"""Temporal evidence tests only; no model, service or filesystem execution."""
import copy
import json
import unittest

from tests.behavior.progress_audit import audit_progress


class Evidence:
    def __init__(self, clock=0):
        self.clock = clock
        self.events = [{"type": "turn.started"}]
        self.trace = [{"seq": 1, "kind": "preflight", "snapshot": {"virtual_time_seconds": clock}}]
        self.ids = 0

    def message(self, text="Still waiting."):
        self.ids += 1
        self.events.append({"type": "item.completed", "item": {
            "id": f"message-{self.ids}", "type": "agent_message", "text": text,
        }})

    def tool(self, operation, arguments, seconds=0, response=None):
        self.ids += 1
        tool = operation.replace(".", "_")
        item = {"id": f"tool-{self.ids}", "type": "mcp_tool_call", "server": "calle_fixture",
                "tool": tool, "arguments": copy.deepcopy(arguments), "status": "in_progress"}
        self.events.append({"type": "item.started", "item": copy.deepcopy(item)})
        self.trace.append({"seq": len(self.trace) + 1, "kind": "tool_attempt",
                           "tool_name": tool, "operation": operation,
                           "arguments_redacted": copy.deepcopy(arguments)})
        self.clock += seconds
        if response is None:
            response = {"recorded": True} if operation == "local.report" else {"virtual_time_seconds": self.clock}
        self.trace.append({"seq": len(self.trace) + 1, "kind": "tool_result",
                           "tool_name": tool, "operation": operation, "result": copy.deepcopy(response),
                           "observed_state": {"virtual_time_seconds": self.clock}})
        item.update(status="completed", error=None, result={
            "content": [{"type": "text", "text": json.dumps(response)}], "structured_content": None})
        self.events.append({"type": "item.completed", "item": item})

    def wait(self, seconds):
        self.tool("host.mock_wait", {"seconds": seconds}, seconds)

    def finish(self):
        self.trace.append({"seq": len(self.trace) + 1, "kind": "session_end",
                           "snapshot": {"virtual_time_seconds": self.clock}})
        self.events.append({"type": "turn.completed"})


class ProgressAuditTests(unittest.TestCase):
    def test_native_resume_commentary_resets_cadence_before_waits(self):
        evidence = Evidence(48)
        evidence.message("Continuing the same call from its saved state.")
        evidence.wait(30)
        evidence.wait(15)
        evidence.message("The result is now available.")
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 48, 18)
        self.assertTrue(result["fully_reconciled"])
        self.assertEqual(result["violations"], [])
        self.assertEqual(result["maximum_gap_seconds"], 45)
        self.assertEqual(result["final_clock"], 93)
        self.assertEqual(result["latest_progress_time"], 93)
        self.assertEqual([o["virtual_time_seconds"] for o in result["progress_observations"]], [48, 93])
        self.assertEqual(len(result["matched_observations"]), 2)
        self.assertEqual(result["semantic_adequacy"], "ungraded")
        self.assertNotIn("status", result)

    def test_missing_resume_commentary_flags_gap_before_final_message(self):
        evidence = Evidence(48)
        evidence.wait(30)
        evidence.wait(15)
        evidence.message("Done.")
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 48, 18)
        self.assertTrue(result["fully_reconciled"])
        self.assertEqual(result["maximum_gap_seconds"], 75)
        self.assertEqual(len(result["violations"]), 1)
        self.assertEqual(result["violations"][0]["from_virtual_time"], 18)
        self.assertEqual(result["violations"][0]["to_virtual_time"], 93)
        self.assertEqual(result["latest_progress_time"], 93)

    def test_no_message_crossing_60_seconds_is_a_violation_including_trailing_wait(self):
        evidence = Evidence()
        evidence.wait(30)
        evidence.wait(30)
        evidence.wait(1)
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 0, 0)
        self.assertEqual(result["progress_observations"], [])
        self.assertEqual(result["maximum_gap_seconds"], 61)
        self.assertEqual(result["violations"][0]["endpoint"], "end_of_turn")
        self.assertEqual(result["latest_progress_time"], 0)

    def test_native_and_actual_local_reports_both_count_without_semantic_approval(self):
        evidence = Evidence()
        evidence.message("Generic text; adequacy must be graded separately.")
        evidence.wait(30)
        evidence.wait(30)
        evidence.tool("local.report", {"message": "Waiting."})
        evidence.wait(30)
        evidence.message("Another generic message.")
        evidence.finish()
        before = copy.deepcopy((evidence.events, evidence.trace))
        result = audit_progress(evidence.events, evidence.trace, 0, 0)
        self.assertTrue(result["fully_reconciled"])
        self.assertEqual(result["maximum_gap_seconds"], 60)
        self.assertEqual(result["violations"], [])
        self.assertEqual([o["source"] for o in result["progress_observations"]],
                         ["native_agent_message", "local.report", "native_agent_message"])
        self.assertTrue(all(o["semantic_adequacy"] == "ungraded" for o in result["progress_observations"]))
        self.assertEqual((evidence.events, evidence.trace), before)

    def test_tool_results_and_quoted_messages_are_not_progress(self):
        evidence = Evidence()
        evidence.tool("journal.read", {}, response={"message": "Still waiting."})
        evidence.wait(30)
        evidence.wait(30)
        evidence.wait(5)
        evidence.message("   ")
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 0, 0)
        self.assertTrue(result["fully_reconciled"])
        self.assertEqual(result["progress_observations"], [])
        self.assertEqual(result["maximum_gap_seconds"], 65)

    def test_repeated_identical_calls_reconcile_by_occurrence(self):
        evidence = Evidence()
        evidence.wait(30)
        evidence.message()
        evidence.wait(30)
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 0, 0)
        self.assertTrue(result["fully_reconciled"])
        self.assertEqual([o["attempt_trace_seq"] for o in result["matched_observations"]], [2, 4])
        self.assertEqual([o["end_virtual_time"] for o in result["matched_observations"]], [30, 60])

    def test_mismatched_completion_arguments_or_response_is_inconclusive(self):
        for mutation in ("arguments", "response", "identity", "status"):
            evidence = Evidence()
            evidence.wait(30)
            completion = evidence.events[-1]["item"]
            if mutation == "arguments":
                completion["arguments"]["seconds"] = 1
            elif mutation == "response":
                completion["result"]["content"][0]["text"] = '{"virtual_time_seconds": 1}'
            elif mutation == "identity":
                evidence.trace[-1]["tool_name"] = "another_tool"
            else:
                completion["status"] = "failed"
            evidence.finish()
            with self.subTest(mutation=mutation):
                result = audit_progress(evidence.events, evidence.trace, 0, 0)
                self.assertFalse(result["fully_reconciled"])
                self.assertTrue(result["inconclusive_issues"])

    def test_missing_clock_start_completion_or_result_prevents_reconciliation(self):
        for mutation in ("clock", "start", "completion", "result", "extra_attempt"):
            evidence = Evidence()
            evidence.wait(30)
            if mutation == "clock":
                del evidence.trace[-1]["observed_state"]
            elif mutation == "start":
                del evidence.events[1]
            elif mutation == "completion":
                evidence.events.pop()
            elif mutation == "result":
                evidence.trace.pop()
            else:
                evidence.trace.append(copy.deepcopy(evidence.trace[1]))
            evidence.finish()
            with self.subTest(mutation=mutation):
                result = audit_progress(evidence.events, evidence.trace, 0, 0)
                self.assertFalse(result["fully_reconciled"])
                self.assertTrue(result["inconclusive_issues"])

    def test_native_message_during_inflight_wait_has_ambiguous_clock(self):
        evidence = Evidence()
        evidence.wait(30)
        evidence.events.insert(2, {"type": "item.completed", "item": {
            "type": "agent_message", "id": "concurrent-message", "text": "Waiting."}})
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 0, 0)
        self.assertFalse(result["fully_reconciled"])
        self.assertEqual(result["progress_observations"][0]["virtual_time_seconds"], None)
        self.assertEqual(result["latest_progress_time"], 0)

    def test_failed_local_report_is_not_counted_as_progress(self):
        evidence = Evidence()
        evidence.wait(30)
        evidence.tool("local.report", {"message": "Waiting."})
        rejected = {"error": "rejected", "scenario_stopped": True}
        evidence.trace[-1].pop("result")
        evidence.trace[-1].update(blocked_reason="rejected", error_type="PermissionError")
        evidence.events[-1]["item"].update(status="failed", result={
            "content": [{"type": "text", "text": json.dumps(rejected)}]})
        evidence.finish()
        result = audit_progress(evidence.events, evidence.trace, 0, 0)
        self.assertEqual(result["progress_observations"], [])
        self.assertEqual(result["latest_progress_time"], 0)

    def test_invalid_initial_and_regressing_final_clocks_are_inconclusive(self):
        evidence = Evidence(48)
        evidence.finish()
        for initial, last in ((48, 49), (None, 0), (48, float("nan")), (True, 0)):
            with self.subTest(initial=initial, last=last):
                result = audit_progress(evidence.events, evidence.trace, initial, last)
                self.assertFalse(result["fully_reconciled"])
        evidence.trace[-1]["snapshot"]["virtual_time_seconds"] = 47
        self.assertFalse(audit_progress(evidence.events, evidence.trace, 48, 18)["fully_reconciled"])


if __name__ == "__main__":
    unittest.main()
