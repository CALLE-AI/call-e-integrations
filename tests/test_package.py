"""Offline structural tests, not Agent behavioral or service integration tests."""
from __future__ import annotations

import json
import re
import socket
import subprocess
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

import yaml
from jsonschema import Draft202012Validator

try:
    from .diagnostics import ROOT, collect_observations, expand_local, load_contract, request_validator, resolve_pointer, synthetic_request
except ImportError:  # unittest discovery with tests as the start directory
    from diagnostics import ROOT, collect_observations, expand_local, load_contract, request_validator, resolve_pointer, synthetic_request

SKILLS = ("calle",)
MCP_URL = "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
BASE_URLS = {"https://api.heycall-e.com"}


def skill_files(pattern: str):
    """Inspect only the unified MCP/API Skill, not the legacy CLI Skill."""
    for skill in SKILLS:
        skill_root = ROOT / "skills" / skill
        for path in skill_root.rglob(pattern):
            if not any(part.startswith(".") for part in path.relative_to(skill_root).parts):
                yield path


def read_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def metadata(skill: str):
    text = (ROOT / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError("Missing YAML frontmatter")
    frontmatter, body = text[4:].split("\n---\n", 1)
    return yaml.safe_load(frontmatter), body


def all_refs(node):
    if isinstance(node, dict):
        if "$ref" in node:
            yield node["$ref"]
        for value in node.values():
            yield from all_refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from all_refs(value)


def operations(contract):
    for path, path_item in contract["paths"].items():
        for method, operation in path_item.items():
            if method in {"get", "post", "put", "patch", "delete", "head", "options"}:
                yield path, method, operation


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Tests never need an account, network socket or a subprocess. Fail closed.
        cls.stack = ExitStack()
        cls.addClassCleanup(cls.stack.close)
        for target in ("socket.socket", "socket.create_connection", "subprocess.Popen"):
            cls.stack.enter_context(patch(target, side_effect=RuntimeError("offline-test guard")))
        cls.contract = load_contract()
        cls.validator = request_validator()

    def test_offline_network_guard(self):
        with self.assertRaisesRegex(RuntimeError, "offline-test guard"):
            socket.create_connection(("never-contact.invalid", 443))

    def test_offline_subprocess_guard(self):
        with self.assertRaisesRegex(RuntimeError, "offline-test guard"):
            subprocess.Popen(["never-execute-fixture"])

    def test_unified_skill_root_present(self):
        for skill in SKILLS:
            self.assertTrue((ROOT / "skills" / skill).is_dir(), skill)

    def test_skill_file_discovery_ignores_hidden_local_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            skill_root = root / "skills" / "calle"
            (skill_root / ".local").mkdir(parents=True)
            (skill_root / ".DS_Store").write_bytes(b"\x80synthetic Finder metadata")
            (skill_root / ".local" / "metadata.json").write_bytes(b"\x80synthetic local metadata")
            public_file = skill_root / "SKILL.md"
            public_file.write_text("Public fixture.\n", encoding="utf-8")
            with patch(f"{__name__}.ROOT", root):
                self.assertEqual(list(skill_files("*")), [public_file])
                self.assertEqual(list(skill_files("*.json")), [])

    def test_skill_entry_files_present(self):
        for skill in SKILLS:
            self.assertTrue((ROOT / "skills" / skill / "SKILL.md").is_file())

    def test_frontmatter_is_mapping(self):
        for skill in SKILLS:
            self.assertIsInstance(metadata(skill)[0], dict)

    def test_frontmatter_names(self):
        for skill in SKILLS:
            self.assertEqual(metadata(skill)[0]["name"], skill)
            self.assertRegex(skill, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
            self.assertLessEqual(len(skill), 64)

    def test_frontmatter_descriptions(self):
        for skill in SKILLS:
            value = metadata(skill)[0]["description"]
            self.assertIsInstance(value, str)
            self.assertTrue(value.strip())
            self.assertLessEqual(len(value), 1024)

    def test_frontmatter_compatibility(self):
        for skill in SKILLS:
            value = metadata(skill)[0]["compatibility"]
            self.assertIsInstance(value, str)
            self.assertLessEqual(len(value), 500)

    def test_frontmatter_custom_metadata_strings(self):
        for skill in SKILLS:
            self.assertTrue(all(isinstance(v, str) for v in metadata(skill)[0]["metadata"].values()))

    def test_main_skill_line_budget(self):
        # Editorial test policy, not proof of an installed host's token limit.
        for skill in SKILLS:
            self.assertLess(len((ROOT / "skills" / skill / "SKILL.md").read_text().splitlines()), 500)

    def test_skill_relative_markdown_links(self):
        for path in skill_files("*.md"):
            for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", path.read_text()):
                if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                    continue
                resolved = (path.parent / target.split("#", 1)[0]).resolve()
                skill_root = ROOT / "skills" / path.relative_to(ROOT / "skills").parts[0]
                self.assertTrue(resolved.is_relative_to(skill_root.resolve()), f"{path}: external runtime dependency {target}")
                self.assertTrue(resolved.exists(), f"{path}: {target}")

    def test_all_skill_json_parse(self):
        for path in skill_files("*.json"):
            self.assertIsInstance(json.loads(path.read_text()), (dict, list))

    def test_openapi_declared_version(self):
        self.assertEqual(self.contract["openapi"], "3.1.0")

    def test_only_documented_api_hosts(self):
        self.assertEqual({s["url"] for s in self.contract["servers"]}, BASE_URLS)

    def test_customer_skill_only_documents_the_public_api_origin(self):
        origins = set()
        for path in skill_files("*"):
            if not path.is_file():
                continue
            for url in re.findall(r"https?://[^\s\"'<>`\[\]()]+", path.read_text()):
                parsed = urlsplit(url)
                host = parsed.hostname or ""
                if host.endswith(".heycall-e.com") and host not in {"docs.heycall-e.com", "dashboard.heycall-e.com", "www.heycall-e.com"}:
                    origins.add(f"{parsed.scheme}://{parsed.netloc}")
        self.assertEqual(origins, BASE_URLS)

    def test_api_key_header_scheme(self):
        scheme = self.contract["components"]["securitySchemes"]["CalleApiKey"]
        self.assertEqual((scheme["type"], scheme["in"], scheme["name"]), ("apiKey", "header", "Authorization"))

    def test_global_security_no_operation_disables_it(self):
        self.assertEqual(self.contract["security"], [{"CalleApiKey": []}])
        for _, _, operation in operations(self.contract):
            self.assertNotEqual(operation.get("security"), [])

    def test_exact_core_scope(self):
        self.assertEqual(set(self.contract["paths"]), {"/v1/goals", "/v1/goals/{goal_id}", "/v2/calls", "/v2/calls/{call_id}", "/v2/calls/{call_id}/events", "/v2/calls/{call_id}/cancel"})

    def test_no_legacy_call_route(self):
        self.assertFalse(any(path.startswith("/v1/calls") for path in self.contract["paths"]))

    def test_all_local_refs_resolve(self):
        refs = list(all_refs(self.contract))
        self.assertTrue(refs)
        for ref in refs:
            self.assertIsNotNone(resolve_pointer(self.contract, ref))

    def test_no_remote_reference_resolution(self):
        with self.assertRaises(ValueError):
            resolve_pointer(self.contract, "https://never-contact.invalid/schema.json")

    def test_unique_operation_ids(self):
        ids = [operation["operationId"] for _, _, operation in operations(self.contract)]
        self.assertEqual(len(ids), len(set(ids)))

    def test_path_parameters_cover_placeholders(self):
        for path, _, operation in operations(self.contract):
            expected = set(re.findall(r"\{([^}]+)\}", path))
            actual = {p["name"] for p in operation.get("parameters", []) if p["in"] == "path" and p.get("required") is True}
            self.assertEqual(expected, actual, path)

    def test_create_requires_stable_idempotency_header(self):
        headers = {p["name"]: p for p in self.contract["paths"]["/v2/calls"]["post"]["parameters"] if p["in"] == "header"}
        self.assertTrue(headers["Idempotency-Key"]["required"])
        self.assertEqual(headers["Idempotency-Key"]["schema"]["maxLength"], 255)

    def test_component_schema_meta_validation(self):
        for schema in self.contract["components"]["schemas"].values():
            Draft202012Validator.check_schema(expand_local(self.contract, schema))

    def test_phone_placeholder_not_sendable(self):
        payload = read_json("skills/calle/assets/hello-call.request.json")
        self.assertEqual(payload["phone"], "<AUTHORIZED_E164_PHONE>")
        self.assertFalse(self.validator.is_valid(payload))

    def test_synthetic_request_passes_local_profile(self):
        self.assertTrue(self.validator.is_valid(synthetic_request()))

    def test_short_phone_rejected(self):
        payload = synthetic_request()
        payload["phone"] = "+12"
        self.assertFalse(self.validator.is_valid(payload))

    def test_missing_required_request_fields_rejected(self):
        for key in ("phone", "task", "result_schema"):
            payload = synthetic_request()
            del payload[key]
            self.assertFalse(self.validator.is_valid(payload), key)

    def test_nested_result_property_rejected(self):
        payload = synthetic_request()
        payload["result_schema"]["properties"]["nested"] = {"type": "object"}
        self.assertFalse(self.validator.is_valid(payload))

    def test_array_result_property_rejected(self):
        payload = synthetic_request()
        payload["result_schema"]["properties"]["many"] = {"type": "array"}
        self.assertFalse(self.validator.is_valid(payload))

    def test_nullable_result_union_rejected(self):
        payload = synthetic_request()
        payload["result_schema"]["properties"]["heard_test"] = {"type": ["string", "null"]}
        self.assertFalse(self.validator.is_valid(payload))

    def test_more_than_32_result_properties_rejected(self):
        payload = synthetic_request()
        payload["result_schema"]["properties"] = {f"p{i}": {"type": "string"} for i in range(33)}
        payload["result_schema"]["required"] = []
        self.assertFalse(self.validator.is_valid(payload))

    def test_open_result_object_rejected(self):
        payload = synthetic_request()
        payload["result_schema"]["additionalProperties"] = True
        self.assertFalse(self.validator.is_valid(payload))

    def test_scheduling_not_in_current_request_profile(self):
        payload = synthetic_request()
        payload["schedule_at"] = "2099-01-01T00:00:00Z"
        self.assertFalse(self.validator.is_valid(payload))

    def test_explicit_null_region_locale_allowed(self):
        payload = synthetic_request()
        payload.update(region=None, locale=None)
        self.assertTrue(self.validator.is_valid(payload))

    def test_non_https_webhook_rejected_by_profile(self):
        payload = synthetic_request()
        payload["webhook_url"] = "http://never-contact.invalid/webhook"
        self.assertFalse(self.validator.is_valid(payload))

    def test_example_result_schema_structure(self):
        schema = synthetic_request()["result_schema"]
        Draft202012Validator.check_schema(schema)
        self.assertTrue(Draft202012Validator(schema).is_valid({"heard_test": "unknown", "summary": "Synthetic no-answer example."}))

    def test_example_result_rejects_unsupported_fallback(self):
        schema = synthetic_request()["result_schema"]
        self.assertFalse(Draft202012Validator(schema).is_valid({"heard_test": False, "summary": "Synthetic input."}))

    def test_result_readiness_enums(self):
        result_schema = self.contract["components"]["schemas"]["Call"]["properties"]["result_status"]
        self.assertEqual(set(result_schema["enum"]), {"pending", "available", "unavailable", "not_applicable"})

    def test_call_duration_accepts_nullable_nonnegative_seconds_and_old_responses(self):
        schema = expand_local(self.contract, self.contract["components"]["schemas"]["Call"])
        validator = Draft202012Validator(schema)
        self.assertTrue(validator.is_valid({"id": "call_fixture_duration"}))
        for value in (None, 0, 0.0, 83.25):
            with self.subTest(duration=value):
                self.assertTrue(validator.is_valid({"id": "call_fixture_duration", "duration": value}))
        for value in (-1, -0.25, True, False, "83.25", {}, []):
            with self.subTest(duration=value):
                self.assertFalse(validator.is_valid({"id": "call_fixture_duration", "duration": value}))
        for state in ("pending", "available", "unavailable", "not_applicable"):
            with self.subTest(result_status=state):
                self.assertTrue(validator.is_valid({"id": "call_fixture_duration",
                                                    "duration": None, "result_status": state}))

    def test_event_page_limit(self):
        params = {p["name"]: p for p in self.contract["paths"]["/v2/calls/{call_id}/events"]["get"]["parameters"]}
        self.assertEqual(params["limit"]["schema"]["default"], 50)
        self.assertEqual(params["limit"]["schema"]["maximum"], 100)
        self.assertIn("cursor", params)

    def test_goal_cursor_parameter_is_after(self):
        params = {p["name"] for p in self.contract["paths"]["/v1/goals"]["get"]["parameters"]}
        self.assertIn("after", params)
        self.assertNotIn("cursor", params)

    def test_mcp_exact_endpoint(self):
        self.assertEqual(read_json("skills/calle/assets/tool-map.template.json")["server_url"], MCP_URL)

    def test_mcp_template_has_no_claimed_observed_tools(self):
        value = read_json("skills/calle/assets/tool-map.template.json")
        self.assertFalse(value["connection_verified"])
        self.assertEqual(value["tools"], [])
        self.assertIsNone(value["observed_at"])

    def test_mcp_capabilities_unverified(self):
        value = read_json("skills/calle/assets/tool-map.template.json")
        for candidate in value["capability_candidates"].values():
            self.assertEqual(candidate["status"], "unverified")
            self.assertEqual(candidate["actual_tool_names"], [])

    def test_original_behavioral_case_ids_are_preserved_when_cases_are_added(self):
        for skill, prefix, count in (("calle", "api", 14), ("calle", "mcp", 10)):
            cases = read_json(f"tests/behavior/{skill}-evals.json")["cases"]
            ids = {case["id"] for case in cases}
            self.assertTrue({f"{prefix}-{index:02}" for index in range(1, count + 1)} <= ids)

    def test_original_behavioral_cases_not_falsely_passed(self):
        for skill in SKILLS:
            self.assertEqual(read_json(f"tests/behavior/{skill}-evals.json")["evaluation_status"], "not_executed_on_an_agent")

    def test_behavioral_case_ids_and_required_content(self):
        ids = []
        for skill in SKILLS:
            for case in read_json(f"tests/behavior/{skill}-evals.json")["cases"]:
                ids.append(case["id"])
                self.assertTrue(case["prompt"])
                self.assertTrue(case["expected"])
        self.assertEqual(len(ids), len(set(ids)))

    def test_extra_cases_count_and_not_run(self):
        value = read_json("tests/extra-behavior-cases.json")
        self.assertEqual(len(value["cases"]), 12)
        self.assertEqual(value["evaluation_status"], "not_executed_on_an_agent")
        self.assertTrue(all(case["execution_status"] == "NOT_RUN" for case in value["cases"]))

    def test_http_templates_only_placeholder_credentials(self):
        headers = []
        for path in (ROOT / "skills/calle/assets").glob("*.http"):
            headers.extend(re.findall(r"^Authorization:\s*(.+)$", path.read_text(), re.M))
        self.assertTrue(headers)
        self.assertTrue(all(header == "Bearer {{CALLE_API_KEY}}" for header in headers))

    def test_http_templates_methods_match_contract(self):
        for file in (ROOT / "skills/calle/assets").glob("*.http"):
            for method, url in re.findall(r"^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)", file.read_text(), re.M):
                self.assertTrue(url.startswith("https://api.heycall-e.com/"))
                path = url.removeprefix("https://api.heycall-e.com").split("?", 1)[0]
                path = path.replace("{{GOAL_ID}}", "{goal_id}").replace("{{CALL_RESOURCE_ID}}", "{call_id}")
                self.assertIn(method.lower(), self.contract["paths"][path])

    def test_no_business_cli_sdk_implementation_files(self):
        prohibited = {".py", ".sh", ".js", ".ts", ".rb", ".ps1", ".exe"}
        self.assertFalse([p for p in skill_files("*") if p.is_file() and p.suffix in prohibited])

    def test_default_test_policy_disables_live_account_access(self):
        policy = read_json("tests/fixtures/config/test-policy.json")
        for key in ("allow_authenticated_network", "allow_write_operations", "allow_live_calls", "allow_unscoped_cross_interface_fallback", "allow_cli_business_transport", "allow_sdk_business_transport", "allow_cli_setup_auth_update_transport"):
            self.assertIs(policy[key], False)
        self.assertEqual(policy["max_logical_calls_without_new_authorization"], 0)

    def test_read_polling_policy_uses_phased_waits_and_a_counted_session_cap(self):
        policy = read_json("tests/fixtures/config/test-policy.json")["read_polling_client_policy"]
        self.assertEqual(policy["max_status_requests_per_monitoring_session"], 120)
        self.assertEqual(policy["first_query_delay_seconds"], 0)
        self.assertEqual(policy["subsequent_query_delays"], [
            {"query_ordinals": [2, 10], "seconds": 2},
            {"query_ordinals": [11, 20], "seconds": 5},
            {"query_ordinals": [21, 30], "seconds": 10},
            {"query_ordinals": [31, None], "seconds": 20},
        ])
        for key in ("query_ordinals_include_transient_retries",
                    "preserve_session_count_and_phase_across_batches_and_interruption",
                    "explicit_continuation_after_cap_starts_new_session_at_saved_phase",
                    "continue_completed_execution_if_result_pending",
                    "reset_transient_retry_streak_after_valid_read",
                    "preserve_transient_failure_streak_across_batches_and_interruption",
                    "respect_retry_after_as_minimum"):
            self.assertIs(policy[key], True)
        self.assertEqual(policy["max_consecutive_transient_retries"], 3)
        self.assertEqual(policy["max_interruptible_wait_chunk_seconds"], 30)
        self.assertEqual(policy["max_progress_interval_seconds"], 60)
        self.assertEqual(policy["snapshot_only_status_reads"], 1)
        self.assertEqual(policy["terminal_result_statuses"], ["available", "unavailable", "not_applicable"])
        self.assertNotIn("suggested_interval_seconds", policy)

    def test_environment_template_public_api_and_empty_credentials_and_target(self):
        content = (ROOT / "tests/fixtures/config/environment.template.env").read_text()
        fields = dict(line.split("=", 1) for line in content.splitlines() if line and not line.startswith("#"))
        self.assertEqual(fields["CALLE_BASE_URL"], "https://api.heycall-e.com")
        for key in ("CALLE_API_KEY", "CALLE_TEST_PHONE"):
            self.assertEqual(fields[key], "")
        self.assertEqual(fields["CALLE_ALLOW_LIVE_CALLS"], "false")

    def test_mcp_connection_template_not_claimed_configured(self):
        config = read_json("tests/fixtures/config/mcp-connection.template.json")
        self.assertEqual(config["server_url"], MCP_URL)
        self.assertIsNone(config["transport"])
        self.assertFalse(config["oauth_completed"])
        self.assertFalse(config["host_configuration_applied"])

    def test_diagnostics_do_not_claim_server_results(self):
        output = collect_observations()
        self.assertEqual(output["scope"], "offline_local_profile_only")
        self.assertFalse(output["service_acceptance_tested"])
        self.assertEqual({item["id"] for item in output["observations"]}, {"G01", "G02", "G03"})
        self.assertTrue(all(item["server_behavior"] == "NOT_TESTED" for item in output["observations"]))

    def test_report_templates_start_not_run(self):
        for name in ("tests/fixtures/templates/api-readonly-result.template.json", "tests/fixtures/templates/agent-evaluation-results.template.json", "tests/fixtures/templates/runtime-capability-check.template.json"):
            self.assertEqual(read_json(name)["status"], "NOT_RUN")

    def test_private_record_template_has_no_authorization(self):
        value = read_json("tests/fixtures/templates/private-operation-record.template.json")
        self.assertIsNone(value["original_request_body_or_tool_arguments"])
        self.assertIsNone(value["authorization_scope"]["approved_number"])
        self.assertEqual(value["authorization_scope"]["maximum_logical_calls"], 0)
