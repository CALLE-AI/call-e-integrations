# Calle CLI verification

This guide verifies the `calle` CLI shipped by `@call-e/cli`.

## Automated checks

Run from the repository root:

```bash
pnpm --filter @call-e/cli test
pnpm --filter @call-e/cli test:unit
pnpm --filter @call-e/cli test:e2e
pnpm --filter @call-e/cli check
pnpm --filter @call-e/cli pack:dry-run
```

The default `test` script runs both unit tests and isolated E2E tests. The E2E
suite starts the real `calle` CLI process and points it at a local fake
broker/MCP HTTP server, so it verifies process boundaries, stdout/stderr,
exit codes, cache files, HTTP headers, and MCP JSON-RPC payloads without
contacting the live Seleven deployment.

For full workspace coverage:

```bash
pnpm test
pnpm check
pnpm pack:dry-run
```

## Offline smoke checks

These commands do not require a live OAuth login:

```bash
node packages/cli/bin/calle.js --help
node packages/cli/bin/calle.js mcp config --base-url https://seleven-mcp-sg.airudder.com
node packages/cli/bin/calle.js auth status --base-url https://seleven-mcp-sg.airudder.com
```

Expected results:

- `--help` lists `auth`, `mcp`, and `call` commands.
- `mcp config` prints JSON with `url` ending in `/mcp/openagent_oauth`.
- `auth status` prints JSON and does not print an access token.

## Live OAuth and MCP checks

Use a real Seleven MCP deployment only for manual or release verification.
The live verification scripts use the real `calle` CLI process, a dedicated
cache root, and a `LIVE_E2E <timestamp>` goal marker. They are intentionally
separate from default CI because they depend on live service availability,
browser login state, and test account access.

Set the target test phone number:

```bash
export CALLE_CLI_LIVE_TO_PHONE='+15551234567'
```

Run the live OAuth, MCP tools, and call planning flow without placing a phone
call:

```bash
pnpm --filter @call-e/cli verify:live
```

Run the live flow and place a real phone call immediately after planning
returns a valid `plan_id` and `confirm_token`:

```bash
pnpm --filter @call-e/cli verify:live:call
```

Before `verify:live:call` invokes `run_call`, it prints the base URL, target
phone number, plan ID, and marker for auditability.

Optional live verification environment variables:

```bash
CALLE_CLI_LIVE_BASE_URL='https://seleven-mcp-sg.airudder.com'
CALLE_CLI_LIVE_CACHE_ROOT='/tmp/calle-cli-live-e2e-cache'
CALLE_CLI_LIVE_GOAL='Verify the calle CLI live call flow.'
CALLE_CLI_LIVE_LANGUAGE='English'
CALLE_CLI_LIVE_REGION='US'
CALLE_CLI_LIVE_POLL_INTERVAL_SECONDS=5
CALLE_CLI_LIVE_POLL_TIMEOUT_SECONDS=600
CALLE_CLI_LIVE_ACCEPT_STATUSES=COMPLETED
CALLE_CLI_LIVE_CLEANUP=1
CALLE_CLI_LIVE_FORCE_LOGIN=1
```

Expected results:

- `auth login` opens a browser login URL.
- After login completes, stdout returns JSON with `status` set to `logged_in` or `cached`.
- `mcp tools` returns JSON with `ok: true` and tool entries including `plan_call`, `run_call`, and `get_call_run`.
- `verify:live` returns a `plan_id` and exits before placing a phone call.
- `verify:live:call` places a real phone call as soon as `call plan` returns a valid `plan_id` and `confirm_token`.
- After `run_call`, `verify:live:call` polls `call status` until the run reaches a terminal status or `CALLE_CLI_LIVE_POLL_TIMEOUT_SECONDS` expires.
- When the call reaches an accepted terminal status, `verify:live:call` prints the final run ID, status, message, summary, call details, activity entries, transcript, and final structured content JSON for debugging.
- By default only `COMPLETED` is treated as a passing terminal status. Other terminal statuses such as `NO_ANSWER`, `BUSY`, `DECLINED`, `FAILED`, `CANCELED`, `CANCELLED`, `VOICEMAIL`, and `EXPIRED` end polling but fail live verification unless included in `CALLE_CLI_LIVE_ACCEPT_STATUSES`.
- No access token is printed to stdout.

If `mcp tools` returns `ok: false` with `error.code: "auth_required"`, run the returned `login_command` and retry.

Live cleanup behavior:

- Local temporary files and pending login cache are cleaned up by the CLI flow.
- The dedicated live token cache is preserved by default to avoid repeated browser login.
- Set `CALLE_CLI_LIVE_CLEANUP=1` to run `auth logout` and remove the dedicated live cache root at the end.
- Remote `plan_call` and `run_call` data is not deleted by this script because no public cleanup API is available. Use dedicated test accounts, controlled test numbers, and the `LIVE_E2E` goal marker for audit and service-side cleanup.

## Live call checks

These commands can place a real phone call. Use only controlled test numbers.

Plan a call:

```bash
node packages/cli/bin/calle.js call plan \
  --base-url https://seleven-mcp-sg.airudder.com \
  --to-phone '+15551234567' \
  --goal 'Verify the calle CLI live call flow.'
```

Run the planned call:

```bash
node packages/cli/bin/calle.js call run \
  --base-url https://seleven-mcp-sg.airudder.com \
  --plan-id '<plan_id>' \
  --confirm-token '<confirm_token>'
```

Poll status:

```bash
node packages/cli/bin/calle.js call status \
  --base-url https://seleven-mcp-sg.airudder.com \
  --run-id '<run_id>'
```

Expected results:

- `call plan` returns JSON with `ok: true` and a `plan_call` result.
- `call run` returns JSON with `ok: true`, `run_id`, `run_result`, `status_result`, and `next_command`.
- `call status` returns JSON with `ok: true` and a `get_call_run` result.

## Compatibility notes

- `calle` defaults to `openagent_oauth` and `/mcp/openagent_oauth`.
- The existing OpenClaw plugin still defaults to `openagent_auth` and `/mcp/openagent_auth`.
- The `calle` CLI is not an OAuth server and not an MCP server; it is a local CLI wrapper over the existing broker API and MCP HTTP endpoint.
