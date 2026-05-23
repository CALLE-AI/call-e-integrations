import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = Path(__file__).resolve().parent
FAKE_SERVER = ROOT / "shared" / "fake-mcp-broker-server.mjs"


def start_fake_server():
    process = subprocess.Popen(
        ["node", str(FAKE_SERVER)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
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


def read_state(state_url):
    with urlopen(state_url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def cache_dir(cache_root, server_url):
    digest = hashlib.md5(server_url.encode("utf-8")).hexdigest()
    return Path(cache_root) / digest


def token_cache_path(cache_root, server_url):
    return cache_dir(cache_root, server_url) / "token.json"


def write_token(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "token": {
                    "access_token": "fake-access-token",
                    "refresh_token": "fake-refresh-token",
                },
                "expires_at": "2030-01-01T00:00:00Z",
            },
            indent=2,
        )
        + "\n"
    )


def write_executable(path, content):
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def write_fake_calle(path, token_path, server_url):
    write_executable(
        path,
        f"""#!{sys.executable}
import json
import sys
from pathlib import Path

cache_path = Path({str(token_path)!r})
server_url = {server_url!r}

if sys.argv[1:3] == ["auth", "status"]:
    usable = cache_path.exists()
    print(json.dumps({{
        "server_url": server_url,
        "cache_path": str(cache_path),
        "pending_cache_path": str(cache_path.with_name("pending_login.json")),
        "cache_exists": usable,
        "pending_exists": False,
        "usable": usable,
        "expires_at": "2030-01-01T00:00:00Z" if usable else None,
        "pending_status": None,
        "pending_login_url": None,
    }}))
    raise SystemExit(0)

raise SystemExit(f"unexpected fake calle args: {{sys.argv[1:]}}")
""",
    )


def write_fake_npm(path, bin_dir, token_path, server_url):
    write_executable(
        path,
        f"""#!{sys.executable}
from pathlib import Path
import os

bin_dir = Path({str(bin_dir)!r})
calle = bin_dir / "calle"
calle.write_text('''#!{sys.executable}
import json
import sys
from pathlib import Path

cache_path = Path({str(token_path)!r})
server_url = {server_url!r}
if sys.argv[1:3] == ["auth", "status"]:
    print(json.dumps({{
        "server_url": server_url,
        "cache_path": str(cache_path),
        "pending_cache_path": str(cache_path.with_name("pending_login.json")),
        "cache_exists": cache_path.exists(),
        "pending_exists": False,
        "usable": cache_path.exists(),
        "expires_at": "2030-01-01T00:00:00Z" if cache_path.exists() else None,
        "pending_status": None,
        "pending_login_url": None,
    }}))
    raise SystemExit(0)
raise SystemExit(f"unexpected fake calle args: {{sys.argv[1:]}}")
''')
calle.chmod(calle.stat().st_mode | 0o100)
raise SystemExit(0)
""",
    )


def write_jsonl(path, records):
    path.write_text("\n".join(json.dumps(record, separators=(",", ":")) for record in records) + "\n", encoding="utf-8")


def run_client(args, env=None, stdin=""):
    return subprocess.run(
        [sys.executable, "client.py", *args],
        cwd=EXAMPLE,
        env={**os.environ, **(env or {}), "FORCE_COLOR": "0"},
        input=stdin,
        text=True,
        capture_output=True,
        timeout=20,
    )


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def assert_no_secrets(output):
    assert "fake-access-token" not in output
    assert "fake-refresh-token" not in output
    assert "fake-confirm-token" not in output


def test_dry_run_uses_cli_token_and_moves_metadata_to_mcp_meta():
    process, fake = start_fake_server()
    try:
        temp_dir = Path(tempfile.mkdtemp(prefix="calle-python-batch-runner-"))
        cache_root = temp_dir / "cache"
        token_path = token_cache_path(cache_root, fake["server_url"])
        write_token(token_path)
        fake_calle = temp_dir / "calle"
        write_fake_calle(fake_calle, token_path, fake["server_url"])
        input_path = temp_dir / "input.jsonl"
        results_dir = temp_dir / "results"
        output_path = results_dir / "call_e_results.jsonl"
        write_jsonl(
            input_path,
            [
                {
                    "to_phones": ["+15555550100"],
                    "region": "CN",
                    "language": "English",
                    "goal": "Plan a short market alert.",
                    "user_input": "Plan a short market alert.",
                    "scheduled_at": "2026-05-24T00:00:00Z",
                    "ttl_seconds": 86400,
                    "metadata": {"policy_id": "policy-1", "symbol": "eth"},
                    "extra_customer_field": "ignored",
                }
            ],
        )

        result = run_client(
            [
                "--input",
                str(input_path),
                "--results-dir",
                str(results_dir),
                "--dry-run",
                "--calle-command",
                str(fake_calle),
                "--cache-root",
                str(cache_root),
                "--base-url",
                fake["base_url"],
                "--server-url",
                fake["server_url"],
            ]
        )

        assert result.returncode == 0, result.stderr
        assert "CLI precheck passed" in result.stdout
        assert output_path.exists()
        assert_no_secrets(result.stdout + result.stderr + output_path.read_text())

        records = read_jsonl(output_path)
        assert records[0]["ok"] is True
        assert records[0]["mode"] == "dry_run"
        assert records[0]["ignored_fields"] == ["extra_customer_field", "scheduled_at", "ttl_seconds"]

        state = read_state(fake["state_url"])
        assert state["tool_calls"][0]["name"] == "plan_call"
        assert "metadata" not in state["tool_calls"][0]["arguments"]
        assert "scheduled_at" not in state["tool_calls"][0]["arguments"]
        assert "ttl_seconds" not in state["tool_calls"][0]["arguments"]
        assert state["tool_calls"][0]["request_meta"]["call-e/customerMetadata"] == {"policy_id": "policy-1", "symbol": "eth"}
    finally:
        stop_fake_server(process)


def test_execute_calls_run_call_for_ready_plan():
    process, fake = start_fake_server()
    try:
        temp_dir = Path(tempfile.mkdtemp(prefix="calle-python-batch-runner-"))
        cache_root = temp_dir / "cache"
        token_path = token_cache_path(cache_root, fake["server_url"])
        write_token(token_path)
        fake_calle = temp_dir / "calle"
        write_fake_calle(fake_calle, token_path, fake["server_url"])
        input_path = temp_dir / "input.jsonl"
        results_dir = temp_dir / "results"
        output_path = results_dir / "call_e_results.jsonl"
        status_output_path = results_dir / "call_e_status_events.jsonl"
        write_jsonl(
            input_path,
            [
                {
                    "to_phones": ["+15555550100"],
                    "region": "CN",
                    "language": "English",
                    "goal": "ready_to_run",
                    "user_input": "ready_to_run",
                }
            ],
        )

        result = run_client(
            [
                "--input",
                str(input_path),
                "--results-dir",
                str(results_dir),
                "--execute",
                "--poll-interval-seconds",
                "0.01",
                "--poll-timeout-seconds",
                "5",
                "--calle-command",
                str(fake_calle),
                "--cache-root",
                str(cache_root),
                "--base-url",
                fake["base_url"],
                "--server-url",
                fake["server_url"],
            ]
        )

        assert result.returncode == 0, result.stderr
        assert "plan_call" in result.stdout
        assert "run_call" in result.stdout
        assert "get_call_run" in result.stdout
        assert "final_status" in result.stdout
        assert "+15555550100" in result.stdout
        assert "ready_to_run" in result.stdout
        assert "Fake call completed successfully." in result.stdout
        assert "Hello from CALL-E." in result.stdout
        assert "BOT" in result.stdout
        assert "USER" in result.stdout
        records = read_jsonl(output_path)
        assert records[0]["ok"] is True
        assert records[0]["mode"] == "execute"
        assert records[0]["to_phones"] == ["+15555550100"]
        assert "run_result" in records[0]
        assert records[0]["run_id"] == "fake-run-1"
        assert records[0]["final_status"] == "COMPLETED"
        assert records[0]["poll_count"] == 2
        assert isinstance(records[0]["duration_seconds"], (int, float))
        assert records[0]["duration_seconds"] >= 0
        assert records[0]["server_duration_seconds"] == 12.34
        assert records[0]["post_summary"] == "Fake call completed successfully."
        assert records[0]["transcript"][0]["text"] == "Hello from CALL-E."
        assert records[0]["transcript"][0]["speaker"] == "BOT"
        assert records[0]["transcript"][0]["ts"] == "00:00:00"
        assert records[0]["transcript"][1]["text"] == "Received. Goodbye."
        assert records[0]["transcript"][1]["speaker"] == "USER"
        assert records[0]["activity"][-1]["message"] == "Fake call completed."
        assert "final_result" in records[0]
        assert records[0]["status_output"] == str(status_output_path)
        status_events = read_jsonl(status_output_path)
        assert [event["status"] for event in status_events] == ["IN_PROGRESS", "COMPLETED"]
        assert [event["terminal"] for event in status_events] == [False, True]
        assert [event["to_phones"] for event in status_events] == [["+15555550100"], ["+15555550100"]]
        assert all(isinstance(event["elapsed_seconds"], (int, float)) for event in status_events)
        assert status_events[-1]["activity"][-1]["message"] == "Fake call completed."
        assert_no_secrets(result.stdout + result.stderr + output_path.read_text())
        assert_no_secrets(status_output_path.read_text())

        state = read_state(fake["state_url"])
        assert [call["name"] for call in state["tool_calls"]] == ["plan_call", "run_call", "get_call_run", "get_call_run"]
        assert state["tool_calls"][1]["arguments"]["plan_id"] == "fake-plan-1"
        assert state["tool_calls"][1]["arguments"]["confirm_token"] == "fake-confirm-token"
        assert state["tool_calls"][2]["arguments"]["run_id"] == "fake-run-1"
    finally:
        stop_fake_server(process)


def test_missing_login_fails_fast_with_no_login_wait():
    process, fake = start_fake_server()
    try:
        temp_dir = Path(tempfile.mkdtemp(prefix="calle-python-batch-runner-"))
        cache_root = temp_dir / "cache"
        token_path = token_cache_path(cache_root, fake["server_url"])
        fake_calle = temp_dir / "calle"
        write_fake_calle(fake_calle, token_path, fake["server_url"])
        input_path = temp_dir / "input.jsonl"
        output_path = temp_dir / "results.jsonl"
        write_jsonl(input_path, [{"user_input": "Plan a short test call."}])

        result = run_client(
            [
                "--input",
                str(input_path),
                "--output",
                str(output_path),
                "--calle-command",
                str(fake_calle),
                "--cache-root",
                str(cache_root),
                "--base-url",
                fake["base_url"],
                "--server-url",
                fake["server_url"],
                "--no-login-wait",
            ]
        )

        assert result.returncode == 2
        assert "Auth required" in result.stderr
    finally:
        stop_fake_server(process)


def test_missing_cli_auto_installs_with_npm_precheck():
    process, fake = start_fake_server()
    try:
        temp_dir = Path(tempfile.mkdtemp(prefix="calle-python-batch-runner-"))
        bin_dir = temp_dir / "bin"
        bin_dir.mkdir()
        cache_root = temp_dir / "cache"
        token_path = token_cache_path(cache_root, fake["server_url"])
        write_token(token_path)
        write_fake_npm(bin_dir / "npm", bin_dir, token_path, fake["server_url"])
        input_path = temp_dir / "input.jsonl"
        output_path = temp_dir / "results.jsonl"
        write_jsonl(input_path, [{"user_input": "Plan a short test call."}])

        result = run_client(
            [
                "--input",
                str(input_path),
                "--output",
                str(output_path),
                "--cache-root",
                str(cache_root),
                "--base-url",
                fake["base_url"],
                "--server-url",
                fake["server_url"],
            ],
            env={"PATH": str(bin_dir)},
        )

        assert result.returncode == 0, result.stderr
        assert "CLI installed" in result.stdout
        assert (bin_dir / "calle").exists()
    finally:
        stop_fake_server(process)
