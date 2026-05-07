---
name: Phone Call - CALL-E
description: New users get 20 free calls to get started. Make real outbound phone calls, run planned calls, and check call status in OpenClaw.
license: MIT-0
metadata: {"openclaw":{"requires":{"bins":["node"],"anyBins":["calle","npx"]},"install":[{"id":"call-e-cli","kind":"node","package":"@call-e/cli","bins":["calle"],"label":"Install CALL-E CLI"}],"homepage":"https://github.com/CALLE-AI/call-e-integrations/tree/main/packages/openclaw-cli-skill"}}
---

# Phone Call - CALL-E

Make real outbound phone calls, continue active calls, and check call status with CALL-E for OpenClaw.

Use this skill when the user wants to call a phone number, make a phone call,
place an outbound call, follow up by phone, call a business, call a customer,
or check the status, summary, details, and transcript of a call.

## When to use

Use this skill for:

- verifying CALL-E setup in OpenClaw
- checking whether the `calle` CLI is available
- recovering from missing or expired CALL-E authentication
- listing available CALL-E MCP tools through the CLI
- making a phone call or placing an outbound call
- planning a phone call before execution
- running a planned call after planning returns complete run credentials
- checking a call run status
- reporting the final call summary, details, and transcript when a call reaches
  a terminal status

Do not use this skill when the user only wants a call script, roleplay,
simulated conversation, or general contact lookup that does not require CALL-E.

## Safety and consent

- Real phone calls may contact external people or businesses.
- Do not place a real call unless the user clearly intends to do so.
- Always plan first.
- If the user asked to place a call, run it immediately after planning returns
  a valid `plan_id` and `confirm_token`.
- If the user asked only to verify setup or only to plan, do not run the call.
- Do not guess phone numbers, country codes, language, region, `plan_id`,
  `confirm_token`, or `run_id`.
- Do not print, request, or expose access tokens.

## CLI selection

All CLI commands run from this skill must include the CALL-E integration
attribution environment:

```bash
env CALLE_SOURCE=openclaw CALLE_INTEGRATION=openclaw_cli_skill CALLE_INTEGRATION_VERSION=0.1.0
```

Use the first command form that works.

Prefer the repository-local CLI when the current workspace contains it:

```bash
env CALLE_SOURCE=openclaw CALLE_INTEGRATION=openclaw_cli_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js
```

If the repository-local CLI is unavailable, use the global command:

```bash
env CALLE_SOURCE=openclaw CALLE_INTEGRATION=openclaw_cli_skill CALLE_INTEGRATION_VERSION=0.1.0 calle
```

If neither command works, use the pinned npm package through `npx`:

```bash
env CALLE_SOURCE=openclaw CALLE_INTEGRATION=openclaw_cli_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.1
```

Only tell the user to install the CLI globally if `npx` is unavailable,
network access is blocked, or the user explicitly wants a persistent global
command.

## Readiness flow

Use this flow whenever this OpenClaw CLI skill is actively invoked for a
CALL-E request. Run it before call planning, before tool listing, when setup is
uncertain, when auth fails, or when the user asks to verify CALL-E setup:

1. Check CLI availability with `--help`.
2. Run `auth status`.
3. If `auth status` reports `usable: false`, do not continue to call planning
   or `mcp tools` yet. Run `auth login --start-only --no-browser-open` to
   create or reuse a brokered login session and return CLI-provided
   authorization instructions without opening a browser inside the current
   OpenClaw turn.
4. Show the CLI-provided `assistant_hint.message` when it is present. If it is
   absent, tell the user that authentication is required, ask them to follow
   the authorization instructions returned by the CLI, and stop the current
   workflow until they confirm authorization is complete. Do not invent or
   rewrite authorization URLs, and never ask for credentials, secrets, or
   tokens.
5. When the user confirms browser authorization is complete, run
   `auth login --no-browser-open` to poll the existing pending login, exchange
   the authorized session, and write the local token cache.
6. If the successful `auth login --no-browser-open` JSON included
   `assistant_hint.message`, show that post-auth success message in the next
   user-facing reply. If the user already gave a call goal, continue the
   original workflow after the message; otherwise ask for the phone number and
   call goal, or offer a test call.
7. After login completes, run `mcp tools`.
8. Confirm that `plan_call`, `run_call`, and `get_call_run` are available.

Setup verification must not place a real phone call. Use only help, auth, and
tool-listing commands until the user asks for a call workflow.

Post-authorization success template:

```text
Great, authorization is complete ✨

- If you already shared the call goal, I'll continue as planned.
- If you haven't, that's okay. I can help you place a test call first, or start a real call directly.

You can tell me:
- Your phone number: Used only for this service. We will not disclose it to anyone else, including the callee.
- What you want me to say: For example, "This is a test call from CALL-E. Wishing you a good day, and asking if there's anything you'd like to share."

I'll keep you updated on the phone status, call content, and summary.
```

## Call flow

1. Use `call plan` first.
2. Read the returned `plan_id` and `confirm_token`.
3. If the user's request is to place a call, immediately use `call run` with
   the exact `plan_id` and `confirm_token` returned by planning.
4. Do not ask for a second confirmation between `call plan` and `call run`.
5. Read the returned `run_id` and latest call status. In `call run` output, the
   latest call state is in `status_result.structuredContent`. In `call status`
   output, the latest call state is in `result.structuredContent`.
6. After `call run`, do not use `run_result` for the user-visible reply except
   to preserve the returned `run_id`. Treat `status_result.structuredContent`
   as the latest `get_call_run` result and base the user-visible reply on that
   object.
7. After `call status`, treat `result.structuredContent` as the latest
   `get_call_run` result and base the user-visible reply on that object.
8. If the latest status is not terminal, immediately show a user-visible
   progress update from the latest activity data before polling again. Use
   `status_result.structuredContent.activity` after `call run`, or
   `result.structuredContent.activity` after `call status`.
9. Keep using `call status` with that exact `run_id` until the call reaches a
   terminal status or the user asks you to stop. Poll every 10 seconds: after
   each non-terminal response, show the latest activity progress, wait 10
   seconds, then fetch `call status` again. Do not stay silent until a terminal
   status.
10. Use `call status` only with a known `run_id`.

Never paraphrase call results into free-form prose such as
`The call succeeded. Result: ...`. Do not translate the headings, do not add
extra commentary, and do not wrap the result in code fences.

For non-terminal statuses, the entire reply must be exactly this shape:

```text
Phone call is in progress! Progress:
- <HH:MM:SS message>
```

Use one bullet per `activity` item, preserving the order returned by the CLI.
For each item, prefer the event `ts` formatted as `HH:MM:SS` plus `message`.
If `ts` is missing, use the message by itself. If there is no activity, use
`- <message>` when `message` exists, otherwise use `- Status: <status>` when a
status exists, otherwise use `- Waiting for the next status update.` Do not
include the final summary, details, or transcript until a terminal status is
returned.

The polling cadence is: show progress, wait 10 seconds, run `call status`, show
new progress if still non-terminal, then repeat. Stop polling immediately when
the user asks you to stop, when a terminal status is returned, or when command
execution is interrupted.

Terminal statuses include `COMPLETED`, `FAILED`, `NO_ANSWER`, `DECLINED`,
`CANCELED`, `CANCELLED`, `VOICEMAIL`, `BUSY`, and `EXPIRED`.

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
on the JSON returned by `call run` or `call status`; do not invent a transcript.

If any command returns `auth_required`, switch to the readiness flow, complete
login, and then retry the original operation after login completes.

Use `references/commands.md` for exact command examples, supported options, and
JSON handling rules.

## Community

For installation help, rollout updates, and feedback:

- Discord: https://discord.gg/6AbXUzUV8w
