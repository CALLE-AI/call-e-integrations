"""Pure offline preparation helpers, not an Agent evaluator or business client.

Only source fixtures are loaded. No credentials, HTTP, shell, model API or MCP
connection is used. A record passing validation is not a passing Agent result.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

SKILLS = ("callev2",)
EVALUATION_SOURCES = (
    ("tests/behavior/callev2-evals.json", "callev2"),
    ("tests/extra-behavior-cases.json", None),
    ("tests/behavior/round-1-cases.json", None),
)
STATES = {"PASS", "FAIL", "NOT_RUN", "BLOCKED", "INCONCLUSIVE"}
DASHBOARD_URL = "https://dashboard.heycall-e.com"
DASHBOARD_MOCK_ACTION = "host.mock_browser_open_dashboard"
HOST_COMMAND_MOCK_ACTIONS = {
    f"host.mock_mcp_command.{operation}" for operation in
    ("help", "status", "configure", "oauth_start", "oauth_status", "refresh", "logout", "remove")
}
AUTH_MOCK_ACTIONS = {
    "api": {"http.GET", "host.mock_secret_presence", "host.mock_secret_read",
                      "host.mock_secret_prepare", "host.mock_secret_delete", DASHBOARD_MOCK_ACTION},
    "mcp": {"host.inspect_existing_connection", "host.mock_discovery",
                        "host.mock_configure", "host.mock_oauth_start", "host.mock_oauth_status",
                        "host.mock_refresh", "host.mock_logout", "host.mock_remove",
                        "mcp.explicitly_loaded_fixture_read_only_tool"},
}
UPDATE_MOCK_ACTIONS = {
    "local.preview", "local.report", "update.mock_fetch_metadata",
    "update.mock_resolve_commit", "update.mock_download_to_staging",
    "update.mock_inspect_staging", "update.mock_install",
    "update.mock_loaded_version",
}
MCP_CALL_MOCK_ACTIONS = {
    "local.preview", "local.report", "journal.read", "journal.write",
    "host.mock_wait",
    "host.inspect_existing_connection", "host.mock_discovery",
    "mcp.prepare_call", "mcp.start_call", "mcp.get_call", "mcp.open_call", "mcp.get_call_transcript",
}
API_CALL_MOCK_ACTIONS = {
    "local.preview", "local.report", "journal.read", "journal.write",
    "host.mock_wait",
    "host.mock_secret_presence", "host.mock_secret_read", "host.mock_secret_prepare",
    DASHBOARD_MOCK_ACTION, "http.GET", "http.POST.create_authorized_call_once",
}


ROUTING_MOCK_ACTIONS = {
    "local.preview", "local.report", "journal.read", "host.inspect_existing_connection",
    "host.mock_discovery", "host.mock_refresh", "host.mock_secret_presence",
    "host.mock_secret_read", "http.GET", "mcp.explicitly_loaded_fixture_read_only_tool",
}


def routing_mock_actions(source: dict[str, Any], skill: str) -> list[str]:
    """Routing fixtures can select/read across interfaces, never submit a write."""
    actions = source.get("mock_allowed_actions")
    if (skill not in SKILLS or source.get("selected_transport") != "undecided"
            or not isinstance(actions, list) or not actions
            or any(not isinstance(action, str) or action not in ROUTING_MOCK_ACTIONS for action in actions)
            or len(set(actions)) != len(actions)):
        raise ValueError(f"Invalid routing mock actions for {source['id']}")
    return list(actions)


def authentication_mock_actions(source: dict[str, Any], selected_transport: str) -> list[str]:
    """Validate explicit authentication-fixture limits, never real permissions."""
    actions = source["mock_allowed_actions"]
    allowed = AUTH_MOCK_ACTIONS.get(selected_transport, set()) | {"local.preview", "local.report", "journal.read"}
    if isinstance(actions, list) and any(
            isinstance(action, str) and action.startswith("host.mock_mcp_command.") for action in actions):
        context = source.get("host_command_fixture")
        if (source.get("mock_action_scope") != "authentication" or selected_transport != "mcp"
                or not isinstance(context, dict)
                or not isinstance(context.get("current_host"), str) or not context["current_host"].strip()
                or context.get("command_host") != context["current_host"]
                or context.get("installed_official_command") is not True
                or context.get("native_management") != "unavailable"
                or context.get("policy_permitted") is not True
                or context.get("user_forbids_cli") is not False):
            raise ValueError(f"Invalid host command fixture for {source['id']}")
        allowed |= HOST_COMMAND_MOCK_ACTIONS
    if (not isinstance(actions, list) or not actions
            or any(not isinstance(action, str) or action not in allowed for action in actions)
            or len(set(actions)) != len(actions)):
        raise ValueError(f"Invalid authentication mock actions for {source['id']}")
    return list(actions)


def update_mock_actions(source: dict[str, Any], skill: str) -> list[str]:
    """Keep update fixtures separate from business, credentials and processes."""
    actions = source.get("mock_allowed_actions")
    if (skill not in SKILLS or not isinstance(actions, list) or not actions
            or any(not isinstance(action, str) or action not in UPDATE_MOCK_ACTIONS for action in actions)
            or len(set(actions)) != len(actions)):
        raise ValueError(f"Invalid update mock actions for {source['id']}")
    return list(actions)


def mcp_call_mock_actions(source: dict[str, Any], skill: str) -> list[str]:
    """Keep current-call fixture actions explicit, mock-only, and MCP-specific."""
    actions = source.get("mock_allowed_actions")
    if (skill not in SKILLS or source.get("selected_transport") != "mcp"
            or not isinstance(actions, list) or not actions
            or any(not isinstance(action, str) or action not in MCP_CALL_MOCK_ACTIONS for action in actions)
            or len(set(actions)) != len(actions)):
        raise ValueError(f"Invalid MCP call mock actions for {source['id']}")
    return list(actions)


def api_call_mock_actions(source: dict[str, Any], skill: str) -> list[str]:
    """Only explicit API-call fixtures can admit a new mock call creation."""
    actions = source.get("mock_allowed_actions")
    if (skill not in SKILLS or source.get("selected_transport") != "api"
            or not isinstance(actions, list) or not actions
            or any(not isinstance(action, str) or action not in API_CALL_MOCK_ACTIONS for action in actions)
            or len(set(actions)) != len(actions)):
        raise ValueError(f"Invalid API call mock actions for {source['id']}")
    return list(actions)


def build_catalog(root: Path) -> list[dict[str, Any]]:
    """Bind all source expectations to a stable rubric; never generate outputs."""
    cases = []
    for relative, default_skill in EVALUATION_SOURCES:
        for source in json.loads((root / relative).read_text(encoding="utf-8"))["cases"]:
            skill = source.get("skill", default_skill)
            if skill not in SKILLS:
                raise ValueError(f"Unknown Skill for {source['id']}")
            selected_transport = source.get("selected_transport")
            scope = source.get("mock_action_scope", "authentication")
            if not isinstance(scope, str) or scope not in {"authentication", "skill_update", "routing", "mcp_call", "api_call"}:
                raise ValueError(f"Unknown mock action scope for {source['id']}")
            if scope == "authentication" and selected_transport not in {"api", "mcp", "separate_sessions"}:
                raise ValueError(f"Missing or invalid selected transport for {source['id']}")
            if selected_transport == "separate_sessions" and source["id"] != "extra-12":
                raise ValueError(f"Separate sessions require the explicit dual-read fixture for {source['id']}")
            actions = ["local.preview", "local.report", "journal.read"]
            # A maximum is a safety boundary, not a requirement to call a tool.
            if source["id"] not in {"api-01", "api-03", "api-11", "api-12", "api-13", "api-14", "extra-08", "extra-09", "c04-06"} and selected_transport == "api":
                actions.append("http.GET")
            if selected_transport == "api" and source["id"] in {"api-07", "api-08", "extra-07"}:
                actions += ["journal.write", "http.POST.same_original_request_at_most_once_after_backoff"]
            if selected_transport == "api" and source["id"] == "api-10":
                actions.append("http.POST.cancel_saved_resource_at_most_once")
            if selected_transport == "api" and source["id"] in {"api-09", "extra-03", "extra-05", "c04-01", "c04-02", "c04-03", "c04-07"}:
                actions.append("journal.write")
            if selected_transport in {"mcp", "separate_sessions"}:
                actions.append("host.inspect_existing_connection")
                if source["id"] not in {"mcp-01", "mcp-04", "c04-08"}:
                    actions.append("host.mock_discovery")
                if source["id"] in {"mcp-05", "mcp-06", "mcp-10", "extra-10", "extra-12"}:
                    actions.append("mcp.explicitly_loaded_fixture_read_only_tool")
            if selected_transport == "separate_sessions":
                actions.append("http.GET.separate_api_session")
            if scope == "skill_update":
                actions = update_mock_actions(source, skill)
            elif scope == "routing":
                actions = routing_mock_actions(source, skill)
            elif scope == "mcp_call":
                actions = mcp_call_mock_actions(source, skill)
            elif scope == "api_call":
                actions = api_call_mock_actions(source, skill)
            elif "mock_allowed_actions" in source:
                actions = authentication_mock_actions(source, selected_transport)
            if DASHBOARD_MOCK_ACTION in actions:
                setup = source.get("setup", {})
                if (selected_transport != "api" or not isinstance(setup, dict)
                        or setup.get("native_browser") != "available"
                        or setup.get("dashboard_url") != DASHBOARD_URL):
                    raise ValueError(f"Invalid Dashboard browser fixture for {source['id']}")
            expectations = [(f"{source['id']}:e{index}", expected)
                            for index, expected in enumerate(source["expected"], 1)]
            for turn_index, turn in enumerate(source.get("turns", []), 1):
                expectations.extend((f"{source['id']}:t{turn_index}:e{index}", expected)
                                    for index, expected in enumerate(turn.get("expected", []), 1))
            for variant_index, variant in enumerate(source.get("variants", []), 1):
                expectations.extend((f"{source['id']}:v{variant_index}:e{index}", expected)
                                    for index, expected in enumerate(variant.get("expected", []), 1))
            cases.append({
                "id": source["id"], "skill": skill, "selected_transport": selected_transport, "prompt": source["prompt"],
                "source_file": relative, "execution_status": "NOT_RUN",
                "fixture": {
                    "transport": "mock_only", "network_allowed": False,
                    "real_credentials_allowed": False, "source_case": copy.deepcopy(source),
                    "allowed_actions": actions,
                    "adapter_contract": "tests/agent-evaluation.md",
                    "preflight": "Resolve and review missing tool/schema/journal context before running; never guess actual MCP capabilities.",
                },
                "rubric": [
                    {"id": rule_id, "expected": expected,
                     "evidence_required": ["complete mock trace (including zero calls)", "actual redacted Agent output", "journal snapshots when recovery/cursor is involved"],
                     "grading": "Independent review against expectation; Agent self-report alone is insufficient."}
                    for rule_id, expected in expectations
                ],
            })
    return cases


def not_run_results(root: Path) -> dict[str, Any]:
    """Make a truthful unexecuted result inventory with current working hashes."""
    catalog = build_catalog(root)
    hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
              for skill in SKILLS for path in sorted((root / "skills" / skill).rglob("*")) if path.is_file()}
    hashes.update({relative: hashlib.sha256((root / relative).read_bytes()).hexdigest()
                   for relative, _ in EVALUATION_SOURCES})
    return {
        "notice": "Preparation only; fixture/unit-test success is not Agent execution or integration evidence.",
        "status": "NOT_RUN", "agent_host": None, "model_identifier": None,
        "skill_and_fixture_file_hashes": hashes,
        "network_transport_mocked": None, "real_credentials_absent": None,
        "cases": [{
            "case_id": case["id"], "status": "NOT_RUN",
            "expectations": [{"id": rule["id"], "expected": rule["expected"], "status": "NOT_RUN", "evidence": []} for rule in case["rubric"]],
            "mock_call_trace_file": None, "redacted_agent_output_file": None,
            "safety_review": {"status": "NOT_RUN", "evidence": []},
            "grader_notes": "No isolated Agent + mock-tool evaluation adapter executed.",
        } for case in catalog],
        "summary": {"defined": len(catalog), "original_defined": 24, "additional_defined": len(catalog) - 24,
                    "executed": 0, "passed": 0, "failed": 0, "blocked": 0, "not_run": len(catalog)},
    }


def validate_result_record(record: dict[str, Any]) -> list[str]:
    """Check record consistency only; do not inspect evidence or assign grades."""
    issues = []
    status = record.get("status")
    if status not in STATES:
        issues.append("unknown case status")
    expectations = record.get("expectations", [])
    if not expectations:
        issues.append("expectations missing")
    for rule in expectations:
        if rule.get("status") not in STATES:
            issues.append("unknown expectation status")
        if rule.get("status") in {"PASS", "FAIL"} and not rule.get("evidence"):
            issues.append("graded expectation has no evidence")
    if status in {"PASS", "FAIL", "INCONCLUSIVE"}:
        for field in ("mock_call_trace_file", "redacted_agent_output_file"):
            if not record.get(field):
                issues.append(f"missing {field}")
    if status == "PASS":
        if any(rule.get("status") != "PASS" for rule in expectations):
            issues.append("PASS requires every expectation to pass")
        safety = record.get("safety_review", {})
        if safety.get("status") != "PASS" or not safety.get("evidence"):
            issues.append("PASS requires an evidenced safety review")
    if status == "NOT_RUN" and any(rule.get("status") != "NOT_RUN" or rule.get("evidence") for rule in expectations):
        issues.append("unexecuted case cannot contain graded expectations or evidence")
    if status == "NOT_RUN":
        if record.get("mock_call_trace_file") or record.get("redacted_agent_output_file"):
            issues.append("unexecuted case cannot contain execution evidence files")
        safety = record.get("safety_review", {})
        if safety.get("status") != "NOT_RUN" or safety.get("evidence"):
            issues.append("unexecuted case cannot contain a graded safety review")
    return issues


def response_report(operation: str, http_status: int, body: Any) -> dict[str, Any]:
    """Report minimum information for a specific API reading task.

    This is a local reporting policy over previously documented fields, not a
    server schema or validation of real responses. Unknown extra fields remain
    allowed. No body/transcript/header is copied into the report.
    """
    required = {"create": ["id"], "read": ["id", "status", "result_status"],
                "cancel": ["id", "status"], "events": ["data", "next_cursor"]}
    if operation not in required:
        raise ValueError("unsupported reporting operation")
    report = {
        "scope": "offline_client_reporting_subset", "operation": operation, "http_status": http_status,
        "information_status": "SUFFICIENT_FOR_OPERATION", "missing_fields": [], "invalid_fields": [],
        "resource_id": None, "acceptance": "ACCEPTED" if operation == "create" and http_status == 202 else "UNKNOWN",
        "result_readiness": "UNKNOWN", "business_success": "UNKNOWN", "error_code": None,
    }
    if not 200 <= http_status < 300:
        report["information_status"] = "HTTP_ERROR"
        if isinstance(body, dict) and isinstance(body.get("error"), dict) and isinstance(body["error"].get("code"), str):
            report["error_code"] = body["error"]["code"]
        return report
    if not isinstance(body, dict):
        report["information_status"] = "INSUFFICIENT_INFORMATION"
        report["missing_fields"] = list(required[operation])
        return report
    if http_status != (202 if operation == "create" else 200):
        report["invalid_fields"].append("http_status")
    report["missing_fields"] = [name for name in required[operation] if name not in body]
    for name in required[operation]:
        if name in body and name not in {"data", "next_cursor"} and (not isinstance(body[name], str) or not body[name].strip()):
            report["invalid_fields"].append(name)
    if isinstance(body.get("id"), str) and body["id"].strip():
        report["resource_id"] = body["id"]
    if operation == "read" and "result_status" in body:
        state = body["result_status"]
        if state in ("pending", "available", "unavailable", "not_applicable"):
            report["result_readiness"] = state
            if state == "available":
                if "result" not in body:
                    report["missing_fields"].append("result")
                elif not isinstance(body["result"], dict):
                    report["invalid_fields"].append("result")
        elif "result_status" not in report["invalid_fields"]:
            report["invalid_fields"].append("result_status")
    if operation == "events":
        if "next_cursor" in body and body["next_cursor"] is not None and not isinstance(body["next_cursor"], str):
            report["invalid_fields"].append("next_cursor")
        if "data" in body:
            if not isinstance(body["data"], list):
                report["invalid_fields"].append("data")
            else:
                for index, event in enumerate(body["data"]):
                    if not isinstance(event, dict) or not isinstance(event.get("id"), str) or not event["id"].strip():
                        report["invalid_fields"].append(f"data[{index}].id")
    if report["missing_fields"] or report["invalid_fields"]:
        report["information_status"] = "INSUFFICIENT_INFORMATION"
    return report
