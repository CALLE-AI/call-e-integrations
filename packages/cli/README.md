# @call-e/cli

`@call-e/cli` ships the `calle` command.

The CLI is not an OAuth server and not an MCP server. It is a local wrapper
that uses the CALL-E broker API to complete browser-based login, cache the
OAuth token locally, print MCP client configuration, and provide call workflow
shortcuts for terminal-based agents.

For install and authentication steps, see
[docs/install/cli.md](../../docs/install/cli.md).

## Quick Start

<!-- sync-with: docs/install/cli.md#plan-a-call -->

First follow [CLI entry point selection](./docs/cli-reference.md#selecting-the-cli-entry-point)
to prepare the launcher and `request.json`. Use each array below as the request's
`argv`, then run `node run-agent-command.mjs request.json` to authenticate,
inspect parameters, or plan a call:

```json
["auth", "login"]
```

```json
["call", "plan", "--help"]
```

```json
["call", "plan", "--to-phone", "+15551234567", "--goal", "Confirm the appointment"]
```

Help is available at every command level:

```json
["--help"]
```

```json
["call", "--help"]
```

```json
["call", "plan", "--help"]
```

## Commands

<!-- sync-with: docs/cli-reference.md#commands -->

```json
["--version"]
```

```json
["auth", "login"]
```

```json
["auth", "login", "--start-only", "--no-browser-open"]
```

```json
["auth", "status"]
```

```json
["auth", "logout"]
```

```json
["mcp", "config"]
```

```json
["mcp", "tools"]
```

```json
["mcp", "call", "plan_call", "--args-json", "{\"to_phones\":[\"+15551234567\"],\"goal\":\"Confirm the appointment\"}"]
```

```json
["call", "plan", "--help"]
```

```json
["call", "plan", "--to-phone", "+15551234567", "--goal", "Confirm the appointment"]
```

```json
["call", "start", "--to-phone", "+15551234567", "--goal", "Confirm the appointment"]
```

```json
["call", "run", "--plan-id", "<plan_id>", "--confirm-token", "<confirm_token>"]
```

```json
["call", "recover", "--recovery-id", "<recovery_id>"]
```

```json
["call", "status", "--run-id", "<run_id>"]
```

```json
["regions", "list"]
```

Defaults:

- Base URL: `https://seleven-mcp-sg.airudder.com`
- MCP channel: `openagent_oauth`
- MCP server URL: `<baseUrl>/mcp/openagent_oauth`
- Broker API: `<baseUrl>/api/v1/openagent-auth/*`
- Token cache: `~/.calle-mcp/cli`

`calle auth login` opens the brokered login URL, polls the broker session,
exchanges the authorized session, and stores the token in a private local cache.
The token is not printed to stdout.

`calle auth login --start-only --no-browser-open` creates or reuses a brokered
login session and returns JSON with `login_url` and `assistant_hint.message`
without polling for completion. This is intended for agent integrations that
need to show the authorization link before continuing.

`calle mcp config` prints a JSON MCP client config:

```json
["mcp", "config", "--base-url", "https://seleven-mcp-sg.airudder.com"]
```

Example output:

```json
{
  "mcpServers": {
    "calle": {
      "type": "http",
      "url": "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
    }
  }
}
```

For LLM clients that can connect to MCP directly, prefer `calle mcp config` and
let the client use the MCP tool schemas. For terminal-based agents such as
Codex, the `calle call ...` commands provide shortcuts over the same remote MCP
tools.

For agent-facing outbound calls, prefer `calle call start`. It performs
planning and execution inside one CLI invocation and does not print execution
confirmation data.

If execution may have been accepted but no `run_id` was received, the CLI
returns `retry_safe: false` with an opaque `recovery_id` and `next_argv`.
Use that array as the next request's `argv` instead of repeating `call start`;
it reuses the original confirmation context without printing it.
If only the initial status
query fails, the command still returns the accepted `run_id` and a `call status`
`next_argv` array. Use the same launcher for that status request.

Successful command stdout is JSON except help and version output. Some
top-level or local failures may print plain stderr. Access tokens are read from
the local cache and are never printed.

## Options

See [docs/cli-reference.md](./docs/cli-reference.md) for the canonical command
and option reference, including defaults, required arguments, advanced
configuration, and per-command examples.

## Telemetry / Usage Data

The CLI sends best-effort usage telemetry to the configured CALL-E service at
`<base-url>/api/ui-telemetry/track` to help diagnose installation,
authentication, MCP tool availability, and drop-off before a first `plan_call`
reaches the server.

Collected fields include an anonymous installation ID stored under the CLI
cache root, CLI version, integration source, command stage, outcome, error type,
and server host/hash. The payload does not include phone numbers, call goals,
OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact
data.

Disable CLI telemetry with `DO_NOT_TRACK=1`, `CALLE_TELEMETRY=0`, or
`--no-telemetry`:

```json
["auth", "status", "--no-telemetry"]
```

```json
["mcp", "tools", "--no-telemetry"]
```

Broker and MCP requests still create service-side security, audit, and business
operation logs needed to authenticate users and run calls.

## Development

```bash
pnpm --filter @call-e/cli test
pnpm --filter @call-e/cli check
pnpm --filter @call-e/cli pack:dry-run
```

For offline smoke checks and live OAuth/MCP validation, see
[docs/cli-verification.md](./docs/cli-verification.md).
