"""CALL-E tools for Hermes.

Five tools over the adapter: auth, plan, run, status, show.

The agent never sees the `calle` CLI, and never learns `call plan`,
`call run` or `call start`. It calls these tools; the adapter builds the
goal, invokes the CLI and persists the outcome. That indirection is what
keeps the plan/run split meaningful -- an agent that knew the CLI could
dial in one step regardless of what any instruction says.

The confirm_token never appears in a tool result. `calle_plan` returns a
summary for a human to read and approve; `calle_run` takes a plan_id and
reads the token from local state.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from typing import Any

from tools.registry import tool_error, tool_result

from . import adapter

TOOLSET = "calle"


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

def _auth_status() -> dict:
    """Local token-cache state. No network."""
    argv = adapter._resolve_calle_bin() + [
        "auth", "status",
        "--cache-root", adapter.CALLE_CACHE_ROOT,
        "--json",
    ]
    try:
        proc = subprocess.run(
            argv, capture_output=True, text=True,
            timeout=adapter.CLI_TIMEOUT_S,
            env=dict(os.environ, DO_NOT_TRACK="1"),
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"_unreachable": f"{type(exc).__name__}: {exc}"}
    out = (proc.stdout or "").strip()
    if not out:
        return {"_unreachable": (proc.stderr or "").strip()[:200] or "no output"}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"_unreachable": out[:200]}


def _check_calle_available() -> bool:
    """Gate dispatch on a usable token.

    `usable`, not `cache_exists`: a cache can exist and be expired.

    A bare bool cannot explain WHICH state failed, so the handlers below
    re-read the status and return a specific message. This only decides
    whether a tool dispatches at all.
    """
    try:
        return bool(_auth_status().get("usable"))
    except Exception:
        return False


def _auth_problem() -> str:
    """Human-facing reason the tools are unavailable.

    Never returns cache_path or expires_at. The path discloses where the
    bearer token lives and the expiry is not the agent's business; both
    would end up in a transcript.
    """
    st = _auth_status()
    if st.get("_unreachable"):
        return tool_error(
            "The CALL-E CLI could not be run. Install Node 22+, then either "
            f"`npm i -g @call-e/cli` or leave it to npx. Detail: {st['_unreachable']}"
        )
    if st.get("usable"):
        return tool_error("Authorization is present. Retry the call.")
    if st.get("pending_exists"):
        return tool_error(
            "A CALL-E login was started but never completed. Call calle_auth "
            "to finish it.",
            next_tool="calle_auth",
        )
    if st.get("cache_exists"):
        return tool_error(
            "The CALL-E authorization has expired. Call calle_auth to sign in "
            "again.",
            next_tool="calle_auth",
        )
    return tool_error(
        "Not authorized with CALL-E yet. Call calle_auth to sign in.",
        next_tool="calle_auth",
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

CALLE_AUTH_SCHEMA = {
    "name": "calle_auth",
    "description": (
        "Sign in to CALL-E. Starts a browser authorization and returns a URL "
        "for the user to open, then exchanges it for a local token. Call with "
        "action='start' to begin, then action='poll' after the user says they "
        "have finished. Use when another calle tool reports it is not "
        "authorized."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["start", "poll", "status"],
                "description": (
                    "start: begin authorization and get a URL. "
                    "poll: exchange a completed authorization for a token. "
                    "status: report whether authorization is present."
                ),
            },
        },
        "required": ["action"],
    },
}

CALLE_PLAN_SCHEMA = {
    "name": "calle_plan",
    "description": (
        "Plan a phone call. Returns a summary for the user to read and "
        "approve. DIALS NOTHING. Always show the returned confirm_summary to "
        "the user and get their agreement before calling calle_run."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "to": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Recipient phone numbers in E.164 form, e.g. +14155550123. "
                    f"At most {adapter.MAX_RECIPIENTS}."
                ),
            },
            "purpose": {
                "type": "string",
                "description": (
                    "Why the call is being made, in one clause, as it would be "
                    "said aloud to the callee."
                ),
            },
            "field": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Questions to ask, one per entry, in order. Optionally "
                    "'key=question text' to name the answer field, e.g. "
                    "'price=How much is it'."
                ),
            },
            "callee_type": {
                "type": "string",
                "enum": ["business", "person"],
                "description": (
                    "business: discloses that it is an AI only if asked. "
                    "person: discloses unconditionally in the opening."
                ),
            },
            "callee_name": {
                "type": "string",
                "description": (
                    "Who is being called, as they would say it themselves. A "
                    "business name or a person's real name, never a "
                    "relationship label."
                ),
            },
            "caller_name": {
                "type": "string",
                "description": (
                    "Optional. Who the call is placed on behalf of, said aloud "
                    "in the disclosure on person calls. Omitted, the callee "
                    "hears a generic reference and no name."
                ),
            },
            "region": {"type": "string"},
            "language": {"type": "string"},
        },
        "required": ["to", "purpose", "field", "callee_type", "callee_name"],
    },
}

CALLE_RUN_SCHEMA = {
    "name": "calle_run",
    "description": (
        "Place a planned call. THIS DIALS A REAL PHONE AND SPENDS CREDIT. "
        "Only call this after showing the user the confirm_summary from "
        "calle_plan and receiving their explicit approval in their own words."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "plan_id": {
                "type": "string",
                "description": "The plan_id returned by calle_plan.",
            },
            "max_wait": {
                "type": "integer",
                "description": (
                    "Seconds to wait for the call to finish before returning "
                    f"control. Default {adapter.DEFAULT_MAX_WAIT_S}. The call "
                    "continues either way; poll with calle_status."
                ),
            },
        },
        "required": ["plan_id"],
    },
}

CALLE_STATUS_SCHEMA = {
    "name": "calle_status",
    "description": (
        "Poll a call that is still running, or fetch the outcome of one that "
        "has finished."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "run_id": {"type": "string"},
            "max_wait": {"type": "integer"},
        },
        "required": ["run_id"],
    },
}

CALLE_SHOW_SCHEMA = {
    "name": "calle_show",
    "description": (
        "Read a stored plan or call outcome from local disk. Works after the "
        "provider has deleted its own copy, which happens within days."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "A plan_id or a run_id.",
            },
        },
        "required": ["id"],
    },
}


# ---------------------------------------------------------------------------
# Pre-dial approval
# ---------------------------------------------------------------------------

def _describe_call(args: dict) -> str:
    """One line naming who is about to be called, and why."""
    plan_id = str((args or {}).get("plan_id") or "").strip() or "unknown plan"
    try:
        state = adapter.load_state(plan_id) or {}
    except Exception:
        state = {}

    phones = state.get("to_phones") or []
    who = state.get("callee_name") or "an unknown callee"
    kind = state.get("callee_type") or "callee"
    purpose = state.get("purpose") or ""

    if not phones:
        return ""
    where = ", ".join(str(p) for p in phones)
    line = f"Place a real phone call to {who} ({kind}) at {where}"
    if purpose:
        line += f" to {purpose}"
    return line + "."


def pre_tool_call(tool_name: str = "", args: Any = None, **_kw):
    """Escalate calle_run to the human-approval gate.

    Returning {"action": "approve", ...} hands the call to the same gate that
    Tier-2 dangerous shell commands use. The host resolves it at the dispatch
    site and is fail-closed: a denial, a timeout, or an error in the gate all
    become a block, and the handler never runs.

    This is why the property does not depend on the skill file, which Hermes
    does not load from a plugin directory, nor on the model choosing to ask.
    A transcript that tells the agent to call someone else still arrives here.

    No rule_key is supplied deliberately. Without one the host derives the
    allowlist key from the tool name and a hash of the message below -- and
    the message names this callee, this number and this purpose. So answering
    [a]lways to one call does not authorise a call to anyone else. A generic
    reason would turn a single [a]lways into a standing permission to dial.
    """
    if tool_name != "calle_run":
        return None

    description = _describe_call(args if isinstance(args, dict) else {})
    if not description:
        # A plan whose recipients cannot be read is a plan that cannot be
        # described, and a confirmation prompt that cannot say who is about to
        # be called is not a confirmation. Block rather than ask.
        plan_id = str((args or {}).get("plan_id") or "").strip() or "(none given)"
        return {
            "action": "block",
            "message": (
                f"Refusing to dial: no local record of plan {plan_id}, so the "
                "callee and number cannot be confirmed. Re-plan with "
                "calle_plan."
            ),
        }

    return {"action": "approve", "message": description}


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

# Every attribute each adapter verb reads off its args object.
#
# The adapter is a CLI: argparse guarantees every one of these exists, with a
# default, before a verb runs. Building a Namespace by hand here removes that
# guarantee -- and a missing field does not fail before the call is placed. In
# `cmd_run` the provider is invoked first and `wait` is read afterwards, so an
# absent attribute raises AFTER a real phone has rung and been charged, and the
# handler reports failure for a call that actually happened.
#
# So the fields are declared once, per verb, and _ns fills every one of them.
# _assert_contract then checks this table against the adapter at import time,
# because a table that silently drifts is the same defect wearing a hat.
_VERB_ARGS = {
    "plan": {
        "to": None, "purpose": None, "field": None,
        "callee_type": "business", "callee_name": None, "caller_name": None,
        "region": None, "language": None,
    },
    "run": {"plan_id": None, "wait": True, "max_wait": None},
    "status": {"run_id": None, "wait": True, "max_wait": None},
    "show": {"id": None},
}


def _ns(verb: str, **kw) -> argparse.Namespace:
    """Args for an adapter verb, with every field it reads present."""
    fields = dict(_VERB_ARGS[verb])
    unknown = set(kw) - set(fields)
    if unknown:
        raise KeyError(f"{verb}: unknown args {sorted(unknown)}")
    fields.update(kw)
    return argparse.Namespace(**fields)


def _assert_contract() -> None:
    """Fail at import if the adapter reads an arg this module does not set.

    Cheap, and it turns a silent post-submission AttributeError into a loud
    failure before any tool is registered.
    """
    import ast
    import inspect

    source = inspect.getsource(adapter)
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or not node.name.startswith("cmd_"):
            continue
        verb = node.name[len("cmd_"):]
        if verb not in _VERB_ARGS:
            continue
        read = {
            child.attr
            for child in ast.walk(node)
            if isinstance(child, ast.Attribute)
            and isinstance(child.value, ast.Name)
            and child.value.id == "args"
        }
        missing = read - set(_VERB_ARGS[verb]) - {"last_argv"}
        if missing:
            raise RuntimeError(
                f"calle plugin: adapter.cmd_{verb} reads args "
                f"{sorted(missing)} that tools._VERB_ARGS does not set. "
                "Update _VERB_ARGS."
            )


_assert_contract()


def _coerce_wait(raw: Any, default: int) -> int:
    """A positive number of seconds, or the default."""
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _handle_calle_auth(args: dict, **kw) -> str:
    action = str(args.get("action") or "status").strip().lower()

    if action == "status":
        st = _auth_status()
        if st.get("_unreachable"):
            return tool_error(f"CALL-E CLI unreachable: {st['_unreachable']}")
        return tool_result({
            "authorized": bool(st.get("usable")),
            "login_pending": bool(st.get("pending_exists")),
        })

    if action not in {"start", "poll"}:
        return tool_error(f"Unknown calle_auth action: {action}")

    flags = ["--no-browser-open"]
    if action == "start":
        flags.insert(0, "--start-only")

    argv = adapter._resolve_calle_bin() + [
        "auth", "login",
        "--cache-root", adapter.CALLE_CACHE_ROOT,
    ] + flags + ["--json"]

    try:
        proc = subprocess.run(
            argv, capture_output=True, text=True,
            timeout=adapter.CLI_TIMEOUT_S,
            env=dict(os.environ, DO_NOT_TRACK="1"),
        )
    except subprocess.TimeoutExpired:
        return tool_error("CALL-E authorization timed out.")
    except OSError as exc:
        return tool_error(f"Could not run the CALL-E CLI: {exc}")

    out = (proc.stdout or "").strip()
    if not out:
        return tool_error(
            f"CALL-E authorization produced no output "
            f"(exit {proc.returncode}): {(proc.stderr or '').strip()[:200]}"
        )
    try:
        payload = json.loads(out)
    except json.JSONDecodeError:
        return tool_error(f"CALL-E authorization returned non-JSON: {out[:200]}")

    result = payload.get("result") or payload
    hint = None
    if isinstance(result, dict):
        hint = (result.get("assistant_hint") or {}).get("message")

    if action == "start":
        url = None
        if isinstance(result, dict):
            url = result.get("login_url") or result.get("pending_login_url")
        if not url:
            return tool_error(
                "CALL-E did not return a login URL. Retry, or check that the "
                "CLI can reach the network."
            )
        return tool_result({
            "login_url": url,
            "message": hint or (
                "Before we start, please complete authorization here: "
                f"{url}"
            ),
            "next": (
                "Show the user this URL and wait. Do not ask them to reply "
                "with anything from the page. When they say they are done, "
                "call calle_auth with action='poll'."
            ),
        })

    if _auth_status().get("usable"):
        return tool_result({
            "authorized": True,
            "message": hint or "Great, authorization is complete.",
        })
    return tool_error(
        hint or (
            "Authorization is not complete yet. If the user has finished in "
            "the browser, call calle_auth with action='poll' again."
        )
    )


def _handle_calle_plan(args: dict, **kw) -> str:
    if not _check_calle_available():
        return _auth_problem()

    to = args.get("to")
    if isinstance(to, str):
        to = [to]
    if not isinstance(to, list) or not to:
        return tool_error("`to` must be a non-empty list of E.164 numbers.")

    field = args.get("field")
    if isinstance(field, str):
        field = [field]
    if not isinstance(field, list) or not field:
        return tool_error("`field` must be a non-empty list of questions.")

    ns = _ns(
        "plan",
        to=[str(p).strip() for p in to],
        purpose=str(args.get("purpose") or "").strip(),
        field=[str(f) for f in field],
        callee_type=str(args.get("callee_type") or "business").strip().lower(),
        callee_name=(str(args.get("callee_name") or "").strip() or None),
        caller_name=(str(args.get("caller_name") or "").strip() or None),
        region=(str(args.get("region") or "").strip() or None),
        language=(str(args.get("language") or "").strip() or None),
    )
    try:
        envelope = adapter.cmd_plan(ns)
    except adapter.CallAgentError as exc:
        return tool_error(str(exc))
    except Exception as exc:
        return tool_error(f"calle_plan failed: {type(exc).__name__}: {exc}")

    # Recorded for the approval prompt: the gate has only the plan_id, and a
    # confirmation that cannot name the callee and the number is not a
    # confirmation of anything.
    try:
        state = adapter.load_state(envelope.get("plan_id", "")) or {}
        state.update({
            "to_phones": ns.to,
            "callee_name": ns.callee_name,
            "callee_type": ns.callee_type,
            "purpose": ns.purpose,
        })
        adapter.save_state(envelope["plan_id"], state)
    except Exception:
        pass

    envelope["next"] = (
        "Show confirm_summary to the user verbatim and ask whether to place "
        "the call. calle_run also requires a separate confirmation from the "
        "user before it will dial."
    )
    return tool_result(envelope)


def _handle_calle_run(args: dict, **kw) -> str:
    if not _check_calle_available():
        return _auth_problem()

    plan_id = str(args.get("plan_id") or "").strip()
    if not plan_id:
        return tool_error("plan_id is required. Call calle_plan first.")

    max_wait = _coerce_wait(args.get("max_wait"), adapter.DEFAULT_MAX_WAIT_S)

    # A plan is single-use. If this plan already submitted a run, poll that run
    # instead of submitting again: a second submission is a second real call to
    # the same person, and the most likely reason an agent retries is that the
    # first attempt returned something it read as a failure.
    try:
        prior = adapter.load_state(plan_id)
    except Exception:
        prior = {}
    prior_run = (prior or {}).get("run_id")
    if prior_run:
        try:
            envelope = adapter.cmd_status(
                _ns("status", run_id=prior_run, max_wait=max_wait)
            )
            envelope["note"] = (
                f"plan {plan_id} was already run as {prior_run}; reporting that "
                "call rather than placing another."
            )
            return tool_result(envelope)
        except Exception as exc:
            # Deliberately broad. A narrower clause was the original defect in
            # this handler: the expected exception type was caught and every
            # other one escaped, so the caller saw a crash rather than an
            # instruction not to re-run. On this path a crash is the worst
            # possible answer, because retrying is what it invites.
            return tool_error(
                f"plan {plan_id} was already run as {prior_run}, and its status "
                f"could not be read: {type(exc).__name__}: {exc}. DO NOT re-run "
                f"this plan -- poll calle_status or calle_show with run_id "
                f"{prior_run}.",
                run_id=prior_run,
                call_placed=True,
            )

    try:
        return tool_result(adapter.cmd_run(_ns("run", plan_id=plan_id, max_wait=max_wait)))
    except adapter.CallAgentError as exc:
        return tool_error(str(exc))
    except Exception as exc:
        # The call may already have been placed: the provider is invoked before
        # the outcome is assembled. Never phrase this so that retrying looks
        # like the remedy.
        try:
            after = adapter.load_state(plan_id) or {}
        except Exception:
            after = {}
        run_id = after.get("run_id")
        if run_id:
            return tool_error(
                f"The call was placed as run {run_id}, but reading its outcome "
                f"failed: {type(exc).__name__}: {exc}. DO NOT run this plan "
                f"again -- poll calle_status with run_id {run_id}.",
                run_id=run_id,
                call_placed=True,
            )
        return tool_error(
            f"calle_run failed before a run id was recorded: "
            f"{type(exc).__name__}: {exc}. A call may still have been placed; "
            f"check with calle_show on plan {plan_id} before retrying.",
            call_placed="unknown",
        )


def _handle_calle_status(args: dict, **kw) -> str:
    if not _check_calle_available():
        return _auth_problem()

    run_id = str(args.get("run_id") or "").strip()
    if not run_id:
        return tool_error("run_id is required.")

    ns = _ns(
        "status",
        run_id=run_id,
        max_wait=_coerce_wait(args.get("max_wait"), adapter.DEFAULT_MAX_WAIT_S),
    )
    try:
        return tool_result(adapter.cmd_status(ns))
    except adapter.CallAgentError as exc:
        return tool_error(str(exc))
    except Exception as exc:
        return tool_error(f"calle_status failed: {type(exc).__name__}: {exc}")


def _handle_calle_show(args: dict, **kw) -> str:
    ident = str(args.get("id") or "").strip()
    if not ident:
        return tool_error("id is required (a plan_id or a run_id).")
    try:
        return tool_result(adapter.cmd_show(_ns("show", id=ident)))
    except adapter.CallAgentError as exc:
        return tool_error(str(exc))
    except Exception as exc:
        return tool_error(f"calle_show failed: {type(exc).__name__}: {exc}")


# `calle_auth` and `calle_show` carry no check_fn: the first is what fixes an
# unauthorized state, and the second reads local disk and stays useful when
# the token has lapsed.
TOOLS = (
    ("calle_auth",   CALLE_AUTH_SCHEMA,   _handle_calle_auth,   None,                   "🔑"),
    ("calle_plan",   CALLE_PLAN_SCHEMA,   _handle_calle_plan,   _check_calle_available, "📋"),
    ("calle_run",    CALLE_RUN_SCHEMA,    _handle_calle_run,    _check_calle_available, "📞"),
    ("calle_status", CALLE_STATUS_SCHEMA, _handle_calle_status, _check_calle_available, "🔄"),
    ("calle_show",   CALLE_SHOW_SCHEMA,   _handle_calle_show,   None,                   "🗂"),
)
