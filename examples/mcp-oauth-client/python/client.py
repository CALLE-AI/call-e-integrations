import asyncio
import json
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken


DEFAULT_SERVER_URL = "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
DEFAULT_REDIRECT_URI = "http://127.0.0.1:8090/callback"


class InMemoryTokenStorage(TokenStorage):
    def __init__(self) -> None:
        self._tokens: OAuthToken | None = None
        self._client_info: OAuthClientInformationFull | None = None

    async def get_tokens(self) -> OAuthToken | None:
        return self._tokens

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self._tokens = tokens

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        return self._client_info

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self._client_info = client_info


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


def parse_json_object(raw: str | None, label: str) -> dict[str, Any]:
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{label} must be a JSON object")
    return parsed


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


def read_config() -> dict[str, Any]:
    return {
        "server_url": os.environ.get("MCP_SERVER_URL", DEFAULT_SERVER_URL),
        "redirect_uri": os.environ.get("MCP_REDIRECT_URI", DEFAULT_REDIRECT_URI),
        "scope": os.environ.get("MCP_SCOPE", "openid email profile"),
        "tool_name": os.environ.get("MCP_TOOL_NAME"),
        "tool_args": parse_json_object(os.environ.get("MCP_TOOL_ARGS_JSON"), "MCP_TOOL_ARGS_JSON"),
        "auto_authorize": os.environ.get("MCP_OAUTH_AUTO_AUTHORIZE") == "1",
    }


async def complete_authorization_automatically(authorization_url: str) -> tuple[str, str | None]:
    async with httpx.AsyncClient(follow_redirects=False, timeout=10.0) as client:
        response = await client.get(authorization_url)
    location = response.headers.get("location")
    if not location:
        raise RuntimeError(f"Auto authorization expected a redirect, got HTTP {response.status_code}")
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    code = params.get("code", [None])[0]
    state = params.get("state", [None])[0]
    if not code:
        raise RuntimeError("Auto authorization redirect did not include a code")
    return code, state


async def wait_for_local_callback(redirect_uri: str, authorization_url: str) -> tuple[str, str | None]:
    parsed_redirect = urlparse(redirect_uri)
    if parsed_redirect.hostname not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("Only localhost redirect URIs can be handled by this example")

    result: dict[str, str | None] = {}
    event = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *_args: Any) -> None:
            return

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != parsed_redirect.path:
                self.send_response(404)
                self.end_headers()
                return
            params = parse_qs(parsed.query)
            result["code"] = params.get("code", [None])[0]
            result["state"] = params.get("state", [None])[0]
            self.send_response(200 if result["code"] else 400)
            self.end_headers()
            self.wfile.write(b"Authorization complete. You can return to the terminal.")
            event.set()

    port = parsed_redirect.port or 80
    server = HTTPServer((parsed_redirect.hostname or "127.0.0.1", port), Handler)
    emit("oauth_authorization_required", authorization_url=authorization_url)

    def handle_one() -> None:
        try:
            server.handle_request()
        finally:
            server.server_close()

    thread = threading.Thread(target=handle_one, daemon=True)
    thread.start()
    await asyncio.to_thread(event.wait)
    code = result.get("code")
    if not code:
        raise RuntimeError("OAuth callback did not include a code")
    return code, result.get("state")


async def run_client() -> None:
    config = read_config()
    latest_authorization_url: str | None = None

    async def redirect_handler(authorization_url: str) -> None:
        nonlocal latest_authorization_url
        latest_authorization_url = authorization_url

    async def callback_handler() -> tuple[str, str | None]:
        if not latest_authorization_url:
            raise RuntimeError("OAuth callback requested before authorization URL was produced")
        if config["auto_authorize"]:
            return await complete_authorization_automatically(latest_authorization_url)
        return await wait_for_local_callback(config["redirect_uri"], latest_authorization_url)

    metadata = OAuthClientMetadata(
        client_name="CALL-E OAuth MCP Python example",
        redirect_uris=[config["redirect_uri"]],
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
        token_endpoint_auth_method="none",
        scope=config["scope"],
    )
    oauth = OAuthClientProvider(
        server_url=config["server_url"],
        client_metadata=metadata,
        storage=InMemoryTokenStorage(),
        redirect_handler=redirect_handler,
        callback_handler=callback_handler,
        timeout=300,
    )

    async with httpx.AsyncClient(auth=oauth, timeout=30.0) as http_client:
        async with streamable_http_client(config["server_url"], http_client=http_client) as (read, write, get_session_id):
            async with ClientSession(read, write) as session:
                await session.initialize()
                emit("connected", server_url=config["server_url"], session_id=get_session_id())

                tools = await session.list_tools()
                emit("tools/list", count=len(tools.tools), tools=[tool.name for tool in tools.tools])

                if config["tool_name"]:
                    result = await session.call_tool(config["tool_name"], arguments=config["tool_args"])
                    emit("tools/call", tool_name=config["tool_name"], result=result.model_dump(mode="json"))

                try:
                    resources = await session.list_resources()
                except Exception as error:
                    emit("resources/list", skipped=True, message=str(error))
                    resources = None

                resource_items = resources.resources if resources else []
                emit("resources/list", count=len(resource_items))
                if resource_items:
                    first = resource_items[0]
                    result = await session.read_resource(first.uri)
                    emit("resources/read", uri=str(first.uri), result=summarize_resource_result(result.model_dump(mode="json")))
                else:
                    emit("resources/read", skipped=True, message="no resources available")


def main() -> int:
    try:
        asyncio.run(run_client())
        return 0
    except Exception as error:
        emit_error(ok=False, error_code="oauth_client_error", message=str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
