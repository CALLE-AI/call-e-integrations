# CALL-E CLI commands

Use the first command form that is available in the current workspace.

Repository-local base command:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js
```

Global base command:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle
```

npx fallback base command:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2
```

## Setup and readiness

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js --help
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js auth status
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js auth login --start-only --no-browser-open
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js auth login --no-browser-open
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js mcp tools
```

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle --help
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth status
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth login --start-only --no-browser-open
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth login --no-browser-open
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle mcp tools
```

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 --help
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 auth status
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 auth login --start-only --no-browser-open
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 auth login --no-browser-open
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 mcp tools
```

Rules:

- Treat all command output as JSON except `--help`.
- Do not print or ask for access tokens.
- Whenever this skill is actively invoked, run `auth status` before call
  planning or tool listing.
- If `auth status` reports `usable: false`, do not call `mcp tools` or
  `call plan` yet. Run `auth login --start-only --no-browser-open` to create
  or reuse a brokered login session and return CLI-provided authorization
  instructions without opening a browser inside the current agent turn.
- Show the CLI-provided `assistant_hint.message` when it is present. If it is
  absent, tell the user that authentication is required, ask them to follow the
  authorization instructions returned by the CLI, and stop the current workflow
  until they confirm authorization is complete.
- Do not invent or rewrite authorization URLs, and never ask for credentials,
  secrets, or tokens.
- When the user confirms browser authorization is complete, run
  `auth login --no-browser-open` to poll the existing pending login, exchange
  the authorized session, and write the local token cache.
- If successful `auth login --no-browser-open` output includes
  `assistant_hint.message`, show it as the post-authorization success note.
  Then continue the original call workflow if the user already gave enough
  details.
- If a command returns `auth_required`, switch back to this auth flow.
- If `mcp tools` succeeds, confirm that `plan_call`, `run_call`, and
  `get_call_run` are present.
- Do not run `call run` during setup verification.
- Do not use raw HTTP or direct remote MCP configuration in this skill.

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

## Call planning

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js call plan --to-phone +15551234567 --goal "Confirm the appointment"
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle call plan --to-phone +15551234567 --goal "Confirm the appointment"
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 call plan --to-phone +15551234567 --goal "Confirm the appointment"
```

Supported `call plan` options:

- `--to-phone <phone>` repeatable
- `--goal <text>`
- `--language <language>`
- `--region <region>`

Only provide options when the value is explicitly known. Do not infer missing
phone numbers, country codes, language, or region.

## Planned call execution

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js call run --plan-id <plan_id> --confirm-token <confirm_token>
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle call run --plan-id <plan_id> --confirm-token <confirm_token>
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 call run --plan-id <plan_id> --confirm-token <confirm_token>
```

Supported `call run` options:

- `--plan-id <id>`
- `--confirm-token <token>`

Run this command immediately after planning returns a valid `plan_id` and
`confirm_token`, when the user's request is to place a call. Preserve `plan_id`
and `confirm_token` exactly as returned by planning.

`call run` calls `run_call`, then fetches `get_call_run` once. Do not use
`run_result` for the user-visible reply except to preserve the returned
`run_id`. Treat `status_result.structuredContent` as the latest
`get_call_run` result. If that status is not terminal, show a user-visible
progress update from `status_result.structuredContent.activity` immediately,
then continue with `call status --run-id <run_id>` every 10 seconds until a
terminal status is returned or the user asks you to stop.

## Call status

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js call status --run-id <run_id>
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle call status --run-id <run_id>
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 call status --run-id <run_id>
```

Supported `call status` options:

- `--run-id <id>`
- `--cursor <cursor>`
- `--limit <number>`

Use status commands only with a known `run_id`.

Terminal statuses:

- `COMPLETED`
- `FAILED`
- `NO_ANSWER`
- `DECLINED`
- `CANCELED`
- `CANCELLED`
- `VOICEMAIL`
- `BUSY`
- `EXPIRED`

Read call data from `status_result.structuredContent` in `call run` output, or
from `result.structuredContent` in `call status` output.

Never paraphrase call results into free-form prose such as
`The call succeeded. Result: ...`. Do not translate the headings, do not add
extra commentary, and do not wrap the result in code fences.

For `call run`, base the user-visible reply on
`status_result.structuredContent`. For `call status`, base the user-visible
reply on `result.structuredContent`.

For non-terminal statuses, the entire reply must be exactly this shape:

```text
Phone call is in progress! Progress:
- <HH:MM:SS message>
```

Use one bullet per `activity` item, preserving the order returned by the CLI.
For `call run`, read activity from `status_result.structuredContent.activity`.
For `call status`, read activity from `result.structuredContent.activity`.
For each activity item, prefer the event `ts` formatted as `HH:MM:SS` plus
`message`. If `ts` is missing, use the message by itself. If there is no
activity, use `- <message>` when `message` exists, otherwise use
`- Status: <status>` when a status exists, otherwise use
`- Waiting for the next status update.` Do not wait silently for the terminal
result.

Polling cadence:

1. Show the latest non-terminal progress.
2. Wait 10 seconds.
3. Run `call status --run-id <run_id>`.
4. If the status is still non-terminal, show the new activity and repeat.
5. Stop polling when a terminal status is returned, the user asks you to stop,
   or command execution is interrupted.

For terminal statuses, include the final transcript in the user-visible reply:

```text
[Status]
<status>

[Call Summary]
<result.post_summary or result.summary or message>

[Details]
Callee Number: <result.extracted.to_phones[0] or result.extracted.calling.callee or Not available>
Duration: <result.extracted.calling.duration_seconds or Not available>
Time: <result.extracted.calling.started_at and ended_at or Not available>
Call id: <result.call_id or Not available>

[Transcript]
<result.transcript or Not available.>
```

If the user requested extra final content, add it after `[Transcript]` using a
short heading and only information present in the JSON output.

## JSON handling

- Treat command output as JSON.
- If `ok` is false and `error.code` is `auth_required`, run or suggest
  `auth login`, then retry after login completes.
- Preserve `plan_id`, `confirm_token`, and `run_id` exactly as returned.
- Show non-terminal `activity` progress clearly without exposing tokens.
- Do not invent transcript text. If `result.transcript` is absent or empty,
  write `Not available.` in the transcript section.
