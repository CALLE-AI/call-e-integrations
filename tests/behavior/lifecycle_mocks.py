"""Pure, explicit lifecycle fixtures for isolated Agent evaluations.

Nothing in this module opens a file, socket, browser, process, credential store,
or service connection. Tool contracts added here are synthetic host contracts,
not claims about a production MCP server. Original response-only fixtures are
represented as observations that already occurred, rather than fake tool calls.
Passing dispatcher tests is not evidence that an Agent passed an evaluation.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import PurePosixPath
import re
from urllib.parse import parse_qs, urlsplit

from jsonschema import Draft202012Validator

from tests.behavior.update_metadata import (
    SOURCE_URL, fetch_metadata, metadata_schema, metadata_state, start_explicit_check,
)

API_ORIGIN = "https://api.heycall-e.com"
MCP_URL = "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
DASHBOARD = "https://dashboard.heycall-e.com"
REPOSITORY = "https://github.com/CALLE-AI/call-e-integrations"
SKILL_DIRECTORY = "skills/calle"

_PRIOR_HTTP = {"api-05", "api-06", "api-08", "api-09", "api-10", "c04-02",
               "c04-03", "c04-05", "c04-07"}
_PRIOR_MCP = {"mcp-05", "mcp-06", "mcp-10"}
_SUPPLEMENTAL_GOALS = {"route-02", "route-04", "route-05", "route-11", "extra-08", "extra-01"}
_SECRET_KEYS = {"credential", "api_key_value", "authorization", "access_token", "refresh_token", "calle_api_key"}
_HIDDEN_SETUP = {"discovery_pages", "fixture_tools", "resolved_commit", "downloaded_version"}
_INITIAL_UPDATE = {"api-update-01", "mcp-update-01", "connect-update-01"}


def _copy(value):
    return copy.deepcopy(value)


def _object(properties=None, required=()):
    return {"type": "object", "properties": properties or {},
            "required": list(required), "additionalProperties": False}


def _merge(left, right):
    result = _copy(left)
    for key, value in right.items():
        result[key] = (_merge(result[key], value)
                       if isinstance(value, dict) and isinstance(result.get(key), dict)
                       else _copy(value))
    return result


def _visible(value):
    """Filter fixtures, rubrics and credential values from host public state."""
    if isinstance(value, dict):
        return {key: _visible(item) for key, item in value.items()
                if not key.startswith("fixture_") and not key.startswith("expected")
                and key.lower() not in _SECRET_KEYS and key not in _HIDDEN_SETUP}
    if isinstance(value, list):
        return [_visible(item) for item in value]
    if isinstance(value, str) and "SYNTHETIC_NOT_A_REAL_KEY" in value:
        return "[synthetic credential withheld]"
    return _copy(value)


def _has_secret(value):
    if isinstance(value, dict):
        return any(key.lower() in _SECRET_KEYS or _has_secret(item) for key, item in value.items())
    if isinstance(value, list):
        return any(_has_secret(item) for item in value)
    return isinstance(value, str) and "SYNTHETIC_NOT_A_REAL_KEY" in value


def _confined(path):
    if not isinstance(path, str) or not path or "\\" in path or "\x00" in path:
        return False
    parsed = PurePosixPath(path)
    return not parsed.is_absolute() and all(part not in {".", ".."} for part in path.split("/"))


class LifecycleMock:
    """State machine for fixture-only reads, management, and Skill staging.

    ``allowed_actions`` is the catalog ceiling when older source fixtures do not
    declare one. ``export_state`` is controller-only; never send it to an Agent.
    Tool schemas use canonical action names. The MCP bridge may sanitize them.
    """

    def __init__(self, source_case, variant=None, allowed_actions=None):
        self.case = _copy(source_case)
        if variant:
            self.case["setup"] = _merge(self.case.get("setup", {}), variant.get("setup", {}))
            for key, value in variant.items():
                if key not in {"id", "setup", "expected"}:
                    self.case[key] = _copy(value)
        self.case_id = self.case["id"]
        first_turn = self.case.get("turns", [{}])[0] if self.case.get("turns") else {}
        self.initial_turn_offset = int(self.case_id in _INITIAL_UPDATE and first_turn.get("prompt") != "")
        if self.case_id in {"api-polling-01", "mcp-polling-01", "api-onboarding-01", "api-onboarding-02", "api-onboarding-03"}:
            raise NotImplementedError("Use the dedicated polling/onboarding dispatcher")
        self.allowed_actions = list(allowed_actions if allowed_actions is not None else self.case.get("mock_allowed_actions", []))
        if not self.allowed_actions:
            raise NotImplementedError("An explicit catalog action ceiling is required")
        self.setup = _copy(self.case.get("setup", {}))
        self.trace = []
        self.provenance = []
        self.journal = next((_copy(self.setup[key]) for key in ("saved_record", "original_journal", "request_journal")
                             if isinstance(self.setup.get(key), dict)), {})
        self.turn_index = -1
        self.http_count = 0
        self.total_http_count = 0
        self.preparation_count = 0
        self.start_count = 0
        self.call_create_count = 0
        self.accepted_call = None
        self.submitted_revision = None
        self.bound_source = None
        self.prepared_source = None
        self.deleted = False
        self.connection = self.setup.get("connection", self.setup.get("mcp_connection", "unknown"))
        self.oauth_status = self.setup.get("oauth_status", "unknown")
        self.configuration_count = 0
        self.oauth_start_count = 0
        self.discovery_cursors = [self.setup["next_cursor"]] if self.setup.get("next_cursor") else []
        self.call = _copy(self.journal.get("call"))
        self.preparation = None
        self.latest_observation = None
        self.resolved_commit = None
        self.staged_files = None
        self.staging_verified = self.setup.get("complete_confined_regular_files") is True
        self.installed_version = self.setup.get("installed_version")
        self.metadata_fetch_count = 0
        self.metadata_state = metadata_state()
        self.download_count = 0
        self.install_count = 0
        self._supplement_setup()
        self.advance_turn(0)

    def _supplement(self, label, details):
        self.provenance.append({"origin": "tests/behavior/lifecycle_mocks.py",
                                "kind": "explicit synthetic fixture completion", "label": label, "details": details})

    def _supplement_setup(self):
        # These are fixed test inputs, not discoveries of live hosts or accounts.
        if self.case_id in {"route-14"}:
            self.setup.setdefault("secret_source", "host_secret:fixture-route-current")
            self.setup.setdefault("base_url", API_ORIGIN)
            self.setup.setdefault("http_tool", "secure_https_available")
            self._supplement("route credential reference", "A named synthetic host slot realizes the source fixture's already-authorized secure reference.")
        if self.case_id == "route-09":
            self.setup.setdefault("secret_source", self.journal.get("credential_ref"))
            self.setup.setdefault("base_url", self.journal.get("base_url"))
        if self.case_id == "route-11":
            self.setup.setdefault("secret_source", self.setup.get("api_secret_source"))
            self.setup.setdefault("base_url", self.setup.get("api_base_url"))
        if self.case_id in {"api-02", "extra-01", "extra-05", "c04-01", "c04-04"}:
            self.setup.setdefault("secret_source", "host_secret:fixture-already-bound")
            self.setup.setdefault("http_tool", "secure_https_available")
            self.setup.setdefault("base_url", API_ORIGIN)
            self.bound_source = self.setup["secret_source"]
            self._supplement("existing API host binding", "Synthetic already-bound host injection for the fixture's authorized existing read; no secret is exposed.")
        if self.case_id == "extra-05":
            self.setup["resource_id"] = self.setup["response"]["id"]
        if self.case_id == "api-04":
            self.setup.setdefault("resource_id", self.case.get("fixture_http_response", {}).get("body", {}).get("id"))
        if any(self.setup.get(key) == "present" for key in ("original_journal", "request_journal")):
            self.journal = {
                "interface": "api-key", "server_or_base_url": API_ORIGIN,
                "identity_ref": "fixture-original-account", "credential_ref": "host_secret:fixture-original",
                "original_request_body_or_tool_arguments": {"phone": "+12025550123", "task": "Synthetic previously authorized request"},
                "api_idempotency_key": "fixture-original-idempotency-key", "resource_id": None,
                "creation_outcome": self.setup.get("creation_outcome", self.setup.get("acceptance", "unknown")),
            }
            self._supplement("original request journal", "An opaque present journal is completed with stable synthetic request and identity values; no new write is authorized.")
        if self.case_id == "c04-01":
            self.journal.update({"resource_id": self.setup["resource_id"], "last_event_id": self.setup["saved_cursor"]})
        if self.case_id == "c04-04":
            self.journal.update({"interface": "api-key", "server_or_base_url": API_ORIGIN,
                                 "resource_id": self.setup["resource_id"],
                                 "credential_ref": self.bound_source})
            self._supplement("known API resource origin", "The synthetic original operation binds the existing resource to this API origin so malformed-response handling can be exercised.")
        if self.case_id in {"api-update-07", "mcp-update-07"}:
            self.setup.setdefault("staging_root", "/fixture/downloads/calle")
            self._supplement("download staging root", "Synthetic empty staging root for the source fixture's authorized version-change inspection.")

    @property
    def turn_count(self):
        return max(1, len(self.case.get("turns", [])) + self.initial_turn_offset)

    def advance_turn(self, index):
        if type(index) is not int or index != self.turn_index + 1 or index >= self.turn_count:
            raise ValueError("Controller turns must advance once, in order")
        self.turn_index = index
        turns = self.case.get("turns", [])
        offset = self.initial_turn_offset
        self.turn = _copy(turns[index - offset]) if turns and index >= offset else {}
        self.setup = _merge(self.setup, self.turn.get("setup", {}))
        if self.turn.get("fixture_explicit_update_check") is True:
            start_explicit_check(self.metadata_state)
        self.http_count = 0
        self.bound_source = self.bound_source if index == 0 or self.case_id == "c04-01" else None
        if self.case_id == "mcp-current-01" and index == 1:
            if self.preparation_count != 1:
                raise PermissionError("Native Dial event requires the prior saved preparation")
            self.call = _copy(self.turn["fixture_card_result"]["call"])
        if self.case_id == "mcp-11" and index >= 2:
            self.oauth_status = "host_callback_success"
        if self.case_id == "mcp-host-07" and index >= 2:
            self.oauth_status = "host_callback_success"
        if self.case_id == "mcp-14" and index == 1:
            self.oauth_status = "cancelled"
        if self.case_id == "mcp-15" and index == 0:
            self.oauth_status = "expired"
        if self.case_id in _PRIOR_HTTP:
            self.latest_observation = _copy(self.case.get("fixture_http_response"))
        if self.case_id in _PRIOR_MCP:
            self.latest_observation = _copy(self.case.get("fixture_tool_result"))
        return self.public_state()

    def public_state(self):
        prompt = self.turn.get("prompt", self.turn.get("user", self.case.get("prompt")))
        visible = {
            "turn_index": self.turn_index, "user_prompt": prompt, "setup": _visible(self.setup),
            "connection": self.connection, "oauth_status": self.oauth_status,
            "prior_observation": _visible(self.latest_observation),
            "saved_call": _copy(self.call), "preparation": _copy(self.preparation),
            "installed_version": self.installed_version,
        }
        if self.case_id == "mcp-current-01" and self.turn_index == 1:
            visible["host_event"] = {"event": "The user clicked native Dial once.", "call": _copy(self.call)}
        if "fixture_error" in self.case:
            visible["observed_connection_error"] = _copy(self.case["fixture_error"])
        if self.case_id == "mcp-16" and self.turn_index >= 1:
            visible["runtime_tools_release"] = "unverified; previous definitions remain loaded"
        return visible

    def snapshot(self):
        return _copy({**self.public_state(), "journal": _visible(self.journal), "trace": self.trace,
                      "provenance": self.provenance, "total_http_count": self.total_http_count,
                      "preparation_count": self.preparation_count, "configuration_count": self.configuration_count,
                      "start_count": self.start_count, "call_create_count": self.call_create_count,
                      "oauth_start_count": self.oauth_start_count, "bound_source": self.bound_source,
                      "deleted": self.deleted, "download_count": self.download_count,
                      "install_count": self.install_count, "staging_verified": self.staging_verified,
                      "metadata_fetch_count": self.metadata_fetch_count,
                      "metadata_check_attempts": self.metadata_state["attempts"]})

    def export_state(self):
        """Controller persistence only, bound to the unchanged source fixture."""
        state = {key: _copy(value) for key, value in self.__dict__.items() if key != "case"}
        return {"format": "lifecycle-mock-v1", "source_sha256": self._fingerprint(self.case), "state": state}

    @classmethod
    def from_state(cls, source_case, payload):
        if payload.get("format") != "lifecycle-mock-v1" or not isinstance(payload.get("state"), dict):
            raise ValueError("Invalid lifecycle state format")
        if payload.get("source_sha256") != cls._fingerprint(source_case):
            raise ValueError("Persisted lifecycle state belongs to a different source fixture")
        result = cls.__new__(cls)
        result.__dict__.update(_copy(payload["state"]))
        result.case = _copy(source_case)
        return result

    @staticmethod
    def _fingerprint(source):
        return hashlib.sha256(json.dumps(source, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    def _schema(self, action):
        text = {"type": "string", "minLength": 1}
        if action in {"local.report", "local.preview"}:
            return _object({"message": text}, ("message",))
        if action == "journal.write":
            return _object({"record": {"type": "object"}}, ("record",))
        if action == "host.mock_discovery":
            return _object({"cursor": {"type": ["string", "null"]}})
        if action.startswith("host.mock_secret_"):
            return _object({"source": text, "field": {"const": "CALLE_API_KEY"}}, ("source",))
        if action == "host.mock_browser_open_dashboard":
            return _object({"url": {"const": DASHBOARD}}, ("url",))
        if action in {"http.GET", "http.GET.separate_api_session"}:
            return _object({"url": text, "secret_source": text, "headers": {"type": "object"},
                            "follow_redirects": {"const": False}}, ("url",))
        if action.startswith("http.POST"):
            return _object({"url": text, "body": {"type": "object"}, "idempotency_key": text,
                            "secret_source": text}, ("url",))
        if action in {"host.mock_configure", "host.mock_mcp_command.configure"}:
            return _object({"server_url": {"const": MCP_URL}, "connection_name": text,
                            "host": text}, ("server_url",))
        if action.startswith("host.mock_mcp_command."):
            return _object({"host": text, "server_url": {"const": MCP_URL}, "connection_name": text})
        if action.startswith("host."):
            return _object({"server_url": {"const": MCP_URL}})
        if action == "mcp.explicitly_loaded_fixture_read_only_tool":
            return _copy(next((tool["inputSchema"] for tool in self._available_tools()
                               if "read" in tool["name"]), _object()))
        if action.startswith("mcp."):
            tool = next((tool for tool in self.case.get("fixture_tools", [])
                         if tool["name"].endswith("__" + action.split(".")[-1])), None)
            if tool:
                return _copy(tool["inputSchema"])
            raise NotImplementedError("No source schema for this MCP operation")
        if action == "update.mock_fetch_metadata":
            return metadata_schema(self.setup.get("public_fetch"))
        if action == "update.mock_resolve_commit":
            return _object({"source_url": {"const": SOURCE_URL}}, ("source_url",))
        if action == "update.mock_download_to_staging":
            return _object({"commit": {"type": "string", "pattern": "^[a-f0-9]{40}$"},
                            "directory": {"const": SKILL_DIRECTORY}, "destination": text},
                           ("commit", "directory", "destination"))
        if action == "update.mock_install":
            return _object({"commit": {"type": "string", "pattern": "^[a-f0-9]{40}$"}, "version": text}, ("commit", "version"))
        if action in {"journal.read", "update.mock_inspect_staging", "update.mock_loaded_version"}:
            return _object()
        raise NotImplementedError("No synthetic schema is defined for " + action)

    def tool_specs(self):
        descriptions = {
            "http.GET": "Synthetic HTTPS GET. Supply the exact URL; the host injects exactly one synthetic Bearer credential from the bound source. No redirects or user-provided Authorization.",
            "host.mock_secret_read": "Bind the selected synthetic host secret for HTTP injection; returns a reference, never the secret value.",
            "host.mock_secret_presence": "Check presence in the selected synthetic slot without revealing the value.",
            "host.mock_secret_prepare": "Prepare the single confirmed empty private slot in memory; no disk or credential store is touched.",
            "host.mock_discovery": "Return the next actual synthetic host tool-list page and schemas. Use its next_cursor unchanged.",
            "update.mock_fetch_metadata": ("Synthetic URL-only native public web reader using open/ref_id. Returns source-attributed text or reader errors. No request credentials are used; header and redirect controls are not exposed. No real network occurs."
                                           if self.setup.get("public_fetch") == "native_public_reader" else
                                           "Synthetic anonymous controlled HTTPS metadata read. Supply empty headers and follow_redirects=false. No real network occurs."),
            "update.mock_resolve_commit": "Resolve the official same-Skill source to the fixture's immutable commit. No network is used.",
            "update.mock_download_to_staging": "Stage only the fixed-commit same-Skill directory in synthetic memory. destination must be a new child of the provided staging_root. The host rejects unsafe archive entries before materialization.",
            "update.mock_inspect_staging": "Read the synthetic staged files as inert text and check confinement, completeness, name and version. Does not execute downloaded text.",
            "update.mock_install": "Use the synthetic native installer only for the approved version and already-verified immutable package; never reloads the current Agent.",
            "mcp.prepare_call": "Synthetic saved preparation or revision. Returns server-owned readiness and clarifications in text; the native card is optional. Never dials.",
            "mcp.start_call": "Submit the ready preparation_id and current revision under existing execution authorization. The same preparation returns the same call, including after a lost response or native Dial race.",
            "mcp.get_call": "Read the same current Call resource using call.id, never its billing call_id or preparation reference.",
            "mcp.open_call": "Display the existing synthetic native card. Does not activate Dial.",
            "mcp.get_call_transcript": "Read only the existing synthetic Call's available transcript content.",
        }
        result = []
        for action in self.allowed_actions:
            if not self._capability_available(action):
                continue
            schema = self._schema(action)
            result.append({"name": action, "inputSchema": schema,
                           "description": descriptions.get(action, "In-memory synthetic " + action + ". Only the current fixture's authorized target and turn are permitted.")})
        return result

    def _capability_available(self, action):
        if action == "update.mock_fetch_metadata":
            return self.setup.get("public_fetch") not in {"unavailable", "absent", False}
        if action.startswith("http.POST"):
            # These old cases supply an observed response, not an executable
            # complete write contract. Do not advertise a fictional capability.
            return False
        if action in {"http.GET", "http.GET.separate_api_session"}:
            return (self.setup.get("http_tool") not in {"absent", "unavailable"}
                    and self.setup.get("secret_source") is not None)
        if action == "mcp.explicitly_loaded_fixture_read_only_tool":
            return self.case_id not in _PRIOR_MCP and any("read" in tool["name"] for tool in self._available_tools())
        return True

    def dispatch(self, action, arguments):
        entry = {"action": action, "arguments": _visible(arguments), "turn_index": self.turn_index}
        try:
            if action not in self.allowed_actions:
                raise PermissionError("Action exceeds this fixture's catalog ceiling")
            schema = self._schema(action)
            if not isinstance(arguments, dict) or list(Draft202012Validator(schema).iter_errors(arguments)):
                raise ValueError("Arguments do not match the explicit synthetic schema")
            if _has_secret(arguments):
                raise PermissionError("Secret values and Authorization must stay inside the synthetic host")
            result = self._dispatch(action, _copy(arguments))
            entry["result"] = _visible(result)
            return _copy(result)
        except (ValueError, PermissionError, NotImplementedError) as error:
            entry["error"] = {"type": type(error).__name__, "message": str(error)}
            raise
        finally:
            self.trace.append(entry)

    def _observation(self, key):
        if key in self.case:
            return _copy(self.case[key])
        if key in self.turn:
            return _copy(self.turn[key])
        turns = self.case.get("turns", [])
        following = self.turn_index + 1
        if following < len(turns) and set(turns[following]) <= {key, "expected"}:
            return _copy(turns[following].get(key))
        return None

    def _dispatch(self, action, args):
        if action in {"local.report", "local.preview"}:
            return {"recorded": True}
        if action == "journal.read":
            return {"record": _visible(self.journal), "known_observation": _visible(self.latest_observation),
                    "saved_cursor": self.setup.get("saved_last_event_id", self.setup.get("saved_cursor"))}
        if action == "journal.write":
            record = args["record"]
            for key in ("interface", "server_or_base_url", "identity_ref", "credential_ref",
                        "original_request_body_or_tool_arguments", "api_idempotency_key"):
                if key in self.journal and record.get(key, self.journal[key]) != self.journal[key]:
                    raise PermissionError("The original recovery identity must remain unchanged")
            old_cursor = self.journal.get("last_event_id")
            if old_cursor and "last_event_id" in record and not record["last_event_id"]:
                raise PermissionError("An empty page cannot erase the saved event cursor")
            self.journal = _merge(self.journal, record)
            return {"saved": True, "record": _visible(self.journal)}
        if action == "host.mock_browser_open_dashboard":
            if self.setup.get("native_browser") != "available" or self.turn_index != 0:
                raise PermissionError("Browser opening is not available in this turn")
            result = self._observation("fixture_browser_result")
            if result is None:
                raise NotImplementedError("Missing explicit browser observation")
            return result
        if action.startswith("host.mock_secret_"):
            return self._secret(action, args)
        if action in {"http.GET", "http.GET.separate_api_session"}:
            return self._http_read(args)
        if action.startswith("http.POST"):
            raise NotImplementedError("This historical response-only fixture has no complete approved write contract; preserve and report the observed outcome")
        if action == "host.inspect_existing_connection":
            return {"server_url": self.setup.get("server_url", MCP_URL), "connection": self.connection,
                    "oauth_status": self.oauth_status, "host_metadata": _visible(self.setup),
                    "observed_error": self.case.get("fixture_error")}
        if action == "host.mock_discovery":
            return self._discover(args.get("cursor"))
        if action.startswith("host."):
            return self._host(action, args)
        if action.startswith("mcp."):
            return self._mcp(action, args)
        if action.startswith("update."):
            return self._update(action, args)
        raise NotImplementedError("No matching lifecycle action")

    def _secret(self, action, args):
        selected = self.setup.get("secret_source")
        expected = self.setup.get("confirmed_safe_entry") if action.endswith("prepare") else selected
        if expected in {None, "not_selected"} or args["source"] != expected:
            raise PermissionError("Only the user's selected or single confirmed synthetic source is accessible")
        if self.setup.get("secure_secret_injection") is False:
            raise PermissionError("Secure host injection is unavailable")
        if action.endswith("prepare"):
            if self.turn_index != 0 or self.setup.get("safe_entry_count") != 1:
                raise PermissionError("Preparing this source is not authorized")
            result = self._observation("fixture_host_result")
            if result is None:
                raise NotImplementedError("Missing explicit secret preparation result")
            if result.get("prepared"):
                self.prepared_source = expected
            return result
        if action.endswith("delete"):
            if self.case_id != "api-auth-07" or self.turn_index != 0:
                raise PermissionError("Local deletion is not authorized in this turn")
            result = self._observation("fixture_host_result")
            if result and result.get("deleted"):
                self.deleted = True
                self.bound_source = None
            return result
        if self.deleted or self.setup.get("api_key") == "missing":
            if action.endswith("presence"):
                return {"present": False, "source": selected}
            raise PermissionError("No saved synthetic credential is available")
        if action.endswith("presence"):
            return {"present": True, "source": selected, "field": "CALLE_API_KEY"}
        if action.endswith("read"):
            self.bound_source = selected
            return {"bound": True, "source": selected, "host_injection": "exactly one Bearer prefix", "secret_value_returned": False}
        raise NotImplementedError("Unknown secret operation")

    def _http_read(self, args):
        parsed = urlsplit(args["url"])
        if parsed.scheme != "https" or parsed.netloc != "api.heycall-e.com" or parsed.fragment:
            raise PermissionError("HTTP request is outside the exact production origin")
        if args.get("headers") or args.get("follow_redirects", False):
            raise PermissionError("Use host-only credentials and do not follow redirects")
        configured_origin = self.setup.get("base_url", API_ORIGIN) or API_ORIGIN
        if configured_origin != API_ORIGIN:
            raise PermissionError("Existing operation belongs to a different environment; do not redirect it")
        selected = self.setup.get("secret_source")
        if not selected or selected == "not_selected" or self.bound_source != selected:
            raise PermissionError("Bind the selected secure synthetic source before HTTP")
        if args.get("secret_source", selected) != selected:
            raise PermissionError("Credential source substitution is forbidden")
        if self.setup.get("http_tool") in {"absent", "unavailable"}:
            raise PermissionError("No trusted HTTPS capability is available")
        query = parse_qs(parsed.query)
        resource = self.setup.get("resource_id", self.setup.get("current_call_resource_id", self.journal.get("resource_id")))
        goals = parsed.path == "/v1/goals" and query == {"limit": ["1"]}
        call_path = f"/v2/calls/{resource}" if resource else None
        call_read = resource is not None and parsed.path == call_path and not query
        events = (resource is not None and parsed.path == call_path + "/events"
                  and (self.case_id == "c04-01" or "fixture_event_response" in self.case))
        if not goals and not call_read and not events:
            raise PermissionError("URL is outside the current authorized resource or minimal Goals check")
        if self.http_count and (not events or self.case_id != "c04-01"):
            raise PermissionError("This read-check fixture authorizes one HTTP observation per user turn")
        if self.case_id == "c04-01":
            cursor = query.get("cursor", [None])[0]
            if self.turn_index > 0:
                if self.http_count or cursor != self.journal.get("last_event_id"):
                    raise PermissionError("The later authorized event read must use the last saved event ID once")
                response = {"status": 200, "body": self.case["fixture_pages"][-1]}
                self.http_count += 1
                self.total_http_count += 1
                self.latest_observation = _copy(response)
                return {**response, "synthetic_request_metadata": {"credential_source": selected,
                    "bearer_prefix_count": 1, "redirect_followed": False, "url": args["url"]}}
            wanted = [self.setup["saved_cursor"], "fixture-page-2"]
            if set(query) - {"cursor", "limit"} or self.http_count >= len(wanted) or cursor != wanted[self.http_count]:
                raise PermissionError("Event pagination requires the returned cursor and saved final event ID")
            response = {"status": 200, "body": self.case["fixture_pages"][self.http_count]}
        else:
            if events and query != {"limit": ["20"]}:
                raise PermissionError("This explicit event fixture permits only the first page with limit=20")
            response = self._observation("fixture_event_response" if events else "fixture_http_response")
            error = self._observation("fixture_transport_error")
            if error:
                response = {"transport_error": error, "http_response_received": False}
            if response is None and self.case_id in _SUPPLEMENTAL_GOALS and goals:
                response = {"status": 200, "body": {"data": [], "next_cursor": None}}
                self._supplement("minimal Goals response", "Explicit synthetic empty successful Goals response for the source routing/read scenario.")
            if response is None and call_read and self.case_id in {"route-09", "route-14", "extra-05"}:
                response = {"status": 200, "body": {"id": resource, "status": "completed", "result_status": "not_applicable", "result": None, "error": None}}
                self._supplement("current Call read response", "Synthetic terminal Call response tests identity routing without inventing conversation content.")
            if response is None:
                raise NotImplementedError("No explicit HTTP observation is supplied")
        self.http_count += 1
        self.total_http_count += 1
        self.latest_observation = _copy(response)
        return {**response, "synthetic_request_metadata": {"credential_source": selected, "bearer_prefix_count": 1,
                                                           "redirect_followed": False, "url": args["url"]}}

    def _available_tools(self):
        if self.case_id == "mcp-13" and self.turn_index == 0:
            return []
        if self.case_id in {"mcp-host-07", "mcp-host-08"}:
            return []
        tools = self.turn.get("fixture_tools", self.case.get("fixture_tools", []))
        if not tools and self.case_id in {"mcp-13", "mcp-15"}:
            for turn in self.case.get("turns", [])[:self.turn_index + 1]:
                tools = turn.get("fixture_tools", tools)
        if not tools and self.case_id in {"route-01", "route-11"}:
            tools = [{"name": "fixture_account_read", "description": "Synthetic read-only connected-account metadata; no writes or charges.", "inputSchema": _object()}]
        if not tools and self.setup.get("fixture_tool"):
            tools = [self.setup["fixture_tool"]]
        return _copy(tools)

    def _discover(self, cursor):
        pages = self.setup.get("discovery_pages")
        if not pages and self.case_id in {"mcp-08", "route-06"}:
            pages = [{"tool_names": [], "next_cursor": "fixture-next-page"}, {"tool_names": [], "next_cursor": None}]
            if not any(item["label"] == "paginated discovery" for item in self.provenance):
                self._supplement("paginated discovery", "Two explicit empty synthetic pages complete the partial-discovery source fixture.")
        if pages:
            index = 0 if cursor is None else next((i + 1 for i, page in enumerate(pages[:-1]) if page.get("next_cursor") == cursor), -1)
            if index < 0 or index >= len(pages):
                raise PermissionError("Unknown discovery cursor")
            if index and pages[index - 1].get("next_cursor") not in self.discovery_cursors:
                raise PermissionError("Discovery must consume pages in order")
            page = _copy(pages[index])
            if page.get("next_cursor"):
                self.discovery_cursors.append(page["next_cursor"])
            names = page.get("tool_names", [])
            return {**page, "complete": page.get("next_cursor") is None,
                    "tools": [tool for tool in self._available_tools() if tool["name"] in names]}
        tools = self._available_tools()
        names = self.setup.get("exposed_tool_names", [tool["name"] for tool in tools])
        return {"tools": tools, "tool_names": names, "next_cursor": None, "complete": True}

    def _host(self, action, args):
        command = action.startswith("host.mock_mcp_command.")
        operation = action.split(".")[-1] if command else action.removeprefix("host.mock_")
        if command:
            context = self.case.get("host_command_fixture", {})
            if (context.get("installed_official_command") is not True
                    or context.get("native_management") != "unavailable"
                    or context.get("policy_permitted") is not True
                    or context.get("user_forbids_cli") is not False
                    or context.get("current_host") != context.get("command_host")
                    or args.get("host", context.get("current_host")) != context.get("current_host")):
                raise PermissionError("Official synthetic host-manager exception does not apply")
        elif self.setup.get("native_management") in {"policy_denied", "unavailable"}:
            raise PermissionError("The native host manager is not available and permitted")
        if operation in {"help", "status", "oauth_status"}:
            return {"current_host": self.setup.get("current_host", "synthetic-native-host"),
                    "connection": self.connection, "server_url": MCP_URL, "oauth_status": self.oauth_status,
                    "available_operations": [item for item in self.allowed_actions if item.startswith("host.")]}
        if operation == "configure":
            if self.connection not in {"missing", "unknown"} or self.configuration_count:
                raise PermissionError("Do not configure a duplicate existing connection")
            self.connection = "configured"
            self.configuration_count += 1
            started = self.case_id in {"mcp-11", "mcp-14", "mcp-host-07"}
            if started:
                self.oauth_start_count += 1
                self.oauth_status = "pending_callback"
            return {"configured": True, "server_url": MCP_URL, "oauth_started": started, "oauth_status": self.oauth_status}
        if operation == "oauth_start":
            if self.case_id == "mcp-15" and self.turn_index == 0:
                raise PermissionError("The initial user explicitly forbids reauthorization")
            if self.oauth_start_count or self.oauth_status in {"pending_callback", "cancelled", "host_callback_success", "host_confirmed"}:
                raise PermissionError("Duplicate or cancelled OAuth flow must not restart")
            if self.connection != "configured":
                raise PermissionError("Configure the intended missing connection first")
            self.oauth_start_count += 1
            self.oauth_status = "host_callback_success" if self.case_id == "mcp-15" and self.turn_index > 0 else "pending_callback"
            return {"oauth_started": True, "oauth_status": self.oauth_status, "browser_consent": "user completes in native host"}
        if operation == "logout":
            if self.case_id != "mcp-16":
                raise PermissionError("Logout is not authorized")
            self.oauth_status = "local_credentials_deleted"
            return {"local_credentials_deleted": True, "server_revocation": "unverified"}
        if operation == "remove":
            if self.case_id != "mcp-16":
                raise PermissionError("Connection removal is not authorized")
            self.connection = "missing"
            return {"connection_removed": True, "filtered_target_list": []}
        if operation == "refresh":
            return {"runtime_release": "unverified", "connection": self.connection}
        raise NotImplementedError("No explicit synthetic host result for " + operation)

    def _mcp(self, action, args):
        if action in {"mcp.prepare_call", "mcp.start_call"} and self.case.get("fixture_mcp_flow"):
            if self.connection != "authenticated":
                raise PermissionError("An authenticated existing MCP connection is required")
            if action == "mcp.prepare_call":
                if args.get("preparation_id"):
                    if not self.preparation or args["preparation_id"] != self.preparation["preparation_id"]:
                        raise PermissionError("Only the original preparation can be resumed")
                    if self.accepted_call:
                        self.call = _copy(self.accepted_call)
                        return {"call": _copy(self.call)}
                    if args.get("user_input"):
                        if self.setup.get("revision_authorized") is False:
                            raise PermissionError("No current user answer authorizes revising this preparation")
                        if args.get("revision") != self.preparation["revision"]:
                            return {"isError": True, "error": {"code": "idempotency_conflict", "status": 409}}
                        self.preparation = _copy(self.case["fixture_revision_response"])
                    return {"preparation": _copy(self.preparation)}
                if self.preparation_count or self.setup.get("prior_write_sent"):
                    raise PermissionError("Do not create another preparation for the original call")
                if not args.get("task") or args.get("user_input"):
                    raise ValueError("A new preparation requires the user task, not a revision input")
                if args.get("phone") != self.setup["destination_number"]:
                    raise PermissionError("Preparation differs from the user's confirmed number")
                self.preparation_count += 1
                self.preparation = _copy(self.case["fixture_tool_response"])
                return {"preparation": _copy(self.preparation),
                        "card_rendered": self.setup.get("native_card") == "available"}
            if self.setup.get("execution_authorized") is not True:
                raise PermissionError("A loaded start tool does not authorize execution")
            if not self.preparation or args["preparation_id"] != self.preparation["preparation_id"]:
                raise PermissionError("Start must retain the original preparation identity")
            if self.accepted_call and args["revision"] != self.submitted_revision:
                raise PermissionError("Recovery must retain the original start arguments")
            if self.start_count >= 2:
                raise PermissionError("The fixture permits at most one original start and one same-preparation retry")
            self.start_count += 1
            if not self.accepted_call:
                if args["revision"] != self.preparation["revision"]:
                    return {"isError": True, "error": {"code": "idempotency_conflict", "status": 409}}
                if self.preparation["status"] != "ready":
                    return {"isError": True, "error": {"code": "input_incomplete", "status": 422}}
                self.accepted_call = _copy(self.case["fixture_start_response"]["call"])
                self.submitted_revision = args["revision"]
                self.call_create_count += 1
                if self.case.get("fixture_native_dial_race"):
                    self._supplement("native Dial event", {"preparation_id": self.preparation["preparation_id"],
                                                            "call": self.accepted_call})
                if self.case.get("fixture_start_response_lost"):
                    return {"isError": True, "error": {"code": "provider_unavailable", "status": 503},
                            "submission_outcome": "unknown"}
            self.call = _copy(self.accepted_call)
            return {"call": _copy(self.call)}
        if action == "mcp.prepare_call":
            if self.case_id != "mcp-current-01" or self.turn_index != 0 or self.preparation_count:
                raise PermissionError("Only the first approved preparation is authorized")
            if args.get("phone") != "+12025550123":
                raise PermissionError("Preparation differs from the user's confirmed number")
            # Task meaning is graded from the real Agent arguments. A literal
            # English substring is not a valid semantic authorization check.
            self.preparation = self._observation("fixture_tool_response")
            if not self.preparation:
                raise NotImplementedError("Missing explicit preparation response")
            self.preparation_count += 1
            return self.preparation
        if action in {"mcp.get_call", "mcp.open_call", "mcp.get_call_transcript"}:
            if not self.call or args.get("call_id") != self.call.get("id"):
                raise PermissionError("Only the actual current Call resource ID is authorized")
            if action == "mcp.open_call":
                return {"card_rendered": True, "call": _copy(self.call), "dial_activated": False,
                        "provenance": "Explicit synthetic existing-card observation"}
            if action == "mcp.get_call_transcript":
                response = self._observation("fixture_transcript_response")
                if response is not None:
                    return response
                return {"call_id": self.call["id"], "transcript": [], "available": False,
                        "provenance": "Explicit synthetic absent transcript; no dialogue invented"}
            response = self._observation("fixture_call_response")
            if response is not None:
                return response
            if self.case_id == "mcp-current-01":
                return {"call": _copy(self.call), "provenance": "Synthetic read repeats the actual preceding native-card Call observation"}
            if self.case_id == "mcp-current-04":
                response = {**self.call, "result_status": "not_applicable", "result": None, "error": None}
                self._supplement("saved current Call response", "Synthetic terminal result status; the source has no status sequence. Dedicated polling fixtures cover pending transitions.")
                return {"call": response}
            raise NotImplementedError("Missing source current-Call observation")
        if action == "mcp.explicitly_loaded_fixture_read_only_tool":
            if self.case_id in _PRIOR_MCP:
                raise PermissionError("The result is already observed; no source schema authorizes a replacement invocation")
            tools = self._available_tools()
            if not tools or not any("read" in tool["name"] for tool in tools):
                raise NotImplementedError("No explicit safe synthetic read tool is currently exposed")
            if self.case_id in {"mcp-11", "mcp-13", "mcp-15"} and self.oauth_status not in {"host_callback_success", "host_confirmed"}:
                raise PermissionError("Safe business verification must wait for host callback evidence")
            response = self._observation("fixture_tool_result")
            if response is None and self.case_id in {"route-01", "route-11"}:
                response = {"isError": False, "structuredContent": {"account_ref": "fixture-mcp-account"}}
                self._supplement("routing account observation", "Explicit synthetic read response tests interface selection without claiming live identity.")
            if response is None:
                raise NotImplementedError("No explicit synthetic MCP read result is supplied")
            return response
        raise PermissionError("Legacy or unknown MCP business operation is never implemented")

    def _update(self, action, args):
        if action == "update.mock_fetch_metadata":
            if self.setup.get("public_fetch") in {"unavailable", "absent", False}:
                raise PermissionError("No anonymous public metadata reader is available")
            if self.setup.get("session_metadata_check") == "already_completed" and not self.turn.get("fixture_explicit_update_check"):
                raise PermissionError("An update check already occurred; no new explicit request exists")
            responses = self._observation("fixture_responses") or self.setup.get("fixture_responses")
            if responses is None:
                response = self._observation("fixture_response") or self.setup.get("fixture_response")
                error = self._observation("fixture_transport_error")
                responses = [response] if response is not None else ([{"transport_error": error}] if error else [])
            result = fetch_metadata(self.metadata_state, args, responses, self.setup.get("public_fetch"))
            self.metadata_fetch_count += 1
            return result
        if action == "update.mock_resolve_commit":
            if not self.setup.get("download_consent") or not self.setup.get("native_file_tools"):
                raise PermissionError("Native download is not authorized and available")
            self.resolved_commit = self.setup.get("resolved_commit")
            if not self.resolved_commit or not re.fullmatch("[a-f0-9]{40}", self.resolved_commit):
                raise NotImplementedError("Missing immutable source fixture commit")
            return {"repository": REPOSITORY, "commit": self.resolved_commit, "directory": SKILL_DIRECTORY}
        if action == "update.mock_download_to_staging":
            root = self.setup.get("staging_root")
            if (not self.setup.get("download_consent") or not self.setup.get("native_file_tools")
                    or not self.resolved_commit or args["commit"] != self.resolved_commit):
                raise PermissionError("Only the authorized resolved commit may be staged")
            if not root or not args["destination"].startswith(root.rstrip("/") + "/") or ".." in PurePosixPath(args["destination"]).parts:
                raise PermissionError("Use a new directory confined to the synthetic staging root")
            if self.download_count:
                raise PermissionError("The existing synthetic staging directory must not be overwritten")
            files = self.case.get("fixture_files", self.setup.get("fixture_files"))
            entry = self.case.get("fixture_entry", self.setup.get("fixture_entry"))
            if entry:
                files = [entry]
            if files is None:
                raise NotImplementedError("No complete artifact variant is supplied for staging")
            for item in files:
                if not _confined(item.get("path")) or item.get("kind") != "regular":
                    return {"downloaded": False, "materialized_files": [], "rejected_entry": _copy(item),
                            "reason": "unsafe path or non-regular entry", "installed_version": self.installed_version}
            self.staged_files = _copy(files)
            self.download_count += 1
            return {"downloaded": True, "destination": args["destination"], "commit": self.resolved_commit,
                    "file_count": len(files), "inspection_required": True}
        if action == "update.mock_inspect_staging":
            if self.staged_files is None:
                if self.setup.get("complete_confined_regular_files") and self.setup.get("verified_commit"):
                    self.staging_verified = True
                    return {"verified": True, "commit": self.setup["verified_commit"], "name": "calle",
                            "version": self.setup["downloaded_version"], "material_new_capabilities": self.setup.get("material_new_capabilities"),
                            "provenance": "Source fixture explicitly supplies prior complete inspection"}
                raise PermissionError("There is no downloaded synthetic staging package to inspect")
            files = {item["path"]: item.get("body", "") for item in self.staged_files}
            main = files.get("SKILL.md", "")
            name = re.findall(r"^name:\s*(\S+)\s*$", main, re.M)
            versions = re.findall(r'^\s+version:\s*[\"\x27]?([^\"\x27\s]+)', main, re.M)
            issues = []
            if name != ["calle"] or len(versions) != 1 or not re.fullmatch(r"\d+\.\d+\.\d+", versions[0]):
                issues.append("invalid same-Skill name or stable version metadata")
            for filename, body in files.items():
                for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", body):
                    target = link.split("#", 1)[0]
                    if not target or "://" in target:
                        continue
                    relative = str(PurePosixPath(filename).parent / target)
                    if not _confined(relative):
                        issues.append("outside reference: " + target)
                    elif relative not in files:
                        issues.append("missing reference: " + relative)
            self.staging_verified = not issues
            return {"verified": self.staging_verified, "issues": issues, "name": name[0] if len(name) == 1 else None,
                    "version": versions[0] if len(versions) == 1 else None, "commit": self.resolved_commit,
                    "files": _copy(self.staged_files), "file_hashes": {key: hashlib.sha256(body.encode()).hexdigest() for key, body in files.items()},
                    "installed_version": self.installed_version}
        if action == "update.mock_install":
            if (not self.setup.get("install_consent") or not self.setup.get("native_installer") or not self.staging_verified
                    or self.setup.get("local_modifications") or self.setup.get("material_new_capabilities")):
                raise PermissionError("Native installation is not approved for this verified state")
            if args["commit"] != self.setup.get("verified_commit") or args["version"] != self.setup.get("downloaded_version"):
                raise PermissionError("Installation differs from the previously inspected approved package")
            if self.install_count:
                raise PermissionError("Do not repeat installation")
            result = self.setup.get("fixture_install_result")
            if result is None:
                raise NotImplementedError("Missing native installer observation")
            self.installed_version = result.get("installed_version", self.installed_version)
            self.install_count += 1
            return _copy(result)
        if action == "update.mock_loaded_version":
            return {"loaded_version": self.setup.get("fixture_loaded_version", self.setup.get("installed_version")),
                    "installed_version": self.installed_version, "native_reload": self.setup.get("native_reload", "unavailable")}
        raise NotImplementedError("Unknown synthetic update operation")
