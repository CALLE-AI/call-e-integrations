"""Regression checks for observed evaluator contract mismatches."""
import unittest
from unittest.mock import patch
import copy
from pathlib import Path

from tests.behavior.codex_adapter import scenario_instances, audit_execution, configuration_fingerprint, merge_observed_progress
from tests.behavior.fixture_server import FixtureDispatcher
from tests.behavior.lifecycle_mocks import LifecycleMock
from tests.behavior.preparation import build_catalog
from tests.behavior.stateful_mocks import StatefulMock, API_ORIGIN

ROOT = Path(__file__).resolve().parents[1]


class EvaluatorRepairTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = {case["id"]: case for case in build_catalog(ROOT)}

    def lifecycle(self, case_id):
        case = self.cases[case_id]
        return LifecycleMock(case["fixture"]["source_case"], allowed_actions=case["fixture"]["allowed_actions"])

    def test_variant_wrappers_do_not_invent_an_empty_base_run(self):
        for case_id in ("api-update-05", "mcp-update-05", "route-07"):
            case = self.cases[case_id]["fixture"]["source_case"]
            self.assertEqual([name for name, _ in scenario_instances(case)],
                             [variant["id"] for variant in case["variants"]])

    def test_known_discovery_cursor_can_resume_without_replaying_initial_page(self):
        mock = self.lifecycle("route-06")
        page = mock.dispatch("host.mock_discovery", {"cursor": "fixture-next-page"})
        self.assertTrue(page["complete"])
        with self.assertRaises(PermissionError):
            mock.dispatch("host.mock_discovery", {"cursor": "invented"})

    def test_authorized_independent_cleanup_layers_work_in_either_order(self):
        for actions in (("host.mock_remove", "host.mock_logout"), ("host.mock_logout", "host.mock_remove")):
            mock = self.lifecycle("mcp-16")
            for action in actions:
                mock.dispatch(action, {})
            self.assertEqual(mock.connection, "missing")
            self.assertEqual(mock.oauth_status, "local_credentials_deleted")
            self.assertEqual(mock.configuration_count, 0)

    def test_preverified_package_does_not_require_redundant_inspection(self):
        mock = self.lifecycle("api-update-08")
        result = mock.dispatch("update.mock_install", {"commit": mock.setup["verified_commit"],
                                                       "version": mock.setup["downloaded_version"]})
        self.assertEqual(result["installed_version"], "2.0.1")
        with self.assertRaises(PermissionError):
            mock.dispatch("update.mock_install", {"commit": mock.setup["verified_commit"], "version": "2.0.1"})

    def test_preparation_goal_is_left_to_semantic_review_without_weakening_identity(self):
        mock = self.lifecycle("mcp-current-01")
        with self.assertRaises(PermissionError):
            mock.dispatch("mcp.prepare_call", {"phone": "+12025550199", "task": "Greet the recipient."})
        self.assertTrue(mock.dispatch("mcp.prepare_call", {"phone": "+12025550123", "task": "Greet the recipient."})["card_rendered"])

    def test_expired_deadline_can_clear_but_future_deadline_cannot(self):
        source = self.cases["api-polling-01"]["fixture"]["source_case"]
        variant = next(item for item in source["variants"] if item["id"] == "server-delay-75-seconds")
        mock = StatefulMock(source, variant)
        url = API_ORIGIN + "/v2/calls/" + mock.call_id
        mock.dispatch("http.GET", {"url": url})
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": {"resource_id": mock.call_id,
                                                         "polling_state": {"server_not_before_virtual_seconds": None}}})
        mock.dispatch("local.report", {"message": "Waiting under server guidance."})
        for seconds in (30, 30):
            mock.dispatch("host.mock_wait", {"seconds": seconds})
        mock.dispatch("local.report", {"message": "Still waiting under server guidance."})
        mock.dispatch("host.mock_wait", {"seconds": 15})
        mock.dispatch("http.GET", {"url": url})
        mock.dispatch("journal.write", {"record": {"resource_id": mock.call_id,
                                                     "polling_state": {**mock.state, "server_not_before_virtual_seconds": None}}})
        self.assertEqual(mock.state["session_query_count"], 2)
        self.assertIsNone(mock.journal["polling_state"]["server_not_before_virtual_seconds"])

    def test_execution_audit_requires_complete_and_reconciled_evidence(self):
        item = {"id": "m1", "type": "mcp_tool_call", "tool": "synthetic_read", "arguments": {"id": "synthetic"}}
        events = [{"type": "item.started", "item": item}, {"type": "item.completed", "item": item},
                  {"type": "turn.completed"}]
        trace = [{"kind": "tool_attempt", "tool_name": "synthetic_read", "arguments_redacted": {"id": "synthetic"}}]
        self.assertEqual(audit_execution(events, trace), [])
        self.assertTrue(audit_execution(events[:-1], trace))
        self.assertTrue(audit_execution([events[0], events[-1]], trace))
        self.assertTrue(audit_execution(events, []))
        self.assertTrue(audit_execution(events + [{"type": "turn.failed"}], trace))
        self.assertTrue(audit_execution(events, trace + trace))

    def test_unexpected_handler_exception_preserves_attempt_and_is_not_skill_failure(self):
        host = FixtureDispatcher({"source": {"id": "synthetic"}, "skill_files": {"SKILL.md": "safe"},
                                  "allowed_actions": []})
        observed = []
        with patch.object(host, "dispatch", side_effect=AttributeError("synthetic handler defect")):
            result = host.call("read_skill_file", {"path": "SKILL.md"},
                               persist_attempt=lambda: observed.extend(copy.deepcopy(host.trace)))
        self.assertEqual(observed[-1]["kind"], "tool_attempt")
        self.assertTrue(result["isError"])
        self.assertTrue(host.trace[-1]["evaluator_error"])
        self.assertEqual(host.trace[-1]["error_type"], "AttributeError")

    def test_capability_configuration_fingerprint_changes_with_tool_policy(self):
        original = configuration_fingerprint()
        with patch("tests.behavior.codex_adapter.DISABLED_FEATURES", ("shell_tool",)):
            self.assertNotEqual(configuration_fingerprint(), original)

    def test_minimal_connection_fixture_gets_explicit_inert_schema(self):
        case = self.cases["extra-11"]
        host = FixtureDispatcher({"source": case["fixture"]["source_case"], "skill_files": {},
                                  "allowed_actions": case["fixture"]["allowed_actions"], "lifecycle_enabled": True})
        tool = next(tool for tool in host.tools if tool["name"] == "fixture_test_connection")
        self.assertEqual(tool["inputSchema"]["type"], "object")
        self.assertFalse(tool["inputSchema"]["additionalProperties"])

    def test_event_empty_page_requires_later_authorized_turn_and_keeps_cursor(self):
        mock = self.lifecycle("c04-01")
        url = API_ORIGIN + "/v2/calls/fixture-resource/events?cursor=fixture-event-0"
        first = mock.dispatch("http.GET", {"url": url})
        next_cursor = first["body"]["next_cursor"]
        second = mock.dispatch("http.GET", {"url": url.split("?")[0] + "?cursor=" + next_cursor})
        self.assertIsNone(second["body"]["next_cursor"])
        mock.dispatch("journal.write", {"record": {"resource_id": "fixture-resource", "last_event_id": "fixture-event-3"}})
        with self.assertRaises(PermissionError):
            mock.dispatch("http.GET", {"url": url.split("?")[0] + "?cursor=fixture-event-3"})
        mock.advance_turn(1)
        empty = mock.dispatch("http.GET", {"url": url.split("?")[0] + "?cursor=fixture-event-3"})
        self.assertEqual(empty["body"]["data"], [])
        self.assertEqual(mock.journal["last_event_id"], "fixture-event-3")

    def test_native_progress_checkpoint_merge_changes_only_observed_timestamp(self):
        checkpoint = {"format": "calle-stateful-mock-controller-state-v1", "current": {
            "clock": 48, "last_progress_time": 18, "state": {"session_query_count": 10,
            "server_not_before_virtual_seconds": 93}, "call_id": "synthetic"}}
        audit = {"fully_reconciled": True, "latest_progress_time": 48, "final_clock": 48}
        merged = merge_observed_progress(checkpoint, audit)
        expected = copy.deepcopy(checkpoint)
        expected["current"]["last_progress_time"] = 48
        self.assertEqual(merged, expected)
        self.assertEqual(checkpoint["current"]["last_progress_time"], 18)
        for patch_fields in ({"fully_reconciled": False}, {"latest_progress_time": 49},
                             {"latest_progress_time": 17}, {"latest_progress_time": float("nan")}, {"final_clock": 50}):
            with self.assertRaises(ValueError):
                merge_observed_progress(checkpoint, {**audit, **patch_fields})


if __name__ == "__main__":
    unittest.main()
