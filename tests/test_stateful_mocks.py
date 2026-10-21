"""Dispatcher unit tests only; these do not execute or grade an Agent."""
import copy
import json
from pathlib import Path
import unittest

from tests.behavior.stateful_mocks import API_ORIGIN, DASHBOARD, StatefulMock
from tests.offline import offline_guard

ROOT = Path(__file__).resolve().parents[1]


def cases():
    return {case["id"]: case for case in json.loads(
        (ROOT / "tests/behavior/callev2-evals.json").read_text(encoding="utf-8"))["cases"]}


def variant(case, name):
    return next(item for item in case["variants"] if item["id"] == name)


def read(mock, call_id=None):
    call_id = call_id or mock.call_id
    if mock.transport == "api":
        return mock.dispatch("http.GET", {"url": API_ORIGIN + "/v2/calls/" + call_id})
    return mock.dispatch("mcp.get_call", {"call_id": call_id})


def wait(mock, seconds):
    remaining = seconds
    while remaining > 0:
        chunk = min(remaining, 30)
        if mock.clock + chunk - mock.last_progress_time > 60:
            mock.dispatch("local.report", {"message": "Still waiting for the existing result."})
        mock.dispatch("host.mock_wait", {"seconds": chunk})
        remaining -= chunk
        if mock.stopped_reason:
            break


def scheduled_read(mock):
    cumulative = mock.state["cumulative_query_count"]
    ordinal = cumulative + 1 if cumulative is not None else mock.state["session_query_count"] + 1
    range_key = "query_ordinals" if cumulative is not None else "session_request_ordinals"
    plans = [item for item in mock.case.get("fixture_wait_plan", [])
             if range_key in item and item[range_key][0] <= ordinal <= item[range_key][1]]
    planned_delay = plans[0]["seconds"] if plans else 0
    deadline = mock.state["server_not_before_virtual_seconds"] or 0
    needed = max(mock.last_query_time + planned_delay, deadline) - mock.clock
    if needed > 0:
        wait(mock, needed)
    if not mock.stopped_reason:
        read(mock)


def original_record(case):
    authorized = case["setup"]["authorized_call"]
    return {
        "interface": "api-key", "server_or_base_url": API_ORIGIN,
        "authorization_scope": {"approved_number": authorized["phone"],
            "approved_purpose": authorized["goal"], "maximum_logical_calls": 1},
        "original_request_body_or_tool_arguments": {
            "phone": authorized["phone"], "task": authorized["goal"],
            "result_schema": {"type": "object", "additionalProperties": False,
                              "properties": {"summary": {"type": "string"}}}},
        "api_idempotency_key": "synthetic-onboarding-stable-key", "resource_id": None,
    }


class StatefulMockTests(unittest.TestCase):
    def setUp(self):
        self.cases = cases()

    def test_all_polling_variants_are_pure_and_preserve_expected_counts(self):
        # This exercises fixture dispatch, not a model's independent decisions.
        executed = 0
        multiturn = []
        with offline_guard():
            for case_id in ("api-polling-01", "mcp-polling-01"):
                case = self.cases[case_id]
                for option in [None, *case["variants"]]:
                    if option and option.get("fixture_execution_profile") == "controller_multiturn_interruption_resume":
                        multiturn.append((case_id, option["id"]))
                        continue
                    with self.subTest(case=case_id, variant=option and option["id"]):
                        mock = StatefulMock(case, option)
                        for _ in range(121):
                            if mock.stopped_reason:
                                break
                            scheduled_read(mock)
                        expected = (option or case)["expected_read_counts"]
                        self.assertEqual(mock.state["session_query_count"], expected["session"])
                        self.assertEqual(mock.state["cumulative_query_count"], expected["cumulative"])
                        self.assertIsNotNone(mock.stopped_reason)
                        self.assertEqual(mock.create_count, 0)
                        executed += 1
        self.assertEqual(executed, 44)
        # Dedicated actual-checkpoint resume tests live in test_polling_interruption_resume.py.
        self.assertEqual(multiturn, [(case_id, "host-hard-interruption-resume")
                                    for case_id in ("api-polling-01", "mcp-polling-01")])

    def test_resumed_counts_determine_phase_and_early_reads_do_not_consume_responses(self):
        case = self.cases["api-polling-01"]
        mock = StatefulMock(case, variant(case, "resume-after-10-reads"))
        with self.assertRaises(PermissionError):
            read(mock)
        self.assertEqual(mock.state["session_query_count"], 10)
        wait(mock, 5)
        read(mock)
        self.assertEqual(mock.state["session_query_count"], 11)

    def test_resource_identity_and_scope_are_enforced_before_state_changes(self):
        for case_id in ("api-polling-01", "mcp-polling-01"):
            mock = StatefulMock(self.cases[case_id])
            with self.assertRaises(PermissionError):
                read(mock, "wrong-billing-id")
            with self.assertRaises(PermissionError):
                mock.dispatch("mcp.prepare_call", {})
            self.assertEqual(mock.state["session_query_count"], 0)

    def test_server_delay_is_observed_without_exposing_future_responses(self):
        case = self.cases["api-polling-01"]
        mock = StatefulMock(case, variant(case, "server-delay-75-seconds"))
        result = read(mock)
        self.assertEqual(result["headers"]["Retry-After"], "75")
        wait(mock, 60)
        with self.assertRaises(PermissionError):
            read(mock)
        mock.dispatch("local.report", {"message": "The server requires additional time."})
        wait(mock, 15)
        result = read(mock)
        self.assertEqual(result["body"]["result"], {})
        self.assertEqual(mock.clock, 75)
        serialized = json.dumps(mock.snapshot())
        for hidden in ("expected_read_counts", "fixture_status_reads", "fixture_wait_plan", "fixture_future_responses"):
            self.assertNotIn(hidden, serialized)
        self.assertNotIn("SYNTHETIC_NOT_A_REAL_KEY", serialized)

    def test_waits_are_short_finite_and_progress_is_audited_after_execution(self):
        mock = StatefulMock(self.cases["api-polling-01"])
        for bad in (0, 31, -1, float("inf"), True):
            with self.subTest(seconds=bad), self.assertRaises((ValueError, PermissionError)):
                mock.dispatch("host.mock_wait", {"seconds": bad})
        mock.dispatch("host.mock_wait", {"seconds": 30})
        mock.dispatch("host.mock_wait", {"seconds": 30})
        mock.dispatch("host.mock_wait", {"seconds": 1})
        self.assertEqual(mock.clock, 61)
        self.assertEqual(mock.last_progress_time, 0)

    def test_hard_interruption_preserves_absolute_server_deadline(self):
        case = self.cases["mcp-polling-01"]
        mock = StatefulMock(case, variant(case, "host-hard-interruption"))
        for _ in range(10):
            scheduled_read(mock)
        mock.dispatch("host.mock_wait", {"seconds": 30})
        snapshot = mock.snapshot()
        self.assertEqual(snapshot["virtual_time_seconds"], 48)
        self.assertEqual(snapshot["polling_state"]["server_not_before_virtual_seconds"], 93)
        self.assertEqual(snapshot["host_event"]["kind"], "host_hard_interruption")
        with self.assertRaises(PermissionError):
            read(mock)

    def test_unknown_counts_remain_unknown_and_have_a_new_bounded_session(self):
        case = self.cases["api-polling-01"]
        mock = StatefulMock(case, variant(case, "saved-count-unavailable"))
        scheduled_read(mock)
        self.assertEqual(mock.clock, 75)
        self.assertIsNone(mock.state["cumulative_query_count"])
        self.assertEqual(mock.state["session_query_count"], 1)

    def test_last_slot_and_resumed_transient_failures_cannot_be_reset_by_journal(self):
        case = self.cases["api-polling-01"]
        for name, count in (("retry-in-last-session-slot", 120), ("resume-three-failed-reads", 14)):
            mock = StatefulMock(case, variant(case, name))
            scheduled_read(mock)
            self.assertEqual(mock.state["session_query_count"], count)
            with self.assertRaises(PermissionError):
                mock.dispatch("journal.write", {"record": {"polling_state": {"session_query_count": 0}}})
            with self.assertRaises(PermissionError):
                read(mock)

    def test_source_and_variant_are_not_modified_and_outputs_are_copies(self):
        case = self.cases["api-polling-01"]
        before = copy.deepcopy(case)
        mock = StatefulMock(case, case["variants"][0])
        snapshot = mock.snapshot()
        snapshot["polling_state"]["session_query_count"] = 99
        specs = mock.tool_specs()
        specs[0]["inputSchema"].clear()
        self.assertEqual(mock.state["session_query_count"], 0)
        self.assertTrue(mock.tool_specs()[0]["inputSchema"])
        self.assertEqual(case, before)

    def test_incomplete_fixture_and_unsupported_case_fail_explicitly(self):
        case = copy.deepcopy(self.cases["api-polling-01"])
        del case["fixture_status_reads"]
        with self.assertRaises(NotImplementedError):
            StatefulMock(case)
        with self.assertRaises(NotImplementedError):
            StatefulMock({"id": "unknown"})
        case = copy.deepcopy(self.cases["mcp-polling-01"])
        case["fixture_tools"][0]["inputSchema"] = {"$ref": "https://never-contact.invalid/schema.json"}
        with offline_guard(), self.assertRaises(NotImplementedError):
            StatefulMock(case)

    def prepare_and_save(self, mock):
        source = mock.setup["confirmed_safe_entry"]
        mock.dispatch("host.mock_secret_prepare", {"source": source, "field": "CALLE_API_KEY"})
        mock.advance_turn(1)
        mock.dispatch("host.mock_secret_read", {"source": source, "field": "CALLE_API_KEY"})
        return source

    def test_all_three_onboarding_cases_enforce_saved_get_journal_post_order(self):
        for number in range(1, 4):
            case = self.cases[f"api-onboarding-{number:02d}"]
            with self.subTest(case=case["id"]), offline_guard():
                mock = StatefulMock(case)
                source = mock.setup["confirmed_safe_entry"]
                get = {"url": API_ORIGIN + "/v1/goals?limit=1", "secret_source": source}
                record = original_record(case)
                post = {"url": API_ORIGIN + "/v2/calls", "secret_source": source,
                        "body": record["original_request_body_or_tool_arguments"],
                        "idempotency_key": record["api_idempotency_key"]}
                with self.assertRaises(PermissionError):
                    mock.dispatch("http.GET", get)
                if number == 1:
                    opened = mock.dispatch("host.mock_browser_open_dashboard", {"url": DASHBOARD})
                    self.assertTrue(opened["opened"])
                else:
                    with self.assertRaises(PermissionError):
                        mock.dispatch("host.mock_browser_open_dashboard", {"url": DASHBOARD})
                self.prepare_and_save(mock)
                with self.assertRaises(PermissionError):
                    mock.dispatch("http.POST.create_authorized_call_once", post)
                self.assertEqual(mock.dispatch("http.GET", get)["status"], 200)
                with self.assertRaises(PermissionError):
                    mock.dispatch("http.POST.create_authorized_call_once", post)
                mock.dispatch("journal.write", {"record": record})
                created = mock.dispatch("http.POST.create_authorized_call_once", post)
                self.assertEqual(created["status"], 202)
                record["resource_id"] = created["body"]["id"]
                mock.dispatch("journal.write", {"record": record})
                with self.assertRaises(PermissionError):
                    mock.dispatch("http.POST.create_authorized_call_once", post)
                self.assertEqual(mock.create_count, 1)
                self.assertEqual(mock.journal["resource_id"], mock.call_id)

    def test_onboarding_rejects_other_sources_targets_and_changed_idempotency(self):
        case = self.cases["api-onboarding-01"]
        mock = StatefulMock(case)
        with self.assertRaises(PermissionError):
            mock.dispatch("host.mock_secret_read", {"source": "other-entry", "field": "CALLE_API_KEY"})
        source = self.prepare_and_save(mock)
        with self.assertRaises(ValueError):
            mock.dispatch("http.GET", {"url": "https://untrusted.invalid/v1/goals?limit=1", "secret_source": source})
        mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1", "secret_source": source})
        record = original_record(case)
        mock.dispatch("journal.write", {"record": record})
        with self.assertRaises(PermissionError):
            mock.dispatch("http.POST.create_authorized_call_once", {"url": API_ORIGIN + "/v2/calls",
                "secret_source": source, "body": record["original_request_body_or_tool_arguments"],
                "idempotency_key": "different-key"})
        changed = copy.deepcopy(record)
        changed["original_request_body_or_tool_arguments"]["phone"] = "+12025550199"
        with self.assertRaises((PermissionError, ValueError)):
            mock.dispatch("journal.write", {"record": changed})
        changed = copy.deepcopy(record)
        changed["CALLE_API_KEY"] = "SYNTHETIC_NOT_A_REAL_KEY"
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": changed})
        self.assertNotIn("CALLE_API_KEY", mock.journal)
        self.assertEqual(mock.create_count, 0)

    def test_turn_advance_cannot_skip_replay_or_forge_a_saved_user_turn(self):
        mock = StatefulMock(self.cases["api-onboarding-01"])
        for index in (0, 2, -1, True):
            with self.assertRaises(ValueError):
                mock.advance_turn(index)
        mock.advance_turn(1)
        source = mock.setup["confirmed_safe_entry"]
        with self.assertRaises(PermissionError):
            mock.dispatch("host.mock_secret_read", {"source": source, "field": "CALLE_API_KEY"})
        with self.assertRaises(ValueError):
            mock.advance_turn(0)

    def test_onboarding_journal_schema_exposes_nested_requirements_and_rejects_bad_shapes(self):
        case = self.cases["api-onboarding-01"]
        mock = StatefulMock(case)
        tool = next(tool for tool in mock.tool_specs() if tool["name"] == "journal.write")
        full = tool["inputSchema"]["properties"]["record"]["oneOf"][0]
        self.assertEqual(set(full["properties"]["authorization_scope"]["required"]),
                         {"approved_number", "approved_purpose", "maximum_logical_calls"})
        for scope in ("Authorized once", None, [], {"request": case["prompt"], "max_logical_calls": 1}):
            record = original_record(case)
            record["authorization_scope"] = scope
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                mock.dispatch("journal.write", {"record": record})
        self.assertFalse(mock.journal)
        self.assertTrue(all(entry.get("error", {}).get("type") == "ValueError" for entry in mock.trace))

    def test_resource_only_journal_update_preserves_original_record_after_create(self):
        case = self.cases["api-onboarding-01"]
        mock = StatefulMock(case)
        source = self.prepare_and_save(mock)
        mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1", "secret_source": source})
        record = original_record(case)
        mock.dispatch("journal.write", {"record": record})
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": {"resource_id": "not-yet-observed"}})
        response = mock.dispatch("http.POST.create_authorized_call_once", {
            "url": API_ORIGIN + "/v2/calls", "secret_source": source,
            "body": record["original_request_body_or_tool_arguments"],
            "idempotency_key": record["api_idempotency_key"],
        })
        mock.dispatch("journal.write", {"record": {"resource_id": response["body"]["id"]}})
        expected = {**record, "resource_id": response["body"]["id"]}
        self.assertEqual(mock.journal, expected)
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": {"resource_id": "wrong-resource"}})
        self.assertEqual(mock.journal, expected)

    def test_controller_restore_preserves_onboarding_without_replaying_get_or_create(self):
        case = self.cases["api-onboarding-01"]
        mock = StatefulMock(case)
        source = mock.setup["confirmed_safe_entry"]
        mock.dispatch("host.mock_secret_prepare", {"source": source, "field": "CALLE_API_KEY"})
        prepared_trace = copy.deepcopy(mock.trace)
        restored = StatefulMock.from_state(case, json.loads(json.dumps(mock.export_state())))
        self.assertEqual(restored.snapshot(), mock.snapshot())
        self.assertEqual(restored.trace, prepared_trace)
        restored.advance_turn(1)
        restored.dispatch("host.mock_secret_read", {"source": source, "field": "CALLE_API_KEY"})
        get = {"url": API_ORIGIN + "/v1/goals?limit=1", "secret_source": source}
        restored.dispatch("http.GET", get)
        record = original_record(case)
        restored.dispatch("journal.write", {"record": record})
        before_post = StatefulMock.from_state(case, restored.export_state())
        self.assertEqual(before_post.http_index, 1)
        post = {"url": API_ORIGIN + "/v2/calls", "secret_source": source,
                "body": record["original_request_body_or_tool_arguments"],
                "idempotency_key": record["api_idempotency_key"]}
        before_post.dispatch("http.POST.create_authorized_call_once", post)
        after_post = StatefulMock.from_state(case, before_post.export_state())
        self.assertEqual(after_post.snapshot(), before_post.snapshot())
        self.assertEqual(after_post.create_count, 1)
        with self.assertRaises(PermissionError):
            after_post.dispatch("http.POST.create_authorized_call_once", post)
        self.assertEqual(sum(entry["action"] == "http.GET" for entry in after_post.trace), 1)

    def test_controller_restore_keeps_variant_clock_deadline_and_failed_read_streak(self):
        case = self.cases["api-polling-01"]
        for option_name in ("server-delay-75-seconds", "resume-three-failed-reads", "host-hard-interruption"):
            with self.subTest(variant=option_name), offline_guard():
                mock = StatefulMock(case, variant(case, option_name))
                scheduled_read(mock)
                if option_name == "server-delay-75-seconds":
                    wait(mock, 30)
                elif option_name == "host-hard-interruption":
                    for _ in range(9):
                        scheduled_read(mock)
                    wait(mock, 30)
                saved = json.loads(json.dumps(mock.export_state()))
                restored = StatefulMock.from_state(case, saved)
                self.assertEqual(restored.snapshot(), mock.snapshot())
                self.assertEqual(restored.case.get("fixture_status_reads"), mock.case.get("fixture_status_reads"))
                if option_name == "server-delay-75-seconds":
                    with self.assertRaises(PermissionError):
                        read(restored)
                    wait(restored, 45)
                    read(restored)
                    self.assertEqual(restored.state["session_query_count"], 2)
                if option_name == "resume-three-failed-reads":
                    with self.assertRaises(PermissionError):
                        read(restored)
                elif option_name == "host-hard-interruption":
                    self.assertEqual(restored.clock, 48)
                    self.assertEqual(restored.state["server_not_before_virtual_seconds"], 93)
                    with self.assertRaises(PermissionError):
                        read(restored)
                saved["current"]["trace"].clear()
                self.assertTrue(restored.trace)

    def test_controller_state_has_no_future_fixtures_and_is_not_model_visible(self):
        case = self.cases["api-polling-01"]
        mock = StatefulMock(case)
        read(mock)
        exported = mock.export_state()
        serialized = json.dumps(exported)
        for hidden in ("fixture_status_reads", "fixture_wait_plan", "expected_read_counts", "fixture_future_responses"):
            self.assertNotIn(hidden, serialized)
        for action in ("controller.export_state", "controller.from_state"):
            self.assertNotIn(action, [tool["name"] for tool in mock.tool_specs()])
            with self.assertRaises(PermissionError):
                mock.dispatch(action, {})
        visible = json.dumps(mock.public_state())
        for private in ("source_sha256", "variant_sha256", "calle-stateful-mock-controller-state-v1"):
            self.assertNotIn(private, visible)
        exported["current"]["state"]["session_query_count"] = 99
        self.assertEqual(mock.state["session_query_count"], 1)

    def test_controller_restore_rejects_mixed_inputs_and_missing_or_invalid_state(self):
        case = self.cases["api-onboarding-01"]
        mock = StatefulMock(case)
        saved = mock.export_state()
        changed_case = copy.deepcopy(case)
        changed_case["prompt"] += " Changed source."
        with self.assertRaises(ValueError):
            StatefulMock.from_state(changed_case, saved)
        for mutate in (lambda value: value["current"].pop("http_index"),
                       lambda value: value["current"].update(turn_index=10),
                       lambda value: value["current"].update(create_count=2),
                       lambda value: value["current"].update(clock=float("inf"))):
            invalid = copy.deepcopy(saved)
            mutate(invalid)
            with self.assertRaises(ValueError):
                StatefulMock.from_state(case, invalid)


if __name__ == "__main__":
    unittest.main()
