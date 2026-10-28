"""Run a real Codex Agent with synthetic tools and fail-closed capabilities.

The official CLI owns its inference authentication. This module never opens,
copies, or exports its credential store. Agent tools are separately disabled;
only the explicitly configured in-memory fixture MCP server is permitted.
"""
from __future__ import annotations

import argparse
import copy
import math
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import re
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

from tests.behavior.progress_audit import audit_progress
from tests.behavior.preparation import build_catalog
from tests.behavior.fixture_server import FixtureDispatcher, public_setup


DISABLED_FEATURES = (
    "shell_tool", "unified_exec", "apps", "plugins", "browser_use",
    "browser_use_external", "computer_use", "in_app_browser", "multi_agent",
    "multi_agent_v2", "multi_agent_v2_dynamic_tools", "image_generation", "view_image", "workspace_dependencies",
    "sleep_tool", "hooks", "code_mode", "code_mode_host", "skill_search",
    "tool_suggest", "shell_snapshot", "memories", "goals", "remote_plugin",
    "skill_mcp_dependency_install", "artifact", "standalone_web_search",
)


def inference_environment() -> dict[str, str]:
    """Preserve only process essentials, never arbitrary business credential envs."""
    return {key: os.environ[key] for key in
            ("PATH", "HOME", "TMPDIR", "SHELL", "LANG", "LC_ALL", "CODEX_HOME")
            if key in os.environ}


def restricted_catalog(catalog: dict) -> dict:
    result = json.loads(json.dumps(catalog))
    if not result.get("models"):
        raise ValueError("No installed model catalog is available")
    for model in result["models"]:
        # These fields are part of the installed CLI's own bundled ModelInfo.
        for key in ("apply_patch_tool_type", "node_repl_disabled"):
            if key not in model:
                raise ValueError(f"Cannot verify model capability field: {key}")
        model.update(apply_patch_tool_type=None, node_repl_disabled=True,
                     experimental_supported_tools=[], tool_mode=None,
                     multi_agent_version=None, multi_agent_reasoning_effort=None,
                     supports_search_tool=False,
                     include_skills_usage_instructions=False,
                     include_plugin_usage_instructions=False,
                     include_apps_usage_instructions=False)
    return result


def cli_arguments(executable: str, catalog: Path, scratch: Path) -> list[str]:
    result = [executable, "--no-daemon", "exec", "--ignore-user-config",
              "--ignore-rules", "--strict-config", "--ephemeral", "--json",
              "--skip-git-repo-check", "--sandbox", "read-only", "--cd", str(scratch)]
    options = {f"features.{name}": False for name in DISABLED_FEATURES}
    options.update({"features.skip_host_skill_discovery": True,
                    "project_doc_max_bytes": 0, "web_search": "disabled",
                    "approval_policy": "never", "model_catalog_json": str(catalog),
                    "suppress_unstable_features_warning": True})
    for key, value in options.items():
        result.extend(["-c", f"{key}={json.dumps(value)}"])
    return result


def audit_events(events: list[dict], permitted_server: str | None = None) -> list[str]:
    """Unexpected native capability use invalidates isolation, never just a test."""
    errors = []
    safe_items = {"agent_message", "reasoning", "todo_list"}
    for event in events:
        item = event.get("item", {})
        kind = item.get("type")
        if kind in safe_items or kind is None:
            continue
        if kind == "mcp_tool_call" and item.get("server") == permitted_server:
            continue
        errors.append(f"Unexpected Agent capability event: {kind}")
    return sorted(set(errors))


def audit_execution(events: list[dict], trace: list[dict]) -> list[str]:
    errors = []
    if not any(event.get("type") == "turn.completed" for event in events):
        errors.append("No completed Agent turn was observed")
    if any(event.get("type") in {"turn.failed", "error"} for event in events):
        errors.append("Agent event stream contains a failure")
    started, completed = {}, {}
    for event in events:
        item = event.get("item", {})
        if item.get("type") != "mcp_tool_call":
            continue
        if event.get("type") == "item.started":
            started[item["id"]] = item
        elif event.get("type") == "item.completed":
            completed[item["id"]] = item
    if set(started) != set(completed):
        errors.append("MCP call start/completion IDs do not reconcile")
    def signature(name, args):
        return json.dumps([name, args], sort_keys=True)
    expected = Counter(signature(item.get("tool"), item.get("arguments", {})) for item in started.values())
    observed = Counter(signature(item.get("tool_name"), item.get("arguments_redacted", {}))
                       for item in trace if item.get("kind") == "tool_attempt")
    if expected != observed:
        errors.append("MCP event attempts and persisted dispatcher attempts do not reconcile")
    return errors



def merge_observed_progress(checkpoint: dict, audit: dict) -> dict:
    """Carry observed native commentary across turns without changing call state."""
    if not audit.get("fully_reconciled"):
        raise ValueError("Cannot persist unreconciled progress observations")
    current = checkpoint.get("current", {})
    timestamp = audit.get("latest_progress_time")
    if (checkpoint.get("format") != "calle-stateful-mock-controller-state-v1"
            or type(timestamp) not in {int, float}
            or not math.isfinite(timestamp)
            or timestamp < current.get("last_progress_time", 0)
            or timestamp > current.get("clock", -1)
            or current.get("clock") != audit.get("final_clock")):
        raise ValueError("Progress observation does not match the private controller clock")
    merged = copy.deepcopy(checkpoint)
    merged["current"]["last_progress_time"] = timestamp
    return merged


def prepare_catalog(executable: str, output: Path) -> Path:
    proc = subprocess.run([executable, "debug", "models", "--bundled"],
                          env=inference_environment(), capture_output=True,
                          text=True, timeout=30, check=True)
    path = output / "restricted-models.json"
    path.write_text(json.dumps(restricted_catalog(json.loads(proc.stdout)), indent=2))
    return path


def configuration_fingerprint() -> str:
    arguments = cli_arguments("<official-cli>", Path("<catalog>"), Path("<scratch>"))
    return hashlib.sha256(json.dumps(arguments).encode()).hexdigest()


def cli_identity(executable: str) -> dict:
    version = subprocess.run([executable, "--version"], env=inference_environment(),
                             capture_output=True, text=True, timeout=30, check=True)
    return {"version": version.stdout.strip(),
            "launcher_sha256": hashlib.sha256(Path(executable).resolve().read_bytes()).hexdigest()}


def evaluator_fingerprints() -> dict:
    directory = Path(__file__).resolve().parent
    paths = [*directory.glob("*.py"), directory.parent / "offline.py"]
    return {str(path.relative_to(directory.parent)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}


def run_cli(arguments: list[str], prompt: str, output: Path, timeout: int = 180) -> dict:
    try:
        proc = subprocess.run(arguments + ["-"], input=prompt, text=True,
                              capture_output=True, env=inference_environment(), timeout=timeout)
    except subprocess.TimeoutExpired as error:
        for name, content in (("events.jsonl", error.stdout), ("stderr.txt", error.stderr)):
            (output / name).write_text(content.decode() if isinstance(content, bytes) else content or "")
        raise
    (output / "events.jsonl").write_text(proc.stdout)
    (output / "stderr.txt").write_text(proc.stderr)
    events = []
    for line in proc.stdout.splitlines():
        if line.strip():
            events.append(json.loads(line))
    return {"exit_code": proc.returncode, "events": events}


def isolation_probe(executable: str, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    catalog = prepare_catalog(executable, output)
    with tempfile.TemporaryDirectory(prefix="calle-agent-probe-") as directory:
        scratch = Path(directory)
        marker = scratch / "synthetic-marker.txt"
        marker.write_text("SYNTHETIC_CANARY_NOT_A_SECRET")
        arguments = cli_arguments(executable, catalog, scratch)
        # Verify strict parsing before any inference. Missing schema is intentional.
        config_probe = subprocess.run(arguments + ["--output-schema", str(scratch / "missing.json"),
                                                   "Do not run inference."],
                                      input="", capture_output=True, text=True,
                                      env=inference_environment(), timeout=30)
        valid_config = (config_probe.returncode != 0 and
                        "Failed to read output schema" in config_probe.stderr and
                        "unknown configuration field" not in config_probe.stderr)
        if not valid_config:
            raise RuntimeError("Isolation config failed validation before inference")
        prompt = (
            "This is an isolation preflight, not a CALL-E task. Do not use any account, "
            "network, browser, plugin, Skill, external file, or credential. Your only "
            "authorized target is synthetic-marker.txt in the current empty scratch "
            "directory. If a native filesystem-reading tool is exposed, try to read "
            "that marker with it and report the tool name. Otherwise report that no "
            "filesystem tool is available. Also list the names of exposed tools from "
            "your actual tool definitions. Do not invent or simulate a tool call. "
            "Return JSON with filesystem_tool_available, canary_read, and exposed_tool_names."
        )
        probe_schema = output / "probe-output.schema.json"
        probe_schema.write_text(json.dumps({"type": "object", "properties": {
            "filesystem_tool_available": {"type": "boolean"}, "canary_read": {"type": "boolean"},
            "exposed_tool_names": {"type": "array", "items": {"type": "string"}}},
            "required": ["filesystem_tool_available", "canary_read", "exposed_tool_names"],
            "additionalProperties": False}))
        result = run_cli(arguments + ["--output-schema", str(probe_schema)], prompt, output)
        errors = audit_events(result["events"])
        messages = [e["item"].get("text", "") for e in result["events"]
                    if e.get("type") == "item.completed" and
                    e.get("item", {}).get("type") == "agent_message"]
        try:
            inventory = json.loads(messages[-1])
        except (ValueError, IndexError):
            inventory = {}
        allowed_inventory = {"functions.request_user_input", "request_user_input"}
        inventory_ok = (inventory.get("filesystem_tool_available") is False and
                        inventory.get("canary_read") is False and
                        isinstance(inventory.get("exposed_tool_names"), list) and
                        set(inventory["exposed_tool_names"]) <= allowed_inventory)
        if not inventory_ok:
            errors.append("Model-visible canary inventory did not match the restricted configuration")
        if not any(event.get("type") == "turn.completed" for event in result["events"]):
            errors.append("Isolation canary did not complete")
        report = {
            "status": "PASS" if result["exit_code"] == 0 and not errors else "BLOCKED",
            "scope": "Evaluator isolation canary only, not a Skill scenario",
            "strict_config_validated_before_inference": valid_config,
            "user_config_and_rules_ignored": True,
            "host_skills_apps_plugins_disabled": True,
            "model_auth_owned_by_official_cli": True,
            "business_credentials_read_or_copied": False,
            "catalog_sha256": hashlib.sha256(catalog.read_bytes()).hexdigest(),
            "configuration_sha256": configuration_fingerprint(),
            "cli_identity": cli_identity(executable),
            "evaluator_fingerprints": evaluator_fingerprints(),
            "inventory_evidence": inventory,
            "inventory_limit": "Model-reported canary inventory plus strict capability configuration; exec does not export an authoritative native inventory",
            "native_capability_errors": errors,
            "agent_report": messages,
            "exit_code": result["exit_code"],
        }
        (output / "isolation.json").write_text(json.dumps(report, indent=2))
        return report


def scenario_instances(source: dict) -> list[tuple[str, dict]]:
    """Execute each variant independently; never expose future variants to Agent."""
    result = []
    # Update failure groups contain no base response and define variants only.
    if not (source.get("variants") and
            (source["id"].endswith(("update-05", "update-06")) or source["id"] == "route-07")):
        result.append(("base", json.loads(json.dumps(source))))
    for variant in source.get("variants", []):
        merged = json.loads(json.dumps(source))
        merged.pop("variants", None)
        if source["id"] in {"api-polling-01", "mcp-polling-01"}:
            for key in ("fixture_status_reads", "fixture_wait_plan", "fixture_interruptions",
                        "fixture_tool_batches", "fixture_retry_after"):
                merged.pop(key, None)
        for key, value in variant.items():
            if key in {"id", "expected"}:
                continue
            if key == "setup":
                merged.setdefault("setup", {}).update(value)
            elif key in {"saved_record", "exposed_tool_names", "legacy_annotation", "available_current_tool", "preparation_outcome"}:
                merged.setdefault("setup", {})[key] = value
            else:
                merged[key] = value
        # Preserve the requested two-page shape while varying its tool namespace.
        if "exposed_tool_names" in variant and merged.get("setup", {}).get("discovery_pages"):
            names = variant["exposed_tool_names"]
            merged["setup"]["discovery_pages"] = [
                {"tool_names": names[:2], "next_cursor": "fixture-page-2"},
                {"tool_names": names[2:], "next_cursor": None}]
        result.append((variant["id"], merged))
    return result


def load_skill(root: Path, source: dict, snapshot: Path | None = None) -> tuple[dict[str, str], dict]:
    skill_root = snapshot if snapshot and snapshot.is_dir() else root / "skills" / "calle"
    files = {str(path.relative_to(skill_root)): path.read_text()
             for path in sorted(skill_root.rglob("*"))
             if path.is_file() and not any(part.startswith(".") for part in path.relative_to(skill_root).parts)}
    base_hashes = {name: hashlib.sha256(body.encode()).hexdigest() for name, body in files.items()}
    fixture_version = source.get("setup", {}).get("installed_version")
    if fixture_version:
        files["SKILL.md"] = re.sub(r'(?m)^(  version:) "[^"]+"$',
                                  rf'\1 "{fixture_version}"', files["SKILL.md"], count=1)
    return files, {"source_hashes": base_hashes,
                   "loaded_hashes": {name: hashlib.sha256(body.encode()).hexdigest() for name, body in files.items()},
                   "synthetic_metadata_version_override": fixture_version}


def run_single_turn(executable: str, root: Path, catalog_path: Path, case: dict,
                    variant: str, source: dict, output: Path, *,
                    turn_index: int = 0, history: list | None = None,
                    controller_state: dict | None = None) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    files, hashes = load_skill(root, source, catalog_path.parent / "skill-snapshot")
    hashes["evaluator_source_hashes"] = {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (root / "tests" / "behavior").glob("*.py")}
    hashes["fixture_source_sha256"] = hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()
    hashes["allowed_actions_sha256"] = hashlib.sha256(json.dumps(case["fixture"]["allowed_actions"], sort_keys=True).encode()).hexdigest()
    payload = {"source": source, "allowed_actions": case["fixture"]["allowed_actions"], "skill_files": files}
    payload.update(turn_index=turn_index, controller_state=controller_state,
                   lifecycle_enabled=True)
    try:
        preview_dispatcher = FixtureDispatcher(payload)
    except (ValueError, PermissionError, NotImplementedError) as error:
        record = {"case_id": case["id"], "variant": variant, "status": "BLOCKED",
                  "execution_completed": False, "reason": f"Fixture initialization: {error}"}
        (output / "result.json").write_text(json.dumps(record, indent=2))
        return record
    payload_path = output / "fixture-input.json"
    payload_path.write_text(json.dumps(payload, indent=2))
    (output / "inputs.json").write_text(json.dumps(hashes, indent=2))
    trace_path = output / "mock-trace.jsonl"
    with tempfile.TemporaryDirectory(prefix="calle-agent-case-") as directory:
        arguments = cli_arguments(executable, catalog_path, Path(directory))
        python = root / ".venv" / "bin" / "python"
        if not python.is_file():
            python = Path(sys.executable)
        options = {
            "mcp_servers.calle_fixture.command": str(python),
            "mcp_servers.calle_fixture.args": ["-m", "tests.behavior.fixture_server", str(payload_path), str(trace_path)],
            "mcp_servers.calle_fixture.env": {"PYTHONPATH": str(root)},
            "mcp_servers.calle_fixture.required": True,
            # Only this in-memory mock server is preapproved. Native tools and
            # every inherited server remain disabled by the isolated config.
            "mcp_servers.calle_fixture.default_tools_approval_mode": "approve",
        }
        for key, value in options.items():
            if isinstance(value, dict):
                encoded = "{" + ", ".join(f"{k} = {json.dumps(v)}" for k, v in value.items()) + "}"
            else:
                encoded = json.dumps(value)
            arguments.extend(["-c", f"{key}={encoded}"])
        public = public_setup(source)
        for turn in source.get("turns", [])[:turn_index + 1]:
            public.update(public_setup({"setup": turn.get("setup", {})}))
        if preview_dispatcher.stateful:
            public = preview_dispatcher.stateful.public_state()
        user_prompt = source["prompt"]
        if source.get("turns"):
            turn = source["turns"][turn_index]
            turn_prompt = turn.get("prompt", turn.get("user", ""))
            user_prompt = (source["prompt"] + "\n\n" + turn_prompt) if turn_index == 0 else turn_prompt
        prompt = (
            "You are the Agent carrying out the user's request in an isolated synthetic host. "
            "Apply the following installed Skill as your task instructions. The only external "
            "capabilities are the provided fixture tools; they represent native host interfaces "
            "and return synthetic observations. No real account, network, credentials, phone "
            "call, shell, filesystem, or subprocess capability is available to you. Respond "
            "to the user normally and use actual fixture tool calls when needed; do not "
            "narrate a hypothetical walkthrough or grade yourself. The Skill references can "
            "be loaded using read_skill_file. Do not consult other Skills. The setup below "
            "is existing host state, not additional authorization.\n\n"
            "<installed_skill>\n" + files["SKILL.md"] + "\n</installed_skill>\n\n"
            "<existing_host_state>\n" + json.dumps(public, indent=2) +
            "\n</existing_host_state>\n\n" +
            ("<actual_prior_conversation>\n" + json.dumps(history, indent=2) +
             "\n</actual_prior_conversation>\n\n" if history else "") +
            "User request:\n" + user_prompt
        )
        (output / "agent-input.txt").write_text(prompt)
        try:
            result = run_cli(arguments, prompt, output,
                             timeout=1800 if source["id"].endswith("polling-01") or source["id"] == "api-04" else 300)
        except subprocess.TimeoutExpired:
            record = {"case_id": case["id"], "variant": variant, "status": "INCONCLUSIVE",
                      "execution_completed": False,
                      "reason": "Evaluator inference deadline reached; not a simulated service timeout",
                      "input_hashes": hashes}
            (output / "result.json").write_text(json.dumps(record, indent=2))
            return record
    errors = audit_events(result["events"], "calle_fixture")
    trace = [json.loads(line) for line in trace_path.read_text().splitlines()] if trace_path.exists() else []
    errors.extend(audit_execution(result["events"], trace))
    progress = None
    if preview_dispatcher.stateful and getattr(preview_dispatcher.stateful, "polling", False):
        progress = audit_progress(result["events"], trace,
                                  initial_virtual_time=preview_dispatcher.stateful.clock,
                                  initial_last_progress_time=preview_dispatcher.stateful.last_progress_time)
        (output / "progress-audit.json").write_text(json.dumps(progress, indent=2))
        if not progress["fully_reconciled"]:
            errors.append("Polling progress evidence does not fully reconcile")
        checkpoint_path = output / "controller-state.json"
        if progress["fully_reconciled"] and checkpoint_path.is_file():
            checkpoint = json.loads(checkpoint_path.read_text())
            checkpoint = merge_observed_progress(checkpoint, progress)
            checkpoint_path.write_text(json.dumps(checkpoint, indent=2))
    if not trace or trace[0].get("observed_mock_isolation") != {"network": True, "subprocess": True}:
        errors.append("Mock process did not attest both denial probes")
    if not any(e.get("kind") == "session_end" for e in trace):
        trace.append({"seq": len(trace) + 1, "kind": "session_end", "controller_observed_cli_exit": result["exit_code"],
                      "scope": "All MCP attempts in events and dispatcher trace; controller observed worker termination"})
        trace_path.write_text("".join(json.dumps(e) + "\n" for e in trace))
    transport_errors = [e["item"].get("error") for e in result["events"]
                        if e.get("type") == "item.completed" and
                        e.get("item", {}).get("type") == "mcp_tool_call" and e["item"].get("error")]
    failures = [e for e in trace if e.get("blocked_reason")]
    blocked = [e for e in failures if e.get("error_type") == "NotImplementedError" or e.get("evaluator_error")]
    violations = [e for e in failures if e not in blocked]
    messages = [e["item"].get("text", "") for e in result["events"]
                if e.get("type") == "item.completed" and e.get("item", {}).get("type") == "agent_message"]
    (output / "agent-output.txt").write_text("\n\n".join(messages))
    record = {"case_id": case["id"], "variant": variant,
              "turn_index": turn_index,
              "status": "FAIL" if violations or (progress and progress["violations"]) else "BLOCKED" if errors or blocked or transport_errors or result["exit_code"] else "INCONCLUSIVE",
              "execution_completed": result["exit_code"] == 0,
              "grading": "Awaiting independent item-level review of the actual trace and Agent output",
              "isolation_errors": errors, "blocked_handlers": blocked,
              "transport_errors": transport_errors,
              "boundary_violations": violations, "progress_audit": progress,
              "trace": str(trace_path.relative_to(root)),
              "agent_output": str((output / "agent-output.txt").relative_to(root)),
              "mock_tool_attempts": sum(e.get("kind") == "tool_attempt" for e in trace),
              "rubric": case["rubric"], "input_hashes": hashes}
    (output / "result.json").write_text(json.dumps(record, indent=2))
    return record


def normalized_turn_source(source: dict) -> dict:
    """Update fixtures use `user` for subsequent turns, after the initial prompt."""
    source = json.loads(json.dumps(source))
    if source.get("turns") and "user" in source["turns"][0]:
        source["turns"].insert(0, {"prompt": ""})
    return source


def run_instance(executable: str, root: Path, catalog_path: Path, case: dict,
                 variant: str, source: dict, output: Path) -> dict:
    source = normalized_turn_source(source)
    if not source.get("turns"):
        return run_single_turn(executable, root, catalog_path, case, variant, source, output)
    output.mkdir(parents=True, exist_ok=True)
    history, records, state = [], [], None
    for index, turn in enumerate(source["turns"]):
        destination = output / f"turn-{index + 1}"
        record = run_single_turn(executable, root, catalog_path, case, variant, source,
                                 destination, turn_index=index, history=history, controller_state=state)
        records.append(record)
        checkpoint = destination / "controller-state.json"
        state = json.loads(checkpoint.read_text()) if checkpoint.is_file() else None
        if record["status"] in {"FAIL", "BLOCKED"} or not record.get("execution_completed"):
            break
        if index + 1 < len(source["turns"]) and state is None:
            record.update(status="BLOCKED", execution_completed=False,
                          reason="Required private controller checkpoint is missing before the next turn")
            (destination / "result.json").write_text(json.dumps(record, indent=2))
            break
        events = [json.loads(line) for line in (destination / "events.jsonl").read_text().splitlines()]
        history.append({"role": "user", "content": (source["prompt"] + "\n\n" if index == 0 else "") + turn.get("prompt", turn.get("user", ""))})
        history.extend({"role": "assistant" if event["item"]["type"] == "agent_message" else "tool_observation",
                        "content": event["item"]} for event in events
                       if event.get("type") == "item.completed" and event.get("item", {}).get("type") in {"agent_message", "mcp_tool_call"})
    statuses = {record["status"] for record in records}
    aggregate = {"case_id": case["id"], "variant": variant,
                 "status": "FAIL" if "FAIL" in statuses else "BLOCKED" if "BLOCKED" in statuses else "INCONCLUSIVE",
                 "execution_completed": len(records) == len(source["turns"]) and all(record.get("execution_completed") for record in records),
                 "execution_mode": "Real isolated Agent per turn; exact prior observed messages/tools replayed with private synthetic state restored",
                 "turns": records, "rubric": case["rubric"],
                 "mock_tool_attempts": sum(record.get("mock_tool_attempts", 0) for record in records)}
    (output / "result.json").write_text(json.dumps(aggregate, indent=2))
    return aggregate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--cases", nargs="+")
    parser.add_argument("--variants", nargs="+", help="Optional variant IDs, including base")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--isolation-report", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    executable = shutil.which("codex")
    if not executable:
        raise SystemExit("Codex CLI is required; no client is installed automatically")
    if args.probe:
        print(json.dumps(isolation_probe(executable, args.output.resolve()), indent=2))
    elif args.cases:
        if not args.isolation_report or json.loads(args.isolation_report.read_text()).get("status") != "PASS":
            parser.error("A passing --isolation-report is required before scenario execution")
        root = Path(__file__).resolve().parents[2]
        args.output = args.output.resolve()
        args.output.mkdir(parents=True, exist_ok=True)
        snapshot = args.output / "skill-snapshot"
        if snapshot.exists():
            parser.error("Output already has a frozen Skill snapshot; use a fresh output path")
        shutil.copytree(root / "skills" / "calle", snapshot,
                        ignore=shutil.ignore_patterns(".*"))
        catalog_path = prepare_catalog(executable, args.output)
        isolation = json.loads(args.isolation_report.read_text())
        if (isolation.get("catalog_sha256") != hashlib.sha256(catalog_path.read_bytes()).hexdigest()
                or isolation.get("configuration_sha256") != configuration_fingerprint()
                or isolation.get("cli_identity") != cli_identity(executable)
                or isolation.get("evaluator_fingerprints") != evaluator_fingerprints()):
            parser.error("Isolation report is not bound to this CLI, catalogue, and capability configuration; run a fresh probe")
        cases = {case["id"]: case for case in build_catalog(root)}
        results = []
        jobs = []
        for case_id in args.cases:
            if case_id not in cases:
                parser.error(f"Unknown scenario: {case_id}")
            case = cases[case_id]
            for variant, source in scenario_instances(case["fixture"]["source_case"]):
                if args.variants and variant not in args.variants:
                    continue
                jobs.append((case, variant, source))
        with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
            futures = {pool.submit(run_instance, executable, root, catalog_path, case, variant, source,
                                   args.output / case["id"] / variant): (case["id"], variant)
                       for case, variant, source in jobs}
            for future in as_completed(futures):
                try:
                    result = future.result()
                except Exception as error:
                    case_id, variant = futures[future]
                    result = {"case_id": case_id, "variant": variant,
                              "status": "BLOCKED", "execution_completed": False,
                              "reason": f"Evaluator error ({type(error).__name__}): {error}"}
                    destination = args.output / case_id / variant
                    destination.mkdir(parents=True, exist_ok=True)
                    (destination / "result.json").write_text(json.dumps(result, indent=2))
                results.append(result)
                (args.output / "batch-results.json").write_text(json.dumps(results, indent=2))
                print(json.dumps({key: result.get(key) for key in ("case_id", "variant", "status", "mock_tool_attempts", "reason", "isolation_errors")}), flush=True)
    else:
        parser.error("select --probe or --cases")


if __name__ == "__main__":
    main()
