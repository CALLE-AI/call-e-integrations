# CALL-E CLI fallback commands for Cursor

Use the first command form that is available in the current workspace.

Repository-local base command:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js
```

Global base command:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle
```

npx fallback base command:

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2
```

## Setup and readiness

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js --help
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js auth status
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js auth login
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js mcp tools
```

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle --help
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle auth status
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle auth login
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle mcp tools
```

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 --help
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 auth status
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 auth login
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 mcp tools
```

Rules:

- Treat all command output as JSON except `--help`.
- Do not print or ask for OAuth tokens, bearer tokens, authorization codes,
  callback URLs, refresh tokens, or access tokens.
- Do not expose OAuth tokens, bearer tokens, authorization codes, callback URLs,
  refresh tokens, or access tokens.
- Prefer Cursor MCP tools. Use CLI fallback only when MCP tools are unavailable
  or the user explicitly asks to verify CALL-E through the CLI.
- Always use plan_call before run_call.
- Only call run_call when the user clearly intends to place the call.
- Preserve plan_id and confirm_token exactly.
- Do not guess phone numbers, country codes, language, region, plan_id,
  confirm_token, or run_id.
- If `auth status` reports `usable: false`, do not call `mcp tools` or
  `call plan` yet. Run blocking `auth login` and keep that command running
  until it exits.
- If `mcp tools` succeeds, confirm that `plan_call`, `run_call`, and
  `get_call_run` are present.
- Do not run `call run` during setup verification.
- Do not configure CALL-E run_call for auto-run.

## Call planning

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js call plan --to-phone +15551234567 --goal "Confirm the appointment"
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle call plan --to-phone +15551234567 --goal "Confirm the appointment"
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 call plan --to-phone +15551234567 --goal "Confirm the appointment"
```

Supported `call plan` options:

- `--to-phone <phone>` repeatable
- `--goal <text>`
- `--language <language>`
- `--region <region>`
- `--timezone <iana>`

Only provide options when the value is explicitly known. Do not infer missing
phone numbers, country codes, language, or region.

If the user asks to make a call but has not provided enough explicit fields for
`call plan`, use raw `plan_call` through `mcp call` with the latest user message
verbatim as `user_input`.

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js mcp call plan_call --args-json '{"user_input":"<latest user message verbatim>"}'
```

## Planned call execution

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js call run --plan-id <plan_id> --confirm-token <confirm_token>
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle call run --plan-id <plan_id> --confirm-token <confirm_token>
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 call run --plan-id <plan_id> --confirm-token <confirm_token>
```

Supported `call run` options:

- `--plan-id <id>`
- `--confirm-token <token>`

Run this command only when the user clearly intends to place the call. Preserve
`plan_id` and `confirm_token` exactly as returned by planning.

## Call status

```bash
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 node packages/cli/bin/calle.js call status --run-id <run_id>
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 calle call status --run-id <run_id>
env CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0 npx -y @call-e/cli@0.3.2 call status --run-id <run_id>
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

For non-terminal statuses, show the latest activity before polling again:

```text
Phone call is in progress! Progress:
- <HH:MM:SS message>
```

## JSON handling

- Treat command output as JSON.
- If `ok` is false and `error.code` is `auth_required`, run or suggest
  `auth login`, then retry after login completes.
- Preserve `plan_id`, `confirm_token`, and `run_id` exactly as returned.
- Show non-terminal `activity` progress clearly without exposing tokens.
- Do not invent transcript text. If `result.transcript` is absent or empty,
  write `Not available.` in the transcript section.
