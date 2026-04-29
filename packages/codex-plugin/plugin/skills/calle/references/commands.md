# Call-E CLI commands

Use the first command form that is available in the current workspace.

Repository-local base command:

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js
```

Global base command:

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle
```

npx fallback base command:

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1
```

## Setup and readiness

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js --help
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js auth status
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js auth login
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js mcp tools
```

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle --help
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle auth status
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle auth login
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle mcp tools
```

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 --help
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 auth status
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 auth login
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 mcp tools
```

Rules:

- Treat all command output as JSON except `--help`.
- Do not print or ask for access tokens.
- If a command returns `auth_required`, run or suggest `auth login`.
- If `mcp tools` succeeds, confirm that `plan_call`, `run_call`, and
  `get_call_run` are present.
- If successful `auth login` output includes `assistant_hint.message`, use it
  to include a brief post-auth help note in the next user-facing reply after
  `mcp tools` confirms the required tools are present. Adapt the wording
  naturally to the user's language and context.
- Do not run `call run` during setup verification.
- Do not use `.mcp.json`, raw HTTP, or direct remote MCP configuration in this
  plugin version.

## Call planning

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js call plan --to-phone +15551234567 --goal "Confirm the appointment"
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle call plan --to-phone +15551234567 --goal "Confirm the appointment"
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 call plan --to-phone +15551234567 --goal "Confirm the appointment"
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
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js call run --plan-id <plan_id> --confirm-token <confirm_token>
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle call run --plan-id <plan_id> --confirm-token <confirm_token>
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 call run --plan-id <plan_id> --confirm-token <confirm_token>
```

Supported `call run` options:

- `--plan-id <id>`
- `--confirm-token <token>`

Run this command immediately after planning returns a valid `plan_id` and
`confirm_token`, when the user's request is to place a call. Preserve `plan_id`
and `confirm_token` exactly as returned by planning.

`call run` calls `run_call`, then fetches `get_call_run` once. If that status is
not terminal, continue with `call status --run-id <run_id>` until a terminal
status is returned or the user asks you to stop.

## Call status

```bash
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 node packages/cli/bin/calle.js call status --run-id <run_id>
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 calle call status --run-id <run_id>
env CALLE_SOURCE=codex CALLE_INTEGRATION=codex_plugin CALLE_INTEGRATION_VERSION=0.1.3 npx -y @call-e/cli@0.2.1 call status --run-id <run_id>
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
- Summarize status clearly without exposing tokens.
- Do not invent transcript text. If `result.transcript` is absent or empty,
  write `Not available.` in the transcript section.
