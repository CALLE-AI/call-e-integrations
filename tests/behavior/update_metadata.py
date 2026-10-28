"""Pure policy for anonymous, bounded synthetic Skill metadata reads.

These helpers neither perform network requests nor generate random tokens. The
Agent supplies request-only nonces; fixtures supply every response explicitly.
"""
import copy
import json
import re


SOURCE_URL = "https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/calle/SKILL.md"
REQUEST_PATTERN = re.escape(SOURCE_URL) + r"\?calle_update_check=[0-9a-f]{16}"


def metadata_state():
    return {"used_nonces": [], "attempts": 0, "last_response": None}


def start_explicit_check(state):
    """Called only for an explicit check declared by the trusted fixture turn."""
    state["attempts"] = 0
    state["last_response"] = None


def metadata_schema(reader=None):
    if reader == "native_public_reader":
        return {"type": "object", "properties": {
            "open": {"type": "array", "minItems": 1, "maxItems": 1,
                     "items": {"type": "object", "properties": {
                         "ref_id": {"type": "string", "pattern": "^" + REQUEST_PATTERN + "$"}},
                         "required": ["ref_id"], "additionalProperties": False}},
            "response_length": {"enum": ["short", "medium", "long"]}},
            "required": ["open"], "additionalProperties": False}
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


def request_url(arguments, reader):
    if reader == "native_public_reader":
        opens = arguments.get("open")
        if (set(arguments) - {"open", "response_length"}
                or not isinstance(opens, list) or len(opens) != 1
                or not isinstance(opens[0], dict) or set(opens[0]) != {"ref_id"}
                or arguments.get("response_length", "short") not in {"short", "medium", "long"}):
            raise ValueError("Native public reads accept one open/ref_id request and optional response_length only")
        url = opens[0]["ref_id"]
    else:
        if (set(arguments) != {"url", "headers", "follow_redirects"}
                or arguments.get("headers") != {} or arguments.get("follow_redirects") is not False):
            raise ValueError("Controlled HTTPS reads require empty headers and no redirects")
        url = arguments["url"]
    if not isinstance(url, str) or re.fullmatch(REQUEST_PATTERN, url) is None:
        raise ValueError("Metadata reads require the official path and one 16-digit lowercase hex nonce")
    return url


def native_reader_output(response, url):
    """Render synthetic public-reader text without claiming hidden controls.

    Source attribution is a fixture transport observation, never inferred from
    document content. Retry classification uses that same controller-only
    transport observation rather than searching the returned document text.
    """
    source = response.get("reader_source")
    if "transport_error" in response or response.get("status") != 200:
        status = response.get("status")
        labels = {302: "Found", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
                  429: "Too Many Requests", 500: "Internal Server Error", 503: "Service Unavailable"}
        error = (str(response["transport_error"]) if "transport_error" in response
                 else f"({status}) {labels.get(status, 'HTTP error')}")
        return ("Internal Error ()\n"
                f'【fixture_native_error】 Source: open({json.dumps({"ref_id": url})}); Total lines: 1\n'
                f"L0: Failed to fetch {url}: {error}")
    if isinstance(source, list):
        attribution = "Ambiguous source attribution: " + json.dumps(source)
    elif source is None:
        attribution = "Source attribution unavailable"
    elif isinstance(source, str) and (source == SOURCE_URL or re.fullmatch(REQUEST_PATTERN, source)):
        attribution = f'Source: open({json.dumps({"ref_id": source})})'
    else:
        attribution = "Returned source: " + str(source)
    lines = str(response.get("body", "")).splitlines()
    completeness = "" if response.get("complete") is True else "; Incomplete excerpt"
    header = f"【fixture_native_view】 Content type: text/plain; {attribution}; Total lines: {len(lines)}{completeness}"
    return header + "\n" + "\n".join(f"L{index}: {line}" for index, line in enumerate(lines))


def fetch_metadata(state, arguments, observations, reader=None):
    """Validate one request and consume one synthetic response atomically."""
    url = request_url(arguments, reader)
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
    if reader == "native_public_reader":
        return native_reader_output(response, url)
    return copy.deepcopy(response)
