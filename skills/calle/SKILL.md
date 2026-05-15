---
name: calle
description: Use CALL-E from skills.sh compatible agents through the calle CLI. Use for CALL-E setup checks, authentication recovery, phone call planning, placing real outbound calls, planned call execution, call status polling, summaries, details, and transcripts.
---

# calle

Use CALL-E from skills.sh compatible agents through the shared `calle` CLI.

CALL-E can place real outbound phone calls. Always plan first, preserve returned
credentials exactly, and only run a planned call when the user clearly intends
to place that call.

## Safety

- Real calls may contact external people or businesses.
- Do not place a real call unless the user clearly intends to do so.
- Always run `call plan` before `call run`.
- If the user asked to place a call, run it immediately after planning returns
  a valid `plan_id` and `confirm_token`.
- If the user asked only to verify setup or only to plan, do not run the call.
- Do not guess phone numbers, country codes, language, region, `plan_id`,
  `confirm_token`, or `run_id`.
- Do not print, request, or expose access tokens.

## CLI Selection

All CLI commands run from this skill must include the CALL-E integration
attribution environment:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0
```

Use the first command form that works.

Prefer the repository-local CLI when the current workspace contains it:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js
```

If the repository-local CLI is unavailable, use the global command:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle
```

If neither command works, use the pinned npm package through `npx`:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2
```

Only tell the user to install the CLI globally if `npx` is unavailable,
network access is blocked, or the user explicitly wants a persistent global
command.

## Readiness Flow

Use this flow whenever this skill is actively invoked for a CALL-E request. Run
it before call planning, before tool listing, when setup is uncertain, when
auth fails, or when the user asks to verify CALL-E setup:

1. Check CLI availability with `--help`.
2. Run `auth status`.
3. If `auth status` reports `usable: false`, do not continue to call planning
   or `mcp tools` yet. Run `auth login --start-only --no-browser-open` to
   create or reuse a brokered login session and return CLI-provided
   authorization instructions without opening a browser inside the current
   agent turn.
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
Great, authorization is complete

- If you already shared the call goal, I'll continue as planned.
- If you haven't, that's okay. I can help you place a test call first, or start a real call directly.

You can tell me:
- Your phone number: Used only for this service. We will not disclose it to anyone else, including the callee.
- What you want me to say: For example, "This is a test call from CALL-E. Wishing you a good day, and asking if there's anything you'd like to share."

I'll keep you updated on the phone status, call content, and summary.
```

## Call Flow

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

If any command returns `auth_required`, switch to the readiness flow, complete
login, and then retry the original operation after login completes.

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

Use `references/commands.md` for exact command examples, supported options, and
JSON handling rules.

## Community

For installation help, rollout updates, and feedback:

- Discord: https://discord.gg/6AbXUzUV8w
