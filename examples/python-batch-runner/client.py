import argparse
import asyncio
import hashlib
import json
import re
import shlex
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from rich.console import Console
from rich.markup import escape
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table


DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com"
DEFAULT_CHANNEL = "openagent_oauth"
DEFAULT_CACHE_ROOT = "~/.calle-mcp/cli"
DEFAULT_RESULTS_DIR = "results"
DEFAULT_OUTPUT_NAME = "call_e_results.jsonl"
DEFAULT_STATUS_OUTPUT_NAME = "call_e_status_events.jsonl"
DEFAULT_CLI_PACKAGE = "@call-e/cli"
INTEGRATION_HEADER = "examples/python-batch-runner/0.0.0"
TERMINAL_STATUSES = {
    "BUSY",
    "CANCELED",
    "CANCELLED",
    "COMPLETED",
    "DECLINED",
    "EXPIRED",
    "FAILED",
    "NO_ANSWER",
    "VOICEMAIL",
}
PLAN_CALL_FIELDS = {
    "to_phones",
    "region",
    "language",
    "goal",
    "user_input",
}
SECRET_KEYS = {
    "access_token",
    "refresh_token",
    "confirm_token",
    "session_secret",
}


class AuthRequiredError(Exception):
    pass


class CliUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class Config:
    input_path: Path
    results_dir: Path
    output_path: Path
    status_output_path: Path
    mode: str
    base_url: str
    channel: str
    server_url: str
    cache_root: str
    calle_command: list[str]
    npm_command: str
    cli_package: str
    auto_install_cli: bool
    login_wait: bool
    timeout_seconds: float
    min_ttl_seconds: float
    poll_interval_seconds: float
    poll_timeout_seconds: float


@dataclass(frozen=True)
class BatchItem:
    line_number: int
    raw: dict[str, Any]
    arguments: dict[str, Any]
    meta: dict[str, Any]
    ignored_fields: list[str]


@dataclass(frozen=True)
class PollOutcome:
    final_result: dict[str, Any]
    final_status: str | None
    poll_count: int
    ended_at: datetime
    duration_seconds: float
    server_duration_seconds: float | None
    post_summary: str | None
    transcript: list[dict[str, Any]]
    activity: list[dict[str, Any]]


def normalize_base_url(value: str) -> str:
    return value.rstrip("/")


def resolve_server_url(base_url: str, channel: str, server_url: str | None) -> str:
    if server_url:
        return server_url
    return f"{normalize_base_url(base_url)}/mcp/{channel.strip().lower() or DEFAULT_CHANNEL}"


def expand_home(value: str) -> str:
    return str(Path(value).expanduser())


def parse_positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("expected a positive number")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run CALL-E MCP calls from a JSONL batch file.")
    parser.add_argument("--input", required=True, type=Path, help="Path to the input JSONL file.")
    parser.add_argument("--results-dir", type=Path, default=Path(DEFAULT_RESULTS_DIR), help=f"Directory for default JSONL outputs. Default: {DEFAULT_RESULTS_DIR}.")
    parser.add_argument("--output", type=Path, help=f"Path to write per-input result JSONL. Default: {DEFAULT_RESULTS_DIR}/{DEFAULT_OUTPUT_NAME}.")
    parser.add_argument("--status-output", type=Path, help=f"Path to write get_call_run status JSONL. Default: {DEFAULT_RESULTS_DIR}/{DEFAULT_STATUS_OUTPUT_NAME}.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Call plan_call only. This is the default.")
    mode.add_argument("--execute", action="store_true", help="Call plan_call and then run_call for ready plans.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"CALL-E base URL. Default: {DEFAULT_BASE_URL}.")
    parser.add_argument("--channel", default=DEFAULT_CHANNEL, help=f"MCP channel. Default: {DEFAULT_CHANNEL}.")
    parser.add_argument("--server-url", help="Full MCP server URL. Overrides --base-url and --channel.")
    parser.add_argument("--cache-root", default=DEFAULT_CACHE_ROOT, help=f"calle CLI cache root. Default: {DEFAULT_CACHE_ROOT}.")
    parser.add_argument("--calle-command", default="calle", help="calle CLI command or path. Default: calle.")
    parser.add_argument("--npm-command", default="npm", help="npm command used for automatic CLI installation. Default: npm.")
    parser.add_argument("--cli-package", default=DEFAULT_CLI_PACKAGE, help=f"CLI package to install when calle is missing. Default: {DEFAULT_CLI_PACKAGE}.")
    parser.add_argument("--no-auto-install-cli", action="store_true", help="Fail if calle is missing instead of installing it.")
    parser.add_argument("--no-login-wait", action="store_true", help="Fail if calle is not logged in instead of pausing for login.")
    parser.add_argument("--timeout-seconds", type=parse_positive_float, default=30.0, help="HTTP timeout for MCP calls.")
    parser.add_argument("--min-token-ttl-seconds", type=parse_positive_float, default=300.0, help="Minimum acceptable cached token TTL.")
    parser.add_argument("--poll-interval-seconds", type=parse_positive_float, default=10.0, help="Seconds between get_call_run polls. Default: 10.")
    parser.add_argument("--poll-timeout-seconds", type=parse_positive_float, default=900.0, help="Maximum seconds to wait for a terminal call status. Default: 900.")
    return parser


def read_config(argv: list[str] | None = None) -> Config:
    args = build_parser().parse_args(argv)
    mode = "execute" if args.execute else "dry_run"
    results_dir = args.results_dir.expanduser()
    return Config(
        input_path=args.input.expanduser(),
        results_dir=results_dir,
        output_path=(args.output.expanduser() if args.output else results_dir / DEFAULT_OUTPUT_NAME),
        status_output_path=(args.status_output.expanduser() if args.status_output else results_dir / DEFAULT_STATUS_OUTPUT_NAME),
        mode=mode,
        base_url=args.base_url,
        channel=args.channel,
        server_url=resolve_server_url(args.base_url, args.channel, args.server_url),
        cache_root=args.cache_root,
        calle_command=shlex.split(args.calle_command),
        npm_command=args.npm_command,
        cli_package=args.cli_package,
        auto_install_cli=not args.no_auto_install_cli,
        login_wait=not args.no_login_wait,
        timeout_seconds=args.timeout_seconds,
        min_ttl_seconds=args.min_token_ttl_seconds,
        poll_interval_seconds=args.poll_interval_seconds,
        poll_timeout_seconds=args.poll_timeout_seconds,
    )


def run_command(command: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=False,
        text=True,
        capture_output=capture,
    )


def executable_exists(command: list[str]) -> bool:
    if not command:
        return False
    executable = command[0]
    if Path(executable).expanduser().exists():
        return True
    return shutil.which(executable) is not None


def install_calle_cli(config: Config, console: Console) -> None:
    npm_path = shutil.which(config.npm_command)
    if not npm_path:
        raise CliUnavailableError(
            f"`{config.calle_command[0]}` is not installed and `{config.npm_command}` was not found. "
            f"Install Node.js/npm or run `npm install -g {config.cli_package}` manually."
        )

    command = [npm_path, "install", "-g", config.cli_package]
    console.print(Panel(f"`{config.calle_command[0]}` was not found. Installing with:\n\n{' '.join(command)}", title="CLI precheck"))
    with console.status("Installing CALL-E CLI...", spinner="dots"):
        completed = run_command(command)
    if completed.returncode != 0:
        details = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
        raise CliUnavailableError(f"Automatic CLI installation failed: {details}")
    if not executable_exists(config.calle_command):
        raise CliUnavailableError(
            f"Installed {config.cli_package}, but `{config.calle_command[0]}` is still not on PATH. "
            "Open a new terminal or add the npm global bin directory to PATH."
        )


def ensure_calle_cli(config: Config, console: Console) -> None:
    if executable_exists(config.calle_command):
        console.print(f"[green]CLI precheck passed:[/] `{config.calle_command[0]}` is available.")
        return

    if not config.auto_install_cli:
        raise CliUnavailableError(
            f"`{config.calle_command[0]}` is not installed. Run `npm install -g {config.cli_package}` first."
        )

    install_calle_cli(config, console)
    console.print(f"[green]CLI installed:[/] `{config.calle_command[0]}` is available.")


def auth_common_args(config: Config) -> list[str]:
    args = ["--base-url", config.base_url, "--channel", config.channel, "--server-url", config.server_url]
    if config.cache_root:
        args.extend(["--cache-root", expand_home(config.cache_root)])
    return args


def run_calle_json(config: Config, args: list[str]) -> dict[str, Any]:
    command = [*config.calle_command, *args, *auth_common_args(config), "--json"]
    completed = run_command(command)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
        raise RuntimeError(f"calle command failed: {' '.join(command)}\n{detail}")
    parsed = json.loads(completed.stdout)
    if not isinstance(parsed, dict):
        raise RuntimeError("calle command did not return a JSON object")
    return parsed


def parse_iso_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_timestamp(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "n/a"
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes, remainder = divmod(int(round(seconds)), 60)
    if minutes < 60:
        return f"{minutes}m {remainder:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def server_hash(server_url: str) -> str:
    return hashlib.md5(server_url.encode("utf-8")).hexdigest()


def fallback_token_cache_path(config: Config, server_url: str) -> Path:
    return Path(expand_home(config.cache_root)) / server_hash(server_url) / "token.json"


def token_cache_path_from_status(config: Config, status: dict[str, Any]) -> Path:
    cache_path = status.get("cache_path")
    if isinstance(cache_path, str) and cache_path:
        return Path(cache_path).expanduser()
    server_url = status.get("server_url") if isinstance(status.get("server_url"), str) else config.server_url
    return fallback_token_cache_path(config, server_url)


def wait_for_cli_login(config: Config, console: Console) -> dict[str, Any]:
    login_command = [*config.calle_command, "auth", "login", *auth_common_args(config)]
    while True:
        if not config.login_wait:
            raise AuthRequiredError(
                "CALL-E CLI is not logged in. Run `calle auth login` first, then retry."
            )
        console.print(
            Panel(
                "The CALL-E CLI is not logged in yet.\n\n"
                f"Run this in another terminal:\n\n{' '.join(login_command)}\n\n"
                "After authorization completes, return here and press Enter.",
                title="Login required",
            )
        )
        try:
            input("Press Enter after `calle auth login` completes...")
        except EOFError as error:
            raise AuthRequiredError("CALL-E CLI login is required, but stdin is not interactive.") from error
        status = run_calle_json(config, ["auth", "status"])
        if status.get("usable"):
            return status
        console.print("[yellow]CLI token is still not usable. Waiting for login again.[/]")


def read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def token_document_usable(document: dict[str, Any] | None, min_ttl_seconds: float) -> bool:
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


def access_token(document: dict[str, Any]) -> str:
    token = document.get("token")
    if not isinstance(token, dict) or not isinstance(token.get("access_token"), str):
        raise RuntimeError("Token cache does not contain an access token")
    return token["access_token"]


def ensure_access_token(config: Config, console: Console) -> str:
    ensure_calle_cli(config, console)
    status = run_calle_json(config, ["auth", "status"])
    if not status.get("usable"):
        status = wait_for_cli_login(config, console)

    cache_path = token_cache_path_from_status(config, status)
    token_document = read_json_file(cache_path)
    if not token_document_usable(token_document, config.min_ttl_seconds):
        raise AuthRequiredError(f"CLI token cache is missing, expired, or malformed: {cache_path}")
    console.print(f"[green]Auth precheck passed:[/] using CLI token cache at {cache_path}")
    return access_token(token_document)


def redacted(value: Any) -> Any:
    if isinstance(value, list):
        return [redacted(item) for item in value]
    if isinstance(value, dict):
        output: dict[str, Any] = {}
        for key, item in value.items():
            if key in SECRET_KEYS:
                output[key] = "[REDACTED]"
            else:
                output[key] = redacted(item)
        return output
    return value


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        try:
            return jsonable(value.model_dump(mode="json", by_alias=True))
        except Exception:
            return str(value)
    return str(value)


def load_jsonl(path: Path) -> list[tuple[int, dict[str, Any]]]:
    items: list[tuple[int, dict[str, Any]]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            parsed = json.loads(stripped)
            if not isinstance(parsed, dict):
                raise ValueError(f"Line {line_number} must be a JSON object")
            items.append((line_number, parsed))
    return items


def normalize_batch_item(line_number: int, raw: dict[str, Any]) -> BatchItem:
    arguments = {key: raw[key] for key in PLAN_CALL_FIELDS if key in raw and raw[key] is not None}
    if "_meta" in raw:
        meta = raw["_meta"]
    elif "meta" in raw:
        meta = raw["meta"]
    elif "metadata" in raw:
        meta = {"call-e/customerMetadata": raw["metadata"]}
    else:
        meta = {}

    if not isinstance(meta, dict):
        raise ValueError(f"Line {line_number} metadata/meta/_meta must be a JSON object")
    if not arguments:
        raise ValueError(f"Line {line_number} does not include any plan_call arguments")

    ignored = sorted(set(raw) - PLAN_CALL_FIELDS - {"metadata", "meta", "_meta"})
    return BatchItem(
        line_number=line_number,
        raw=raw,
        arguments=arguments,
        meta=meta,
        ignored_fields=ignored,
    )


def item_to_phones(item: BatchItem) -> list[str]:
    phones = item.arguments.get("to_phones")
    if isinstance(phones, list):
        return [str(phone) for phone in phones if phone is not None]
    if isinstance(phones, str) and phones:
        return [phones]
    return []


def phone_label(item: BatchItem) -> str:
    phones = item_to_phones(item)
    return ", ".join(phones) if phones else "unknown"


def goal_label(item: BatchItem) -> str:
    goal = item.arguments.get("goal") or item.arguments.get("user_input") or ""
    return compact_text(goal, 240) if goal else "Not provided."


def compact_text(value: Any, max_length: int = 140) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(jsonable(redacted(value)), ensure_ascii=False, separators=(",", ":"))
    text = " ".join(text.split())
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 1]}..."


def first_string(payload: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def candidate_payloads(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        return []
    payloads = [value]
    for key in ("structured_content", "structuredContent", "data", "result", "status_result", "call", "run"):
        nested = value.get(key)
        if isinstance(nested, dict):
            payloads.extend(candidate_payloads(nested))
    return payloads


def extract_post_summary(value: Any) -> str | None:
    for payload in candidate_payloads(value):
        summary = first_string(payload, ("post_summary", "postsummary", "summary", "message"))
        if summary:
            return summary
    return None


def normalize_activity_item(item: Any) -> dict[str, Any]:
    if isinstance(item, dict):
        normalized = jsonable(redacted(item))
        if not isinstance(normalized, dict):
            return {"message": compact_text(normalized)}
        if not normalized.get("message"):
            message = first_string(
                normalized,
                ("text", "detail", "status", "state", "name", "type"),
            )
            if message:
                normalized["message"] = message
        return normalized
    return {"message": compact_text(item)}


def extract_activity(value: Any) -> list[dict[str, Any]]:
    for payload in candidate_payloads(value):
        activity = payload.get("activity")
        if isinstance(activity, list):
            return [normalize_activity_item(item) for item in activity]
        if isinstance(activity, str) and activity.strip():
            return [{"message": activity.strip()}]
    return []


def activity_message(item: dict[str, Any]) -> str:
    message = item.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return compact_text(item)


def normalize_transcript_turn(item: Any) -> dict[str, Any]:
    if isinstance(item, str):
        return {"speaker": "", "text": item.strip(), "ts": ""}
    if isinstance(item, dict):
        text = first_string(item, ("text", "message", "content", "utterance", "transcript"))
        if not text:
            content = item.get("content")
            if isinstance(content, list):
                text = " ".join(compact_text(part) for part in content if part is not None).strip()
        speaker = first_string(item, ("speaker", "role", "name", "source")) or ""
        ts = first_string(item, ("ts", "timestamp", "time", "started_at", "start_at", "start_time")) or ""
        if not ts and isinstance(item.get("start_ms"), (int, float)):
            ts = f"{item['start_ms']}ms"
        return {
            "speaker": speaker,
            "text": text or compact_text(item),
            "ts": ts,
        }
    return {"speaker": "", "text": compact_text(item), "ts": ""}


INLINE_TRANSCRIPT_TURN_RE = re.compile(r"\[(?P<ts>\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*(?P<speaker>[^:\[]+):\s*")


def split_inline_transcript(text: str) -> list[dict[str, Any]]:
    matches = list(INLINE_TRANSCRIPT_TURN_RE.finditer(text))
    if not matches:
        return [normalize_transcript_turn(text)]

    turns: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        turn_text = text[match.end():next_start].strip()
        if not turn_text:
            continue
        turns.append(
            {
                "ts": match.group("ts").strip(),
                "speaker": match.group("speaker").strip(),
                "text": turn_text,
            }
        )
    return turns or [normalize_transcript_turn(text)]


def transcript_from_value(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, str) and value.strip():
        return split_inline_transcript(value.strip())
    if isinstance(value, list):
        return [normalize_transcript_turn(item) for item in value]
    if isinstance(value, dict):
        nested = value.get("turns") or value.get("messages") or value.get("items")
        if nested is not None:
            return transcript_from_value(nested)
        return [normalize_transcript_turn(value)]
    return []


def extract_transcript(value: Any) -> list[dict[str, Any]]:
    for payload in candidate_payloads(value):
        for key in ("transcript", "asr", "conversation", "messages", "turns", "transcript_turns"):
            if key in payload:
                transcript = transcript_from_value(payload[key])
                if transcript:
                    return transcript
    return []


def extract_server_duration(value: Any) -> float | None:
    for payload in candidate_payloads(value):
        duration_seconds = payload.get("duration_seconds")
        if isinstance(duration_seconds, (int, float)):
            return float(duration_seconds)
        duration_ms = payload.get("duration_ms")
        if isinstance(duration_ms, (int, float)):
            return float(duration_ms) / 1000
        started_at = parse_iso_date(payload.get("started_at") if isinstance(payload.get("started_at"), str) else None)
        ended_at = parse_iso_date(payload.get("ended_at") if isinstance(payload.get("ended_at"), str) else None)
        if started_at and ended_at:
            return max(0.0, (ended_at - started_at).total_seconds())
    return None


def tool_result_to_dict(result: Any) -> dict[str, Any]:
    dumped = {
        "content": jsonable(getattr(result, "content", [])),
        "structured_content": jsonable(getattr(result, "structured_content", None)),
        "is_error": jsonable(getattr(result, "is_error", False)),
    }
    data = getattr(result, "data", None)
    if data is not None and dumped["structured_content"] is None:
        dumped["data"] = jsonable(data)
    return redacted(dumped)


def result_is_error(result: Any, dumped: dict[str, Any]) -> bool:
    value = getattr(result, "is_error", None)
    if isinstance(value, bool):
        return value
    for key in ("isError", "is_error"):
        if isinstance(dumped.get(key), bool):
            return dumped[key]
    return False


def structured_content(result: Any, dumped: dict[str, Any]) -> dict[str, Any]:
    value = getattr(result, "structured_content", None)
    if isinstance(value, dict):
        return value
    for key in ("structuredContent", "structured_content"):
        if isinstance(dumped.get(key), dict):
            return dumped[key]
    data = getattr(result, "data", None)
    return data if isinstance(data, dict) else {}


def extract_status(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("status", "call_status", "state"):
            status = value.get(key)
            if isinstance(status, str) and status:
                return status.upper()
        for key in ("status_result", "result", "call", "run"):
            status = extract_status(value.get(key))
            if status:
                return status
        for item in value.values():
            status = extract_status(item)
            if status:
                return status
    if isinstance(value, list):
        for item in value:
            status = extract_status(item)
            if status:
                return status
    return None


async def call_tool(client: Client, name: str, arguments: dict[str, Any], meta: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    result = await client.call_tool(name=name, arguments=arguments, meta=meta or None, raise_on_error=False)
    dumped = tool_result_to_dict(result)
    if result_is_error(result, dumped):
        raise RuntimeError(json.dumps(dumped, separators=(",", ":")))
    return result, dumped


def write_jsonl_record(handle: Any, record: dict[str, Any]) -> None:
    handle.write(json.dumps(redacted(record), separators=(",", ":")) + "\n")
    handle.flush()


def print_event(console: Console, event: str, **fields: Any) -> None:
    parts = [f"[bold]{event}[/]"]
    for key, value in fields.items():
        if value is not None:
            parts.append(f"{escape(str(key))}={escape(compact_text(value, 180))}")
    console.print(" | ".join(parts))


def print_input_preview(console: Console, items: list[BatchItem], mode: str) -> None:
    table = Table(title="Batch input")
    table.add_column("Line", justify="right")
    table.add_column("Phone")
    table.add_column("Region")
    table.add_column("Language")
    table.add_column("Mode")
    table.add_column("Ignored")
    for item in items:
        table.add_row(
            str(item.line_number),
            escape(phone_label(item)),
            escape(compact_text(item.arguments.get("region") or "")),
            escape(compact_text(item.arguments.get("language") or "")),
            mode,
            escape(", ".join(item.ignored_fields) if item.ignored_fields else "-"),
        )
    console.print(table)


def print_call_completion(console: Console, item: BatchItem, record: dict[str, Any]) -> None:
    status = record.get("final_status") or "UNKNOWN"
    title = f"Line {item.line_number} | {phone_label(item)} | {status}"
    summary = record.get("post_summary") or "Not available."
    details = [
        f"[bold]run_id[/]: {escape(compact_text(record.get('run_id') or 'n/a'))}",
        f"[bold]phone[/]: {escape(phone_label(item))}",
        f"[bold]goal[/]: {escape(goal_label(item))}",
        f"[bold]duration[/]: {escape(format_duration(record.get('duration_seconds')))}",
        f"[bold]polls[/]: {escape(str(record.get('poll_count') or 0))}",
        f"[bold]post summary[/]: {escape(compact_text(summary, 500))}",
    ]
    server_duration = record.get("server_duration_seconds")
    if isinstance(server_duration, (int, float)):
        details.insert(2, f"[bold]server duration[/]: {escape(format_duration(float(server_duration)))}")
    console.print(Panel("\n".join(details), title=title, border_style="green" if record.get("ok") else "red"))

    transcript = record.get("transcript")
    if isinstance(transcript, list) and transcript:
        table = Table(
            title=f"ASR transcript | line {item.line_number} | {phone_label(item)}",
            show_lines=True,
        )
        table.add_column("Time", no_wrap=True)
        table.add_column("Speaker", no_wrap=True)
        table.add_column("Text")
        for turn in transcript[:20]:
            if isinstance(turn, dict):
                table.add_row(
                    escape(compact_text(turn.get("ts") or "", 32)),
                    escape(compact_text(turn.get("speaker") or "", 32)),
                    escape(compact_text(turn.get("text") or "", 700)),
                )
        if len(transcript) > 20:
            table.add_row("", "", f"... {len(transcript) - 20} more turn(s) in the JSONL output")
        console.print(table)
    else:
        console.print(f"[dim]ASR transcript | line {item.line_number} | {escape(phone_label(item))}: Not available.[/]")


async def poll_call_run(
    client: Client,
    config: Config,
    item: BatchItem,
    run_id: str,
    run_started_at: datetime,
    run_start_monotonic: float,
    status_output: Any,
    progress: Progress,
    task: Any,
    console: Console,
) -> PollOutcome:
    deadline = asyncio.get_running_loop().time() + config.poll_timeout_seconds
    poll_index = 0
    last_result: dict[str, Any] = {}
    last_status: str | None = None
    last_activity: list[dict[str, Any]] = []

    while True:
        poll_index += 1
        elapsed = time.perf_counter() - run_start_monotonic
        progress.update(
            task,
            description=(
                f"line {item.line_number} | {phone_label(item)} | "
                f"{last_status or 'POLLING'} | poll {poll_index} | {format_duration(elapsed)}"
            ),
        )
        status_result, status_dumped = await call_tool(client, "get_call_run", {"run_id": run_id}, item.meta)
        structured = structured_content(status_result, status_dumped)
        status = extract_status(structured) or extract_status(status_dumped)
        activity = extract_activity(status_dumped)
        latest_activity = activity_message(activity[-1]) if activity else None
        last_result = status_dumped
        last_status = status
        if activity:
            last_activity = activity
        print_event(
            console,
            "get_call_run",
            line=item.line_number,
            phone=phone_label(item),
            run_id=run_id,
            poll=poll_index,
            elapsed=format_duration(time.perf_counter() - run_start_monotonic),
            status=status,
            activity=latest_activity,
        )

        write_jsonl_record(
            status_output,
            {
                "line_number": item.line_number,
                "to_phones": item_to_phones(item),
                "run_id": run_id,
                "poll_index": poll_index,
                "status": status,
                "terminal": status in TERMINAL_STATUSES if status else False,
                "started_at": iso_timestamp(run_started_at),
                "elapsed_seconds": time.perf_counter() - run_start_monotonic,
                "activity": activity,
                "get_call_run_result": status_dumped,
                "timestamp": utc_now().isoformat(),
            },
        )

        if status in TERMINAL_STATUSES:
            ended_at = utc_now()
            duration_seconds = time.perf_counter() - run_start_monotonic
            print_event(
                console,
                "final_status",
                line=item.line_number,
                phone=phone_label(item),
                run_id=run_id,
                status=status,
                duration=format_duration(duration_seconds),
            )
            return PollOutcome(
                final_result=last_result,
                final_status=last_status,
                poll_count=poll_index,
                ended_at=ended_at,
                duration_seconds=duration_seconds,
                server_duration_seconds=extract_server_duration(last_result),
                post_summary=extract_post_summary(last_result),
                transcript=extract_transcript(last_result),
                activity=last_activity,
            )
        if asyncio.get_running_loop().time() >= deadline:
            raise TimeoutError(f"Timed out waiting for terminal status for run_id={run_id}")
        await asyncio.sleep(config.poll_interval_seconds)


async def process_batch(
    config: Config,
    token: str,
    items: list[BatchItem],
    console: Console,
) -> tuple[dict[str, int], list[dict[str, Any]]]:
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Call-E-Integration": INTEGRATION_HEADER,
    }
    transport = StreamableHttpTransport(config.server_url, headers=headers)
    totals = {"ok": 0, "failed": 0}
    row_summaries: list[dict[str, Any]] = []
    config.output_path.parent.mkdir(parents=True, exist_ok=True)
    if config.mode == "execute":
        config.status_output_path.parent.mkdir(parents=True, exist_ok=True)

    async with Client(transport) as client:
        with config.output_path.open("w", encoding="utf-8") as output:
            status_output = config.status_output_path.open("w", encoding="utf-8") if config.mode == "execute" else None
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                TimeElapsedColumn(),
                console=console,
            ) as progress:
                try:
                    task = progress.add_task("Processing batch...", total=len(items))
                    for index, item in enumerate(items, start=1):
                        progress.update(
                            task,
                            description=(
                                f"line {item.line_number} ({index}/{len(items)}) | "
                                f"{phone_label(item)} | preparing"
                            ),
                        )
                        record: dict[str, Any] = {
                            "line_number": item.line_number,
                            "to_phones": item_to_phones(item),
                            "mode": config.mode,
                            "ok": False,
                            "ignored_fields": item.ignored_fields,
                            "request_meta_sent": bool(item.meta),
                            "started_at": None,
                            "ended_at": None,
                            "duration_seconds": None,
                            "server_duration_seconds": None,
                            "poll_count": 0,
                            "post_summary": None,
                            "transcript": [],
                            "activity": [],
                        }
                        run_started_at: datetime | None = None
                        run_start_monotonic: float | None = None
                        try:
                            plan_result, plan_dumped = await call_tool(client, "plan_call", item.arguments, item.meta)
                            record["plan_result"] = plan_dumped
                            plan_structured = structured_content(plan_result, plan_dumped)
                            print_event(
                                console,
                                "plan_call",
                                line=item.line_number,
                                phone=phone_label(item),
                                ready_to_run=plan_structured.get("ready_to_run"),
                                plan_id=plan_structured.get("plan_id"),
                            )
                            if config.mode == "dry_run":
                                record["ok"] = True
                            else:
                                if not plan_structured.get("ready_to_run"):
                                    raise RuntimeError("plan_call did not return ready_to_run=true")
                                plan_id = plan_structured.get("plan_id")
                                confirm_token = plan_structured.get("confirm_token")
                                if not isinstance(plan_id, str) or not isinstance(confirm_token, str):
                                    raise RuntimeError("plan_call did not return plan_id and confirm_token")
                                run_started_at = utc_now()
                                run_start_monotonic = time.perf_counter()
                                record["started_at"] = iso_timestamp(run_started_at)
                                run_result, run_dumped = await call_tool(
                                    client,
                                    "run_call",
                                    {"plan_id": plan_id, "confirm_token": confirm_token},
                                    item.meta,
                                )
                                run_structured = structured_content(run_result, run_dumped)
                                run_id = run_structured.get("run_id")
                                if not isinstance(run_id, str) or not run_id:
                                    raise RuntimeError("run_call did not return run_id")
                                record["run_id"] = run_id
                                record["run_result"] = run_dumped
                                print_event(
                                    console,
                                    "run_call",
                                    line=item.line_number,
                                    phone=phone_label(item),
                                    plan_id=plan_id,
                                    run_id=run_id,
                                    status=extract_status(run_structured) or extract_status(run_dumped),
                                )
                                if status_output is None:
                                    raise RuntimeError("status output is not available in execute mode")
                                outcome = await poll_call_run(
                                    client,
                                    config,
                                    item,
                                    run_id,
                                    run_started_at,
                                    run_start_monotonic,
                                    status_output,
                                    progress,
                                    task,
                                    console,
                                )
                                record["ended_at"] = iso_timestamp(outcome.ended_at)
                                record["duration_seconds"] = outcome.duration_seconds
                                record["server_duration_seconds"] = outcome.server_duration_seconds
                                record["poll_count"] = outcome.poll_count
                                record["post_summary"] = outcome.post_summary
                                record["transcript"] = outcome.transcript
                                record["activity"] = outcome.activity
                                record["final_status"] = outcome.final_status
                                record["final_result"] = outcome.final_result
                                record["status_output"] = str(config.status_output_path)
                                record["ok"] = True
                                print_call_completion(console, item, record)
                        except Exception as error:
                            if run_start_monotonic is not None:
                                ended_at = utc_now()
                                record["ended_at"] = iso_timestamp(ended_at)
                                record["duration_seconds"] = time.perf_counter() - run_start_monotonic
                            record["error"] = {"type": type(error).__name__, "message": str(error)}
                            print_event(
                                console,
                                "record_failed",
                                line=item.line_number,
                                phone=phone_label(item),
                                error=type(error).__name__,
                                duration=format_duration(record.get("duration_seconds")),
                            )

                        write_jsonl_record(output, record)
                        totals["ok" if record["ok"] else "failed"] += 1
                        row_summaries.append(
                            {
                                "line_number": item.line_number,
                                "to_phones": item_to_phones(item),
                                "ok": record["ok"],
                                "final_status": record.get("final_status"),
                                "duration_seconds": record.get("duration_seconds"),
                                "poll_count": record.get("poll_count", 0),
                                "run_id": record.get("run_id"),
                                "error": record.get("error"),
                            }
                        )
                        progress.advance(task)
                finally:
                    if status_output is not None:
                        status_output.close()

    return totals, row_summaries


def print_summary(
    config: Config,
    totals: dict[str, int],
    row_summaries: list[dict[str, Any]],
    console: Console,
) -> None:
    table = Table(title="Batch result")
    table.add_column("Mode")
    table.add_column("Succeeded", justify="right")
    table.add_column("Failed", justify="right")
    table.add_column("Output")
    table.add_row(config.mode, str(totals["ok"]), str(totals["failed"]), str(config.output_path))
    console.print(table)

    details = Table(title="Call details")
    details.add_column("Line", justify="right")
    details.add_column("Phone")
    details.add_column("Status")
    details.add_column("Duration", justify="right")
    details.add_column("Polls", justify="right")
    details.add_column("Run ID")
    details.add_column("Error")
    for row in row_summaries:
        error = row.get("error")
        details.add_row(
            str(row.get("line_number")),
            escape(", ".join(row.get("to_phones") or []) or "unknown"),
            escape(str(row.get("final_status") or ("OK" if row.get("ok") else "FAILED"))),
            format_duration(row.get("duration_seconds") if isinstance(row.get("duration_seconds"), (int, float)) else None),
            str(row.get("poll_count") or 0),
            escape(compact_text(row.get("run_id") or "", 48)),
            escape(compact_text(error.get("type") if isinstance(error, dict) else "", 48)),
        )
    console.print(details)
    if config.mode == "execute":
        console.print(f"[green]Status events:[/] {config.status_output_path}")


async def run(argv: list[str] | None = None) -> int:
    console = Console()
    config = read_config(argv)
    token = ensure_access_token(config, console)
    raw_items = load_jsonl(config.input_path)
    items = [normalize_batch_item(line_number, raw) for line_number, raw in raw_items]
    if not items:
        raise ValueError(f"No JSONL records found in {config.input_path}")
    console.print(f"[green]Loaded[/] {len(items)} JSONL record(s) from {config.input_path}")
    print_input_preview(console, items, config.mode)
    totals, row_summaries = await process_batch(config, token, items, console)
    print_summary(config, totals, row_summaries, console)
    return 0 if totals["failed"] == 0 else 1


def main() -> int:
    try:
        return asyncio.run(run())
    except AuthRequiredError as error:
        Console(stderr=True).print(f"[red]Auth required:[/] {error}")
        return 2
    except CliUnavailableError as error:
        Console(stderr=True).print(f"[red]CLI unavailable:[/] {error}")
        return 3
    except Exception as error:
        Console(stderr=True).print(f"[red]Error:[/] {type(error).__name__}: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
