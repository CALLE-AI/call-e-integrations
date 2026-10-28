"""Offline boundary tests for the actual Agent executor and synthetic MCP host."""
import copy
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from tests.behavior.codex_adapter import (
    audit_events, cli_arguments, inference_environment, normalized_turn_source,
    restricted_catalog, scenario_instances,
)
from tests.behavior.fixture_server import FixtureDispatcher, SOURCE_URL, public_setup
from tests.behavior.preparation import build_catalog

ROOT = Path(__file__).resolve().parents[1]


class AgentExecutorTests(unittest.TestCase):
    def source(self, case_id):
        return copy.deepcopy(next(case["fixture"]["source_case"] for case in build_catalog(ROOT)
                                  if case["id"] == case_id))

    def dispatcher(self, source, allowed=None):
        return FixtureDispatcher({"source": source,
                                  "allowed_actions": allowed or source.get("mock_allowed_actions", []),
                                  "skill_files": {"SKILL.md": "safe", "references/test.md": "reference"}})

    def test_model_catalog_removes_native_capabilities_without_changing_model(self):
        original = {"models": [{"slug": "inherited", "apply_patch_tool_type": "freeform",
                                "node_repl_disabled": False, "multi_agent_version": "v2"}]}
        restricted = restricted_catalog(original)
        self.assertEqual(restricted["models"][0]["slug"], "inherited")
        self.assertIsNone(restricted["models"][0]["apply_patch_tool_type"])
        self.assertIsNone(restricted["models"][0]["multi_agent_version"])
        self.assertIsNone(restricted["models"][0]["tool_mode"])
        self.assertTrue(restricted["models"][0]["node_repl_disabled"])
        self.assertFalse(restricted["models"][0]["supports_search_tool"])
        self.assertFalse(original["models"][0]["node_repl_disabled"])
        with self.assertRaises(ValueError):
            restricted_catalog({"models": [{"slug": "unknown-schema"}]})

    def test_inference_process_does_not_inherit_business_secrets(self):
        with patch.dict(os.environ, {"PATH": "/fixture/bin", "HOME": "/fixture/home",
                                     "CALLE_API_KEY": "synthetic", "OTHER_TOKEN": "synthetic"}, clear=True):
            self.assertEqual(inference_environment(), {"PATH": "/fixture/bin", "HOME": "/fixture/home"})

    def test_cli_has_no_model_override_and_ignores_inherited_tools(self):
        arguments = cli_arguments("codex", Path("/fixture/catalog"), Path("/fixture/scratch"))
        self.assertIn("--ignore-user-config", arguments)
        self.assertIn("--ignore-rules", arguments)
        self.assertIn("--strict-config", arguments)
        self.assertIn("--ephemeral", arguments)
        self.assertIn("features.shell_tool=false", arguments)
        self.assertIn("features.apps=false", arguments)
        self.assertIn("features.plugins=false", arguments)
        self.assertIn('web_search="disabled"', arguments)
        self.assertFalse(any(argument.startswith("model=") or argument.startswith("model_reasoning_effort=")
                             for argument in arguments))

    def test_unexpected_native_or_wrong_server_event_invalidates_isolation(self):
        def event(kind, server=None):
            return {"item": {"type": kind, "server": server}}
        self.assertEqual(audit_events([event("agent_message"), event("mcp_tool_call", "fixture")], "fixture"), [])
        for item in (event("command_execution"), event("file_change"), event("web_search"),
                     event("collab_tool_call"), event("mcp_tool_call", "real_service")):
            self.assertTrue(audit_events([item], "fixture"))

    def test_public_setup_never_exposes_future_responses_or_install_result(self):
        source = {"setup": {"connection": "authenticated", "fixture_response": {"answer": "future"},
                             "discovery_pages": [{"secret": "future"}], "downloaded_version": "9.0.0"},
                  "expected": ["rubric"], "variants": [{"expected": ["hidden"]}]}
        self.assertEqual(public_setup(source), {"connection": "authenticated"})

    def test_read_skill_rejects_arbitrary_path_and_stops_scenario(self):
        dispatcher = self.dispatcher({"id": "synthetic"})
        self.assertFalse(dispatcher.call("read_skill_file", {"path": "references/test.md"})["isError"])
        self.assertTrue(dispatcher.call("read_skill_file", {"path": "/private/credential"})["isError"])
        self.assertTrue(dispatcher.call("read_skill_file", {"path": "SKILL.md"})["isError"])
        self.assertTrue(dispatcher.stopped)

    def test_loaded_tool_is_not_implicitly_authorized(self):
        source = self.source("mcp-current-06")
        dispatcher = self.dispatcher(source)
        name = next(name for name in dispatcher.actions if dispatcher.actions[name] == "mcp.prepare_call")
        result = dispatcher.call(name, {})
        self.assertTrue(result["isError"])
        self.assertIn("authorization ceiling", dispatcher.trace[-1]["blocked_reason"])

    def test_synthetic_terminal_is_callable_but_never_executes(self):
        dispatcher = self.dispatcher({"id": "synthetic", "setup": {"available_capabilities": ["terminal shell only"]}}, ["local.report"])
        self.assertIn("synthetic_terminal", dispatcher.actions)
        result = dispatcher.call("synthetic_terminal", {"command": "never-executed"})
        self.assertTrue(result["isError"])
        self.assertIn("authorization ceiling", dispatcher.trace[-1]["blocked_reason"])

    def test_metadata_fetch_never_accepts_credentials_redirect_or_other_origin(self):
        for mutation in ({"headers": {"Authorization": "Bearer synthetic"}},
                         {"follow_redirects": True}, {"url": "https://attacker.invalid"}):
            dispatcher = self.dispatcher(self.source("api-update-02"))
            arguments = {"url": SOURCE_URL + "?calle_update_check=0123456789abcdef", "headers": {}, "follow_redirects": False, **mutation}
            self.assertTrue(dispatcher.call("fetch_public_metadata", arguments)["isError"])
        dispatcher = self.dispatcher(self.source("api-update-02"))
        result = dispatcher.call("fetch_public_metadata", {"url": SOURCE_URL + "?calle_update_check=0123456789abcdef", "headers": {}, "follow_redirects": False})
        self.assertFalse(result["isError"])
        self.assertIn("Synthetic hostile text", result["content"][0]["text"])
        self.assertFalse(dispatcher.stopped)

    def test_discovery_requires_observed_cursor_and_keeps_page_order(self):
        dispatcher = self.dispatcher(self.source("mcp-current-02"))
        first = json.loads(dispatcher.call("discover_tools", {"cursor": None})["content"][0]["text"])
        second = json.loads(dispatcher.call("discover_tools", {"cursor": first["next_cursor"]})["content"][0]["text"])
        self.assertEqual(len(first["tool_names"]), 2)
        self.assertEqual(len(second["tool_names"]), 1)
        self.assertIsNone(second["next_cursor"])
        self.assertTrue(dispatcher.call("discover_tools", {"cursor": "invented"})["isError"])

    def test_bridge_metadata_fresh_retry_recovers_404_and_rejects_third_attempt(self):
        source = self.source("api-update-02")
        source["setup"].pop("fixture_response")
        source["setup"]["fixture_responses"] = [{"status": 404}, {"status": 200, "body": "new version"}]
        dispatcher = self.dispatcher(source)
        for nonce, status in (("0123456789abcdef", 404), ("fedcba9876543210", 200)):
            result = dispatcher.call("fetch_public_metadata", {
                "url": SOURCE_URL + "?calle_update_check=" + nonce, "headers": {}, "follow_redirects": False})
            self.assertFalse(result["isError"])
            self.assertEqual(json.loads(result["content"][0]["text"])["status"], status)
        result = dispatcher.call("fetch_public_metadata", {
            "url": SOURCE_URL + "?calle_update_check=1111111111111111", "headers": {}, "follow_redirects": False})
        self.assertTrue(result["isError"])

    def test_bridge_metadata_rejects_cached_url_and_reused_nonce(self):
        dispatcher = self.dispatcher(self.source("api-update-02"))
        self.assertTrue(dispatcher.call("fetch_public_metadata", {
            "url": SOURCE_URL, "headers": {}, "follow_redirects": False})["isError"])
        source = self.source("api-update-02")
        source["setup"]["fixture_response"] = {"status": 404}
        dispatcher = self.dispatcher(source)
        arguments = {"url": SOURCE_URL + "?calle_update_check=0123456789abcdef", "headers": {}, "follow_redirects": False}
        self.assertFalse(dispatcher.call("fetch_public_metadata", arguments)["isError"])
        self.assertTrue(dispatcher.call("fetch_public_metadata", arguments)["isError"])

    def test_bridge_metadata_restore_preserves_nonce_and_attempt_limits(self):
        source = self.source("api-update-02")
        source["setup"]["fixture_response"] = {"status": 404}
        dispatcher = self.dispatcher(source)
        arguments = {"url": SOURCE_URL + "?calle_update_check=0123456789abcdef", "headers": {}, "follow_redirects": False}
        self.assertFalse(dispatcher.call("fetch_public_metadata", arguments)["isError"])
        payload = {"source": source, "allowed_actions": source["mock_allowed_actions"],
                   "skill_files": {}, "controller_state": json.loads(json.dumps(dispatcher.controller_state()))}
        reused = FixtureDispatcher(payload)
        self.assertTrue(reused.call("fetch_public_metadata", arguments)["isError"])
        restored = FixtureDispatcher(payload)
        self.assertFalse(restored.call("fetch_public_metadata", {
            **arguments, "url": SOURCE_URL + "?calle_update_check=fedcba9876543210"})["isError"])
        payload["controller_state"] = json.loads(json.dumps(restored.controller_state()))
        exhausted = FixtureDispatcher(payload)
        self.assertTrue(exhausted.call("fetch_public_metadata", {
            **arguments, "url": SOURCE_URL + "?calle_update_check=1111111111111111"})["isError"])
        self.assertEqual(exhausted.snapshot()["metadata_fetch_count"], 2)

    def test_bridge_metadata_never_retries_nontransient_results_or_exposes_sequences(self):
        for response in ({"status": 200}, {"status": 401}, {"status": 403}, {"status": 429},
                         {"status": 302}, {"transport_error": "permission_denied"}):
            with self.subTest(response=response):
                source = self.source("api-update-02")
                source["setup"]["fixture_responses"] = [response, {"status": 200, "body": "hidden future"}]
                self.assertNotIn("hidden future", json.dumps(public_setup(source)))
                dispatcher = self.dispatcher(source)
                arguments = {"url": SOURCE_URL + "?calle_update_check=0123456789abcdef", "headers": {}, "follow_redirects": False}
                self.assertFalse(dispatcher.call("fetch_public_metadata", arguments)["isError"])
                self.assertTrue(dispatcher.call("fetch_public_metadata", {
                    **arguments, "url": SOURCE_URL + "?calle_update_check=fedcba9876543210"})["isError"])

    def test_polling_variant_does_not_inherit_other_response_sequence(self):
        variants = dict(scenario_instances(self.source("api-polling-01")))
        interrupted = variants["interrupted-retry-after"] if "interrupted-retry-after" in variants else next(
            value for value in variants.values() if value.get("fixture_interruptions"))
        snapshot = variants["snapshot-only"]
        self.assertNotIn("fixture_interruptions", snapshot)
        self.assertEqual(snapshot["expected_read_counts"]["session"], 1)
        self.assertNotEqual(snapshot["fixture_status_reads"], interrupted["fixture_status_reads"])

    def test_update_followup_keeps_initial_turn_and_onboarding_does_not_duplicate(self):
        update = normalized_turn_source(self.source("api-update-01"))
        onboarding = normalized_turn_source(self.source("api-onboarding-01"))
        self.assertEqual(len(update["turns"]), 2)
        self.assertEqual(update["turns"][1]["user"], "Maybe later.")
        self.assertEqual(len(onboarding["turns"]), 2)
        for transport in ("api", "mcp"):
            variants = dict(scenario_instances(self.source(f"{transport}-update-06")))
            for name in ("first-use-404-recovery", "automatic-404-exhausted"):
                with self.subTest(transport=transport, variant=name):
                    source = normalized_turn_source(variants[name])
                    self.assertEqual(len(source["turns"]), 3)
                    self.assertEqual(source["turns"][0]["prompt"], "")
                    self.assertEqual(source["turns"][1]["user"], source["prompt"])
                    self.assertEqual(source["turns"][2]["user"], "Can it also retrieve call transcripts?")

    def test_acceptance_fixture_declares_its_limited_read_capability(self):
        dispatcher = self.dispatcher(self.source("api-onboarding-01"))
        tool = next(tool for tool in dispatcher.tools if tool["name"] == "http_GET")
        self.assertEqual(tool["inputSchema"]["properties"]["url"]["const"],
                         "https://api.heycall-e.com/v1/goals?limit=1")
        self.assertIn("no Call-status read capability", tool["description"])

    def test_discovered_service_names_keep_the_exact_callable_binding(self):
        source = self.source("mcp-12")
        dispatcher = FixtureDispatcher({"source": source, "skill_files": {},
                                        "allowed_actions": source["mock_allowed_actions"],
                                        "lifecycle_enabled": True})
        self.assertEqual(dispatcher.actions["fixture_account_read"],
                         "mcp.explicitly_loaded_fixture_read_only_tool")
        self.assertNotIn("mcp_explicitly_loaded_fixture_read_only_tool", dispatcher.actions)


if __name__ == "__main__":
    unittest.main()
