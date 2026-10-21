"""Pure policy for anonymous, bounded synthetic Skill metadata reads.

These helpers neither perform network requests nor generate random tokens. The
Agent supplies request-only nonces; fixtures supply every response explicitly.
"""
import copy
import re


SOURCE_URL = "https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/callev2/SKILL.md"
REQUEST_PATTERN = re.escape(SOURCE_URL) + r"\?callev2_update_check=[0-9a-f]{16}"


def metadata_state():
    return {"used_nonces": [], "attempts": 0, "last_response": None}


def start_explicit_check(state):
    """Called only for an explicit check declared by the trusted fixture turn."""
    state["attempts"] = 0
    state["last_response"] = None


def metadata_schema():
    return {"type": "object", "properties": {
        "url": {"type": "string", "pattern": "^" + REQUEST_PATTERN + "$"},
        "headers": {"type": "object", "maxProperties": 0},
        "follow_redirects": {"const": False}},
        "required": ["url", "headers", "follow_redirects"], "additionalProperties": False}


def retryable(response):
    if not isinstance(response, dict):
        return False
    if "transport_error" in response:
        return response["transport_error"] == "timeout"
    status = response.get("status")
    return type(status) is int and (status == 404 or 500 <= status <= 599)


def fetch_metadata(state, arguments, observations):
    """Validate one request and consume one synthetic response atomically."""
    url = arguments.get("url")
    if (set(arguments) != {"url", "headers", "follow_redirects"}
            or not isinstance(url, str) or re.fullmatch(REQUEST_PATTERN, url) is None
            or arguments.get("headers") != {} or arguments.get("follow_redirects") is not False):
        raise ValueError("Metadata reads require the official path, one 16-digit lowercase hex nonce, empty headers and no redirects")
    nonce = url.rsplit("=", 1)[1]
    if nonce in state["used_nonces"]:
        raise PermissionError("Every metadata request requires a fresh nonce")
    attempt = state["attempts"]
    if attempt >= 2 or (attempt and not retryable(state["last_response"])):
        raise PermissionError("Only one retry after 404, timeout or HTTP 5xx is authorized per check")
    if not isinstance(observations, list) or not observations:
        raise NotImplementedError("Missing metadata transport observation")
    response = observations[min(attempt, len(observations) - 1)]
    if not isinstance(response, dict):
        raise NotImplementedError("Invalid metadata transport observation")
    state["used_nonces"].append(nonce)
    state["attempts"] += 1
    state["last_response"] = copy.deepcopy(response)
    return copy.deepcopy(response)
