import asyncio
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com"
DEFAULT_CHANNEL = "openagent_oauth"
DEFAULT_SCOPE = "openid email profile"
DEFAULT_CLIENT_NAME = "calle Login"
MCP_PROTOCOL_VERSION = "2025-11-25"


class McpHttpError(Exception):
    def __init__(self, message: str, status_code: int | None = None, code: str = "mcp_error") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def emit(event: str, **payload: Any) -> None:
    line = json.dumps({"event": event, **payload, "timestamp": datetime.now(timezone.utc).isoformat()}, separators=(",", ":"))
    print(line)
    write_log_line(line)


def emit_error(**payload: Any) -> None:
    line = json.dumps({**payload, "timestamp": datetime.now(timezone.utc).isoformat()}, separators=(",", ":"))
    print(line, file=os.sys.stderr)
    write_log_line(line)


def write_log_line(line: str) -> None:
    log_file = os.environ.get("MCP_LOG_FILE")
    if not log_file:
        return
    path = Path(log_file).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def normalize_base_url(value: str) -> str:
    return value.rstrip("/")


def resolve_server_url(base_url: str, channel: str, server_url: str | None) -> str:
    if server_url:
        return server_url
    return f"{normalize_base_url(base_url)}/mcp/{channel.strip().lower() or DEFAULT_CHANNEL}"


def expand_home(value: str) -> str:
    return str(Path(value).expanduser())


def parse_positive_number(raw: str | None, default: float) -> float:
    if not raw:
        return default
    value = float(raw)
    if value <= 0:
        raise ValueError(f"Expected a positive number, got: {raw}")
    return value


def parse_json_object(raw: str | None, label: str) -> dict[str, Any]:
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{label} must be a JSON object")
    return parsed


def read_config() -> dict[str, Any]:
    base_url = os.environ.get("MCP_BASE_URL", DEFAULT_BASE_URL)
    channel = os.environ.get("MCP_CHANNEL", DEFAULT_CHANNEL)
    server_url = resolve_server_url(base_url, channel, os.environ.get("MCP_SERVER_URL"))
    return {
        "base_url": base_url,
        "server_url": server_url,
        "broker_base_url": normalize_base_url(os.environ.get("MCP_BROKER_BASE_URL", base_url)),
        "auth_base_url": normalize_base_url(os.environ.get("MCP_AUTH_BASE_URL", base_url)),
        "channel": channel,
        "scope": os.environ.get("MCP_SCOPE", DEFAULT_SCOPE),
        "client_name": os.environ.get("MCP_CLIENT_NAME", DEFAULT_CLIENT_NAME),
        "cache_root": Path(expand_home(os.environ.get("MCP_CACHE_ROOT", "~/.calle-mcp/examples/broker"))),
        "timeout_seconds": parse_positive_number(os.environ.get("MCP_TIMEOUT_SECONDS"), 15),
        "min_ttl_seconds": parse_positive_number(os.environ.get("MCP_MIN_TTL_SECONDS"), 300),
        "poll_timeout_seconds": parse_positive_number(os.environ.get("MCP_POLL_TIMEOUT_SECONDS"), 300),
        "integration_header": os.environ.get("CALLE_EXAMPLE_INTEGRATION", "examples/mcp-broker-client-python/0.0.0"),
        "tool_name": os.environ.get("MCP_TOOL_NAME"),
        "tool_args": parse_json_object(os.environ.get("MCP_TOOL_ARGS_JSON"), "MCP_TOOL_ARGS_JSON"),
    }


def server_hash(server_url: str) -> str:
    return hashlib.md5(server_url.encode("utf-8")).hexdigest()


def cache_dir(config: dict[str, Any]) -> Path:
    return config["cache_root"] / server_hash(config["server_url"])


def token_cache_path(config: dict[str, Any]) -> Path:
    return cache_dir(config) / "token.json"


def pending_cache_path(config: dict[str, Any]) -> Path:
    return cache_dir(config) / "pending_login.json"


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return None
    except Exception:
        return None


def write_private_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps(payload, indent=2) + "\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def remove_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def parse_iso_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def token_is_usable(document: dict[str, Any] | None, min_ttl_seconds: float) -> bool:
    if not document:
        return False
    token = document.get("token")
    if not isinstance(token, dict) or not isinstance(token.get("access_token"), str) or not token["access_token"]:
        return False
    expires_at = parse_iso_date(document.get("expires_at"))
    if expires_at is None:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return (expires_at - datetime.now(timezone.utc)).total_seconds() > min_ttl_seconds


def pending_is_valid(document: dict[str, Any] | None) -> bool:
    if not document:
        return False
    for field in ("session_id", "session_secret", "login_url", "status", "created_at"):
        if not isinstance(document.get(field), str) or not document[field]:
            return False
    expires_at = parse_iso_date(document.get("expires_at"))
    if expires_at is None:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) < expires_at


async def create_broker_session(client: httpx.AsyncClient, config: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(
        f"{config['broker_base_url']}/api/v1/openagent-auth/sessions",
        headers={"X-Call-E-Integration": config["integration_header"]},
        json={
            "server_url": config["server_url"],
            "auth_base_url": config["auth_base_url"],
            "channel": config["channel"],
            "scope": config["scope"],
            "client_name": config["client_name"],
        },
    )
    response.raise_for_status()
    payload = response.json()
    return {
        "session_id": str(payload["session_id"]),
        "session_secret": str(payload["session_secret"]),
        "login_url": str(payload["login_url"]),
        "status": str(payload.get("status", "PENDING")).upper(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": payload.get("expires_at"),
        "error_message": None,
        "poll_after_ms": int(payload.get("poll_after_ms") or 0) or None,
    }


async def get_broker_status(client: httpx.AsyncClient, config: dict[str, Any], pending: dict[str, Any]) -> dict[str, Any]:
    response = await client.get(
        f"{config['broker_base_url']}/api/v1/openagent-auth/sessions/{pending['session_id']}",
        headers={
            "X-OpenAgent-Session-Secret": pending["session_secret"],
            "X-Call-E-Integration": config["integration_header"],
        },
    )
    response.raise_for_status()
    return response.json()


async def exchange_broker_session(client: httpx.AsyncClient, config: dict[str, Any], pending: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(
        f"{config['broker_base_url']}/api/v1/openagent-auth/sessions/{pending['session_id']}/exchange",
        headers={
            "X-OpenAgent-Session-Secret": pending["session_secret"],
            "X-Call-E-Integration": config["integration_header"],
        },
    )
    response.raise_for_status()
    return response.json()


async def ensure_broker_token(config: dict[str, Any]) -> dict[str, Any]:
    token_path = token_cache_path(config)
    pending_path = pending_cache_path(config)
    cached = read_json(token_path)
    if token_is_usable(cached, config["min_ttl_seconds"]):
        emit("auth_status", status="cached", server_url=config["server_url"], expires_at=cached.get("expires_at"))
        return cached

    if cached:
        emit("auth_status", status="expired", server_url=config["server_url"], expires_at=cached.get("expires_at"))

    timeout = httpx.Timeout(config["timeout_seconds"])
    async with httpx.AsyncClient(timeout=timeout) as client:
        pending = read_json(pending_path)
        if not pending_is_valid(pending):
            if pending:
                remove_file(pending_path)
            pending = await create_broker_session(client, config)
            write_private_json(pending_path, pending)
            emit("auth_status", status="login_required", pending_status=pending["status"], login_url=pending["login_url"], pending_created=True)
        else:
            emit("auth_status", status="pending", pending_status=pending["status"], login_url=pending["login_url"])

        deadline = asyncio.get_running_loop().time() + config["poll_timeout_seconds"]
        while asyncio.get_running_loop().time() < deadline:
            status_payload = await get_broker_status(client, config, pending)
            pending = {
                **pending,
                "status": str(status_payload.get("status", pending.get("status", "PENDING"))).upper(),
                "expires_at": status_payload.get("expires_at", pending.get("expires_at")),
                "error_message": status_payload.get("error_message"),
                "poll_after_ms": int(status_payload.get("poll_after_ms") or pending.get("poll_after_ms") or 1),
            }
            write_private_json(pending_path, pending)
            emit("auth_poll", pending_status=pending["status"])

            if pending["status"] == "AUTHORIZED":
                exchanged = await exchange_broker_session(client, config, pending)
                write_private_json(token_path, exchanged)
                remove_file(pending_path)
                emit("auth_status", status="logged_in", server_url=config["server_url"], expires_at=exchanged.get("expires_at"))
                return exchanged

            if pending["status"] in {"FAILED", "EXPIRED", "EXCHANGED"}:
                remove_file(pending_path)
                raise RuntimeError(f"Brokered login failed: {pending.get('error_message') or pending['status']}")

            await asyncio.sleep(max(0.001, min(float(pending.get("poll_after_ms") or 1000) / 1000, 10)))

    raise RuntimeError("Timed out waiting for brokered login authorization")


def access_token(document: dict[str, Any]) -> str:
    token = document.get("token")
    if not isinstance(token, dict) or not isinstance(token.get("access_token"), str):
        raise RuntimeError("Token cache does not contain an access token")
    return token["access_token"]


def summarize_resource_result(result: dict[str, Any]) -> dict[str, Any]:
    contents = result.get("contents") if isinstance(result.get("contents"), list) else []
    summarized = []
    for content in contents:
        if not isinstance(content, dict):
            summarized.append({"type": type(content).__name__})
            continue
        text = content.get("text") if isinstance(content.get("text"), str) else ""
        summarized.append(
            {
                "uri": content.get("uri"),
                "mime_type": content.get("mimeType") or content.get("mime_type"),
                "text_bytes": len(text.encode("utf-8")),
            }
        )
    return {"content_count": len(contents), "contents": summarized}


def clear_broker_state(config: dict[str, Any]) -> None:
    remove_file(token_cache_path(config))
    remove_file(pending_cache_path(config))


async def request_json_rpc(client: httpx.AsyncClient, config: dict[str, Any], headers: dict[str, str], payload: dict[str, Any]) -> tuple[dict[str, Any], httpx.Headers]:
    response = await client.post(config["server_url"], headers=headers, json=payload)
    body = response.json() if response.content else {}
    if response.status_code >= 400:
        code = "auth_required" if response.status_code in {401, 403} else "mcp_http_error"
        raise McpHttpError(f"MCP HTTP {response.status_code} for {payload.get('method')}", response.status_code, code)
    if isinstance(body, dict) and body.get("error"):
        raise McpHttpError(body["error"].get("message", f"MCP error for {payload.get('method')}"))
    return body, response.headers


async def open_mcp_session(client: httpx.AsyncClient, config: dict[str, Any], token: str) -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        "Authorization": f"Bearer {token}",
        "X-Call-E-Integration": config["integration_header"],
    }
    initialize, response_headers = await request_json_rpc(
        client,
        config,
        headers,
        {
            "jsonrpc": "2.0",
            "id": "broker-python-initialize",
            "method": "initialize",
            "params": {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "calle-broker-example-python",
                    "version": "0.0.0",
                },
            },
        },
    )
    _ = initialize
    session_id = response_headers.get("mcp-session-id")
    if session_id:
        headers["mcp-session-id"] = session_id
    await request_json_rpc(
        client,
        config,
        headers,
        {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {},
        },
    )
    return headers


async def mcp_request(client: httpx.AsyncClient, config: dict[str, Any], headers: dict[str, str], method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    body, _headers = await request_json_rpc(
        client,
        config,
        headers,
        {
            "jsonrpc": "2.0",
            "id": f"broker-python-{method}",
            "method": method,
            "params": params or {},
        },
    )
    return body.get("result", {})


async def run_mcp_flow(config: dict[str, Any], token_document: dict[str, Any]) -> None:
    token = access_token(token_document)

    async with httpx.AsyncClient(timeout=httpx.Timeout(config["timeout_seconds"])) as client:
        headers = await open_mcp_session(client, config, token)
        emit("connected", server_url=config["server_url"])

        tools = await mcp_request(client, config, headers, "tools/list")
        tool_items = tools.get("tools") if isinstance(tools.get("tools"), list) else []
        emit("tools/list", count=len(tool_items), tools=[tool.get("name") for tool in tool_items if isinstance(tool, dict)])

        if config["tool_name"]:
            result = await mcp_request(
                client,
                config,
                headers,
                "tools/call",
                {
                    "name": config["tool_name"],
                    "arguments": config["tool_args"],
                },
            )
            emit("tools/call", tool_name=config["tool_name"], result=result)

        try:
            resources = await mcp_request(client, config, headers, "resources/list")
        except Exception as error:
            emit("resources/list", skipped=True, message=str(error))
            resources = {"resources": []}
        resource_items = resources.get("resources") if isinstance(resources.get("resources"), list) else []
        emit("resources/list", count=len(resource_items))

        if resource_items and isinstance(resource_items[0], dict) and resource_items[0].get("uri"):
            uri = str(resource_items[0]["uri"])
            result = await mcp_request(client, config, headers, "resources/read", {"uri": uri})
            emit("resources/read", uri=uri, result=summarize_resource_result(result))
        else:
            emit("resources/read", skipped=True, message="no resources available")


async def run_client() -> None:
    config = read_config()
    token_document = await ensure_broker_token(config)
    for attempt in range(2):
        try:
            await run_mcp_flow(config, token_document)
            return
        except McpHttpError as error:
            if attempt == 0 and error.code == "auth_required":
                clear_broker_state(config)
                emit(
                    "auth_status",
                    status="stale_remote_token",
                    server_url=config["server_url"],
                    message="Cached token was rejected by MCP server; cleared local cache and restarting broker login.",
                )
                token_document = await ensure_broker_token(config)
                continue
            raise


def main() -> int:
    try:
        asyncio.run(run_client())
        return 0
    except Exception as error:
        code = error.code if isinstance(error, McpHttpError) else "broker_client_error"
        emit_error(ok=False, error_code=code, message=str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
