"""Executed local fixture/report checks; these do not execute an Agent."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from tests.offline import offline_guard

try:
    from .behavior.preparation import build_catalog, not_run_results, response_report, validate_result_record
except ImportError:
    from behavior.preparation import build_catalog, not_run_results, response_report, validate_result_record

ROOT = Path(__file__).resolve().parents[1]


class BehaviorPreparationTests(unittest.TestCase):
    def host_command_source(self):
        return {
            "id": "synthetic-host-command", "selected_transport": "mcp",
            "mock_action_scope": "authentication", "prompt": "Connect using the current host.",
            "expected": ["Keep host management separate from business calls."],
            "mock_allowed_actions": ["local.report", "host.mock_mcp_command.configure"],
            "host_command_fixture": {
                "current_host": "codex", "command_host": "codex",
                "installed_official_command": True, "native_management": "unavailable",
                "policy_permitted": True, "user_forbids_cli": False,
            },
        }

    def catalog_for_synthetic_case(self, source, selected_transport="api"):
        original_read = Path.read_text
        selected = "tests/behavior/calle-evals.json"
        source = {"selected_transport": selected_transport, **source}

        def fixture_read(path, *args, **kwargs):
            if path == ROOT / selected:
                return json.dumps({"cases": [source]})
            return original_read(path, *args, **kwargs)

        with patch.object(Path, "read_text", fixture_read):
            return next(case for case in build_catalog(ROOT) if case["id"] == source["id"])

    def test_missing_key_setup_does_not_gain_default_http_permission(self):
        source = {"id": "synthetic-api-setup", "prompt": "Help me configure a missing key.",
                  "expected": ["Give the next setup step without HTTP."],
                  "mock_allowed_actions": ["local.report", "host.mock_secret_presence"],
                  "turns": [{"user": "I have not saved a key yet."}]}
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        self.assertNotIn("http.GET", case["fixture"]["allowed_actions"])
        self.assertEqual(case["fixture"]["source_case"]["turns"], source["turns"])

    def test_dashboard_browser_mock_requires_available_native_api_setup_and_fixed_url(self):
        source = {
            "id": "synthetic-dashboard", "prompt": "Help me obtain an API Key.",
            "expected": ["Open only the official Dashboard through the native host."],
            "mock_allowed_actions": ["local.report", "host.mock_browser_open_dashboard"],
            "setup": {"native_browser": "available", "dashboard_url": "https://dashboard.heycall-e.com"},
        }
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        for setup in ({}, None, {"native_browser": "unavailable", "dashboard_url": "https://dashboard.heycall-e.com"},
                      {"native_browser": "policy_denied", "dashboard_url": "https://dashboard.heycall-e.com"},
                      {"native_browser": "available", "dashboard_url": "https://untrusted.invalid"}):
            with self.subTest(setup=setup), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "setup": setup})
        for scope, transport in (("authentication", "mcp"), ("routing", "undecided"),
                                 ("skill_update", "api"), ("mcp_call", "mcp")):
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_action_scope": scope,
                                                "selected_transport": transport})

    def test_api_call_scope_requires_explicit_actions_and_api_transport(self):
        source = {
            "id": "synthetic-api-call", "prompt": "Place one authorized mock Hello call.",
            "mock_action_scope": "api_call", "selected_transport": "api",
            "expected": ["Persist the original request before exactly one mock create."],
            "mock_allowed_actions": ["local.report", "journal.write", "http.POST.create_authorized_call_once"],
        }
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        self.assertFalse(case["fixture"]["network_allowed"])
        self.assertFalse(case["fixture"]["real_credentials_allowed"])
        for actions in (None, [], "http.POST", [1], ["local.report", "local.report"],
                        ["http.POST"], ["mcp.prepare_call"], ["host.mock_oauth_start"],
                        ["host.mock_secret_delete"], ["shell.execute"], ["update.mock_fetch_metadata"]):
            with self.subTest(actions=actions), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_allowed_actions": actions})
        for transport in ("mcp", "undecided", "separate_sessions", None):
            with self.subTest(transport=transport), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "selected_transport": transport})
        for scope, transport in (("authentication", "api"), ("routing", "undecided"),
                                 ("skill_update", "api"), ("mcp_call", "mcp")):
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_action_scope": scope,
                                                "selected_transport": transport})
        with self.assertRaises(ValueError):
            self.catalog_for_synthetic_case({key: value for key, value in source.items()
                                             if key != "mock_allowed_actions"})

    def test_first_use_call_cases_preserve_private_handoff_and_saved_continuation(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for number in range(1, 4):
            fixture = catalog[f"api-onboarding-{number:02}"]["fixture"]
            source = fixture["source_case"]
            self.assertEqual(source["mock_action_scope"], "api_call")
            self.assertIn("http.POST.create_authorized_call_once", fixture["allowed_actions"])
            self.assertFalse(fixture["network_allowed"])
            self.assertFalse(fixture["real_credentials_allowed"])
            self.assertEqual(source["setup"]["authorized_call"]["max_logical_calls"], 1)
            self.assertIn(source["setup"]["authorized_call"]["phone"], source["prompt"])
            prepare, saved = source["turns"]
            self.assertTrue(prepare["fixture_host_result"]["prepared"])
            self.assertEqual(prepare["fixture_host_result"]["field"], "CALLE_API_KEY")
            self.assertEqual(prepare["fixture_host_result"]["secret_source"], saved["setup"]["secret_source"])
            self.assertEqual(saved["prompt"], "Saved.")
            self.assertEqual([(item["method"], item["path"]) for item in saved["fixture_http_responses"]],
                             [("GET", "/v1/goals?limit=1"), ("POST", "/v2/calls")])
        opened = catalog["api-onboarding-01"]["fixture"]
        self.assertIn("host.mock_browser_open_dashboard", opened["allowed_actions"])
        self.assertTrue(opened["source_case"]["turns"][0]["fixture_browser_result"]["opened"])
        for case_id in ("api-onboarding-02", "api-onboarding-03"):
            fixture = catalog[case_id]["fixture"]
            self.assertNotIn("host.mock_browser_open_dashboard", fixture["allowed_actions"])
            self.assertNotIn("fixture_browser_result", fixture["source_case"]["turns"][0])

    def test_onboarding_changes_preserve_preview_and_setup_only_ceilings(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for case_id in ("api-03", "mcp-20"):
            self.assertEqual(set(catalog[case_id]["fixture"]["allowed_actions"]),
                             {"local.preview", "local.report"})
        missing = catalog["api-01"]["fixture"]["allowed_actions"]
        self.assertIn("host.mock_browser_open_dashboard", missing)
        self.assertFalse(any(action.startswith("http.") for action in missing))
        read_only = catalog["api-auth-01"]["fixture"]["allowed_actions"]
        self.assertIn("host.mock_browser_open_dashboard", read_only)
        self.assertIn("http.GET", read_only)
        self.assertFalse(any(action.startswith("http.POST") for action in read_only))
        self.assertEqual(catalog["api-auth-08"]["fixture"]["allowed_actions"],
                         ["local.report", "host.mock_secret_presence"])

    def test_virtual_wait_permission_is_explicit_and_limited_to_call_scopes(self):
        for transport in ("api", "mcp"):
            source = {
                "id": f"synthetic-{transport}-wait", "selected_transport": transport,
                "mock_action_scope": f"{transport}_call", "prompt": "Monitor the saved call.",
                "expected": ["Use only explicitly allowed synthetic waits and reads."],
                "mock_allowed_actions": ["local.report", "host.mock_wait"],
            }
            case = self.catalog_for_synthetic_case(source)
            self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
            self.assertFalse(case["fixture"]["network_allowed"])
            for scope, selected in (("authentication", transport), ("skill_update", transport),
                                    ("routing", "undecided")):
                with self.subTest(transport=transport, scope=scope), self.assertRaises(ValueError):
                    self.catalog_for_synthetic_case({**source, "mock_action_scope": scope,
                                                    "selected_transport": selected})

    def test_polling_groups_preserve_read_only_actions_and_phased_long_results(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for transport in ("api", "mcp"):
            case = catalog[f"{transport}-polling-01"]
            fixture = case["fixture"]
            source = fixture["source_case"]
            self.assertEqual(source["execution_status"], "NOT_RUN")
            self.assertEqual(source["version"], "2.0.0")
            self.assertEqual(set(fixture["allowed_actions"]),
                             {"local.report", "journal.read", "journal.write", "host.mock_wait",
                              "http.GET" if transport == "api" else "mcp.get_call"})
            self.assertFalse(fixture["network_allowed"])
            self.assertFalse(fixture["real_credentials_allowed"])
            self.assertEqual(source["fixture_tool_batches"], [[1, 10], [11, 20], [21, 30], [31, 32]])
            self.assertEqual(source["fixture_wait_plan"], [
                {"query_ordinals": [1, 1], "seconds": 0},
                {"query_ordinals": [2, 10], "seconds": 2},
                {"query_ordinals": [11, 20], "seconds": 5},
                {"query_ordinals": [21, 30], "seconds": 10},
                {"query_ordinals": [31, 32], "seconds": 20},
            ])
            pending, final = source["fixture_status_reads"]
            self.assertEqual(pending["query_ordinal_range"], [1, 31])
            self.assertEqual(final["query_ordinal_range"], [32, 32])
            pending_call, final_call = [
                read["response"]["body"] if transport == "api"
                else read["response"]["structuredContent"]["call"]
                for read in (pending, final)
            ]
            self.assertEqual(pending_call["status"], "completed")
            self.assertEqual(pending_call["result_status"], "pending")
            self.assertEqual(final_call["result_status"], "available")
            self.assertEqual(final_call["result"], {})
            variants = {variant["id"]: variant for variant in source["variants"]}
            self.assertEqual(variants["result-after-12-reads"]["expected_read_counts"],
                             {"session": 12, "cumulative": 12})
            self.assertTrue({"unavailable-without-error", "not-applicable", "user-stop",
                             "explicit-cancellation", "snapshot-only", "authentication-error",
                             "invalid-response", "fatal-error"} <= variants.keys())
            self.assertEqual(variants["snapshot-only"]["expected_read_counts"]["session"], 1)
            self.assertEqual(variants["snapshot-only"]["fixture_wait_plan"],
                             [{"query_ordinals": [1, 1], "seconds": 0}])
            self.assertEqual(len(source["variants"]), 22)
            resumed = variants["host-hard-interruption-resume"]
            self.assertEqual(len(resumed["turns"]), 2)
            self.assertEqual(resumed["expected_read_counts"], {"session": 11, "cumulative": 11})
            if transport == "mcp":
                for scenario in [source, *source["variants"]]:
                    for read in scenario["fixture_status_reads"]:
                        if "response" in read:
                            structured = read["response"]["structuredContent"]
                            self.assertEqual(set(structured), {"call"})
                            self.assertEqual(structured["call"]["id"], source["setup"]["saved_call_resource_id"])
                invalid = variants["invalid-response"]["fixture_status_reads"][0]
                self.assertNotIn("result_status", invalid["response"]["structuredContent"]["call"])
            for index, variant in enumerate(source["variants"], 1):
                expected = [item["expected"] for item in case["rubric"]
                            if item["id"].startswith(f"{case['id']}:v{index}:")]
                self.assertEqual(expected, variant["expected"])

    def test_polling_fixtures_preserve_resumption_counts_server_wait_and_failure_streak(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for transport in ("api", "mcp"):
            source = catalog[f"{transport}-polling-01"]["fixture"]["source_case"]
            variants = {variant["id"]: variant for variant in source["variants"]}
            self.assertEqual(source["fixture_clock"], {
                "mode": "virtual_only", "real_sleep_allowed": False,
                "max_interruptible_wait_chunk_seconds": 30, "max_progress_interval_seconds": 60,
            })
            for identifier, previous, delay in (("resume-after-10-reads", 10, 5),
                                                 ("resume-after-30-reads", 30, 20)):
                resumed = variants[identifier]
                self.assertEqual(resumed["setup"]["polling_state"]["session_query_count"], previous)
                self.assertEqual(resumed["fixture_wait_plan"][0]["seconds"], delay)
                self.assertEqual(resumed["fixture_status_reads"][0]["query_ordinal_range"][0], previous + 1)
            server_wait = variants["server-delay-75-seconds"]
            delayed = server_wait["fixture_wait_plan"][1]
            self.assertEqual(server_wait["fixture_retry_after"]["minimum_seconds"], 75)
            self.assertEqual(sum(delayed["chunks_seconds"]), delayed["seconds"])
            self.assertTrue(all(0 < seconds <= 30 for seconds in delayed["chunks_seconds"]))
            interrupted = variants["host-hard-interruption"]
            self.assertEqual(interrupted["expected_saved_state"]["server_not_before_virtual_seconds"], 93)
            self.assertEqual(interrupted["expected_saved_state"]["session_query_count"], 10)
            self.assertEqual(interrupted["fixture_interruptions"][0]["kind"], "host_hard_interruption")
            unknown = variants["saved-count-unavailable"]
            self.assertIsNone(unknown["expected_read_counts"]["cumulative"])
            self.assertEqual(unknown["fixture_wait_plan"][0]["seconds"], 45)
            self.assertEqual(unknown["fixture_wait_plan"][1]["seconds"], 20)
            self.assertTrue(all(item["cumulative_query_ordinal"] is None
                                for item in unknown["fixture_status_reads"]))
            failures = variants["resume-three-failed-reads"]
            self.assertEqual(failures["setup"]["polling_state"]["consecutive_transient_failures"], 3)
            self.assertEqual(failures["fixture_status_reads"][0]["query_ordinal_range"], [14, 14])
            self.assertEqual(failures["expected_read_counts"], {"session": 14, "cumulative": 14})

    def test_polling_fixtures_cover_cap_terminal_boundary_and_count_all_retries(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for transport in ("api", "mcp"):
            source = catalog[f"{transport}-polling-01"]["fixture"]["source_case"]
            variants = {variant["id"]: variant for variant in source["variants"]}
            final = variants["terminal-at-120"]["fixture_status_reads"][-1]
            self.assertEqual(final["query_ordinal_range"], [120, 120])
            final_call = (final["response"]["body"] if transport == "api"
                          else final["response"]["structuredContent"]["call"])
            self.assertEqual(final_call["result_status"], "available")
            pending = variants["pending-at-120"]
            self.assertEqual(pending["fixture_status_reads"][0]["query_ordinal_range"], [1, 120])
            self.assertEqual(pending["expected_saved_state"]["session_query_count"], 120)
            self.assertEqual(pending["fixture_wait_plan"][-1],
                             {"query_ordinals": [31, 120], "seconds": 20})
            last_slot = variants["retry-in-last-session-slot"]
            self.assertEqual(last_slot["setup"]["polling_state"]["session_query_count"], 119)
            self.assertEqual(last_slot["expected_read_counts"]["session"], 120)
            self.assertEqual(last_slot["fixture_status_reads"][0]["query_ordinal_range"], [120, 120])
            exhausted = variants["transient-retries-exhausted"]
            self.assertEqual(exhausted["fixture_status_reads"][-1]["query_ordinal_range"], [2, 5])
            self.assertEqual(exhausted["expected_read_counts"]["session"], 5)
            reset = variants["transient-retry-streak-reset"]
            valid = reset["fixture_status_reads"][3]["response"]
            valid_call = valid["body"] if transport == "api" else valid["structuredContent"]["call"]
            self.assertEqual(valid_call["result_status"], "pending")
            self.assertEqual(reset["expected_read_counts"], {"session": 8, "cumulative": 8})
            continued = variants["explicit-new-session-after-cap"]
            self.assertTrue(continued["setup"]["new_session_explicitly_authorized"])
            self.assertEqual(continued["setup"]["polling_state"]["cumulative_query_count"], 120)
            self.assertEqual(continued["setup"]["polling_state"]["session_query_count"], 0)
            self.assertEqual(continued["fixture_wait_plan"], [{"query_ordinals": [121, 122], "seconds": 20}])
            self.assertEqual(continued["expected_read_counts"], {"session": 2, "cumulative": 122})

    def test_production_only_scenarios_preserve_explicit_action_ceilings(self):
        cases = {case["id"]: case for case in build_catalog(ROOT)}
        public = cases["api-production-01"]["fixture"]
        self.assertIsNone(public["source_case"]["setup"]["base_url"])
        self.assertIn("http.GET", public["allowed_actions"])
        mismatch = cases["api-production-02"]["fixture"]
        self.assertEqual(mismatch["source_case"]["setup"]["base_url"], "https://example.invalid")
        self.assertEqual(mismatch["allowed_actions"], ["local.report", "journal.read"])
        connected = cases["mcp-production-01"]["fixture"]
        self.assertEqual(connected["source_case"]["setup"]["server_url"],
                         "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth")
        self.assertEqual(connected["allowed_actions"],
                         ["local.report", "host.inspect_existing_connection", "host.mock_discovery"])

    def test_oauth_setup_permissions_remain_explicit_mock_actions(self):
        source = {"id": "synthetic-mcp-setup", "prompt": "Connect and sign in.",
                  "expected": ["Use the mocked host flow."],
                  "mock_allowed_actions": ["local.report", "host.inspect_existing_connection",
                                           "host.mock_configure", "host.mock_oauth_start", "host.mock_oauth_status"]}
        case = self.catalog_for_synthetic_case(source, "mcp")
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        self.assertNotIn("host.mock_discovery", case["fixture"]["allowed_actions"])
        self.assertFalse(case["fixture"]["network_allowed"])

    def test_host_commands_require_explicit_same_host_authentication_context(self):
        source = self.host_command_source()
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        self.assertEqual(case["fixture"]["source_case"]["host_command_fixture"], source["host_command_fixture"])
        for field, value in (("current_host", ""), ("command_host", "claude-code"),
                             ("installed_official_command", False), ("native_management", "available"),
                             ("native_management", "policy_denied"), ("policy_permitted", False),
                             ("user_forbids_cli", True), ("policy_permitted", "true")):
            invalid = copy.deepcopy(source)
            invalid["host_command_fixture"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case(invalid)
        for field in ("mock_action_scope", "host_command_fixture"):
            invalid = copy.deepcopy(source)
            del invalid[field]
            with self.subTest(missing=field), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case(invalid)

    def test_host_command_scope_rejects_api_routing_update_and_dual_sessions(self):
        for scope, transport in (("authentication", "api"), ("routing", "undecided"),
                                 ("skill_update", "mcp"), ("skill_update", "api"),
                                 ("authentication", "separate_sessions")):
            source = self.host_command_source()
            source.update(mock_action_scope=scope, selected_transport=transport)
            if transport == "separate_sessions":
                source["id"] = "extra-12"
            with self.subTest(scope=scope, transport=transport), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case(source)

    def test_host_command_namespace_cannot_authorize_business_or_update_operations(self):
        for operation in ("http", "call", "tools_call", "proxy", "install_dependency", "read_token_cache",
                          "update", "download", "install_skill", "shell", "execute", "configure;curl"):
            source = self.host_command_source()
            source["mock_allowed_actions"] = [f"host.mock_mcp_command.{operation}"]
            with self.subTest(operation=operation), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case(source)

    def test_host_command_management_operations_remain_individually_scoped(self):
        for operation in ("help", "status", "configure", "oauth_start", "oauth_status", "refresh", "logout", "remove"):
            source = self.host_command_source()
            source["mock_allowed_actions"] = [f"host.mock_mcp_command.{operation}"]
            with self.subTest(operation=operation):
                case = self.catalog_for_synthetic_case(source)
                self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
                self.assertFalse(case["fixture"]["network_allowed"])
                self.assertFalse(case["fixture"]["real_credentials_allowed"])

    def test_host_command_metadata_does_not_add_permissions_to_default_cases(self):
        source = self.host_command_source()
        del source["mock_allowed_actions"]
        case = self.catalog_for_synthetic_case(source)
        self.assertFalse(any(action.startswith("host.mock_mcp_command.")
                             for action in case["fixture"]["allowed_actions"]))

    def test_host_command_preparation_does_not_relax_real_subprocess_guard(self):
        with offline_guard():
            self.catalog_for_synthetic_case(self.host_command_source())
            with self.assertRaisesRegex(RuntimeError, "offline-test guard"):
                subprocess.Popen(["fixture-never-execute-host-manager"])

    def test_repository_host_scenarios_preserve_native_preference_and_oauth_deduplication(self):
        cases = {case["id"]: case for case in build_catalog(ROOT)}
        for number in (1, 4, 5, 6, 8, 9):
            actions = cases[f"mcp-host-{number:02}"]["fixture"]["allowed_actions"]
            self.assertFalse(any(action.startswith("host.mock_mcp_command.") for action in actions))
        for number, host in ((2, "codex"), (3, "claude-code"), (7, "codex")):
            fixture = cases[f"mcp-host-{number:02}"]["fixture"]
            self.assertEqual(fixture["source_case"]["host_command_fixture"]["current_host"], host)
            self.assertIn("host.mock_mcp_command.configure", fixture["allowed_actions"])
            self.assertNotIn("mcp.explicitly_loaded_fixture_read_only_tool", fixture["allowed_actions"])
        pending = cases["mcp-host-07"]["fixture"]
        self.assertNotIn("host.mock_mcp_command.oauth_start", pending["allowed_actions"])
        self.assertNotIn("host.mock_oauth_start", pending["allowed_actions"])
        self.assertEqual(len(pending["source_case"]["turns"]), 3)
        self.assertEqual(cases["mcp-host-09"]["fixture"]["source_case"]["mock_action_scope"], "skill_update")

    def test_each_turn_expectation_has_a_distinct_unexecuted_rubric_item(self):
        source = {"id": "synthetic-multiturn", "prompt": "Configure and verify.",
                  "mock_allowed_actions": ["local.report", "host.mock_secret_presence", "http.GET"],
                  "expected": ["Preserve the selected interface."],
                  "turns": [{"prompt": "Not saved yet.", "expected": ["Wait without HTTP."]},
                            {"prompt": "Saved.", "expected": ["Continue the authorized GET."]}]}
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual([rule["id"] for rule in case["rubric"]],
                         ["synthetic-multiturn:e1", "synthetic-multiturn:t1:e1", "synthetic-multiturn:t2:e1"])
        self.assertEqual([rule["expected"] for rule in case["rubric"]],
                         ["Preserve the selected interface.", "Wait without HTTP.", "Continue the authorized GET."])

    def test_explicit_mock_actions_reject_unknown_live_or_cross_interface_access(self):
        for skill, action in (("api", "http.POST"),
                              ("api", "host.mock_oauth_start"),
                              ("mcp", "host.mock_secret_read"),
                              ("mcp", "http.GET"),
                              ("mcp", "shell.execute")):
            with self.subTest(skill=skill, action=action):
                source = {"id": "synthetic-invalid-action", "prompt": "Synthetic.",
                          "expected": ["Reject invalid preparation."], "mock_allowed_actions": [action]}
                with self.assertRaises(ValueError):
                    self.catalog_for_synthetic_case(source, skill)

    def test_malformed_explicit_actions_do_not_fall_back_to_legacy_defaults(self):
        for value in (None, [], "http.GET", [1], [["local.report"]], ["local.report", "local.report"]):
            with self.subTest(value=value):
                source = {"id": "synthetic-invalid-actions", "prompt": "Synthetic.",
                          "expected": ["Reject malformed action declarations."], "mock_allowed_actions": value}
                with self.assertRaises(ValueError):
                    self.catalog_for_synthetic_case(source)

    def test_update_scope_has_only_explicit_update_actions_for_either_transport(self):
        for skill in ("api", "mcp"):
            with self.subTest(skill=skill):
                source = {"id": "synthetic-update", "prompt": "Check this skill version.",
                          "mock_action_scope": "skill_update", "expected": ["Report the version."],
                          "mock_allowed_actions": ["local.report", "update.mock_fetch_metadata"]}
                case = self.catalog_for_synthetic_case(source, skill)
                self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
                self.assertFalse(case["fixture"]["network_allowed"])
                self.assertFalse(case["fixture"]["real_credentials_allowed"])

    def test_update_scope_rejects_business_secret_oauth_and_process_actions(self):
        forbidden = ("http.GET", "http.POST", "host.inspect_existing_connection", "host.mock_discovery",
                     "host.mock_secret_read", "host.mock_secret_prepare", "host.mock_oauth_start",
                     "mcp.explicitly_loaded_fixture_read_only_tool", "journal.write", "shell.execute",
                     "update.run_install_hook")
        for skill in ("api", "mcp"):
            for action in forbidden:
                with self.subTest(skill=skill, action=action):
                    source = {"id": "synthetic-unsafe-update", "prompt": "Check this skill version.",
                              "mock_action_scope": "skill_update", "expected": ["Reject unsafe scope."],
                              "mock_allowed_actions": ["local.report", action]}
                    with self.assertRaises(ValueError):
                        self.catalog_for_synthetic_case(source, skill)

    def test_update_scope_requires_valid_explicit_actions_without_defaults(self):
        for skill in ("api", "mcp"):
            source = {"id": "synthetic-missing-update-actions", "prompt": "Update only.",
                      "mock_action_scope": "skill_update", "expected": ["Reject missing actions."]}
            with self.subTest(skill=skill, actions="missing"), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case(source, skill)
            for actions in (None, [], "update.mock_fetch_metadata", [1], [["local.report"]],
                            ["local.report", "local.report"]):
                with self.subTest(skill=skill, actions=actions), self.assertRaises(ValueError):
                    self.catalog_for_synthetic_case({**source, "mock_allowed_actions": actions}, skill)

    def test_unknown_scope_and_unscoped_update_actions_are_rejected(self):
        source = {"id": "synthetic-scope", "prompt": "Synthetic.", "expected": ["Reject."],
                  "mock_allowed_actions": ["local.report", "update.mock_fetch_metadata"]}
        for scope in ("unknown", None, []):
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_action_scope": scope})
        with self.assertRaises(ValueError):
            self.catalog_for_synthetic_case(source)

    def test_variant_expectations_receive_distinct_unexecuted_rubric_items(self):
        source = {"id": "synthetic-update-variants", "prompt": "Check response variants.",
                  "mock_action_scope": "skill_update", "mock_allowed_actions": ["local.report"],
                  "expected": ["Keep variants independent."],
                  "variants": [{"id": "traversal", "expected": ["Reject traversal."]},
                               {"id": "symlink", "expected": ["Reject symlink.", "Do not read target."]}]}
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual([rule["id"] for rule in case["rubric"]],
                         ["synthetic-update-variants:e1", "synthetic-update-variants:v1:e1",
                          "synthetic-update-variants:v2:e1", "synthetic-update-variants:v2:e2"])
        self.assertEqual(case["fixture"]["source_case"]["variants"], source["variants"])
        self.assertEqual(case["execution_status"], "NOT_RUN")

    def test_repository_update_fixtures_preserve_check_download_install_boundaries(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for prefix in ("api", "mcp"):
            self.assertEqual(catalog[f"{prefix}-update-01"]["fixture"]["allowed_actions"],
                             ["local.report", "update.mock_fetch_metadata"])
            self.assertEqual(catalog[f"{prefix}-update-03"]["fixture"]["allowed_actions"], ["local.report"])
            for number in (4, 5, 7):
                self.assertNotIn("update.mock_install", catalog[f"{prefix}-update-{number:02}"]["fixture"]["allowed_actions"])
            self.assertIn("update.mock_install", catalog[f"{prefix}-update-08"]["fixture"]["allowed_actions"])
        self.assertEqual(catalog["mcp-19"]["fixture"]["allowed_actions"], ["local.preview", "local.report"])

    def test_routing_scope_requires_explicit_actions_and_undecided_transport(self):
        source = {"id": "synthetic-routing", "prompt": "Select a supported route.",
                  "mock_action_scope": "routing", "selected_transport": "undecided",
                  "expected": ["Stay within the requested read."],
                  "mock_allowed_actions": ["local.report", "host.mock_discovery", "http.GET"]}
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        self.assertNotIn("host.mock_secret_read", case["fixture"]["allowed_actions"])
        self.assertFalse(case["fixture"]["network_allowed"])
        for malformed in (None, [], ["local.report", "local.report"], "http.GET"):
            with self.subTest(actions=malformed), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_allowed_actions": malformed})
        for transport in ("api", "mcp", "separate_sessions", None):
            with self.subTest(transport=transport), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "selected_transport": transport})
        missing = {key: value for key, value in source.items() if key != "mock_allowed_actions"}
        with self.assertRaises(ValueError):
            self.catalog_for_synthetic_case(missing)

    def test_current_mcp_call_scope_requires_explicit_actions_and_mcp_transport(self):
        source = {"id": "synthetic-current-mcp", "prompt": "Prepare a synthetic call.",
                  "mock_action_scope": "mcp_call", "selected_transport": "mcp",
                  "expected": ["Respect the explicit synthetic action ceiling."],
                  "mock_allowed_actions": ["local.report", "mcp.prepare_call"]}
        case = self.catalog_for_synthetic_case(source)
        self.assertEqual(case["fixture"]["allowed_actions"], source["mock_allowed_actions"])
        self.assertFalse(case["fixture"]["network_allowed"])
        self.assertFalse(case["fixture"]["real_credentials_allowed"])
        for actions in (None, [], "mcp.prepare_call", [1], ["local.report", "local.report"]):
            with self.subTest(actions=actions), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_allowed_actions": actions})
        missing = {key: value for key, value in source.items() if key != "mock_allowed_actions"}
        with self.assertRaises(ValueError):
            self.catalog_for_synthetic_case(missing)
        for transport in ("api", "undecided", "separate_sessions", None):
            with self.subTest(transport=transport), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "selected_transport": transport})

    def test_current_mcp_call_scope_rejects_legacy_and_cross_scope_actions(self):
        source = {"id": "synthetic-current-mcp", "prompt": "Read a synthetic call.",
                  "mock_action_scope": "mcp_call", "selected_transport": "mcp",
                  "expected": ["Reject out-of-scope mock permissions."]}
        forbidden = ("mcp.plan_call", "mcp.run_call", "mcp.get_call_run",
                     "mcp__calle_connect__plan_call", "mcp__calle_connect__run_call",
                     "mcp__calle_connect__get_call_run", "http.GET", "http.POST",
                     "host.mock_secret_read", "host.mock_oauth_start", "host.mock_configure",
                     "host.mock_mcp_command.status", "shell.execute", "update.mock_fetch_metadata")
        for action in forbidden:
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_allowed_actions": ["local.report", action]})
        for scope, transport in (("authentication", "mcp"), ("routing", "undecided"),
                                 ("skill_update", "mcp")):
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_action_scope": scope,
                                                "selected_transport": transport,
                                                "mock_allowed_actions": ["mcp.prepare_call"]})
            with self.subTest(scope=scope, action="start_call"), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case({**source, "mock_action_scope": scope,
                                                "selected_transport": transport,
                                                "mock_allowed_actions": ["mcp.start_call"]})

    def test_current_mcp_cases_preserve_write_recovery_and_preview_ceilings(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        prepared = catalog["mcp-current-01"]["fixture"]
        self.assertIn("mcp.prepare_call", prepared["allowed_actions"])
        self.assertEqual(len(prepared["source_case"]["turns"]), 2)
        for number in range(2, 7):
            fixture = catalog[f"mcp-current-{number:02}"]["fixture"]
            self.assertNotIn("mcp.prepare_call", fixture["allowed_actions"])
            self.assertNotIn("http.GET", fixture["allowed_actions"])
            self.assertNotIn("http.POST", fixture["allowed_actions"])
        self.assertEqual(catalog["mcp-current-05"]["fixture"]["allowed_actions"],
                         ["local.report", "journal.read"])
        self.assertEqual(catalog["mcp-current-06"]["fixture"]["allowed_actions"],
                         ["local.preview", "local.report"])
        self.assertIn("http.GET", catalog["route-14"]["fixture"]["allowed_actions"])
        self.assertNotIn("mcp.prepare_call", catalog["route-14"]["fixture"]["allowed_actions"])
        for number in range(7, 12):
            fixture = catalog[f"mcp-current-{number:02}"]["fixture"]
            self.assertIn("mcp.start_call", fixture["allowed_actions"])
            self.assertNotIn("http.POST", fixture["allowed_actions"])
        for case_id in ("mcp-current-01", "mcp-current-03", "mcp-current-05", "mcp-current-06", "mcp-current-12"):
            self.assertNotIn("mcp.start_call", catalog[case_id]["fixture"]["allowed_actions"])

    def test_preview_fixtures_cannot_gain_default_read_or_discovery_actions(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for case_id in ("api-03", "mcp-20"):
            with self.subTest(case=case_id):
                fixture = catalog[case_id]["fixture"]
                self.assertEqual(set(fixture["allowed_actions"]), {"local.preview", "local.report"})
                self.assertFalse(fixture["network_allowed"])
                self.assertFalse(fixture["real_credentials_allowed"])
        preview = catalog["mcp-20"]["fixture"]["source_case"]
        self.assertIsNone(preview["setup"]["agent_ref"])
        self.assertEqual(preview["setup"]["tool_schemas"], "already_loaded")
        self.assertIn("fixture_lookup_agent", {tool["name"] for tool in preview["fixture_tools"]})

    def test_tool_listing_does_not_gain_business_reads_for_a_known_resource(self):
        case = next(case for case in build_catalog(ROOT) if case["id"] == "mcp-02")
        fixture = case["fixture"]
        self.assertTrue(fixture["source_case"]["setup"]["known_task_ref"])
        self.assertEqual(set(fixture["allowed_actions"]),
                         {"local.report", "host.inspect_existing_connection", "host.mock_discovery"})

    def test_routing_scope_cannot_gain_writes_oauth_install_or_process_permissions(self):
        for action in ("http.POST", "http.POST.create", "host.mock_oauth_start", "host.mock_configure",
                       "host.mock_secret_delete", "journal.write", "shell.execute",
                       "update.mock_install", "mcp.fixture_create_call"):
            source = {"id": "synthetic-unsafe-routing", "prompt": "Select a route.",
                      "mock_action_scope": "routing", "selected_transport": "undecided",
                      "expected": ["Reject unsafe scope."], "mock_allowed_actions": ["local.report", action]}
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.catalog_for_synthetic_case(source)

    def test_routing_fixture_permissions_preserve_critical_negative_cases(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        for number in (1, 3, 6, 7, 8, 10, 12, 13):
            actions = catalog[f"route-{number:02}"]["fixture"]["allowed_actions"]
            self.assertNotIn("http.GET", actions)
            self.assertNotIn("host.mock_secret_read", actions)
        for number in (2, 4, 5, 9, 11):
            self.assertIn("http.GET", catalog[f"route-{number:02}"]["fixture"]["allowed_actions"])
        self.assertNotIn("host.mock_discovery", catalog["route-09"]["fixture"]["allowed_actions"])
        for number in range(1, 14):
            self.assertFalse(any("POST" in action or "write" in action for action in
                                 catalog[f"route-{number:02}"]["fixture"]["allowed_actions"]))

    def test_all_cases_load_one_skill_and_hash_only_its_current_sources(self):
        catalog = build_catalog(ROOT)
        self.assertEqual({case["skill"] for case in catalog}, {"calle"})
        for case in catalog:
            scope = case["fixture"]["source_case"].get("mock_action_scope", "authentication")
            if scope == "authentication":
                self.assertIn(case["selected_transport"], {"api", "mcp", "separate_sessions"})
        hashes = not_run_results(ROOT)["skill_and_fixture_file_hashes"]
        skill_hashes = [path for path in hashes if path.startswith("skills/")]
        self.assertTrue(skill_hashes)
        self.assertTrue(all(path.startswith("skills/calle/") for path in skill_hashes))
        source_files = {case["source_file"] for case in catalog}
        self.assertEqual(source_files, {"tests/behavior/calle-evals.json",
                                       "tests/extra-behavior-cases.json",
                                       "tests/behavior/round-1-cases.json"})
        for relative in source_files:
            self.assertEqual(hashes[relative], hashlib.sha256((ROOT / relative).read_bytes()).hexdigest())
        self.assertNotIn("skills/calle/evals/evals.json", hashes)

    def test_fixture_changes_update_evidence_hash_without_changing_skill_hashes(self):
        source = "tests/behavior/calle-evals.json"
        with tempfile.TemporaryDirectory() as directory:
            temporary_root = Path(directory)
            shutil.copytree(ROOT / "skills/calle", temporary_root / "skills/calle")
            for relative in {case["source_file"] for case in build_catalog(ROOT)}:
                destination = temporary_root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, destination)
            before = not_run_results(temporary_root)
            fixture = temporary_root / source
            fixture.write_bytes(fixture.read_bytes() + b"\n")
            after = not_run_results(temporary_root)
            self.assertNotEqual(before["skill_and_fixture_file_hashes"][source],
                                after["skill_and_fixture_file_hashes"][source])
            for relative, digest in before["skill_and_fixture_file_hashes"].items():
                if relative != source:
                    self.assertEqual(after["skill_and_fixture_file_hashes"][relative], digest)
            self.assertEqual(before["cases"], after["cases"])
            self.assertEqual(after["summary"]["executed"], 0)

    def test_unified_update_fixtures_share_one_source_without_business_actions(self):
        catalog = build_catalog(ROOT)
        updates = [case for case in catalog if case["fixture"]["source_case"].get("mock_action_scope") == "skill_update"]
        self.assertEqual(len(updates), 18)
        expected_source = "https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/calle/SKILL.md"
        for case in updates:
            setup = case["fixture"]["source_case"]["setup"]
            self.assertEqual(setup["installed_name"], "calle")
            self.assertEqual(setup["update_source"], expected_source)
            self.assertNotIn("http.GET", case["fixture"]["allowed_actions"])
            self.assertNotIn("host.mock_discovery", case["fixture"]["allowed_actions"])

    def test_catalog_preserves_every_original_and_extra_expectation(self):
        catalog = {case["id"]: case for case in build_catalog(ROOT)}
        sources = [ROOT / "tests/behavior/calle-evals.json"]
        sources.append(ROOT / "tests/extra-behavior-cases.json")
        sources.append(ROOT / "tests/behavior/round-1-cases.json")
        for path in sources:
            for source in json.loads(path.read_text())["cases"]:
                case = catalog[source["id"]]
                self.assertEqual(case["source_file"], str(path.relative_to(ROOT)))
                self.assertEqual(case["prompt"], source["prompt"])
                all_expected = (source["expected"]
                                + [expected for turn in source.get("turns", []) for expected in turn.get("expected", [])]
                                + [expected for variant in source.get("variants", []) for expected in variant.get("expected", [])])
                self.assertEqual([item["expected"] for item in case["rubric"]], all_expected)
                self.assertEqual(case["fixture"]["source_case"], source)

    def test_catalog_all_have_evidence_rules_and_explicit_mock_only_scope(self):
        cases = build_catalog(ROOT)
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        for case in cases:
            self.assertEqual(case["execution_status"], "NOT_RUN")
            self.assertEqual(case["fixture"]["transport"], "mock_only")
            self.assertEqual(case["fixture"]["network_allowed"], False)
            self.assertEqual(case["fixture"]["real_credentials_allowed"], False)
            self.assertTrue(case["fixture"]["allowed_actions"])
            for rule in case["rubric"]:
                self.assertTrue(rule["evidence_required"])

    def test_round_one_cases_cover_remaining_c04_scenarios(self):
        cases = json.loads((ROOT / "tests/behavior/round-1-cases.json").read_text())["cases"]
        tags = {tag for case in cases for tag in case["tags"]}
        self.assertTrue({"event_pagination", "deduplicate_event_ids", "accepted_not_success", "429", "unknown_error", "missing_fields"} <= tags)

    def test_input_rejection_allows_persisting_the_corrected_body(self):
        case = next(case for case in build_catalog(ROOT) if case["id"] == "api-09")
        self.assertIn("journal.write", case["fixture"]["allowed_actions"])

    def test_not_run_results_include_each_expectation_without_invented_evidence(self):
        results = not_run_results(ROOT)
        self.assertEqual(results["summary"]["defined"], len(build_catalog(ROOT)))
        self.assertEqual(results["summary"]["original_defined"], 24)
        self.assertEqual(results["summary"]["executed"], 0)
        self.assertIsNone(results["network_transport_mocked"])
        self.assertIsNone(results["agent_host"])
        for case in results["cases"]:
            self.assertEqual(case["status"], "NOT_RUN")
            self.assertTrue(case["expectations"])
            self.assertFalse(validate_result_record(case))
            for expected in case["expectations"]:
                self.assertEqual(expected["status"], "NOT_RUN")
                self.assertEqual(expected["evidence"], [])

    def test_pass_cannot_be_claimed_without_trace_and_output(self):
        case = not_run_results(ROOT)["cases"][0]
        case["status"] = "PASS"
        for expected in case["expectations"]:
            expected["status"] = "PASS"
        self.assertTrue(validate_result_record(case))

    def test_not_run_rejects_evidence_files_and_graded_safety_review(self):
        case = not_run_results(ROOT)["cases"][0]
        for field in ("mock_call_trace_file", "redacted_agent_output_file"):
            mutated = copy.deepcopy(case)
            mutated[field] = "synthetic-should-not-exist.txt"
            self.assertTrue(validate_result_record(mutated))
        case["safety_review"] = {"status": "PASS", "evidence": ["synthetic-reference"]}
        self.assertTrue(validate_result_record(case))

    def test_evidence_record_validation_is_structural_not_an_agent_grade(self):
        case = not_run_results(ROOT)["cases"][0]
        case["status"] = "PASS"
        case["mock_call_trace_file"] = "synthetic-unit-test-trace.jsonl"
        case["redacted_agent_output_file"] = "synthetic-unit-test-output.txt"
        case["safety_review"] = {"status": "PASS", "evidence": ["trace:complete", "output:1-2"]}
        for expected in case["expectations"]:
            expected.update(status="PASS", evidence=["trace:complete", "output:1-2"])
        self.assertEqual(validate_result_record(case), [])
        case["expectations"][0]["status"] = "NOT_RUN"
        self.assertTrue(validate_result_record(case))

    def test_missing_fields_are_reported_per_operation(self):
        expected = {"create": ["id"], "read": ["id", "status", "result_status"], "cancel": ["id", "status"], "events": ["data", "next_cursor"]}
        for operation, missing in expected.items():
            report = response_report(operation, 202 if operation == "create" else 200, {})
            self.assertEqual(report["information_status"], "INSUFFICIENT_INFORMATION")
            self.assertEqual(report["missing_fields"], missing)

    def test_unknown_fields_are_allowed_and_input_is_not_modified(self):
        payload = {"id": "fixture-resource", "status": "completed", "result_status": "available", "result": {}, "future_server_field": {"anything": True}}
        original = copy.deepcopy(payload)
        report = response_report("read", 200, payload)
        self.assertEqual(report["information_status"], "SUFFICIENT_FOR_OPERATION")
        self.assertEqual(report["result_readiness"], "available")
        self.assertEqual(report["business_success"], "UNKNOWN")
        self.assertEqual(payload, original)
        self.assertNotIn("future_server_field", report)

    def test_accepted_response_uses_resource_not_billing_identifier(self):
        report = response_report("create", 202, {"id": "fixture-resource", "call_id": "fixture-billing"})
        self.assertEqual(report["resource_id"], "fixture-resource")
        self.assertEqual(report["acceptance"], "ACCEPTED")
        self.assertEqual(report["business_success"], "UNKNOWN")
        self.assertEqual(response_report("create", 202, {"call_id": "fixture-billing"})["missing_fields"], ["id"])

    def test_unexpected_success_status_does_not_imply_sufficient_information(self):
        report = response_report("create", 200, {"id": "fixture-resource"})
        self.assertEqual(report["information_status"], "INSUFFICIENT_INFORMATION")
        self.assertEqual(report["acceptance"], "UNKNOWN")
        self.assertIn("http_status", report["invalid_fields"])

    def test_result_available_requires_present_object_and_allows_empty(self):
        base = {"id": "fixture-resource", "status": "completed", "result_status": "available"}
        self.assertIn("result", response_report("read", 200, base)["missing_fields"])
        base["result"] = None
        self.assertIn("result", response_report("read", 200, base)["invalid_fields"])
        base["result"] = {}
        self.assertEqual(response_report("read", 200, base)["information_status"], "SUFFICIENT_FOR_OPERATION")

    def test_pending_and_unavailable_never_become_business_success(self):
        for state in ("pending", "unavailable", "not_applicable"):
            report = response_report("read", 200, {"id": "fixture-resource", "status": "completed", "result_status": state, "result": None, "error": None})
            self.assertEqual(report["result_readiness"], state)
            self.assertEqual(report["business_success"], "UNKNOWN")

    def test_unrecognized_result_state_retains_uncertainty(self):
        report = response_report("read", 200, {"id": "fixture-resource", "status": "future-state", "result_status": "new-result-state"})
        self.assertEqual(report["result_readiness"], "UNKNOWN")
        self.assertEqual(report["information_status"], "INSUFFICIENT_INFORMATION")

    def test_http_errors_are_not_success_and_unknown_errors_are_not_rejections(self):
        for status in (402, 429, 503, 598):
            report = response_report("create", status, {"error": {"code": "fixture_error"}})
            self.assertEqual(report["acceptance"], "UNKNOWN")
            self.assertEqual(report["business_success"], "UNKNOWN")
            self.assertEqual(report["information_status"], "HTTP_ERROR")
            self.assertEqual(report["error_code"], "fixture_error")

    def test_redirect_is_never_success_and_report_does_not_copy_location(self):
        report = response_report("create", 307, {"location": "https://untrusted.invalid/collect"})
        self.assertEqual(report["information_status"], "HTTP_ERROR")
        self.assertNotIn("location", report)

    def test_events_page_checks_item_ids_and_cursor_without_transcript_guess(self):
        valid = {"data": [{"id": "fixture-event-1", "type": "call.asr", "future": 123}], "next_cursor": "fixture-cursor"}
        self.assertEqual(response_report("events", 200, valid)["information_status"], "SUFFICIENT_FOR_OPERATION")
        self.assertEqual(response_report("events", 200, {"data": [], "next_cursor": None})["information_status"], "SUFFICIENT_FOR_OPERATION")
        report = response_report("events", 200, {"data": [{}], "next_cursor": 7})
        self.assertEqual(set(report["invalid_fields"]), {"data[0].id", "next_cursor"})
        self.assertNotIn("transcript", report)

    def test_bad_response_shapes_report_information_gap(self):
        for payload in (None, [], "fixture"):
            self.assertEqual(response_report("read", 200, payload)["information_status"], "INSUFFICIENT_INFORMATION")
        with self.assertRaises(ValueError):
            response_report("invented-operation", 200, {})


if __name__ == "__main__":
    unittest.main()
