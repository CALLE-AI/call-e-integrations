"""Pure synthetic polling/onboarding tools; no host, credential or network I/O.

The fixture supplies observations, never an implementation of the Agent policy.
The dispatcher enforces the fixture's action ceiling and rejects unsafe reads,
writes and waits. A passing dispatcher unit test is not an Agent evaluation.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
from typing import Any

from jsonschema import Draft202012Validator

API_ORIGIN = "https://api.heycall-e.com"
MCP_ORIGIN = "https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth"
DASHBOARD = "https://dashboard.heycall-e.com"
_POLLING = {"api-04", "api-polling-01", "mcp-polling-01"}
_ONBOARDING = {f"api-onboarding-{number:02d}" for number in range(1, 4)}
_TRANSIENT = {"transport", "rate_limit", "service_unavailable"}
_TERMINAL = {"available", "unavailable", "not_applicable"}
_SYNTHETIC_KEY = "SYNTHETIC_NOT_A_REAL_KEY"
_STATE_FORMAT = "calle-stateful-mock-controller-state-v1"
_POLLING_BINDING_FIELDS = ("interface", "server_or_base_url", "identity_ref",
                           "credential_ref", "resource_id", "authorization_scope")
_STATE_FIELDS = (
    "turn_index", "setup", "trace", "journal", "clock", "last_query_time", "last_progress_time",
    "state", "history_unavailable", "latest_response", "stopped_reason", "host_event", "call_id",
    "prepared_source", "bound_source", "read_verified", "create_count", "http_index",
    "interruption_history",
)


def _fingerprint(value):
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _object(properties=None, required=()):
    return {"type": "object", "properties": properties or {},
            "required": list(required), "additionalProperties": False}


def _merge_setup(base, extra):
    result = copy.deepcopy(base)
    for key, value in extra.items():
        result[key] = (_merge_setup(result[key], value)
                       if isinstance(value, dict) and isinstance(result.get(key), dict)
                       else copy.deepcopy(value))
    return result


def _contains_secret_field(value):
    if isinstance(value, dict):
        return any(str(key).lower() in {"api_key", "calle_api_key", "authorization", "access_token", "refresh_token"}
                   or _contains_secret_field(item) for key, item in value.items())
    return isinstance(value, list) and any(_contains_secret_field(item) for item in value)


def _check_local_schema(value):
    if isinstance(value, dict):
        if "$ref" in value and not str(value["$ref"]).startswith("#"):
            raise NotImplementedError("Remote schema references are not permitted by the pure dispatcher")
        for child in value.values():
            _check_local_schema(child)
    elif isinstance(value, list):
        for child in value:
            _check_local_schema(child)


class StatefulMock:
    """In-memory dispatcher for complete polling and first-call setup fixtures.

    Turn indices are zero-based. Construction enters the first turn. Subsequent
    turns must be advanced one at a time by the evaluator, never by Agent tools.
    """

    def __init__(self, source_case: dict, variant: dict | None = None):
        self._source_fingerprint = _fingerprint(source_case)
        self._variant_fingerprint = _fingerprint(variant) if variant is not None else None
        self.case = copy.deepcopy(source_case)
        self.case_id = self.case.get("id")
        if self.case_id not in _POLLING | _ONBOARDING:
            raise NotImplementedError("Stateful mocks cover polling and first-call API onboarding only")
        self.variant_id = variant.get("id") if variant else None
        if variant:
            self.case["setup"] = _merge_setup(self.case.get("setup", {}), variant.get("setup", {}))
            # Response/wait/interruption sequences replace the base sequences.
            for key in ("fixture_status_reads", "fixture_wait_plan", "fixture_interruptions",
                        "fixture_tool_batches", "fixture_retry_after"):
                self.case.pop(key, None)
            for key, value in variant.items():
                if key not in {"id", "setup", "expected", "expected_read_counts", "expected_saved_state"}:
                    self.case[key] = copy.deepcopy(value)
        self.polling = self.case_id in _POLLING
        self.transport = self.case.get("selected_transport")
        self.allowed_actions = list(self.case.get("mock_allowed_actions", []))
        if not self.allowed_actions:
            raise NotImplementedError("Explicit mock action ceiling is missing")
        self.setup = copy.deepcopy(self.case.get("setup", {}))
        self.turn_index = -1
        self.trace: list[dict] = []
        self.journal: dict = {}
        self.clock = self.setup.get("virtual_time_seconds", 0)
        self.last_query_time = self.clock
        self.last_progress_time = self.clock
        self.state = copy.deepcopy(self.setup.get("polling_state", {}))
        self.history_unavailable = bool(self.setup.get("history_unavailable"))
        if self.polling:
            required = {"cumulative_query_count", "session_query_count",
                        "server_not_before_virtual_seconds", "consecutive_transient_failures"}
            if not required <= self.state.keys() or not self.case.get("fixture_status_reads"):
                raise NotImplementedError("Polling state or response sequence is incomplete")
            if self.state["session_query_count"] is None:
                if not self.history_unavailable:
                    raise NotImplementedError("Missing session count without an explicit lost-history fixture")
                self.state["session_query_count"] = 0
            if (self.setup.get("prior_session_exhausted")
                    and not self.setup.get("new_session_explicitly_authorized")):
                raise PermissionError("A new monitoring session is not authorized")
        self.latest_response = None
        self.stopped_reason = None
        self.host_event = None
        self.interruption_history = []
        self.call_id = self.setup.get("saved_call_resource_id")
        if self.polling and "saved_record" in self.setup:
            seed = self.setup["saved_record"]
            if (not isinstance(seed, dict) or _contains_secret_field(seed)
                    or seed.get("resource_id") != self.call_id
                    or seed.get("interface") != "api-key" or self.transport != "api"
                    or seed.get("server_or_base_url") != API_ORIGIN
                    or seed.get("polling_state") != self.state):
                raise ValueError("Initial polling journal must match the original API binding and counters")
            self.journal = copy.deepcopy(seed)
        self.prepared_source = None
        self.bound_source = None
        self.read_verified = False
        self.create_count = 0
        self.http_index = 0
        self._schemas = self._make_schemas()
        _check_local_schema(self._schemas)
        if any(action not in self._schemas for action in self.allowed_actions):
            raise NotImplementedError("The fixture requires an unsupported stateful action")
        self.advance_turn(0)

    def _make_schemas(self):
        text = {"type": "string", "minLength": 1}
        schemas = {
            "local.report": _object({"message": text}, ("message",)),
            "local.preview": _object({"message": text}, ("message",)),
            "journal.read": _object(),
            "journal.write": _object({"record": {"type": "object"}}, ("record",)),
            "host.mock_wait": _object({"seconds": {"type": "number", "exclusiveMinimum": 0, "maximum": 30}}, ("seconds",)),
            "http.GET": _object({"url": text, "secret_source": text}, ("url",)),
            "http.POST.create_authorized_call_once": _object({
                "url": text, "body": {"type": "object"}, "idempotency_key": text, "secret_source": text,
            }, ("url", "body", "idempotency_key", "secret_source")),
            "host.mock_browser_open_dashboard": _object({"url": {"const": DASHBOARD}}, ("url",)),
            "host.mock_secret_prepare": _object({"source": text, "field": {"const": "CALLE_API_KEY"}}, ("source", "field")),
            "host.mock_secret_presence": _object({"source": text, "field": {"const": "CALLE_API_KEY"}}, ("source", "field")),
            "host.mock_secret_read": _object({"source": text, "field": {"const": "CALLE_API_KEY"}}, ("source", "field")),
        }
        if self.transport == "mcp":
            tools = self.case.get("fixture_tools", [])
            if len(tools) != 1 or not tools[0].get("name", "").endswith("__get_call"):
                raise NotImplementedError("Polling requires one explicit synthetic get_call schema")
            schemas["mcp.get_call"] = copy.deepcopy(tools[0]["inputSchema"])
        elif self.polling:
            schemas["http.GET"] = _object({"url": text}, ("url",))
        else:
            # These first-use fixtures end at acceptance. Their synthetic host
            # exposes Goals verification, not a nonexistent status response.
            schemas["http.GET"] = _object({"url": {"const": API_ORIGIN + "/v1/goals?limit=1"},
                                            "secret_source": text}, ("url", "secret_source"))
        if self.polling:
            record_properties = {
                "resource_id": {"const": self.call_id}, "polling_state": {"type": "object"},
                "interface": {"const": "api-key" if self.transport == "api" else "mcp"},
                "server_or_base_url": {"const": API_ORIGIN if self.transport == "api" else MCP_ORIGIN},
            }
            seed = self.setup.get("saved_record", {})
            record_properties.update({key: {"const": copy.deepcopy(seed[key])}
                                      for key in _POLLING_BINDING_FIELDS if key in seed})
            schemas["journal.write"] = _object({"record": {"type": "object", "properties": record_properties}}, ("record",))
        else:
            authorized = self.setup.get("authorized_call", {})
            scope = {"type": "object", "properties": {
                "approved_number": {"const": authorized.get("phone")},
                "approved_purpose": {"const": authorized.get("goal")},
                "maximum_logical_calls": {"type": "integer", "const": 1},
            }, "required": ["approved_number", "approved_purpose", "maximum_logical_calls"]}
            request = {"type": "object", "properties": {
                "phone": {"const": authorized.get("phone")}, "task": text,
                "result_schema": {"type": "object"},
            }, "required": ["phone", "task", "result_schema"]}
            record = {"type": "object", "properties": {
                "interface": {"const": "api-key"}, "server_or_base_url": {"const": API_ORIGIN},
                "authorization_scope": scope, "original_request_body_or_tool_arguments": request,
                "api_idempotency_key": text, "resource_id": {"type": ["string", "null"], "minLength": 1},
            }, "required": ["interface", "server_or_base_url", "authorization_scope",
                              "original_request_body_or_tool_arguments", "api_idempotency_key"]}
            resource_patch = _object({"resource_id": text}, ("resource_id",))
            schemas["journal.write"] = _object({"record": {"oneOf": [record, resource_patch]}}, ("record",))
        return schemas

    def tool_specs(self) -> list[dict]:
        descriptions = {
            "http.GET": "Synthetic HTTPS GET only. The host injects a bound synthetic credential, never a caller-supplied secret. Supply the full URL.",
            "http.POST.create_authorized_call_once": "Synthetic single-call POST. Requires the same saved request, idempotency key and bound source after the authorized Goals read.",
            "host.mock_wait": "Advance the virtual clock by 1 to 30 seconds and check actual synthetic host interruptions. No real sleep or background work occurs.",
            "journal.write": "Persist a private synthetic record in memory using the declared schema. For API creation, supply the full original record and nested authorization_scope fields. After a create response, a record containing only resource_id updates that field while preserving the original body, key and authorization. Polling records retain observed counters and resource identity.",
            "journal.read": "Read the existing synthetic operation record and observed monitoring state. No future responses are exposed.",
            "host.mock_secret_read": "Bind the selected synthetic secret source for host injection; returns a reference, never the secret value.",
            "host.mock_secret_prepare": "Prepare the confirmed empty private source and CALLE_API_KEY field using only in-memory host state.",
            "host.mock_secret_presence": "Observe whether CALLE_API_KEY is saved in the selected synthetic source without exposing its value.",
            "host.mock_browser_open_dashboard": "Open only the official Dashboard in the synthetic host browser and return its actual mock result.",
            "mcp.get_call": "Synthetic current Call read. call_id is the existing Call resource ID; no legacy run identifier is accepted.",
            "local.report": "Record a user-visible progress message in the synthetic host.",
            "local.preview": "Record a local preview without business I/O.",
        }
        if not self.polling:
            descriptions["http.GET"] = "Synthetic access verification GET only: /v1/goals?limit=1. This fixture host has no Call-status read capability. The host injects the selected synthetic credential without exposing its value."
        return [{"name": action, "description": descriptions[action],
                 "inputSchema": copy.deepcopy(self._schemas[action])} for action in self.allowed_actions]

    def advance_turn(self, turn_index: int) -> dict:
        turns = self.case.get("turns", [{}])
        if type(turn_index) is not int or turn_index != self.turn_index + 1 or turn_index >= len(turns):
            raise ValueError("Turns must advance exactly once and in order")
        next_turn = copy.deepcopy(turns[turn_index])
        resume = next_turn.get("fixture_resume_after_interruption")
        if resume is not None:
            if (not self.polling or turn_index == 0 or not isinstance(resume, dict)
                    or resume.get("kind") != "host_hard_interruption"
                    or self.stopped_reason != resume["kind"]
                    or not self.host_event or self.host_event.get("kind") != resume["kind"]
                    or self.clock != resume.get("virtual_time_seconds")
                    or self.state != resume.get("polling_state")):
                raise PermissionError("Resume requires the explicitly authorized observed interruption state")
        self.turn_index = turn_index
        self.turn = next_turn
        self.setup = _merge_setup(self.setup, self.turn.get("setup", {}))
        self.http_index = 0
        self.bound_source = None
        self.read_verified = False
        if resume is not None:
            self.stopped_reason = None
            self.host_event = None
        return self.public_state()

    def public_state(self) -> dict:
        visible_keys = {"http_tool", "secure_secret_injection", "native_browser", "dashboard_url",
                        "secret_source", "confirmed_safe_entry", "safe_entry_count", "secret_variable",
                        "api_key", "base_url", "private_durable_storage", "interface_selection",
                        "authorized_call", "saved_call_resource_id", "history_unavailable",
                        "prior_session_exhausted", "new_session_explicitly_authorized", "tool_schemas",
                        "discovery_complete"}
        return copy.deepcopy({
            "turn_index": self.turn_index,
            "user_prompt": self.turn.get("prompt", self.case.get("prompt")),
            "setup": {key: value for key, value in self.setup.items() if key in visible_keys},
            "virtual_time_seconds": self.clock,
            "polling_state": self.state if self.polling else None,
            "saved_call_resource_id": self.call_id,
            "latest_response": self.latest_response,
            "host_event": self.host_event,
            "interruption_history": self.interruption_history,
        })

    def snapshot(self) -> dict:
        return copy.deepcopy({**self.public_state(), "journal": self.journal,
                              "trace": self.trace, "create_count": self.create_count,
                              "prepared_source": self.prepared_source, "bound_source": self.bound_source,
                              "read_verified": self.read_verified, "stopped_reason": self.stopped_reason})

    def export_state(self) -> dict:
        """Export trusted controller storage; never return this as a model tool result.

        The envelope contains observed mutable state and input fingerprints only.
        Future response fixtures and expected grading answers remain in the source.
        """
        return copy.deepcopy({
            "format": _STATE_FORMAT,
            "source_sha256": self._source_fingerprint,
            "variant_id": self.variant_id,
            "variant_sha256": self._variant_fingerprint,
            "current": {name: getattr(self, name) for name in _STATE_FIELDS},
        })

    @classmethod
    def from_state(cls, source_case: dict, state: dict) -> "StatefulMock":
        """Restore trusted controller state without replaying any tool or response.

        This is not a tool exposed to the Agent. The controller must keep both the
        envelope and source fixtures out of model-visible history. Fingerprints
        detect mixed input revisions; they are not authentication of untrusted data.
        """
        if (not isinstance(state, dict) or state.get("format") != _STATE_FORMAT
                or state.get("source_sha256") != _fingerprint(source_case)):
            raise ValueError("Controller state format or source fingerprint does not match")
        selected_variant = None
        if state.get("variant_sha256") is not None:
            matches = [item for item in source_case.get("variants", [])
                       if item.get("id") == state.get("variant_id")
                       and _fingerprint(item) == state["variant_sha256"]]
            if len(matches) != 1:
                raise ValueError("Controller state does not identify one unchanged source variant")
            selected_variant = matches[0]
        elif state.get("variant_id") is not None:
            raise ValueError("Controller variant identity is incomplete")
        current = state.get("current")
        if not isinstance(current, dict) or set(current) != set(_STATE_FIELDS):
            raise ValueError("Controller state fields are incomplete or unsupported")
        # Initialization constructs schemas and initial data only; it performs no
        # dispatch, consumes no response, and generates no trace or host event.
        restored = cls(source_case, selected_variant)
        turns = restored.case.get("turns", [{}])
        index = current["turn_index"]
        if type(index) is not int or not 0 <= index < len(turns):
            raise ValueError("Controller turn index is invalid")
        expected_setup = copy.deepcopy(restored.case.get("setup", {}))
        for turn in turns[:index + 1]:
            expected_setup = _merge_setup(expected_setup, turn.get("setup", {}))
        if current["setup"] != expected_setup:
            raise ValueError("Controller setup does not match the observed turn sequence")
        for name in ("clock", "last_query_time", "last_progress_time"):
            value = current[name]
            if type(value) not in {int, float} or not math.isfinite(value) or value < 0:
                raise ValueError("Controller clock state is invalid")
        if max(current["last_query_time"], current["last_progress_time"]) > current["clock"]:
            raise ValueError("Controller clock history is inconsistent")
        if (not isinstance(current["trace"], list) or not isinstance(current["journal"], dict)
                or type(current["create_count"]) is not int or not 0 <= current["create_count"] <= 1
                or type(current["http_index"]) is not int
                or not 0 <= current["http_index"] <= len(turns[index].get("fixture_http_responses", []))):
            raise ValueError("Controller operation history is invalid")
        interruption_history = current["interruption_history"]
        if not isinstance(interruption_history, list):
            raise ValueError("Controller interruption history is invalid")
        event_indices = []
        for event in interruption_history:
            if (not isinstance(event, dict) or type(event.get("event_index")) is not int
                    or not 0 <= event["event_index"] < len(restored.case.get("fixture_interruptions", []))
                    or event.get("kind") != restored.case["fixture_interruptions"][event["event_index"]]["kind"]
                    or type(event.get("virtual_time_seconds")) not in {int, float}
                    or not 0 <= event["virtual_time_seconds"] <= current["clock"]):
                raise ValueError("Controller interruption history does not match the observed fixture")
            event_indices.append(event["event_index"])
        if len(event_indices) != len(set(event_indices)):
            raise ValueError("Controller interruption history repeats an event")
        if restored.polling:
            polling = current["state"]
            if not isinstance(polling, dict) or set(polling) != set(restored.state):
                raise ValueError("Controller polling fields are invalid")
            for key, maximum in (("session_query_count", 120), ("consecutive_transient_failures", 4)):
                if type(polling[key]) is not int or not 0 <= polling[key] <= maximum:
                    raise ValueError("Controller polling counters are invalid")
            count = polling["cumulative_query_count"]
            if count is not None and (type(count) is not int or count < polling["session_query_count"]):
                raise ValueError("Controller cumulative count is invalid")
            if current["call_id"] != restored.call_id:
                raise ValueError("Controller polling resource identity changed")
            seed = restored.setup.get("saved_record", {})
            if any(current["journal"].get(key) != seed[key]
                   for key in _POLLING_BINDING_FIELDS if key in seed):
                raise ValueError("Controller polling journal changed the original API binding")
        for name in _STATE_FIELDS:
            setattr(restored, name, copy.deepcopy(current[name]))
        restored.turn = copy.deepcopy(turns[index])
        return restored

    def dispatch(self, canonical_action: str, arguments: dict) -> Any:
        before = copy.deepcopy(self.state)
        entry = {"action": canonical_action, "arguments": copy.deepcopy(arguments),
                 "turn_index": self.turn_index, "virtual_time_before": self.clock, "state_before": before}
        try:
            if canonical_action not in self.allowed_actions:
                raise PermissionError("Action is outside this fixture's explicit authorization")
            if not isinstance(arguments, dict) or list(Draft202012Validator(self._schemas[canonical_action]).iter_errors(arguments)):
                raise ValueError("Arguments do not match the synthetic tool schema")
            result = self._dispatch(canonical_action, copy.deepcopy(arguments))
            entry["result"] = copy.deepcopy(result)
            return copy.deepcopy(result)
        except (PermissionError, ValueError, NotImplementedError) as error:
            entry["error"] = {"type": type(error).__name__, "message": str(error)}
            raise
        finally:
            entry["virtual_time_after"] = self.clock
            entry["state_after"] = copy.deepcopy(self.state)
            self.trace.append(entry)

    def _dispatch(self, action, args):
        if action in {"local.report", "local.preview"}:
            self.last_progress_time = self.clock
            return {"recorded": True}
        if action == "journal.read":
            return {"record": copy.deepcopy(self.journal), **self.public_state()}
        if action == "journal.write":
            return self._save_record(args["record"])
        if self.polling:
            if action == "host.mock_wait":
                return self._wait(args["seconds"])
            if action in {"http.GET", "mcp.get_call"}:
                return self._poll(args)
        if action == "host.mock_browser_open_dashboard":
            if self.setup.get("native_browser") != "available" or self.turn_index != 0:
                raise PermissionError("Dashboard opening is not authorized in this turn")
            result = self.turn.get("fixture_browser_result")
            if result is None:
                raise NotImplementedError("No browser observation is supplied for this turn")
            return result
        if action.startswith("host.mock_secret_"):
            return self._secret(action, args)
        if action in {"http.GET", "http.POST.create_authorized_call_once"}:
            return self._onboarding_http(action, args)
        raise NotImplementedError("No complete stateful fixture implements this action")

    def _next_delay(self):
        count = self.state["cumulative_query_count"]
        if count is None:
            return 20
        ordinal = count + 1
        return 0 if ordinal == 1 else 2 if ordinal <= 10 else 5 if ordinal <= 20 else 10 if ordinal <= 30 else 20

    def _wait(self, seconds):
        if self.stopped_reason:
            raise PermissionError("Monitoring has stopped")
        if not math.isfinite(seconds):
            raise PermissionError("Virtual wait must be finite")
        end = self.clock + seconds
        consumed = {event["event_index"] for event in self.interruption_history}
        for index, event in enumerate(self.case.get("fixture_interruptions", [])):
            if index in consumed or self.state["cumulative_query_count"] != event.get("after_query_ordinal"):
                continue
            interruption_time = self.last_query_time + event.get("after_wait_seconds", 0)
            if self.clock <= interruption_time <= end:
                end = interruption_time
        elapsed = end - self.clock
        self.clock = end
        self._interrupt()
        return {"elapsed_seconds": elapsed, "virtual_time_seconds": self.clock,
                "host_event": copy.deepcopy(self.host_event)}

    def _interrupt(self):
        consumed = {event["event_index"] for event in self.interruption_history}
        for index, event in enumerate(self.case.get("fixture_interruptions", [])):
            if index in consumed:
                continue
            if self.state["cumulative_query_count"] != event.get("after_query_ordinal"):
                continue
            if self.clock - self.last_query_time < event.get("after_wait_seconds", 0):
                continue
            self.host_event = {"kind": event["kind"], "virtual_time_seconds": self.clock}
            self.stopped_reason = event["kind"]
            self.interruption_history.append({**copy.deepcopy(self.host_event), "event_index": index,
                                              "polling_state": copy.deepcopy(self.state)})

    def _poll(self, args):
        if self.stopped_reason or self.state["session_query_count"] >= 120:
            raise PermissionError("Monitoring has stopped or exhausted its session cap")
        if self.transport == "api":
            if args.get("url") != API_ORIGIN + "/v2/calls/" + self.call_id:
                raise PermissionError("Only the original API Call resource is authorized")
        elif args.get("call_id") != self.call_id:
            raise PermissionError("Only the original MCP Call resource is authorized")
        not_before = self.state["server_not_before_virtual_seconds"]
        if self.clock < max(self.last_query_time + self._next_delay(), not_before or 0):
            raise PermissionError("Read occurs before the allowed phase or server deadline")
        cumulative = self.state["cumulative_query_count"]
        cumulative = cumulative + 1 if cumulative is not None else None
        session = self.state["session_query_count"] + 1
        matches = []
        for item in self.case["fixture_status_reads"]:
            bounds = item.get("query_ordinal_range") if cumulative is not None else item.get("session_request_ordinal_range")
            ordinal = cumulative if cumulative is not None else session
            if bounds and bounds[0] <= ordinal <= bounds[1]:
                matches.append(item)
        if len(matches) != 1:
            raise NotImplementedError("No unique response is defined for this request ordinal")
        item = matches[0]
        self.state.update(cumulative_query_count=cumulative, session_query_count=session)
        self.last_query_time = self.clock
        if "fixture_error" in item:
            error = item["fixture_error"]
            if error["category"] in _TRANSIENT:
                self.state["consecutive_transient_failures"] += 1
                if self.state["consecutive_transient_failures"] >= 4:
                    self.stopped_reason = "transient_retries_exhausted"
            else:
                self.stopped_reason = error["category"]
            result = {"synthetic_transport_error": copy.deepcopy(error)}
        elif "response" in item:
            result = copy.deepcopy(item["response"])
            body = result.get("body") if self.transport == "api" else result.get("structuredContent", {}).get("call")
            valid = (isinstance(body, dict) and body.get("id") == self.call_id
                     and isinstance(body.get("status"), str)
                     and body.get("result_status") in _TERMINAL | {"pending"}
                     and (body.get("result_status") != "available" or isinstance(body.get("result"), dict)))
            if not valid:
                self.stopped_reason = "invalid_response"
            else:
                self.state["consecutive_transient_failures"] = 0
                self.latest_response = copy.deepcopy(result)
                if body["result_status"] in _TERMINAL:
                    self.stopped_reason = "terminal_result"
        else:
            raise NotImplementedError("Polling response has no observation")
        delay = self.case.get("fixture_retry_after", {})
        if delay and delay.get("query_ordinal") == cumulative:
            deadline = delay.get("not_before_virtual_seconds", self.clock + delay["minimum_seconds"])
            self.state["server_not_before_virtual_seconds"] = deadline
            if self.transport == "api":
                result.setdefault("headers", {})["Retry-After"] = str(delay["minimum_seconds"])
            else:
                result["synthetic_server_wait"] = {"minimum_seconds": delay["minimum_seconds"], "not_before_virtual_seconds": deadline}
        if self.variant_id == "snapshot-only":
            self.stopped_reason = "snapshot_complete"
        if session == 120 and self.stopped_reason is None:
            self.stopped_reason = "session_cap"
        self._interrupt()
        if self.host_event:
            result["synthetic_host_event"] = copy.deepcopy(self.host_event)
        if self.transport == "api":
            result["synthetic_request_evidence"] = self._injection_evidence(args["url"])
        return result

    @staticmethod
    def _injection_evidence(url, source=None, method="GET"):
        # Construct and check the final synthetic header before redacting it.
        headers = {"Authorization": "Bearer " + _SYNTHETIC_KEY}
        value = headers["Authorization"]
        assert value == "Bearer SYNTHETIC_NOT_A_REAL_KEY"
        return {"method": method, "url": url, "credential_source": source,
                "authorization": "Bearer [REDACTED]", "bearer_prefix_count": value.count("Bearer "),
                "redirects_followed": False}

    def _secret(self, action, args):
        expected = self.setup.get("confirmed_safe_entry")
        if not expected or args["source"] != expected:
            raise PermissionError("Only the confirmed private source is authorized")
        if self.setup.get("base_url") not in {None, API_ORIGIN}:
            raise PermissionError("Configured API origin does not match the authorized production target")
        if action == "host.mock_secret_prepare":
            if self.turn_index != 0 or self.setup.get("api_key") == "configured":
                raise PermissionError("Empty private storage preparation is not authorized now")
            result = self.turn.get("fixture_host_result")
            if not result or result.get("secret_source") != expected or not result.get("prepared"):
                raise NotImplementedError("A successful private storage preparation fixture is required")
            self.prepared_source = expected
            return result
        present = self.setup.get("api_key") == "configured" and self.setup.get("secret_source") == expected
        if action == "host.mock_secret_presence":
            return {"source": expected, "field": "CALLE_API_KEY", "present": present}
        if not present or self.prepared_source != expected:
            raise PermissionError("The user has not saved and bound the prepared private entry")
        self.bound_source = expected
        return {"source": expected, "field": "CALLE_API_KEY", "injection_ready": True,
                "credential_value_exposed": False}

    def _save_record(self, record):
        if _contains_secret_field(record):
            raise PermissionError("Private operation records must not contain credentials")
        if self.polling:
            if record.get("resource_id", self.call_id) != self.call_id:
                raise PermissionError("Journal resource identity cannot change")
            for key, value in record.get("polling_state", {}).items():
                if (key == "server_not_before_virtual_seconds" and value is None
                        and self.state.get(key) is not None and self.clock >= self.state[key]):
                    continue
                if key in self.state and value != self.state[key]:
                    raise PermissionError("Journal counters must match observed monitoring state")
            original = {**self.journal, **self.setup.get("saved_record", {})}
            if any(key in record and record[key] != original[key]
                   for key in _POLLING_BINDING_FIELDS if key in original):
                raise PermissionError("Polling journal must preserve its original interface and authorization")
            self.journal = _merge_setup(self.journal, record)
            return {"saved": True}
        if set(record) == {"resource_id"}:
            if not self.journal or not self.create_count or record["resource_id"] != self.call_id:
                raise PermissionError("A resource-only update requires the observed create response")
            self.journal["resource_id"] = record["resource_id"]
            return {"saved": True}
        authorized = self.setup.get("authorized_call", {})
        body = record.get("original_request_body_or_tool_arguments")
        scope = record.get("authorization_scope", {})
        if (record.get("interface") != "api-key" or record.get("server_or_base_url") != API_ORIGIN
                or not isinstance(body, dict) or body.get("phone") != authorized.get("phone")
                or not isinstance(body.get("task"), str) or not body["task"].strip()
                or not isinstance(body.get("result_schema"), dict)
                or not isinstance(record.get("api_idempotency_key"), str) or not record["api_idempotency_key"].strip()
                or scope.get("approved_number") != authorized.get("phone")
                or scope.get("approved_purpose") != authorized.get("goal")
                or type(scope.get("maximum_logical_calls")) is not int
                or scope.get("maximum_logical_calls") != 1):
            raise PermissionError("The complete original request, key, origin and one-call authorization must be persisted")
        if self.journal:
            for key in ("original_request_body_or_tool_arguments", "api_idempotency_key", "interface", "server_or_base_url", "authorization_scope"):
                if record.get(key) != self.journal.get(key):
                    raise PermissionError("An existing operation's body, key or authorization cannot change")
        if record.get("resource_id") not in {None, self.call_id}:
            raise PermissionError("The saved resource ID must come from the observed create response")
        self.journal = copy.deepcopy(record)
        return {"saved": True}

    def _onboarding_http(self, action, args):
        expected = self.setup.get("confirmed_safe_entry")
        if (self.turn_index == 0 or self.setup.get("api_key") != "configured"
                or self.bound_source != expected or args.get("secret_source") != expected):
            raise PermissionError("Business HTTP requires the user's saved continuation and same-source secure binding")
        method = "GET" if action == "http.GET" else "POST"
        path = "/v1/goals?limit=1" if method == "GET" else "/v2/calls"
        if args["url"] != API_ORIGIN + path:
            raise PermissionError("Only this turn's exact production endpoint is authorized")
        responses = self.turn.get("fixture_http_responses", [])
        if self.http_index >= len(responses):
            raise PermissionError("This turn has no remaining authorized HTTP operation")
        response = responses[self.http_index]
        if response.get("method") != method or response.get("path") != path:
            raise PermissionError("The authorized Goals verification must precede creation")
        if method == "POST":
            if (not self.read_verified or not self.journal or self.create_count
                    or args["body"] != self.journal.get("original_request_body_or_tool_arguments")
                    or args["idempotency_key"] != self.journal.get("api_idempotency_key")):
                raise PermissionError("Creation requires the verified, persisted original operation exactly once")
            self.create_count += 1
            self.call_id = response.get("body", {}).get("id")
        else:
            self.read_verified = response.get("status") == 200
        self.http_index += 1
        result = {key: copy.deepcopy(value) for key, value in response.items() if key not in {"method", "path"}}
        result["synthetic_request_evidence"] = self._injection_evidence(args["url"], expected, method)
        return result
