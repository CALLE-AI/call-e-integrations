import json
import os
import queue
import socket
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from urllib.request import urlopen

import pytest


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = Path(__file__).resolve().parent
FAKE_SERVER = ROOT / "shared" / "fake-mcp-broker-server.mjs"


def start_fake_server(*, no_resources=False, unauthorized_mcp=False, oauth_issuer=None):
    env = os.environ.copy()
    if no_resources:
        env["FAKE_NO_RESOURCES"] = "1"
    if unauthorized_mcp:
        env["FAKE_UNAUTHORIZED_MCP"] = "1"
    if oauth_issuer:
        env["FAKE_OAUTH_ISSUER"] = oauth_issuer
    process = subprocess.Popen(
        ["node", str(FAKE_SERVER)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )
    assert process.stdout is not None
    line = process.stdout.readline()
    payload = json.loads(line)
    return process, payload


def stop_fake_server(process):
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def run_client(env):
    return subprocess.run(
        [sys.executable, "client.py"],
        cwd=EXAMPLE,
        env={**os.environ, **env, "FORCE_COLOR": "0"},
        text=True,
        capture_output=True,
        timeout=20,
    )


def run_client_with_callback(env):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        redirect_uri = f"http://127.0.0.1:{listener.getsockname()[1]}/callback"
    process = subprocess.Popen(
        [sys.executable, "client.py"],
        cwd=EXAMPLE,
        env={**os.environ, **env, "MCP_REDIRECT_URI": redirect_uri,
             "MCP_OAUTH_AUTO_AUTHORIZE": "0", "PYTHONUNBUFFERED": "1", "FORCE_COLOR": "0"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    authorization = queue.Queue()
    lines = []

    def read_authorization():
        for line in process.stdout:
            lines.append(line)
            event = json.loads(line)
            if event.get("event") == "oauth_authorization_required":
                authorization.put(event["authorization_url"])
                return
        authorization.put(None)

    threading.Thread(target=read_authorization, daemon=True).start()
    try:
        authorization_url = authorization.get(timeout=20)
        assert authorization_url is not None, process.stderr.read()
        with urlopen(authorization_url, timeout=5) as response:
            assert response.status == 200
            assert "Authorization complete" in response.read().decode()
        stdout, stderr = process.communicate(timeout=20)
        return subprocess.CompletedProcess(process.args, process.returncode, "".join(lines) + stdout, stderr)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def read_state(state_url):
    with urlopen(state_url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def assert_no_secrets(output):
    assert "fake-access-token" not in output
    assert "fake-refresh-token" not in output
    assert "fake-session-secret" not in output


def test_oauth_client_completes_auth_and_mcp_calls():
    process, fake = start_fake_server()
    try:
        log_file = Path(tempfile.mkdtemp(prefix="calle-oauth-example-python-")) / "client.log"
        result = run_client(
            {
                "MCP_SERVER_URL": fake["server_url"],
                "MCP_REDIRECT_URI": "http://127.0.0.1:8090/callback",
                "MCP_OAUTH_AUTO_AUTHORIZE": "1",
                "MCP_TOOL_NAME": "plan_call",
                "MCP_TOOL_ARGS_JSON": '{"user_input":"Plan a short test call. Do not start it."}',
                "MCP_LOG_FILE": str(log_file),
            }
        )
        assert result.returncode == 0, result.stderr
        connected = next(json.loads(line) for line in result.stdout.splitlines() if '"event":"connected"' in line)
        assert connected["session_id"] == "fake-mcp-session"
        assert '"event":"tools/list"' in result.stdout
        assert '"event":"tools/call"' in result.stdout
        assert '"event":"resources/read"' in result.stdout
        assert_no_secrets(result.stdout + result.stderr)
        log = log_file.read_text()
        assert '"event":"tools/call"' in log
        assert '"timestamp":' in log
        assert_no_secrets(log)

        state = read_state(fake["state_url"])
        assert len(state["oauth_registers"]) == 1
        assert len(state["oauth_tokens"]) == 1
        assert [request["method"] for request in state["mcp_requests"]] == [
            "initialize",
            "initialize",
            "notifications/initialized",
            "tools/list",
            "tools/call",
            "resources/list",
            "resources/read",
        ]
        assert all(request["has_bearer_token"] for request in state["mcp_requests"][1:])
        assert state["tool_calls"][0]["name"] == "plan_call"
    finally:
        stop_fake_server(process)


def test_oauth_client_skips_missing_resources():
    process, fake = start_fake_server(no_resources=True)
    try:
        result = run_client(
            {
                "MCP_SERVER_URL": fake["server_url"],
                "MCP_REDIRECT_URI": "http://127.0.0.1:8090/callback",
                "MCP_OAUTH_AUTO_AUTHORIZE": "1",
            }
        )
        assert result.returncode == 0, result.stderr
        assert '"event":"resources/read","skipped":true' in result.stdout
        assert_no_secrets(result.stdout + result.stderr)
        state = read_state(fake["state_url"])
        assert state["resource_reads"] == []
    finally:
        stop_fake_server(process)


def test_oauth_client_reports_repeated_401_without_leaking_tokens():
    process, fake = start_fake_server(unauthorized_mcp=True)
    try:
        result = run_client(
            {
                "MCP_SERVER_URL": fake["server_url"],
                "MCP_REDIRECT_URI": "http://127.0.0.1:8090/callback",
                "MCP_OAUTH_AUTO_AUTHORIZE": "1",
            }
        )
        assert result.returncode != 0
        assert "oauth_client_error" in result.stderr
        assert_no_secrets(result.stdout + result.stderr)
        state = read_state(fake["state_url"])
        assert len(state["oauth_registers"]) == 1
        assert len(state["oauth_authorizes"]) >= 1
        assert len(state["oauth_tokens"]) >= 1
        assert not state["mcp_requests"][0]["has_bearer_token"]
        assert any(request["has_bearer_token"] for request in state["mcp_requests"][1:])
        assert state["tool_calls"] == []
    finally:
        stop_fake_server(process)


@pytest.mark.parametrize("auto_authorize", [True, False])
@pytest.mark.parametrize("issuer", ["valid", "mismatch"])
def test_oauth_client_validates_callback_issuer(auto_authorize, issuer):
    process, fake = start_fake_server(oauth_issuer=issuer)
    try:
        env = {
            "MCP_SERVER_URL": fake["server_url"],
            "MCP_REDIRECT_URI": "http://127.0.0.1:8090/callback",
            "MCP_OAUTH_AUTO_AUTHORIZE": "1",
        }
        result = run_client(env) if auto_authorize else run_client_with_callback(env)
        state = read_state(fake["state_url"])
        assert len(state["oauth_registers"]) == 1
        assert len(state["oauth_authorizes"]) == 1
        assert_no_secrets(result.stdout + result.stderr)
        if issuer == "valid":
            assert result.returncode == 0, result.stderr
            connected = next(json.loads(line) for line in result.stdout.splitlines() if '"event":"connected"' in line)
            assert connected["session_id"] == "fake-mcp-session"
            assert len(state["oauth_tokens"]) == 1
            assert '"event":"tools/list"' in result.stdout
            assert '"event":"resources/read"' in result.stdout
        else:
            assert result.returncode != 0
            assert "oauth_client_error" in result.stderr
            assert state["oauth_tokens"] == []
            assert not any(request["has_bearer_token"] for request in state["mcp_requests"])
    finally:
        stop_fake_server(process)
