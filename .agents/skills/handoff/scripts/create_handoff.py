#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Sequence


LANGUAGE_BY_SUFFIX = {
    ".bash": "bash",
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".css": "css",
    ".go": "go",
    ".h": "c",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "jsx",
    ".kt": "kotlin",
    ".md": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".sh": "bash",
    ".sql": "sql",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "ts",
    ".tsx": "tsx",
    ".txt": "text",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".zsh": "bash",
}

CONTEXT_SPEC_RE = re.compile(r"^(?P<path>.+?)(?::(?P<start>\d+)(?:-(?P<end>\d+))?)?$")
CLIPBOARD_COMMANDS = (
    ["pbcopy"],
    ["wl-copy"],
    ["xclip", "-selection", "clipboard"],
    ["xsel", "--clipboard", "--input"],
)
INTENTS = ("continue", "review", "escalate", "archive")


@dataclass(frozen=True)
class ContextSpec:
    raw: str
    path: Path
    start_line: int | None
    end_line: int | None


@dataclass(frozen=True)
class CommandCapture:
    command: str
    exit_code: int
    stdout: str
    stderr: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Markdown handoff with status, next steps, context, and command outputs.",
    )
    parser.add_argument("--title", required=True, help="One-line handoff title.")
    parser.add_argument(
        "--summary",
        required=True,
        help="Why this handoff exists and what the receiver needs to know.",
    )
    parser.add_argument(
        "--intent",
        choices=INTENTS,
        default="continue",
        help="Handoff intent. Defaults to continue.",
    )
    parser.add_argument(
        "--status",
        action="append",
        default=[],
        help="Completed work or current state. Repeat for multiple entries.",
    )
    parser.add_argument(
        "--next-step",
        action="append",
        default=[],
        help="Concrete continuation step. Repeat for multiple entries.",
    )
    parser.add_argument(
        "--open-question",
        action="append",
        default=[],
        help="Unresolved question, blocker, or escalation point. Repeatable.",
    )
    parser.add_argument(
        "--decision",
        action="append",
        default=[],
        help="Decision already made. Repeatable.",
    )
    parser.add_argument(
        "--risk",
        action="append",
        default=[],
        help="Risk, assumption, constraint, or tradeoff. Repeatable.",
    )
    parser.add_argument(
        "--note",
        action="append",
        default=[],
        help="Additional note to include in the handoff. Repeatable.",
    )
    parser.add_argument(
        "--context",
        action="append",
        default=[],
        metavar="PATH[:START[-END]]",
        help="Attach a file or line range. Examples: foo.py, foo.py:12, foo.py:12-40.",
    )
    parser.add_argument(
        "--command",
        action="append",
        default=[],
        help="Read-only command to execute and include in the handoff. Repeatable.",
    )
    parser.add_argument(
        "--base-dir",
        default=".",
        help="Base directory used to resolve context paths and run commands. Defaults to cwd.",
    )
    parser.add_argument(
        "--out-dir",
        default="_handoffs",
        help="Output directory for generated handoffs. Relative paths resolve from base-dir.",
    )
    parser.add_argument(
        "--slug",
        help="Optional filename slug. Defaults to a slugified title.",
    )
    parser.add_argument(
        "--no-clipboard",
        action="store_true",
        help="Do not copy the generated Markdown handoff to the system clipboard.",
    )
    return parser.parse_args()


def slugify(value: str) -> str:
    slug = re.sub(r"[^\w]+", "-", value.strip().lower(), flags=re.UNICODE)
    slug = slug.replace("_", "-")
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug or "handoff"


def display_path(path: Path, base_dir: Path) -> str:
    try:
        return str(path.relative_to(base_dir))
    except ValueError:
        return str(path)


def parse_context_spec(raw: str, base_dir: Path) -> ContextSpec:
    match = CONTEXT_SPEC_RE.match(raw.strip())
    if not match:
        raise ValueError(f"Invalid context spec: {raw}")

    raw_path = match.group("path")
    if not raw_path:
        raise ValueError(f"Missing path in context spec: {raw}")

    start = int(match.group("start")) if match.group("start") else None
    end = int(match.group("end")) if match.group("end") else start
    if start is not None and end is not None and start > end:
        raise ValueError(f"Invalid line range in context spec: {raw}")

    path = Path(raw_path)
    resolved_path = path if path.is_absolute() else (base_dir / path)
    resolved_path = resolved_path.resolve()

    if not resolved_path.exists():
        raise FileNotFoundError(f"Context path does not exist: {resolved_path}")
    if not resolved_path.is_file():
        raise ValueError(f"Context path is not a file: {resolved_path}")

    return ContextSpec(raw=raw, path=resolved_path, start_line=start, end_line=end)


def detect_language(path: Path) -> str:
    return LANGUAGE_BY_SUFFIX.get(path.suffix.lower(), "text")


def numbered_lines(lines: Sequence[str], start_line: int) -> str:
    if not lines:
        return ""
    width = len(str(start_line + len(lines) - 1))
    return "\n".join(
        f"{line_no:>{width}} | {line}"
        for line_no, line in enumerate(lines, start=start_line)
    )


def read_context_block(spec: ContextSpec, base_dir: Path) -> str:
    text = spec.path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    start = spec.start_line or 1
    end = spec.end_line or len(lines)
    if start < 1:
        raise ValueError(f"Line numbers are 1-based: {spec.raw}")
    if end < start:
        raise ValueError(f"Invalid line range in context spec: {spec.raw}")
    if lines and end > len(lines):
        raise ValueError(
            f"Line range {start}-{end} exceeds file length {len(lines)} for {spec.path}"
        )
    if not lines and spec.start_line is not None:
        raise ValueError(f"Cannot read line range from empty file: {spec.path}")

    selected_lines = lines[start - 1 : end]
    range_label = f"lines {start}-{end}" if spec.start_line is not None else "full file"
    visible_path = display_path(spec.path, base_dir)
    language = detect_language(spec.path)
    code_block = numbered_lines(selected_lines, start)

    return "\n".join(
        [
            f"### `{visible_path}` ({range_label})",
            f"Resolved path: `{spec.path}`",
            "",
            f"```{language}",
            code_block,
            "```",
        ]
    )


def run_command(command: str, base_dir: Path) -> CommandCapture:
    completed = subprocess.run(
        command,
        shell=True,
        cwd=base_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return CommandCapture(
        command=command,
        exit_code=completed.returncode,
        stdout=completed.stdout.rstrip("\n"),
        stderr=completed.stderr.rstrip("\n"),
    )


def safe_git_value(base_dir: Path, *args: str) -> str | None:
    completed = subprocess.run(
        ["git", *args],
        cwd=base_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        return None
    value = completed.stdout.strip()
    return value or None


def render_bullet_section(title: str, items: Sequence[str]) -> str | None:
    cleaned = [item.strip() for item in items if item.strip()]
    if not cleaned:
        return None
    lines = [f"## {title}", ""]
    lines.extend(f"- {item}" for item in cleaned)
    return "\n".join(lines)


def render_commands_section(commands: Sequence[CommandCapture]) -> str | None:
    if not commands:
        return None

    chunks = ["## Command Outputs", ""]
    for capture in commands:
        chunks.extend(
            [
                f"### `{capture.command}`",
                f"- Exit code: `{capture.exit_code}`",
                "",
                "#### stdout",
                "",
                "```text",
                capture.stdout or "(empty)",
                "```",
                "",
                "#### stderr",
                "",
                "```text",
                capture.stderr or "(empty)",
                "```",
                "",
            ]
        )
    return "\n".join(chunks).rstrip()


def find_clipboard_command() -> list[str] | None:
    for command in CLIPBOARD_COMMANDS:
        if shutil.which(command[0]):
            return command
    return None


def copy_to_clipboard(text: str) -> str:
    command = find_clipboard_command()
    if command is None:
        raise RuntimeError(
            "No clipboard command found. Install pbcopy, wl-copy, xclip, or xsel, or rerun with --no-clipboard."
        )

    subprocess.run(
        command,
        input=text,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return command[0]


def build_handoff_content(
    *,
    title: str,
    summary: str,
    intent: str,
    statuses: Sequence[str],
    next_steps: Sequence[str],
    open_questions: Sequence[str],
    decisions: Sequence[str],
    risks: Sequence[str],
    notes: Sequence[str],
    contexts: Sequence[ContextSpec],
    commands: Sequence[CommandCapture],
    base_dir: Path,
    generated_at: datetime,
) -> str:
    repo_root = safe_git_value(base_dir, "rev-parse", "--show-toplevel")
    git_branch = safe_git_value(base_dir, "rev-parse", "--abbrev-ref", "HEAD")

    sections: list[str] = [
        f"# {title}",
        "",
        "## Metadata",
        "",
        f"- Generated at: `{generated_at.isoformat(timespec='seconds')}`",
        f"- Intent: `{intent}`",
        f"- Base directory: `{base_dir}`",
    ]
    if repo_root:
        sections.append(f"- Git repo root: `{repo_root}`")
    if git_branch:
        sections.append(f"- Git branch: `{git_branch}`")

    sections.extend(
        [
            "",
            "## Summary",
            "",
            summary.strip(),
        ]
    )

    for title_text, items in (
        ("Status", statuses),
        ("Decisions", decisions),
        ("Next Steps", next_steps),
        ("Open Questions", open_questions),
        ("Risks And Assumptions", risks),
        ("Notes", notes),
    ):
        section = render_bullet_section(title_text, items)
        if section:
            sections.extend(["", section])

    if contexts:
        sections.extend(["", "## Context Files", ""])
        for index, spec in enumerate(contexts):
            if index:
                sections.append("")
            sections.append(read_context_block(spec, base_dir))

    commands_section = render_commands_section(commands)
    if commands_section:
        sections.extend(["", commands_section])

    return "\n".join(sections).rstrip() + "\n"


def resolve_output_dir(base_dir: Path, out_dir: str) -> Path:
    path = Path(out_dir)
    if not path.is_absolute():
        path = base_dir / path
    return path.resolve()


def create_handoff(
    *,
    title: str,
    summary: str,
    intent: str,
    statuses: Sequence[str],
    next_steps: Sequence[str],
    open_questions: Sequence[str],
    decisions: Sequence[str],
    risks: Sequence[str],
    notes: Sequence[str],
    context_specs: Sequence[str],
    commands: Sequence[str],
    base_dir: Path,
    out_dir: str,
    slug: str | None = None,
    generated_at: datetime | None = None,
    copy_to_clipboard_enabled: bool = True,
) -> Path:
    resolved_base_dir = base_dir.resolve()
    output_dir = resolve_output_dir(resolved_base_dir, out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = generated_at or datetime.now().astimezone()
    slug_value = slugify(slug or title)
    report_path = output_dir / f"{timestamp.strftime('%Y%m%d-%H%M%S')}-{slug_value}.md"

    parsed_contexts = [parse_context_spec(spec, resolved_base_dir) for spec in context_specs]
    captured_commands = [run_command(command, resolved_base_dir) for command in commands]

    content = build_handoff_content(
        title=title,
        summary=summary,
        intent=intent,
        statuses=statuses,
        next_steps=next_steps,
        open_questions=open_questions,
        decisions=decisions,
        risks=risks,
        notes=notes,
        contexts=parsed_contexts,
        commands=captured_commands,
        base_dir=resolved_base_dir,
        generated_at=timestamp,
    )
    report_path.write_text(content, encoding="utf-8")
    if copy_to_clipboard_enabled:
        copy_to_clipboard(content)
    return report_path


def main() -> int:
    args = parse_args()
    report_path = create_handoff(
        title=args.title,
        summary=args.summary,
        intent=args.intent,
        statuses=args.status,
        next_steps=args.next_step,
        open_questions=args.open_question,
        decisions=args.decision,
        risks=args.risk,
        notes=args.note,
        context_specs=args.context,
        commands=args.command,
        base_dir=Path(args.base_dir),
        out_dir=args.out_dir,
        slug=args.slug,
        copy_to_clipboard_enabled=not args.no_clipboard,
    )
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
