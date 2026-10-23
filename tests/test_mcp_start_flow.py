"""Pure mock checks for authorized UI and headless MCP execution."""
import copy
import unittest
from pathlib import Path

from tests.behavior.fixture_server import FixtureDispatcher
from tests.behavior.lifecycle_mocks import LifecycleMock
from tests.behavior.preparation import build_catalog
from tests.offline import offline_guard


ROOT = Path(__file__).resolve().parents[1]


class McpStartFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {item["id"]: item for item in build_catalog(ROOT)}

    def make(self, case_id, variant=None):
        fixture = self.catalog[case_id]["fixture"]
        source = fixture["source_case"]
        option = next((item for item in source.get("variants", []) if item["id"] == variant), None)
        return LifecycleMock(source, option, fixture["allowed_actions"])

    def prepare(self, mock):
        return mock.dispatch("mcp.prepare_call", {"phone": "+12025550123", "task": "Say hello."})["preparation"]

    def start(self, mock, preparation=None):
        preparation = preparation or mock.preparation
        return mock.dispatch("mcp.start_call", {key: preparation[key] for key in ("preparation_id", "revision")})

    def test_authorized_ready_flow_works_with_or_without_card(self):
        with offline_guard():
            for variant in ("headless", "native-card-available"):
                with self.subTest(variant=variant):
                    mock = self.make("mcp-current-07", variant)
                    preparation = self.prepare(mock)
                    self.assertEqual(preparation["status"], "ready")
                    self.assertIsNone(mock.call)
                    started = self.start(mock)
                    call_id = started["call"]["id"]
                    self.assertEqual(started["call"]["status"], "queued")
                    read = mock.dispatch("mcp.get_call", {"call_id": call_id})
                    self.assertEqual(read["call"]["result_status"], "not_applicable")
                    self.assertEqual((mock.preparation_count, mock.call_create_count), (1, 1))
                    self.assertEqual([entry["action"] for entry in mock.trace],
                                     ["mcp.prepare_call", "mcp.start_call", "mcp.get_call"])

    def test_same_preparation_retry_deduplicates_and_is_bounded(self):
        mock = self.make("mcp-current-07", "headless")
        preparation = self.prepare(mock)
        self.assertEqual(self.start(mock), self.start(mock))
        self.assertEqual(mock.call_create_count, 1)
        with self.assertRaises(PermissionError):
            self.start(mock)
        with self.assertRaises(PermissionError):
            self.prepare(mock)
        with self.assertRaises(PermissionError):
            self.start(mock, {**preparation, "preparation_id": "prep_other"})

    def test_server_clarification_revision_is_reused_across_turns(self):
        mock = self.make("mcp-current-08")
        initial = self.prepare(mock)
        self.assertEqual(initial["status"], "needs_input")
        resumed = LifecycleMock.from_state(mock.case, mock.export_state())
        resumed.advance_turn(1)
        revised = resumed.dispatch("mcp.prepare_call", {
            "preparation_id": initial["preparation_id"], "revision": 1, "user_input": "Use Alex."})["preparation"]
        self.assertEqual(revised["revision"], 2)
        self.assertEqual(revised["status"], "ready")
        stale = self.start(resumed, initial)
        self.assertEqual(stale["error"]["status"], 409)
        self.assertIsNone(resumed.call)
        self.start(resumed, revised)
        self.assertEqual((resumed.preparation_count, resumed.call_create_count), (1, 1))

    def test_incomplete_or_blocked_preparations_cannot_start(self):
        for case_id, variant in (("mcp-current-08", None), ("mcp-current-11", "blocked-policy")):
            with self.subTest(case=case_id):
                mock = self.make(case_id, variant)
                self.prepare(mock)
                result = self.start(mock)
                self.assertEqual(result["error"]["status"], 422)
                self.assertEqual(mock.call_create_count, 0)

    def test_uncertain_accepted_start_recovers_without_new_preparation(self):
        mock = self.make("mcp-current-09")
        preparation = self.prepare(mock)
        uncertain = self.start(mock)
        self.assertTrue(uncertain["isError"])
        self.assertEqual(uncertain["submission_outcome"], "unknown")
        self.assertIsNone(mock.public_state()["saved_call"])
        with self.assertRaises(PermissionError):
            self.prepare(mock)
        restored = LifecycleMock.from_state(mock.case, mock.export_state())
        with self.assertRaises(PermissionError):
            self.start(restored, {**preparation, "revision": 2})
        recovered = self.start(restored, preparation)
        self.assertEqual(recovered["call"]["id"], "call_fixture9")
        self.assertEqual((restored.preparation_count, restored.start_count, restored.call_create_count), (1, 2, 1))

    def test_native_dial_race_returns_one_call(self):
        mock = self.make("mcp-current-10")
        self.prepare(mock)
        first = self.start(mock)
        second = self.start(mock)
        self.assertEqual(first["call"]["id"], second["call"]["id"])
        native_event = next(item for item in mock.provenance if item["label"] == "native Dial event")
        self.assertEqual(native_event["details"]["call"]["id"], first["call"]["id"])
        self.assertEqual(mock.call_create_count, 1)

    def test_prepare_only_does_not_gain_execution_from_loaded_tool(self):
        mock = self.make("mcp-current-11", "prepare-only-ready")
        self.assertIn("mcp.start_call", mock.allowed_actions)
        self.assertEqual(self.prepare(mock)["status"], "ready")
        with self.assertRaises(PermissionError):
            self.start(mock)
        self.assertEqual(mock.call_create_count, 0)

    def test_later_wait_instruction_revokes_execution_without_losing_preparation(self):
        fixture = self.catalog["mcp-current-07"]["fixture"]
        source = copy.deepcopy(fixture["source_case"])
        source.pop("variants")
        source["turns"] = [{"prompt": ""}, {"prompt": "Wait. Keep this as a preparation only.",
                                            "setup": {"execution_authorized": False}}]
        mock = LifecycleMock(source, allowed_actions=fixture["allowed_actions"])
        preparation = self.prepare(mock)
        resumed = LifecycleMock.from_state(mock.case, mock.export_state())
        resumed.advance_turn(1)
        self.assertEqual(resumed.preparation, preparation)
        with self.assertRaises(PermissionError):
            self.start(resumed)
        self.assertEqual(resumed.call_create_count, 0)

    def test_retryable_service_error_is_exposed_without_stopping_fixture(self):
        fixture = self.catalog["mcp-current-09"]["fixture"]
        dispatcher = FixtureDispatcher({"source": fixture["source_case"], "allowed_actions": fixture["allowed_actions"],
                                        "skill_files": {}, "lifecycle_enabled": True})
        names = {action: name for name, action in dispatcher.actions.items()}
        dispatcher.call(names["mcp.prepare_call"], {"phone": "+12025550123", "task": "Say hello."})
        args = {"preparation_id": "prep_fixture9", "revision": 1}
        self.assertTrue(dispatcher.call(names["mcp.start_call"], args)["isError"])
        self.assertFalse(dispatcher.stopped)
        self.assertFalse(dispatcher.call(names["mcp.start_call"], args)["isError"])
        self.assertEqual(dispatcher.stateful.call_create_count, 1)

    def test_start_requires_authenticated_connection_and_exact_schema(self):
        mock = self.make("mcp-current-07", "headless")
        self.prepare(mock)
        for args in ({"preparation_id": mock.preparation["preparation_id"]},
                     {"preparation_id": "prep_fixture7", "revision": 0},
                     {"preparation_id": "prep_fixture7", "revision": 1, "task": "Override"}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                mock.dispatch("mcp.start_call", args)
        mock.connection = "unauthenticated"
        with self.assertRaises(PermissionError):
            self.start(mock)
        self.assertEqual(mock.call_create_count, 0)

    def test_preview_authentication_and_cancel_scopes_have_no_dial_permission(self):
        for case_id in ("mcp-current-03", "mcp-current-06", "mcp-current-12"):
            fixture = self.catalog[case_id]["fixture"]
            dispatcher = FixtureDispatcher({"source": fixture["source_case"], "allowed_actions": fixture["allowed_actions"],
                                            "skill_files": {}, "lifecycle_enabled": True})
            name = next(name for name, action in dispatcher.actions.items() if action == "mcp.start_call")
            result = dispatcher.call(name, {"preparation_id": "prep_fixture7", "revision": 1})
            self.assertTrue(result["isError"])
            self.assertIn("authorization ceiling", dispatcher.trace[-1]["blocked_reason"])
            self.assertNotIn("mcp.cancel_call", dispatcher.actions.values())


if __name__ == "__main__":
    unittest.main()
