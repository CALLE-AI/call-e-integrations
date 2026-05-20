---
name: calle
description: Use CALL-E from Cursor for setup checks, authentication recovery, phone call planning, planned call execution, and call status checks.
---

# CALL-E For Cursor

Use this skill when the user wants Cursor to use CALL-E for setup checks,
authentication recovery, phone call planning, planned call execution, or call
status inspection.

This Cursor plugin is MCP-first. Prefer the Cursor MCP tools exposed by the
bundled `calle` server whenever they are available:

- `plan_call`
- `run_call`
- `get_call_run`

Use the CLI fallback only when Cursor MCP tools are unavailable or the user
explicitly asks to verify CALL-E through the CLI.

## When to use

Use this skill for:

- verifying CALL-E setup in Cursor
- checking that the `calle` MCP server is connected
- recovering from missing or expired CALL-E MCP authentication
- planning a phone call
- running a planned call after planning returns complete run credentials
- checking a call run status
- reporting the final call summary, details, and transcript when a call reaches
  a terminal status

Do not use this skill when the user only wants a call script, roleplay,
simulated conversation, or general contact lookup that does not require CALL-E.

## Safety and consent

- Real phone calls may contact external people or businesses.
- Always use plan_call before run_call.
- Only call run_call when the user clearly intends to place the call.
- Preserve plan_id and confirm_token exactly.
- If the user asked only to verify setup or only to plan, do not run the call.
- Do not guess phone numbers, country codes, language, region, plan_id,
  confirm_token, or run_id.
- Do not expose OAuth tokens, bearer tokens, authorization codes, callback URLs,
  refresh tokens, or access tokens.
- Do not configure CALL-E run_call for auto-run.

## MCP readiness

Use this flow whenever this Cursor plugin is actively invoked for a CALL-E
request. Run it before call planning, when setup is uncertain, when auth fails,
or when the user asks to verify CALL-E setup:

1. Confirm the `calle` MCP server is connected.
2. Confirm that `plan_call`, `run_call`, and `get_call_run` are available.
3. If Cursor asks to authorize the `calle` MCP server, use Cursor's MCP
   authorization flow and continue after authorization completes.
4. Never ask the user for OAuth tokens, bearer tokens, authorization codes,
   callback URLs, refresh tokens, or access tokens.
5. If the MCP server cannot be connected or authorized, use the CLI fallback.

Setup verification must not place a real phone call. Use only tool discovery,
authorization recovery, and `plan_call` when the user explicitly asks to plan.

## MCP call flow

1. Use `plan_call` first.
   If the user has not provided enough explicit fields for `plan_call`, call
   it with `user_input` set to the latest user message verbatim so CALL-E can
   ask for missing details.
2. Read the returned `plan_id` and `confirm_token`.
3. If the user's request is to place a call, immediately use `run_call` with
   the exact `plan_id` and `confirm_token` returned by planning.
4. Do not ask for a second confirmation between `plan_call` and `run_call`.
5. Read the returned `run_id`. Preserve it exactly.
6. After `run_call`, wait 60 seconds before the first `get_call_run` request
   unless the call already returned a terminal status.
7. Keep using `get_call_run` with that exact `run_id` until the call reaches a
   terminal status or the user asks you to stop. Poll every 5 to 10 seconds
   after the first status check.
8. Use `get_call_run` only with a known `run_id`.

Terminal statuses include `COMPLETED`, `FAILED`, `NO_ANSWER`, `DECLINED`,
`CANCELED`, `CANCELLED`, `VOICEMAIL`, `BUSY`, and `EXPIRED`.

For non-terminal statuses, reply with progress in this shape:

```text
Phone call is in progress! Progress:
- <HH:MM:SS message>
```

Use one bullet per `activity` item, preserving the order returned by CALL-E.
For each item, prefer the event `ts` formatted as `HH:MM:SS` plus `message`.
If `ts` is missing, use the message by itself. If there is no activity, use
`- Status: <status>` when a status exists; otherwise use
`- Waiting for the next status update.` Do not include the final summary,
details, or transcript until a terminal status is returned.

When the call reaches a terminal status, reply with the final call result,
including these sections in this order:

```text
[Status]
<status>

[Call Summary]
<post_summary or summary or message>

[Details]
Callee Number: <primary callee or Not available>
Duration: <duration or Not available>
Time: <start/end time or Not available>
Call id: <call_id or Not available>

[Transcript]
<transcript or Not available.>
```

If the user asked for extra final content, such as key takeaways or next steps,
add it after `[Transcript]` under a short heading. Base all final sections only
on the JSON returned by `run_call` or `get_call_run`; do not invent a
transcript.

## CLI fallback

All CLI commands run from this Cursor plugin must include the CALL-E integration
attribution environment:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0
```

Use the first command form that works.

Prefer the repository-local CLI when the current workspace contains it:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js
```

If the repository-local CLI is unavailable, use the global command:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle
```

If neither command works, use the npm package through `npx`:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli
```

Only tell the user to install the CLI globally if `npx` is unavailable,
network access is blocked, or the user explicitly wants a persistent global
command.

Use CLI fallback readiness commands in this order:

1. Check CLI availability with `--help`.
2. Run `auth status`.
3. If `auth status` reports `usable: false`, run blocking `auth login` and
   keep that command running until it exits.
4. After login completes, run `mcp tools`.
5. Confirm that `plan_call`, `run_call`, and `get_call_run` are available.

If a CLI command returns `auth_required`, switch to the CLI fallback readiness
flow, complete login, and then retry the original operation after login
completes.

Use `references/commands.md` for exact CLI command examples, supported options,
and JSON handling rules.
