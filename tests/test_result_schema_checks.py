"""Offline regressions for the result_schema client safety subset, not API tests."""
from __future__ import annotations

import copy
import socket
import subprocess
import unittest
from contextlib import ExitStack
from unittest.mock import patch

from jsonschema import Draft202012Validator

if __package__:
    from .diagnostics import request_validator, synthetic_request
    from .result_schema_checks import check_result_schema
else:  # unittest discovery with tests as the start directory
    from diagnostics import request_validator, synthetic_request
    from result_schema_checks import check_result_schema


def scalar_schema(kind="string", enum=None):
    field = {"type": kind}
    if enum is not None:
        field["enum"] = enum
    return {"type": "object", "additionalProperties": False,
            "properties": {"answer": field}, "required": ["answer"]}


class ResultSchemaChecksTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stack = ExitStack()
        cls.addClassCleanup(cls.stack.close)
        for target in ("socket.socket", "socket.create_connection", "subprocess.Popen"):
            cls.stack.enter_context(patch(target, side_effect=RuntimeError("offline-test guard")))

    def codes(self, schema):
        return [issue["code"] for issue in check_result_schema(schema)]

    def test_offline_guards(self):
        with self.assertRaisesRegex(RuntimeError, "offline-test guard"):
            socket.create_connection(("never-contact.invalid", 443))
        with self.assertRaisesRegex(RuntimeError, "offline-test guard"):
            subprocess.Popen(["never-execute-fixture"])

    def test_current_profile_reproduces_g01_but_semantics_rejects(self):
        request = synthetic_request()
        request["result_schema"]["required"] = ["undeclared"]
        self.assertTrue(request_validator().is_valid(request))
        self.assertEqual(self.codes(request["result_schema"]), ["required_property_missing"])

    def test_current_profile_reproduces_g02_but_semantics_rejects(self):
        request = synthetic_request()
        request["result_schema"]["properties"]["heard_test"] = {"type": "boolean", "enum": ["yes"]}
        self.assertTrue(request_validator().is_valid(request))
        self.assertEqual(self.codes(request["result_schema"]), ["enum_type_mismatch"])

    def test_existing_request_template_remains_valid(self):
        request = synthetic_request()
        self.assertTrue(request_validator().is_valid(request))
        self.assertEqual(check_result_schema(request["result_schema"]), [])

    def test_valid_scalars_and_unknown(self):
        cases = [("string", ["yes", "no", "unknown"]), ("boolean", [True, False]),
                 ("integer", [-1, 0, 2]), ("number", [-1.5, 0, 2.5])]
        for kind, enum in cases:
            with self.subTest(kind=kind):
                self.assertEqual(check_result_schema(scalar_schema(kind, enum)), [])

    def test_scalar_without_enum_remains_valid(self):
        for kind in ("string", "boolean", "integer", "number"):
            with self.subTest(kind=kind):
                self.assertEqual(check_result_schema(scalar_schema(kind)), [])

    def test_required_is_optional_and_may_be_empty(self):
        schema = scalar_schema()
        schema.pop("required")
        self.assertEqual(check_result_schema(schema), [])
        schema["required"] = []
        self.assertEqual(check_result_schema(schema), [])

    def test_empty_properties_preserve_existing_profile_boundary(self):
        schema = {"type": "object", "additionalProperties": False, "properties": {}}
        self.assertEqual(check_result_schema(schema), [])

    def test_boolean_is_not_a_numeric_enum_member(self):
        for kind in ("integer", "number"):
            for value in (True, False):
                with self.subTest(kind=kind, value=value):
                    self.assertEqual(self.codes(scalar_schema(kind, [value])), ["enum_type_mismatch"])

    def test_number_is_not_a_boolean_enum_member(self):
        for value in (0, 1, 0.0, 1.0):
            with self.subTest(value=value):
                self.assertEqual(self.codes(scalar_schema("boolean", [value])), ["enum_type_mismatch"])

    def test_enum_mismatch_includes_mixed_enum(self):
        cases = [("string", ["unknown", False]), ("boolean", [False, "unknown"]),
                 ("integer", [2, 2.5]), ("number", [2, "2"])]
        for kind, enum in cases:
            with self.subTest(kind=kind):
                self.assertEqual(self.codes(scalar_schema(kind, enum)), ["enum_type_mismatch"])

    def test_integral_float_matches_json_schema_integer(self):
        self.assertTrue(Draft202012Validator({"type": "integer"}).is_valid(1.0))
        self.assertEqual(check_result_schema(scalar_schema("integer", [1.0])), [])

    def test_non_json_or_nonfinite_scalar_values_fail_closed(self):
        for value in (None, [], {}, float("nan"), float("inf"), float("-inf")):
            with self.subTest(value_type=type(value).__name__):
                self.assertIn("enum_type_mismatch", self.codes(scalar_schema("number", [value])))

    def test_empty_enum_is_explicit_client_policy(self):
        issues = check_result_schema(scalar_schema("string", []))
        self.assertEqual(issues, [{"code": "enum_empty", "path": "/properties/answer/enum",
                                   "policy": "client_safety_subset"}])

    def test_duplicate_enums_include_json_numeric_equality(self):
        for kind, enum in (("string", ["unknown", "unknown"]), ("boolean", [True, True]),
                           ("integer", [1, 1.0]), ("number", [0, -0.0])):
            with self.subTest(kind=kind):
                self.assertEqual(self.codes(scalar_schema(kind, enum)), ["enum_duplicate"])

    def test_boolean_and_number_are_not_duplicates(self):
        issues = check_result_schema(scalar_schema("number", [1, True, 0, False]))
        self.assertEqual([issue["code"] for issue in issues], ["enum_type_mismatch", "enum_type_mismatch"])

    def test_json_schema_meta_validation_is_not_client_semantics(self):
        # Locally observed jsonschema 4.26.0 behavior, not new service-contract evidence.
        for schema in ({"type": "object", "required": ["undeclared"]},
                       {"type": "boolean", "enum": ["yes"]},
                       {"enum": []}, {"enum": ["unknown", "unknown"]}):
            with self.subTest(schema=schema):
                Draft202012Validator.check_schema(schema)
        self.assertTrue(Draft202012Validator({"type": "object", "required": ["undeclared"]})
                        .is_valid({"undeclared": "allowed on an open object"}))
        self.assertFalse(Draft202012Validator({"type": "boolean", "enum": ["yes"]}).is_valid(True))
        self.assertFalse(Draft202012Validator({"enum": []}).is_valid("anything"))
        self.assertTrue(Draft202012Validator({"enum": ["unknown", "unknown"]}).is_valid("unknown"))

    def test_issue_locations_are_json_pointers_and_do_not_echo_enum_values(self):
        schema = {"properties": {"a/b~c": {"type": "boolean", "enum": ["synthetic-private-value"]}},
                  "required": ["missing"]}
        self.assertEqual(check_result_schema(schema), [
            {"code": "required_property_missing", "path": "/required/0", "policy": "client_safety_subset"},
            {"code": "enum_type_mismatch", "path": "/properties/a~1b~0c/enum/0", "policy": "client_safety_subset"},
        ])

    def test_inputs_are_not_modified(self):
        schema = scalar_schema("number", [1, True, 1.0])
        snapshot = copy.deepcopy(schema)
        check_result_schema(schema)
        self.assertEqual(schema, snapshot)

    def test_invalid_structural_prerequisites_raise(self):
        for schema in (None, [], {}, {"properties": []}, {"properties": {}, "required": "answer"},
                       {"properties": {}, "required": [False]}, {"properties": {1: {"type": "string"}}},
                       {"properties": {"answer": False}}, {"properties": {"answer": {"type": "array"}}},
                       {"properties": {"answer": {"type": "string", "enum": "unknown"}}}):
            with self.subTest(schema=schema):
                with self.assertRaisesRegex(ValueError, "structural profile"):
                    check_result_schema(schema)
