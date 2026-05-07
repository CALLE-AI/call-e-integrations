import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = Path(__file__).resolve().parent
FAKE_SERVER = ROOT / "shared" / "fake-mcp-broker-server.mjs"


def start_fake_server(*, no_resources=False, unauthorized_mcp=False):
    env = os.environ.copy()
    if no_resources:
        env["FAKE_NO_RESOURCES"] = "1"
    if unauthorized_mcp:
        env["FAKE_UNAUTHORIZED_MCP"] = "1"
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
    finally:
        stop_fake_server(process)
