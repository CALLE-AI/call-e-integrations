import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = Path(__file__).resolve().parent
FAKE_SERVER = ROOT / "shared" / "fake-mcp-broker-server.mjs"


def start_fake_server(*, no_resources=False, unauthorized_mcp=False, pending_first=False):
    env = os.environ.copy()
    if no_resources:
        env["FAKE_NO_RESOURCES"] = "1"
    if unauthorized_mcp:
        env["FAKE_UNAUTHORIZED_MCP"] = "1"
    if pending_first:
        env["FAKE_BROKER_PENDING_FIRST"] = "1"
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


def reset_state(reset_url):
    request = Request(reset_url, method="POST")
    with urlopen(request, timeout=5) as response:
        response.read()


def cache_dir(cache_root, server_url):
    digest = hashlib.md5(server_url.encode("utf-8")).hexdigest()
    return Path(cache_root) / digest


def write_cache(cache_root, server_url, name, payload):
    directory = cache_dir(cache_root, server_url)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(json.dumps(payload, indent=2) + "\n")


def write_token(cache_root, server_url, expires_at="2030-01-01T00:00:00Z", access_token="fake-access-token"):
    write_cache(
        cache_root,
        server_url,
        "token.json",
        {
            "token": {
                "access_token": access_token,
                "refresh_token": "fake-refresh-token",
            },
            "expires_at": expires_at,
        },
    )


def write_pending(cache_root, server_url, base_url):
    write_cache(
        cache_root,
        server_url,
        "pending_login.json",
        {
            "session_id": "fake-broker-session",
            "session_secret": "fake-session-secret",
            "login_url": f"{base_url}/openagent-auth/sessions/fake-broker-session/start",
            "status": "PENDING",
            "created_at": "2026-01-01T00:00:00Z",
            "expires_at": "2030-01-01T00:00:00Z",
            "poll_after_ms": 1,
        },
    )


def assert_no_secrets(output):
    assert "fake-access-token" not in output
    assert "fake-refresh-token" not in output
    assert "fake-session-secret" not in output
    assert "stale-access-token" not in output


def test_broker_client_login_tool_resource_and_cached_reuse():
    process, fake = start_fake_server(pending_first=True)
    try:
        cache_root = tempfile.mkdtemp(prefix="calle-broker-example-python-")
        log_file = Path(cache_root) / "client.log"
        env = {
            "MCP_BASE_URL": fake["base_url"],
            "MCP_SERVER_URL": fake["server_url"],
            "MCP_CACHE_ROOT": cache_root,
            "MCP_POLL_TIMEOUT_SECONDS": "5",
            "MCP_TOOL_NAME": "plan_call",
            "MCP_TOOL_ARGS_JSON": '{"user_input":"Plan a short test call. Do not start it."}',
            "MCP_LOG_FILE": str(log_file),
        }
        first = run_client(env)
        assert first.returncode == 0, first.stderr
        assert '"status":"login_required"' in first.stdout
        assert '"status":"logged_in"' in first.stdout
        assert '"event":"tools/call"' in first.stdout
        assert '"event":"resources/read"' in first.stdout
        assert_no_secrets(first.stdout + first.stderr)
        log = log_file.read_text()
        assert '"event":"tools/call"' in log
        assert '"timestamp":' in log
        assert_no_secrets(log)

        state = read_state(fake["state_url"])
        assert len(state["broker_creates"]) == 1
        assert state["broker_exchange_count"] == 1
        assert state["tool_calls"][0]["name"] == "plan_call"
        assert len(state["resource_reads"]) == 1
        assert all(request["has_bearer_token"] for request in state["mcp_requests"])

        reset_state(fake["reset_url"])
        second = run_client(env)
        assert second.returncode == 0, second.stderr
        assert '"status":"cached"' in second.stdout
        assert_no_secrets(second.stdout + second.stderr)
        state = read_state(fake["state_url"])
        assert state["broker_creates"] == []
        assert state["broker_exchange_count"] == 0
    finally:
        stop_fake_server(process)


def test_broker_client_resumes_pending_and_skips_no_resources():
    process, fake = start_fake_server(no_resources=True)
    try:
        cache_root = tempfile.mkdtemp(prefix="calle-broker-example-python-")
        write_pending(cache_root, fake["server_url"], fake["base_url"])
        result = run_client(
            {
                "MCP_BASE_URL": fake["base_url"],
                "MCP_SERVER_URL": fake["server_url"],
                "MCP_CACHE_ROOT": cache_root,
            }
        )
        assert result.returncode == 0, result.stderr
        assert '"status":"pending"' in result.stdout
        assert '"event":"resources/read","skipped":true' in result.stdout
        assert_no_secrets(result.stdout + result.stderr)
        state = read_state(fake["state_url"])
        assert state["broker_creates"] == []
        assert state["broker_exchange_count"] == 1
        assert state["resource_reads"] == []
    finally:
        stop_fake_server(process)


def test_broker_client_expired_cache_and_remote_401():
    process, fake = start_fake_server()
    try:
        cache_root = tempfile.mkdtemp(prefix="calle-broker-example-python-")
        write_token(cache_root, fake["server_url"], "2000-01-01T00:00:00Z")
        expired = run_client(
            {
                "MCP_BASE_URL": fake["base_url"],
                "MCP_SERVER_URL": fake["server_url"],
                "MCP_CACHE_ROOT": cache_root,
            }
        )
        assert expired.returncode == 0, expired.stderr
        assert '"status":"expired"' in expired.stdout
        assert '"status":"logged_in"' in expired.stdout
        assert_no_secrets(expired.stdout + expired.stderr)
    finally:
        stop_fake_server(process)

    unauthorized_process, unauthorized_fake = start_fake_server(unauthorized_mcp=True)
    try:
        cache_root = tempfile.mkdtemp(prefix="calle-broker-example-python-")
        write_token(cache_root, unauthorized_fake["server_url"])
        unauthorized = run_client(
            {
                "MCP_BASE_URL": unauthorized_fake["base_url"],
                "MCP_SERVER_URL": unauthorized_fake["server_url"],
                "MCP_CACHE_ROOT": cache_root,
            }
        )
        assert unauthorized.returncode != 0
        assert '"error_code":"auth_required"' in unauthorized.stderr
        assert_no_secrets(unauthorized.stdout + unauthorized.stderr)
    finally:
        stop_fake_server(unauthorized_process)


def test_broker_client_clears_stale_cached_token_rejected_by_mcp_server():
    process, fake = start_fake_server()
    try:
        cache_root = tempfile.mkdtemp(prefix="calle-broker-example-python-")
        write_token(cache_root, fake["server_url"], "2030-01-01T00:00:00Z", "stale-access-token")
        result = run_client(
            {
                "MCP_BASE_URL": fake["base_url"],
                "MCP_SERVER_URL": fake["server_url"],
                "MCP_CACHE_ROOT": cache_root,
            }
        )

        assert result.returncode == 0, result.stderr
        assert '"status":"cached"' in result.stdout
        assert '"status":"stale_remote_token"' in result.stdout
        assert '"status":"login_required"' in result.stdout
        assert '"status":"logged_in"' in result.stdout
        assert_no_secrets(result.stdout + result.stderr)

        state = read_state(fake["state_url"])
        assert len(state["broker_creates"]) == 1
        assert state["broker_exchange_count"] == 1
        assert any(not request["has_bearer_token"] for request in state["mcp_requests"])
        assert any(request["has_bearer_token"] for request in state["mcp_requests"])
    finally:
        stop_fake_server(process)
