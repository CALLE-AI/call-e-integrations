"""Pure extra semantic checks for this package's closed scalar result_schema.

This is an offline development helper, not a business client or Skill runtime
dependency. Run the existing CreateCall structural profile as well: an empty issue
list from this helper alone is NOT full schema validation or service acceptance.
Malformed portions needed by this helper raise ValueError rather than pass silently.

All returned issues enforce a *client safety subset*, not new CALL-E constraints:
* General JSON Schema allows `required` names absent from `properties` on an open
  object. Here the closed-object profile would make that requirement impossible.
* General JSON Schema combines `type` and `enum` as independent constraints; enum
  may include values excluded by type. This client requires every option to match.
* This client rejects empty and duplicate enums. The locally installed Draft
  2020-12 validator accepts those schemas; empty enum matches no instance and
  duplicate enum members do not change its matching behavior. These are client
  policy decisions, not claims about the server or a newly retrieved specification.
* JSON booleans are distinct from numbers; 1 and 1.0 are equal JSON numbers and
  integral finite floats satisfy JSON Schema's integer semantics.

No files, credentials, network, subprocesses, or schema references are accessed.
"""
from __future__ import annotations

import math
from typing import Any


SCALAR_TYPES = frozenset({"string", "boolean", "integer", "number"})


def _number(value: Any) -> bool:
    return type(value) is int or (type(value) is float and math.isfinite(value))


def _matches(kind: str, value: Any) -> bool:
    if kind == "string":
        return type(value) is str
    if kind == "boolean":
        return type(value) is bool
    if kind == "number":
        return _number(value)
    return type(value) is int or (type(value) is float and math.isfinite(value) and value.is_integer())


def _equal_scalar(left: Any, right: Any) -> bool:
    # Python True == 1 and False == 0 must not collapse separate JSON types.
    if type(left) is bool or type(right) is bool:
        return type(left) is type(right) and left == right
    if _number(left) and _number(right):
        return left == right
    return type(left) is str and type(right) is str and left == right


def _pointer_token(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def check_result_schema(schema: Any) -> list[dict[str, str]]:
    """Return semantic issues as {code, path, policy}; do not echo enum values.

    `path` is a JSON Pointer relative to result_schema. This only supplements the
    existing structural profile; it neither resolves references nor repairs input.
    """
    invalid_structure = "Run the structural profile first; result_schema shape is unsupported"
    if not isinstance(schema, dict) or not isinstance(schema.get("properties"), dict):
        raise ValueError(invalid_structure)
    properties = schema["properties"]
    required = schema.get("required", [])
    if not isinstance(required, list) or any(not isinstance(name, str) for name in required):
        raise ValueError(invalid_structure)
    for name, field in properties.items():
        if (not isinstance(name, str) or not isinstance(field, dict)
                or not isinstance(field.get("type"), str) or field["type"] not in SCALAR_TYPES
                or ("enum" in field and not isinstance(field["enum"], list))):
            raise ValueError(invalid_structure)

    issues: list[dict[str, str]] = []

    def add(code: str, path: str) -> None:
        issues.append({"code": code, "path": path, "policy": "client_safety_subset"})

    for index, name in enumerate(required):
        if name not in properties:
            add("required_property_missing", f"/required/{index}")
    for name, field in properties.items():
        if "enum" not in field:
            continue
        values = field["enum"]
        path = f"/properties/{_pointer_token(name)}/enum"
        if not values:
            add("enum_empty", path)
        for index, value in enumerate(values):
            if not _matches(field["type"], value):
                add("enum_type_mismatch", f"{path}/{index}")
            if any(_equal_scalar(value, previous) for previous in values[:index]):
                add("enum_duplicate", f"{path}/{index}")
    return issues
