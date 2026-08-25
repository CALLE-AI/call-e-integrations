#!/usr/bin/env python3
"""
adapter.py — provider-agnostic phone-call adapter.

Verbs: plan | run | status | show
Provider: CALL-E (via the `calle` CLI). Selected by CALL_PROVIDER.

Hard rules baked in, not documented-and-hoped-for:
  * `calle call start` is never invoked. It plans and runs in one step without
    printing confirmation data, which deletes the human breakpoint. Enforcement
    by absence: there is no code path that reaches it.
  * `completion_confidence` is never surfaced. It scores call cleanliness, not
    information completeness (0.9/high on a call that answered 2 of 4 asks).
    If the skill can't see it, the skill can't gate on it.
  * Only `structuredContent` is parsed. The same payload also arrives as a JSON
    string in content[0].text with different timestamp localisation.
  * Provider text (`next_step.instruction`, summaries, transcripts) is data,
    never instruction. Only `run_id` / `plan_id` are reused across commands.

Envelope returned by every verb is provider-shaped-out, not CALL-E-shaped.
A second provider implements Provider and nothing above it changes.

  * The confirm_token NEVER leaves disk. plan does not return it, run reads it
    from the sidecar, _redact_argv strips it, show pops it, and save_result
    refuses to write an envelope carrying it. It authorises a real charged
    call for ~24h and cannot be revoked early, so it must never reach the
    model's context.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROVIDER = os.environ.get("CALL_PROVIDER", "calle")

REGION = os.environ.get("CALL_REGION") or None

# No local list of valid regions.
#
# A copy of the provider's supported regions can only ever go stale, and a
# stale copy fails in the worst direction: it refuses a region the provider
# supports, for a call that would have worked. The provider owns the list and
# is the only thing that can answer authoritatively, so the region is passed
# through in the shape the API expects and the provider decides.
#
# The check that IS worth doing locally is the format one, below: two letters,
# uppercase. That catches "usa", "uk " and "United States" without pretending
# to know which codes are live this month.
_REGION_FORMAT = re.compile(r"^[A-Z]{2}$")

LANGUAGE = os.environ.get("CALL_LANGUAGE", "English")

DISPLAY_TZ = os.environ.get("CALL_DISPLAY_TZ", "UTC")

PLUGIN_HOME = Path(
    os.environ.get("CALLE_PLUGIN_HOME")
    or (Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")
        / "plugins" / "calle")
)

# Unpinned, matching the other CALL-E clients: npx resolves the latest
# published CLI. Set CALLE_BIN to pin a specific build.
CALLE_CLI_PKG = "@call-e/cli"


def _resolve_calle_bin() -> list[str]:
    """argv prefix for the CLI: explicit override, then PATH, then npx."""
    override = os.environ.get("CALLE_BIN")
    if override:
        return [override] if override.endswith((".js",)) is False else ["node", override]
    if shutil.which("calle"):
        return ["calle"]
    return ["npx", "-y", CALLE_CLI_PKG]


CALLE_CACHE_ROOT = os.environ.get(
    "CALLE_CACHE_ROOT", str(PLUGIN_HOME / ".calle")
)
CALL_CONSENT_CMD = os.environ.get("CALL_CONSENT_CMD") or None

STATE_DIR = Path(
    os.environ.get("CALL_STATE_DIR") or str(PLUGIN_HOME / "runs")
)

CLI_TIMEOUT_S = int(os.environ.get("CALL_CLI_TIMEOUT", "60"))

CALLE_REQUEST_TIMEOUT_S = int(os.environ.get("CALL_REQUEST_TIMEOUT", "30"))

# Two layers: the CLI's own per-request network timeout, and the subprocess
# ceiling enforced here. The inner one must fire first or the CLI is killed
# before it can emit its structured JSON error.
if CALLE_REQUEST_TIMEOUT_S >= CLI_TIMEOUT_S:
    raise SystemExit(
        f"config error: CALL_REQUEST_TIMEOUT ({CALLE_REQUEST_TIMEOUT_S}s) must be "
        f"strictly less than CALL_CLI_TIMEOUT ({CLI_TIMEOUT_S}s). The CLI's own "
        "request timeout has to fire before the subprocess ceiling, or its "
        "structured error is lost and failures become undiagnosable."
    )
DEFAULT_MAX_WAIT_S = int(os.environ.get("CALL_MAX_WAIT", "360"))

DEFAULT_CALLER_REFERENCE = "my client"
def _package_version(default: str = "0.1.0") -> str:
    """Version from plugin.yaml, which the release process keeps in step.

    Hard-coding it here is what let `pnpm version-packages` bump package.json
    and leave this behind, failing the package check and blocking the release.
    One source, read at import, with a literal fallback for a copy of this file
    used outside the plugin directory.
    """
    manifest = Path(__file__).resolve().parent / "plugin.yaml"
    try:
        for line in manifest.read_text(encoding="utf-8").splitlines():
            if line.startswith("version:"):
                value = line.split(":", 1)[1].strip().strip("\"'")
                if value:
                    return value
    except OSError:
        pass
    return default


__version__ = _package_version()

POLL_FLOOR_S = 5
POLL_CEILING_S = 30

IDENTITY_CHECK = (
    "You are calling {name}. Ask whether you have reached {name} before "
    "asking anything else -- unless they have already named the place "
    "themselves in their greeting. If they greet you without naming it, "
    "however they phrase it, you must ask. If they name it themselves and it "
    "is {name}, that is your confirmation: thank them and go straight to your "
    "questions, and do not ask them to confirm what they have just told you. "
    "If they confirm when asked, continue. If they will not say either way, "
    "ask the questions anyway and report that identity was never confirmed. "
    "If what they name is a different place, or they say you have reached "
    "somewhere else, do not ask the questions; report what they said and end "
    "the call."
)
DISCLOSURE = (
    "If asked who is calling or whether this is a recording, say plainly that "
    "you are an AI assistant calling on behalf of my client, then continue."
)
CALLER_REFERENCE = (
    "When you say why you are calling, say you are calling on behalf of your "
    "client. Do not give their name."
)
DISCLOSURE_PERSON = (
    "Open the call by saying: \"Hi, I am an AI assistant calling on "
    "behalf of {caller}. This call is being transcribed. Have I reached "
    "{name}?\" Say all of this first, before anything else, whether or not "
    "you are asked, and say it even if nobody has spoken yet. If you reach "
    "voicemail or an answering machine, say nothing at all and end the call. "
    "After they answer, ask whether now is a good time to talk. If they say "
    "it is not a good time, apologise, end the call, and report that."
)
IDENTITY_CHECK_PERSON = (
    "You are calling {name}. Any affirmative answer to your opening question "
    "confirms their identity, and they need not repeat the name. If they say "
    "you have reached someone else, apologise, end the call, and report that. "
    "If they will not say either way, continue and report that identity was "
    "never confirmed."
)
IMPLAUSIBLE_ANSWER = (
    "If an answer cannot be the kind of thing you asked for -- a way of "
    "travelling that is not a way of travelling, a time that is not a time, "
    "a price that is not a number -- say what you heard and ask them to "
    "confirm it. Do this once for each question. If what they say is still "
    "not that kind of thing, report exactly what they said and move on."
)
PROHIBITIONS = (
    "Do not negotiate. Do not place an order, hold, or reservation. Do not "
    "agree to anything on the caller's behalf. Do not leave a voicemail; if "
    "you reach voicemail or an automated system, end the call without leaving "
    "a message. If nobody answers, end the call and report that nobody "
    "answered."
)


def _redact_argv(argv: list[str]) -> list[str]:
    """Copy of argv with the confirm-token VALUE replaced.

    The token authorises a real, charged call for ~24h and cannot be revoked.
    """
    out = list(argv)
    for i, tok in enumerate(out):
        if tok == "--confirm-token" and i + 1 < len(out):
            out[i + 1] = "<redacted>"
    return out


def _normalise_e164(phone: str) -> str:
    """Strip formatting so a consent lookup is not defeated by punctuation."""
    return "+" + re.sub(r"\D", "", phone) if phone.strip().startswith("+") \
        else re.sub(r"\D", "", phone)


def consent_configured() -> bool:
    """Whether a consent command is configured at all.

    Callers MUST branch on this before reading _has_call_consent: with no
    command configured, a False from it means nothing, and reading it as a
    refusal would block every person call on a default install.
    """
    return bool(CALL_CONSENT_CMD)


def _has_call_consent(phone: str) -> bool:
    """True only on a clean exit 0 from the configured consent command.

    Returns False when nothing is configured, which is NOT a refusal --
    see consent_configured(). Never raises.
    """
    if not CALL_CONSENT_CMD:
        return False
    try:
        proc = subprocess.run(
            shlex.split(CALL_CONSENT_CMD) + ["--phone", phone],
            capture_output=True,
            text=True,
            timeout=CLI_TIMEOUT_S,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    return proc.returncode == 0


def _validate_region(region: str | None) -> str | None:
    """Normalise a region code. Format only -- the provider owns the list."""
    if region is None:
        return None
    r = region.strip().upper()
    if not r:
        return None
    if not _REGION_FORMAT.match(r):
        raise CallAgentError(
            f"region {region!r} is not a two-letter region code. Use the "
            "ISO 3166-1 alpha-2 form -- GB rather than UK, US rather than USA "
            "-- or omit the region entirely and let the provider resolve it "
            "from the phone number."
        )
    return r


class CallAgentError(RuntimeError):
    pass


def _state_path(key: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)
    return STATE_DIR / f"{safe}.json"


def _secure_state_dir() -> None:
    """State directory owner-only, before anything is written into it.

    POSIX modes are advisory on Windows -- chmod there toggles a read-only bit
    and nothing more. The protection is real on Linux and macOS; on Windows it
    is best-effort and the directory inherits its ACL from the parent.
    """
    STATE_DIR.mkdir(parents=True, mode=0o700, exist_ok=True)
    try:
        STATE_DIR.chmod(0o700)
    except OSError:
        pass


def save_state(key: str, data: dict) -> None:
    # The plan sidecar holds the confirm_token, which authorises a charged call
    # for about a day and cannot be revoked. So the mode is set AT CREATION,
    # not after: a chmod that follows the write leaves a window in which the
    # file exists under the process umask. The temporary name is unique per
    # call and opened O_EXCL, so a pre-existing file or symlink at that path
    # is an error rather than a target to follow.
    _secure_state_dir()
    p = _state_path(key)
    fd, tmp_name = tempfile.mkstemp(
        dir=str(STATE_DIR), prefix=f".{p.stem}.", suffix=".tmp"
    )
    tmp = Path(tmp_name)
    try:
        # os.fdopen takes ownership of the descriptor, so closing the wrapper
        # closes it exactly once. Windows will not rename a file that still
        # has an open handle, and leaving the mkstemp descriptor open here is
        # what made this fail there while passing on POSIX.
        with os.fdopen(fd, "w") as handle:
            handle.write(json.dumps(data, indent=2))
        # chmod on the path, not fchmod on the descriptor: fchmod does not
        # exist on Windows. Still before the rename, so the file is never
        # readable by others at its final name.
        os.chmod(tmp, 0o600)
        os.replace(tmp, p)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    try:
        p.chmod(0o600)
    except OSError:
        pass


def _result_path(key: str) -> Path:
    """Sibling of _state_path, distinct suffix. Never the plan sidecar."""
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)
    return STATE_DIR / f"{safe}.result.json"


RESULT_KEYS = (
    "extracted_fields",
    "run_id",
    "state",
    "provider_state",
    "next_action",
    "summary",
    "evidence",
    "transcript",
    "telephony",
    "to_phones",
    "fields_requested",
    "purpose",
    "raw",
)


def _attach_extracted(envelope: dict, state: dict) -> None:
    """Parse result.summary into extracted_fields, in place.

    Keys come from the plan sidecar, not the provider payload. A plan may
    carry none, so absence is normal and must not raise. extracted_fields is
    ABSENT when nothing parses, never an empty dict -- an unparseable summary
    and a summary with no fields are different.
    """
    keys = [k for k in (state.get("field_keys") or []) if k]
    if not keys:
        return
    found = _extract_fields(envelope.get("summary"), keys)
    if found:
        envelope["extracted_fields"] = found


def _load_result(run_id: str) -> dict:
    """Read an existing result sidecar. Returns {} on anything unreadable.

    save_result never raises and that contract does not change here.
    """
    p = _result_path(run_id)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def save_result(envelope: dict) -> None:
    """Persist a TERMINAL call outcome beside its plan sidecar.

    Never raises: a failed write must not cost the caller a result they are
    holding. `raw` is kept in full because it is the only local copy once the
    provider ages the run out.
    """
    state = envelope.get("state")
    if not state or state == "in_progress":
        return
    run_id = envelope.get("run_id")
    if not run_id:
        return

    rec = {k: envelope.get(k) for k in RESULT_KEYS if k in envelope}
    rec["written_at"] = _now()

    hollow = not (rec.get("summary") or rec.get("evidence") or rec.get("transcript"))
    if hollow:
        rec["content_empty"] = True
        # A hollow terminal read must never replace a record that has
        # content. The provider deletes runs without notice and a deleted run
        # reports FAILED, so the hollow read is appended as dated evidence
        # rather than discarded.
        prior = _load_result(run_id)
        if prior and (
            prior.get("summary") or prior.get("evidence") or prior.get("transcript")
        ):
            prior.setdefault("hollow_reads", []).append(
                {
                    "read_at": rec["written_at"],
                    "state": rec.get("state"),
                    "provider_state": rec.get("provider_state"),
                    "message": (envelope.get("raw") or {}).get("message"),
                }
            )
            rec = prior

    # The envelope must never carry a spend credential. Refuse rather than
    # trust: a token written here would outlive any token-pruning pass.
    if "confirm_token" in envelope or "confirm_token" in (envelope.get("raw") or {}):
        print(
            "calle adapter: refusing to write result sidecar -- confirm_token "
            "present in envelope",
            file=sys.stderr,
        )
        return

    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        p = _result_path(run_id)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(rec, indent=2, ensure_ascii=False))
        tmp.replace(p)
        try:
            p.chmod(0o600)
        except OSError:
            pass
    except Exception as exc:
        print(f"calle adapter: result sidecar write failed: {exc}", file=sys.stderr)


def load_state(key: str) -> dict:
    p = _state_path(key)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


class Provider:
    name = "abstract"

    def plan(self, to_phones: list[str], goal: str) -> dict:
        raise NotImplementedError

    def run(self, plan_id: str, confirm_token: str) -> dict:
        raise NotImplementedError

    def status(self, run_id: str) -> dict:
        raise NotImplementedError


class CalleProvider(Provider):
    name = "calle"


    def _exec(self, subcommand: list[str], flags: list[str]) -> dict:
        """Subcommand first, flags after — reversing this yields
        `Unknown command: --flag value` with the flag and value glued into one
        token, which reads like a broken CLI rather than a bad argument order."""
        # Subcommand first, flags after. Reversing this yields
        # "Unknown command: --flag value" rather than an argument error.
        argv = (
            _resolve_calle_bin()
            + subcommand
            + ["--cache-root", CALLE_CACHE_ROOT]
            + flags
            + ["--timeout-seconds", str(CALLE_REQUEST_TIMEOUT_S)]
            + ["--no-telemetry", "--json"]
        )
        self.last_argv = _redact_argv(argv)
        env = dict(
            os.environ,
            DO_NOT_TRACK="1",
            CALLE_SOURCE="hermes",
            CALLE_INTEGRATION="hermes_plugin",
            CALLE_INTEGRATION_VERSION=__version__,
        )

        try:
            proc = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                timeout=CLI_TIMEOUT_S,
                env=env,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise CallAgentError(
                f"calle {' '.join(subcommand)} timed out after {CLI_TIMEOUT_S}s"
            ) from exc

        out = proc.stdout.strip()

        # An unrecognised command prints usage and does not mark itself as an
        # error. Detect it explicitly rather than letting a JSON decode
        # failure stand in for it.
        if out.startswith("Usage: calle"):
            raise CallAgentError(
                f"calle rejected the invocation and printed usage "
                f"(argument error, not a call failure): {' '.join(subcommand)}"
            )

        if not out:
            raise CallAgentError(
                f"calle {' '.join(subcommand)} produced no stdout "
                f"(exit {proc.returncode}): {proc.stderr.strip()[:400]}"
            )

        try:
            payload = json.loads(out)
        except json.JSONDecodeError as exc:
            raise CallAgentError(
                f"calle {' '.join(subcommand)} returned non-JSON: {out[:400]}"
            ) from exc

        if not payload.get("ok", False):
            raise CallAgentError(
                f"calle reported failure: {json.dumps(payload)[:400]}"
            )

        result = payload.get("result", {})
        if result.get("isError"):
            raise CallAgentError(
                f"provider returned isError: {json.dumps(result)[:400]}"
            )

        # structuredContent only. content[0].text carries the same payload
        # with different timestamp localisation.
        structured = result.get("structuredContent")
        if not isinstance(structured, dict):
            raise CallAgentError(
                "provider response had no structuredContent object"
            )
        return structured


    def plan(
        self,
        to_phones: list[str],
        goal: str,
        *,
        region: str | None = None,
        language: str | None = None,
    ) -> dict:
        flags: list[str] = []
        for phone in to_phones:
            flags += ["--to-phone", phone]
        flags += ["--goal", goal, "--language", language or LANGUAGE]
        # Omitted entirely when unset. An absent hint lets CALL-E resolve the
        # region from the number; a wrong one asserts the callee is somewhere
        # they are not.
        effective_region = region or REGION
        if effective_region:
            flags += ["--region", effective_region]
        return self._exec(["call", "plan"], flags)

    def run(self, plan_id: str, confirm_token: str) -> dict:
        return self._exec(
            ["call", "run"],
            [
                "--plan-id", plan_id,
                "--confirm-token", confirm_token,
                "--timezone", DISPLAY_TZ,
            ],
        )

    def status(self, run_id: str) -> dict:
        return self._exec(
            ["call", "status"], ["--run-id", run_id, "--timezone", DISPLAY_TZ]
        )


    TRANSCRIPT_LINE = re.compile(
        r"^\[(?P<ts>\d{2}:\d{2}:\d{2})\]\s+(?P<who>[A-Z]+):\s?(?P<text>.*)$"
    )
    SPEAKER_MAP = {"BOT": "agent", "USER": "callee"}

    @classmethod
    def normalize_transcript(cls, raw: str | None) -> list[dict]:
        """CALL-E ships the transcript as one newline-joined string. A second
        provider will ship something else; this is the swap surface."""
        if not raw:
            return []
        turns: list[dict] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            m = cls.TRANSCRIPT_LINE.match(line)
            if not m:
                if turns:
                    turns[-1]["text"] += " " + line
                continue
            turns.append(
                {
                    "t": m.group("ts"),
                    "speaker": cls.SPEAKER_MAP.get(
                        m.group("who"), m.group("who").lower()
                    ),
                    "text": m.group("text").strip(),
                }
            )
        return turns

    STATE_MAP = {
        "PREPARING": "in_progress",
        "RUNNING": "in_progress",
        "IN_PROGRESS": "in_progress",
        "COMPLETED": "completed",
        "FAILED": "failed",
        "CANCELLED": "cancelled",
        "EXPIRED": "expired",
    }

    @classmethod
    def to_envelope(cls, structured: dict) -> dict:
        result = structured.get("result") or {}
        extracted = result.get("extracted") or {}
        calling = extracted.get("calling") or {}
        next_step = structured.get("next_step")

        if isinstance(next_step, dict):
            action = next_step.get("action")
            poll_after = next_step.get("poll_after_seconds")
        else:
            action = None
            poll_after = None

        raw_status = (structured.get("status") or "").upper()
        # Unmapped statuses become "unknown", never raw_status.lower(): a
        # passed-through value is a state string no caller can branch on.
        # provider_state below carries the raw value.
        state = cls.STATE_MAP.get(raw_status, "unknown")

        return {
            "provider": cls.name,
            "run_id": structured.get("run_id"),
            "state": state,
            "provider_state": raw_status or None,
            "next_action": action,
            "poll_after_seconds": poll_after,
            "summary": result.get("summary"),
            "evidence": ((result.get("outcome") or {}).get("evidence") or []),
            "transcript": cls.normalize_transcript(result.get("transcript")),
            "telephony": {
                "duration_s": calling.get("duration_seconds"),
                "callee_count": calling.get("callee_count"),
                "hangup_by": (calling.get("calls") or [{}])[0].get("hangup_type"),
                "started_at": (calling.get("calls") or [{}])[0].get(
                    "call_start_time"
                ),
                "ended_at": (calling.get("calls") or [{}])[0].get("call_end_time"),
            },
            "to_phones": extracted.get("to_phones") or [],
            "raw": structured,
        }


PROVIDERS: dict[str, type[Provider]] = {"calle": CalleProvider}


def get_provider() -> Provider:
    try:
        return PROVIDERS[PROVIDER]()
    except KeyError:
        raise CallAgentError(
            f"unknown CALL_PROVIDER={PROVIDER!r}; known: {sorted(PROVIDERS)}"
        )


# Script-aware: a goal may not be in English, so this must not assume [.!?].
_TERMINATORS = ".!?।॥"


_FIELD_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def _parse_field(spec: str) -> tuple[str | None, str]:
    """Split an optional "key=text" field spec into (key, text).

    Split on the FIRST "=" only, and only when what precedes it is a plain
    lowercase identifier. Anything else returns (None, spec) with the string
    intact -- a field that legitimately contains an equals sign, such as
    "is the price = list price", must not be silently turned into a key.
    """
    if "=" not in spec:
        return None, spec
    head, _, tail = spec.partition("=")
    head = head.strip()
    if not _FIELD_KEY_RE.match(head) or not tail.strip():
        return None, spec
    return head, tail.strip()


_TRAILING_NOTE = re.compile(r"[.;]\s+(?=[A-Za-z][A-Za-z0-9_]*\s*[:=])")


def _extract_fields(summary: str | None, keys: list[str]) -> dict[str, str]:
    """Recover key: value pairs from the provider's prose summary.

    Splits on the KNOWN KEY NAMES, never on punctuation. The delimiter is not
    stable: another integrator records "in_stock=partial, unit_price=5" while
    A summary reads "free_time: 6PM; meeting_location: At the office". Equals
    against colon, comma against semicolon, and nothing guarantees either.

    Keys are matched longest-first so that a key which is a prefix of another
    ("price" inside "unit_price") cannot claim the longer one's match.

    Returns {} when nothing matches. The caller decides what absence means.
    """
    if not summary or not keys:
        return {}

    ordered = sorted({k for k in keys if k}, key=len, reverse=True)
    if not ordered:
        return {}

    pattern = re.compile(
        r"\b(" + "|".join(re.escape(k) for k in ordered) + r")\s*[:=]\s*",
        re.IGNORECASE,
    )
    matches = list(pattern.finditer(summary))
    if not matches:
        return {}

    out: dict[str, str] = {}
    for i, m in enumerate(matches):
        if i + 1 < len(matches):
            end = matches[i + 1].start()
        else:
            end = len(summary)
            note = _TRAILING_NOTE.search(summary, m.end())
            if note:
                end = note.start()
        value = summary[m.end():end].strip()
        value = value.rstrip().rstrip(";,").strip()
        if value:
            out[m.group(1).lower()] = value
    return out


def _as_sentence(text: str) -> str:
    """Strip any existing terminator so exactly one can be appended.

    Not .rstrip('.') -- that is English-only and would leave a danda in
    place, producing a double terminator in scripts that use one.
    """
    return text.strip().rstrip(_TERMINATORS).strip()


def build_goal(
    purpose: str,
    fields: list[str],
    callee_type: str = "business",
    callee_name: str | None = None,
    field_keys: list[str | None] | None = None,
    caller_name: str | None = None,
) -> str:
    """Assemble the goal as clean, atomic sentences.

    Field numbering is parenthesised -- "(1)" not "1." -- because a period
    after a digit reads as a sentence boundary to anything parsing this
    text, including the provider's planner and any later diff. The list is
    one sentence so a changed field list reads as one change.
    """
    opening = _as_sentence(purpose)
    if opening:
        opening = opening[0].upper() + opening[1:]
    keys = list(field_keys or [None] * len(fields))
    keys += [None] * (len(fields) - len(keys))

    # Parenthesised "(1)", never "1." -- a period after a digit reads as a
    # sentence boundary to anything parsing this text, including the
    # provider's planner.
    numbered = "; ".join(
        f"({i}) {k} -- {_as_sentence(f)}" if k else f"({i}) {_as_sentence(f)}"
        for i, (f, k) in enumerate(zip(fields, keys), 1)
    )
    named = [k for k in keys if k]
    key_clause = (
        f"Report the answers using the key names {', '.join(named)}. "
        if named
        else ""
    )
    if callee_type == "person":
        # Order is disclosure -> identity -> purpose, and it is load-bearing.
        # Positioning the disclosure relative to an identity check lets it be
        # skipped entirely by any callee that cannot confirm, such as
        # voicemail. Purpose stays last so a wrong recipient hears only the
        # disclosure.
        return (
            f"{DISCLOSURE_PERSON.format(name=callee_name, caller=caller_name or DEFAULT_CALLER_REFERENCE)} "
            f"{IDENTITY_CHECK_PERSON.format(name=callee_name)} "
            f"{opening}. "
            f"Find out, in order: {numbered}. "
            f"{key_clause}"
            f"{IMPLAUSIBLE_ANSWER} "
            f"Report exactly what they say, including when they are unsure "
            f"or decline to answer; do not fill in gaps with assumptions. "
            f"{PROHIBITIONS}"
        )

    return (
        f"{opening}. "
        f"{IDENTITY_CHECK.format(name=callee_name)} "
        f"{CALLER_REFERENCE} "
        f"Find out, in order: {numbered}. "
        f"If an answer makes a later question pointless -- they do not stock "
        f"the item, they do not offer the service -- do not ask it, and do not "
        f"ask what the answer would have been. Report it as not applicable and "
        f"say why. That is a complete answer, not a gap. "
        f"{key_clause}"
        f"{IMPLAUSIBLE_ANSWER} "
        f"Report exactly what they say, including when they are unsure or "
        f"decline to answer; do not fill in gaps with assumptions. "
        f"{DISCLOSURE} {PROHIBITIONS}"
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


MAX_RECIPIENTS = 5


def _consent_map(phones: list[str]) -> dict[str, bool]:
    """Per-number consent, in argument order.

    Returns {} when no consent command is configured, which is the default.
    An empty map means "not checked" and must not be read as "none consented".

    Every number is looked up independently; duplicates once. A False covers
    no-consent, timeout and an unreachable command alike, so callers must not
    read one as proof that consent is absent.
    """
    if not consent_configured():
        return {}
    seen: dict[str, bool] = {}
    for raw in phones:
        p = _normalise_e164(raw)
        if p not in seen:
            seen[p] = _has_call_consent(p)
    return seen


def _check_cap(phones: list[str]) -> None:
    """Blast radius under a single approval.

    One confirm_token authorises the whole plan and in-flight calls cannot be
    cancelled, so the recipient count is the number of irrevocable actions one
    human decision commits to. Bounded locally and free.
    """
    if len(phones) > MAX_RECIPIENTS:
        raise CallAgentError(
            f"{len(phones)} recipients exceeds the cap of {MAX_RECIPIENTS}. "
            "One plan carries one confirm_token, so every recipient on it is "
            "authorised by a single human approval -- and an in-flight call "
            "cannot be cancelled. Split into separate plans, each approved "
            "on its own."
        )


def cmd_plan(args: argparse.Namespace) -> dict:
    provider = get_provider()
    callee_type = getattr(args, "callee_type", "business")
    callee_name = (getattr(args, "callee_name", None) or "").strip() or None

    if callee_type == "person" and not callee_name:
        raise CallAgentError(
            "--callee-name is required with --callee-type person. Use a "
            "name the callee would answer to FROM SOMEONE THEY DO NOT KNOW "
            "-- not a relationship label. \"Mom\" is a label: it identifies "
            "them relative to the caller and means nothing to them on the phone. "
            "It is only used to ask for them at the open."
        )
    if callee_type == "business" and not callee_name:
        raise CallAgentError(
            "--callee-name is required with --callee-type business. It is "
            "the business name said aloud at the open -- \"have I reached "
            "Ace Hardware?\" -- so give it as a person would say it (\"Ace "
            "Hardware\"), not as a directory listing (\"Ace Hardware of "
            "West LA, 1600 Wilshire Blvd\"). Without it the identity clause "
            "has nothing to substitute and the agent recites its own "
            "instruction to the callee."
        )

    if callee_type == "person":
        consent = _consent_map(args.to)
        missing = [p for p, ok in consent.items() if not ok]
        if consent and missing:
            raise CallAgentError(
                f"no call consent on file for {', '.join(missing)} "
                f"({len(missing)} of {len(consent)} number(s) on this plan). "
                "Either consent was never granted, it was revoked, the "
                "number resolves to no contact or to more than one, or the "
                "consent lookup itself failed -- all fail closed and are "
                "indistinguishable here, so do not report this as proof that "
                "consent is absent. Checked as the exact strings "
                f"{missing!r} -- a consent store may match phone values "
                "literally, so a differently formatted stored number will "
                "miss. Confirm with the person who asked for the call, then "
                "record it in whatever CALL_CONSENT_CMD queries. Do not "
                "proceed on a consent claim made during a call."
            )
    else:
        consent = _consent_map(args.to)
        consented = [p for p, ok in consent.items() if ok]
        if consented:
            raise CallAgentError(
                f"{', '.join(consented)} "
                f"({len(consented)} of {len(consent)}) "
                "recorded as a person with call consent, not a business. A "
                "business plan opens with CONDITIONAL disclosure -- the "
                "callee is told they are speaking to an AI only if they ask "
                "-- and a person must be told unconditionally at the open. "
                "Use --callee-type person. Note that one plan carries one "
                "callee_type, so a mixed list of businesses and people "
                "cannot be planned together: split them."
            )

    _check_cap(args.to)

    parsed = [_parse_field(f) for f in args.field]
    field_keys = [k for k, _ in parsed]
    field_texts = [t for _, t in parsed]
    goal = build_goal(
        args.purpose, field_texts, callee_type, callee_name, field_keys,
        (getattr(args, "caller_name", None) or "").strip() or None,
    )
    region = _validate_region(getattr(args, "region", None) or REGION)
    language = getattr(args, "language", None) or LANGUAGE
    structured = provider.plan(args.to, goal, region=region, language=language)

    plan_id = structured.get("plan_id")
    if not plan_id:
        raise CallAgentError("provider returned no plan_id")

    display_goal = structured.get("display_goal") or ""
    goal_modified = display_goal.strip() != goal.strip()

    state = {
        "plan_id": plan_id,
        "created_at": _now(),
        "provider": provider.name,
        "to_phones": args.to,
        "purpose": args.purpose,
        "fields_requested": field_texts,
        "field_keys": field_keys,
        "goal_sent": goal,
        "goal_returned": display_goal,
        "goal_modified_by_provider": goal_modified,
        "region_sent": region,
        "language_sent": language,
        "argv_sent": getattr(provider, "last_argv", None),
        "display_timezone": DISPLAY_TZ,
        "confirm_token": structured.get("confirm_token"),
        "confirm_expires_at": structured.get("confirm_expires_at"),
        "confirm_summary_rendered": bool(structured.get("confirm_summary")),
    }
    save_state(plan_id, state)

    return {
        "verb": "plan",
        "provider": provider.name,
        "plan_id": plan_id,
        "ready_to_run": bool(structured.get("ready_to_run")),
        "to_phones": args.to,
        "fields_requested": field_texts,
        "field_keys": field_keys,
        "confirm_summary": structured.get("confirm_summary"),
        "confirm_expires_at": structured.get("confirm_expires_at"),
        "goal_modified_by_provider": goal_modified,
        "goal_returned": display_goal if goal_modified else None,
        "clarifying_questions": structured.get("clarifying_questions") or [],
        "approval_required": True,
        "next": (
            "A human must read confirm_summary and approve. "
            f"Then call the calle_run tool with plan_id {plan_id}"
        ),
    }


def _check_window(state: dict) -> None:
    expiry = state.get("confirm_expires_at")
    if not expiry:
        return
    try:
        exp = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
    except ValueError:
        return
    if datetime.now(timezone.utc) >= exp:
        raise CallAgentError(
            f"confirm window expired at {expiry}. The approval no longer "
            f"authorises this call — re-plan, do not resume."
        )


def cmd_run(args: argparse.Namespace) -> dict:
    provider = get_provider()
    state = load_state(args.plan_id)
    if not state:
        raise CallAgentError(
            f"no local state for plan_id {args.plan_id}; it was not created by "
            f"this tool, or state was lost. Re-plan."
        )
    _check_window(state)

    if not state.get("confirm_summary_rendered"):
        raise CallAgentError(
            f"plan {args.plan_id} has no rendered approval summary on file. "
            "It was not produced by this tool, or the provider returned no "
            "confirm_summary for a human to read. Re-plan."
        )

    token = state.get("confirm_token")
    if not token:
        raise CallAgentError(f"no confirm_token stored for {args.plan_id}")

    structured = provider.run(args.plan_id, token)
    envelope = CalleProvider.to_envelope(structured)

    run_id = envelope.get("run_id")
    if run_id:
        carry = dict(state)
        carry["run_id"] = run_id
        carry["ran_at"] = _now()
        # The run-keyed copy exists so a status poll can find the plan
        # context from a run id alone. It must NOT carry the confirm_token:
        # a second copy under a second key outlives any pruning that works by
        # plan id, and the credential is live for about a day.
        run_carry = {k: v for k, v in carry.items() if k != "confirm_token"}
        save_state(run_id, run_carry)
        save_state(args.plan_id, carry)

    envelope["fields_requested"] = state.get("fields_requested", [])
    envelope["purpose"] = state.get("purpose")
    if not args.wait:
        return envelope
    return _poll(provider, run_id, state, args.max_wait)


def _poll(
    provider: Provider, run_id: str, state: dict, max_wait: int
) -> dict:
    """Bounded. Returns control rather than hanging the session."""
    deadline = time.monotonic() + max_wait
    envelope: dict[str, Any] = {}
    delay = POLL_FLOOR_S

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            envelope = envelope or {}
            envelope["state"] = envelope.get("state") or "in_progress"
            envelope["timed_out_waiting"] = True
            envelope["note"] = (
                f"stopped waiting after {max_wait}s; the call may still be "
                f"running. Poll again with calle_status, run_id {run_id}"
            )
            break

        time.sleep(min(delay, max(remaining, 0)))

        structured = provider.status(run_id)
        envelope = CalleProvider.to_envelope(structured)

        if envelope["state"] != "in_progress":
            break
        if envelope.get("next_action") == "report_result":
            break

        suggested = envelope.get("poll_after_seconds")
        delay = (
            min(max(int(suggested), POLL_FLOOR_S), POLL_CEILING_S)
            if isinstance(suggested, (int, float))
            else POLL_FLOOR_S
        )

    envelope["fields_requested"] = state.get("fields_requested", [])
    envelope["purpose"] = state.get("purpose")
    _attach_extracted(envelope, state)
    save_result(envelope)
    return envelope


def cmd_status(args: argparse.Namespace) -> dict:
    provider = get_provider()
    state = load_state(args.run_id)
    if args.wait:
        return _poll(provider, args.run_id, state, args.max_wait)

    envelope = CalleProvider.to_envelope(provider.status(args.run_id))
    envelope["fields_requested"] = state.get("fields_requested", [])
    envelope["purpose"] = state.get("purpose")
    _attach_extracted(envelope, state)
    save_result(envelope)
    return envelope


def cmd_show(args: argparse.Namespace) -> dict:
    """Read back whatever is stored locally under an id.

    An id may be a plan_id or a run_id, and a terminal outcome is written to a
    SEPARATE sidecar from the plan record. Reading only the plan record is why
    this returned nothing useful for a finished call: the outcome was on disk
    the whole time under a different name.

    Local persistence is the answer to a provider that deletes runs within
    days and reports a deleted run as failed, so this must find the outcome
    whichever id the caller happens to hold.
    """
    state = load_state(args.id) or {}
    result = _load_result(args.id)

    # A plan record carries the run it produced; follow it to that outcome.
    if not result:
        run_id = state.get("run_id")
        if run_id:
            result = _load_result(run_id)

    if not state and not result:
        raise CallAgentError(
            f"no local record for {args.id} (looked for a plan record and a "
            f"call outcome)"
        )

    state.pop("confirm_token", None)
    if not result:
        return state

    # The outcome is the answer; the plan record is context. Nesting it rather
    # than merging keeps a plan field from shadowing a result field of the same
    # name -- both records carry purpose, to_phones and fields_requested.
    merged = dict(result)
    merged.pop("confirm_token", None)
    if state:
        merged["plan"] = {
            k: v for k, v in state.items()
            if k in ("plan_id", "to_phones", "callee_name", "callee_type",
                     "purpose", "goal_returned", "field_keys", "created_at")
        }
    return merged


def main() -> int:
    p = argparse.ArgumentParser(
        prog="adapter.py",
        description="Provider-agnostic phone-call adapter. plan -> approve -> run.",
    )
    p.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    sub = p.add_subparsers(dest="verb", required=True)

    sp = sub.add_parser("plan", help="Build a call. Does not dial. Free.")
    sp.add_argument("--to", action="append", required=True, metavar="E164")
    sp.add_argument("--purpose", required=True)
    sp.add_argument(
        "--field",
        action="append",
        required=True,
        help=(
            "A single fact to retrieve. Repeat. Order is asked order. "
            "Optionally 'key=text' to have the answer reported under that "
            "key, e.g. unit_price=What does it cost. The key must be a "
            "plain lowercase identifier; anything else is treated as part "
            "of the question."
        ),
    )
    sp.add_argument(
        "--region",
        default=None,
        metavar="CODE",
        help=(
            "Recipient region code (US, SG, IN, GB...). Omit to let CALL-E "
            "resolve it from the number -- that is the default and usually "
            "correct. Validated locally before any call."
        ),
    )
    sp.add_argument(
        "--language",
        default=None,
        help=f"Spoken language. Default: {LANGUAGE}. Constrained by region.",
    )
    sp.add_argument(
        "--callee-name",
        default=None,
        metavar="NAME",
        help=(
            "Who to ask for at the open. Required for BOTH callee types "
            "-- both say it out loud. Must be a name the callee would answer "
            "to from someone they do not know, never a relationship label."
        ),
    )
    sp.add_argument(
        "--caller-name",
        default=None,
        metavar="NAME",
        help=(
            "Who the call is placed on behalf of, said aloud in the opening "
            "disclosure on person calls. Optional. Omitted, the disclosure "
            f"says \"{DEFAULT_CALLER_REFERENCE}\", which is correct for "
            "every caller and names nobody."
        ),
    )
    sp.add_argument(
        "--callee-type",
        choices=("business", "person"),
        default="business",
        help=(
            "Who is being called. business (default) is the retrieval case "
            "and discloses only if asked. person discloses unconditionally "
            "at the open. A consent record is checked only when "
            "CALL_CONSENT_CMD is configured; it is not required."
        ),
    )
    sp.set_defaults(func=cmd_plan)

    sr = sub.add_parser("run", help="Place an approved call.")
    sr.add_argument("--plan-id", required=True)
    sr.add_argument("--wait", action="store_true")
    sr.add_argument("--max-wait", type=int, default=DEFAULT_MAX_WAIT_S)
    sr.set_defaults(func=cmd_run)

    ss = sub.add_parser("status", help="Poll a run.")
    ss.add_argument("--run-id", required=True)
    ss.add_argument("--wait", action="store_true")
    ss.add_argument("--max-wait", type=int, default=DEFAULT_MAX_WAIT_S)
    ss.set_defaults(func=cmd_status)

    sh = sub.add_parser("show", help="Local state for a plan or run.")
    sh.add_argument("id")
    sh.set_defaults(func=cmd_show)

    args = p.parse_args()
    try:
        print(json.dumps(args.func(args), indent=2))
        return 0
    except CallAgentError as exc:
        print(json.dumps({"error": str(exc), "verb": args.verb}, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
