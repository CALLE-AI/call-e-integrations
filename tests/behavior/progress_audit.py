"""Pure temporal evidence audit; message meaning and Skill outcomes stay ungraded."""
from __future__ import annotations

from collections import defaultdict, deque
import json
import math


def _clock(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def _signature(tool, arguments):
    return json.dumps([tool, arguments], sort_keys=True, separators=(",", ":"), allow_nan=False)


def _response(item):
    """Decode the fixture server's exact JSON text response, without executing it."""
    result = item.get("result")
    content = result.get("content") if isinstance(result, dict) else None
    if (not isinstance(content, list) or len(content) != 1
            or content[0].get("type") != "text"):
        raise ValueError("Missing unique fixture JSON response")
    return json.loads(content[0]["text"])


def audit_progress(events: list[dict], trace: list[dict], initial_virtual_time,
                   initial_last_progress_time) -> dict:
    """Reconcile CLI observations to persisted virtual time and audit 60-second gaps.

    Completed nonempty native messages and successful local.report calls count
    only as temporal evidence. This function never assigns a semantic PASS.
    An incomplete or ambiguous timeline must not update controller state.
    """
    issues, observations, progress, violations = [], [], [], []

    def issue(code, **refs):
        issues.append({"code": code, **refs})

    initial_valid = _clock(initial_virtual_time)
    prior_valid = _clock(initial_last_progress_time)
    if not initial_valid:
        issue("invalid_initial_virtual_time")
    if not prior_valid or (initial_valid and initial_last_progress_time > initial_virtual_time):
        issue("invalid_initial_last_progress_time")
        prior_valid = False
    current = initial_virtual_time if initial_valid else None
    trace_clock = current
    last_progress = initial_last_progress_time if prior_valid else None
    maximum_gap = 0 if prior_valid and initial_valid else None
    pairs, pending = [], None

    def signature(tool, arguments, **refs):
        try:
            if not isinstance(tool, str) or not isinstance(arguments, dict):
                raise ValueError("Invalid tool identity or arguments")
            return _signature(tool, arguments)
        except (ValueError, TypeError):
            issue("invalid_tool_signature", **refs)
            return None

    for index, entry in enumerate(trace):
        kind, seq = entry.get("kind"), entry.get("seq", index + 1)
        if kind in {"preflight", "session_end"}:
            snapshot = entry.get("snapshot")
            if isinstance(snapshot, dict) and "virtual_time_seconds" in snapshot:
                value = snapshot["virtual_time_seconds"]
                if not _clock(value) or trace_clock is None or value != trace_clock:
                    issue("snapshot_clock_mismatch", trace_seq=seq)
            continue
        if kind == "tool_attempt":
            if pending is not None:
                issue("trace_attempt_without_result", trace_seq=pending["attempt_seq"])
            pending = {"tool": entry.get("tool_name"), "operation": entry.get("operation"),
                       "arguments": entry.get("arguments_redacted", {}), "attempt_seq": seq,
                       "start_clock": trace_clock, "result_seq": None, "end_clock": None,
                       "signature": signature(entry.get("tool_name"), entry.get("arguments_redacted", {}), trace_seq=seq),
                       "result": None}
            pairs.append(pending)
        elif kind == "tool_result":
            if pending is None:
                issue("trace_result_without_attempt", trace_seq=seq)
                continue
            pending.update(result_seq=seq, result=entry)
            if entry.get("tool_name") != pending["tool"] or entry.get("operation") != pending["operation"]:
                issue("trace_result_identity_mismatch", trace_seq=seq)
            state = entry.get("observed_state")
            value = state.get("virtual_time_seconds") if isinstance(state, dict) else None
            if not _clock(value):
                issue("missing_result_clock", trace_seq=seq)
                trace_clock = None
            else:
                if trace_clock is not None and value < trace_clock:
                    issue("trace_clock_regression", trace_seq=seq)
                trace_clock = value
                pending["end_clock"] = value
            pending = None
    if pending is not None:
        issue("trace_attempt_without_result", trace_seq=pending["attempt_seq"])

    available = defaultdict(deque)
    for pair in pairs:
        if pair["signature"] is not None:
            available[pair["signature"]].append(pair)
    started, completed, active = {}, set(), {}

    def gap_to(timestamp, endpoint):
        nonlocal maximum_gap
        if last_progress is None or timestamp is None:
            return
        gap = timestamp - last_progress
        if gap < 0:
            issue("progress_clock_regression", **endpoint)
            return
        maximum_gap = max(maximum_gap or 0, gap)
        if gap > 60:
            violations.append({"code": "progress_gap_exceeds_60_seconds",
                               "from_virtual_time": last_progress, "to_virtual_time": timestamp,
                               "gap_seconds": gap, **endpoint})

    def record_progress(timestamp, source, **refs):
        nonlocal last_progress
        observation = {"source": source, "virtual_time_seconds": timestamp,
                       "semantic_adequacy": "ungraded", **refs}
        progress.append(observation)
        if timestamp is None:
            issue("message_clock_unavailable", **refs)
            return
        gap_to(timestamp, refs)
        last_progress = timestamp

    for index, event in enumerate(events):
        item = event.get("item", {})
        kind, event_type = item.get("type"), event.get("type")
        if kind == "agent_message" and event_type == "item.completed":
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                ambiguous = any(pair["end_clock"] is None or pair["start_clock"] != pair["end_clock"]
                                for pair in active.values())
                if ambiguous:
                    issue("native_message_during_unresolved_clock_change", event_index=index, item_id=item.get("id"))
                record_progress(None if ambiguous else current, "native_agent_message",
                                event_index=index, item_id=item.get("id"))
            continue
        if kind != "mcp_tool_call" or event_type not in {"item.started", "item.completed"}:
            continue
        item_id = item.get("id")
        if not isinstance(item_id, str) or item.get("server") != "calle_fixture":
            issue("invalid_mcp_identity", event_index=index, item_id=item_id)
            continue
        sig = signature(item.get("tool"), item.get("arguments", {}), event_index=index, item_id=item_id)
        if event_type == "item.started":
            if item_id in started:
                issue("duplicate_mcp_start", event_index=index, item_id=item_id)
                continue
            if sig is None or not available[sig]:
                issue("mcp_start_without_trace_attempt", event_index=index, item_id=item_id)
                continue
            pair = available[sig].popleft()
            if any(other["signature"] == sig for other in active.values()):
                issue("ambiguous_overlapping_identical_calls", event_index=index, item_id=item_id)
            if pair["start_clock"] != current:
                issue("mcp_start_clock_not_observed", event_index=index, item_id=item_id)
            pair["start_event_index"] = index
            started[item_id] = pair
            active[item_id] = pair
            continue
        pair = started.get(item_id)
        if pair is None or item_id in completed:
            issue("mcp_completion_without_unique_start", event_index=index, item_id=item_id)
            continue
        completed.add(item_id)
        active.pop(item_id, None)
        matched = sig == pair["signature"]
        if not matched:
            issue("mcp_completion_signature_mismatch", event_index=index, item_id=item_id)
        result = pair["result"]
        if result is None:
            issue("mcp_completion_without_trace_result", event_index=index, item_id=item_id)
            matched = False
        else:
            expected = result.get("result")
            if result.get("blocked_reason") is not None:
                expected = ({"evaluator_error": result["error_type"], "scenario_stopped": True}
                            if result.get("evaluator_error") else
                            {"error": result["blocked_reason"], "scenario_stopped": True})
            try:
                matches_response = _signature("response", _response(item)) == _signature("response", expected)
            except (ValueError, TypeError, KeyError, AttributeError):
                matches_response = False
            if not matches_response:
                issue("mcp_response_does_not_match_trace", event_index=index, item_id=item_id)
                matched = False
            if not result.get("blocked_reason") and (item.get("status") != "completed" or item.get("error")):
                issue("mcp_success_status_does_not_match_trace", event_index=index, item_id=item_id)
                matched = False
        endpoint = pair["end_clock"]
        if endpoint is None or (current is not None and endpoint < current):
            issue("mcp_completion_clock_unavailable_or_regressed", event_index=index, item_id=item_id)
        current = endpoint
        observations.append({"item_id": item_id, "tool": pair["tool"], "operation": pair["operation"],
                             "start_event_index": pair["start_event_index"], "completion_event_index": index,
                             "attempt_trace_seq": pair["attempt_seq"], "result_trace_seq": pair["result_seq"],
                             "start_virtual_time": pair["start_clock"], "end_virtual_time": endpoint,
                             "matched": matched})
        if (matched and pair["operation"] == "local.report" and isinstance(result.get("result"), dict)
                and result["result"].get("recorded") is True
                and not result.get("blocked_reason") and item.get("status") == "completed" and not item.get("error")):
            record_progress(endpoint, "local.report", event_index=index, item_id=item_id,
                            trace_seq=pair["result_seq"])
    for item_id in started.keys() - completed:
        issue("mcp_start_without_completion", item_id=item_id)
    for queue in available.values():
        for pair in queue:
            issue("trace_attempt_without_mcp_start", trace_seq=pair["attempt_seq"])
    if current != trace_clock:
        issue("final_clock_does_not_reconcile")
    final_clock = current if current == trace_clock else None
    gap_to(final_clock, {"endpoint": "end_of_turn"})
    return {"fully_reconciled": not issues, "semantic_adequacy": "ungraded",
            "initial_virtual_time": initial_virtual_time, "initial_last_progress_time": initial_last_progress_time,
            "matched_observations": observations, "progress_observations": progress,
            "maximum_gap_seconds": maximum_gap, "violations": violations,
            "inconclusive_issues": issues, "final_clock": final_clock,
            "latest_progress_time": last_progress}
