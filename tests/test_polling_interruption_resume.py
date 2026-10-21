"""Offline controller-resume contracts; these tests do not run or grade an Agent."""
import copy
import json
import unittest

from tests.behavior.codex_adapter import normalized_turn_source, scenario_instances
from tests.behavior.stateful_mocks import API_ORIGIN, MCP_ORIGIN, StatefulMock
from tests.offline import offline_guard
from tests.test_stateful_mocks import cases, read, scheduled_read, variant, wait


class PollingInterruptionResumeTests(unittest.TestCase):
    def test_wait_crossing_interruption_stops_at_event_time_for_any_legal_chunks(self):
        for case_id in ("api-polling-01", "mcp-polling-01"):
            for chunks in ((20, 20), (25, 30), (10, 10, 30)):
                source = cases()[case_id]
                mock = StatefulMock(source, variant(source, "host-hard-interruption-resume"))
                with self.subTest(case=case_id, chunks=chunks), offline_guard():
                    for _ in range(10):
                        scheduled_read(mock)
                    for seconds in chunks:
                        before = mock.clock
                        result = mock.dispatch("host.mock_wait", {"seconds": seconds})
                    self.assertEqual(mock.clock, 48)
                    self.assertEqual(result["elapsed_seconds"], 48 - before)
                    self.assertLess(result["elapsed_seconds"], chunks[-1])
                    self.assertEqual(mock.host_event["virtual_time_seconds"], 48)
                    restored = StatefulMock.from_state(source, mock.export_state())
                    restored.advance_turn(1)
                    wait(restored, 30)
                    wait(restored, 15)
                    read(restored)
                    self.assertEqual(restored.state["session_query_count"], 11)
                    self.assertEqual(restored.clock, 93)

    def test_both_transports_restore_real_checkpoint_and_wait_remaining_45_seconds(self):
        for case_id in ("api-polling-01", "mcp-polling-01"):
            original = cases()[case_id]
            source = normalized_turn_source(dict(scenario_instances(original))["host-hard-interruption-resume"])
            with self.subTest(case=case_id), offline_guard():
                mock = StatefulMock(source)
                for _ in range(10):
                    scheduled_read(mock)
                mock.dispatch("host.mock_wait", {"seconds": 30})
                self.assertEqual(mock.clock, 48)
                self.assertEqual(mock.stopped_reason, "host_hard_interruption")
                self.assertEqual(mock.state["cumulative_query_count"], 10)
                self.assertEqual(mock.state["session_query_count"], 10)
                self.assertEqual(mock.state["server_not_before_virtual_seconds"], 93)
                mock.dispatch("journal.write", {"record": {
                    "resource_id": mock.call_id, "polling_state": copy.deepcopy(mock.state),
                }})
                envelope = json.loads(json.dumps(mock.export_state()))
                before = mock.snapshot()
                serialized = json.dumps(mock.public_state())
                self.assertNotIn('"available"', serialized)
                self.assertNotIn("fixture_status_reads", serialized)
                self.assertNotIn("fixture_resume_after_interruption", serialized)
                with self.assertRaises(PermissionError):
                    read(mock)

                resumed = StatefulMock.from_state(source, envelope)
                resumed.advance_turn(1)
                self.assertIsNone(resumed.host_event)
                self.assertIsNone(resumed.stopped_reason)
                self.assertEqual(resumed.clock, 48)
                self.assertEqual(resumed.state, before["polling_state"])
                self.assertEqual(resumed.journal, before["journal"])
                self.assertEqual(resumed.trace, before["trace"])
                self.assertEqual(resumed.latest_response, before["latest_response"])
                self.assertEqual(resumed.interruption_history, before["interruption_history"])
                self.assertEqual(len(resumed.interruption_history), 1)
                for delay in (0, 30, 14):
                    if delay:
                        wait(resumed, delay)
                    with self.assertRaises(PermissionError):
                        read(resumed)
                    self.assertEqual(resumed.state["session_query_count"], 10)
                    self.assertIsNone(resumed.stopped_reason)
                wait(resumed, 1)
                result = read(resumed)
                body = result["body"] if resumed.transport == "api" else result["structuredContent"]["call"]
                self.assertEqual(body["result_status"], "available")
                self.assertEqual(body["result"], {})
                self.assertEqual(body["id"], resumed.call_id)
                self.assertEqual(resumed.clock, 93)
                self.assertEqual(resumed.state, source["expected_saved_state"])
                self.assertEqual(resumed.stopped_reason, "terminal_result")
                self.assertEqual(resumed.create_count, 0)
                self.assertEqual(len(resumed.interruption_history), 1)
                with self.assertRaises(PermissionError):
                    read(resumed)

    def test_declared_30_plus_15_wait_completes_without_retriggering_interruption(self):
        for case_id in ("api-polling-01", "mcp-polling-01"):
            source = cases()[case_id]
            mock = StatefulMock(source, variant(source, "host-hard-interruption-resume"))
            with self.subTest(case=case_id), offline_guard():
                for _ in range(10):
                    scheduled_read(mock)
                wait(mock, 30)
                restored = StatefulMock.from_state(source, json.loads(json.dumps(mock.export_state())))
                restored.advance_turn(1)
                wait(restored, 30)
                self.assertIsNone(restored.host_event)
                wait(restored, 15)
                read(restored)
                self.assertEqual(restored.clock, 93)
                self.assertEqual(restored.state["session_query_count"], 11)
                self.assertEqual(len(restored.interruption_history), 1)

    def test_original_one_turn_fixture_is_unchanged_and_cannot_resume(self):
        for case_id in ("api-polling-01", "mcp-polling-01"):
            source = cases()[case_id]
            old = variant(source, "host-hard-interruption")
            self.assertNotIn("turns", old)
            self.assertEqual(old["expected_read_counts"], {"session": 10, "cumulative": 10})
            self.assertEqual(old["fixture_status_reads"][0]["query_ordinal_range"], [1, 10])
            mock = StatefulMock(source, old)
            for _ in range(10):
                scheduled_read(mock)
            wait(mock, 30)
            restored = StatefulMock.from_state(source, mock.export_state())
            with self.assertRaises(ValueError):
                restored.advance_turn(1)
            with self.assertRaises(PermissionError):
                read(restored)

    def test_controller_resume_requires_matching_observed_interruption(self):
        source = cases()["api-polling-01"]
        option = variant(source, "host-hard-interruption-resume")
        mock = StatefulMock(source, option)
        with self.assertRaises(PermissionError):
            mock.advance_turn(1)
        self.assertEqual(mock.turn_index, 0)
        for _ in range(10):
            scheduled_read(mock)
        wait(mock, 30)
        envelope = mock.export_state()
        invalid = copy.deepcopy(envelope)
        invalid["current"]["interruption_history"].append(
            copy.deepcopy(invalid["current"]["interruption_history"][0]))
        with self.assertRaises(ValueError):
            StatefulMock.from_state(source, invalid)
        invalid = copy.deepcopy(envelope)
        invalid["current"]["clock"] = 49
        restored = StatefulMock.from_state(source, invalid)
        with self.assertRaises(PermissionError):
            restored.advance_turn(1)

    def test_partial_polling_journal_updates_preserve_identity_and_nested_counters(self):
        for case_id in ("api-04", "api-polling-01", "mcp-polling-01"):
            mock = StatefulMock(cases()[case_id])
            origin = API_ORIGIN if mock.transport == "api" else MCP_ORIGIN
            interface = "api-key" if mock.transport == "api" else "mcp"
            read(mock)
            mock.dispatch("journal.write", {"record": {
                "resource_id": mock.call_id, "interface": interface,
                "server_or_base_url": origin, "polling_state": copy.deepcopy(mock.state),
            }})
            wait(mock, 2)
            read(mock)
            mock.dispatch("journal.write", {"record": {"polling_state": {
                "session_query_count": 2, "cumulative_query_count": 2,
            }}})
            self.assertEqual(mock.journal["resource_id"], mock.call_id)
            self.assertEqual(mock.journal["interface"], interface)
            self.assertEqual(mock.journal["server_or_base_url"], origin)
            self.assertEqual(mock.journal["polling_state"], mock.state)
            for change in ({"resource_id": "another-call"}, {"interface": "another-interface"},
                           {"server_or_base_url": "https://other.invalid"}):
                with self.subTest(case=case_id, change=change), self.assertRaises((ValueError, PermissionError)):
                    mock.dispatch("journal.write", {"record": change})

    def test_partial_journal_update_cannot_clear_future_server_deadline(self):
        source = cases()["api-polling-01"]
        mock = StatefulMock(source, variant(source, "server-delay-75-seconds"))
        read(mock)
        mock.dispatch("journal.write", {"record": {
            "resource_id": mock.call_id, "polling_state": copy.deepcopy(mock.state),
        }})
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": {"polling_state": {"server_not_before_virtual_seconds": None}}})
        self.assertEqual(mock.journal["polling_state"]["server_not_before_virtual_seconds"], 75)
        wait(mock, 75)
        mock.dispatch("journal.write", {"record": {"polling_state": {"server_not_before_virtual_seconds": None}}})
        self.assertEqual(mock.journal["resource_id"], mock.call_id)
        self.assertEqual(mock.journal["polling_state"]["session_query_count"], 1)


if __name__ == "__main__":
    unittest.main()
