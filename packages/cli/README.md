# @call-e/cli

`@call-e/cli` ships the `calle` CLI.

The `calle` CLI is not an OAuth server and not an MCP server. It is a local CLI wrapper that uses the existing Seleven MCP broker API to complete browser-based login, cache the OAuth token locally, and print MCP client configuration.

## Install

```bash
npm install -g @call-e/cli
```

## Commands

```bash
calle auth login
calle auth status
calle auth logout
calle mcp config
calle mcp tools
calle mcp call plan_call --args-json '{"to_phones":["+15551234567"],"goal":"Confirm the appointment"}'
calle call plan --to-phone +15551234567 --goal "Confirm the appointment"
calle call run --plan-id <plan_id> --confirm-token <confirm_token>
calle call status --run-id <run_id>
```

Defaults:

- Base URL: `https://seleven-mcp-sg.airudder.com`
- MCP channel: `openagent_oauth`
- MCP server URL: `<baseUrl>/mcp/openagent_oauth`
- Broker API: `<baseUrl>/api/v1/openagent-auth/*`
- Token cache: `~/.calle-mcp/cli`

`calle auth login` opens the brokered login URL, polls the broker session, exchanges the authorized session, and stores the token in a private local cache. The token is not printed to stdout.

`calle mcp config` prints a JSON MCP client config:

```bash
calle mcp config --base-url https://seleven-mcp-sg.airudder.com
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

For LLM clients that can connect to MCP directly, prefer `calle mcp config` and let the client use the MCP tool schemas. For terminal-based agents such as Codex, the `calle call ...` commands provide LLM-friendly shortcuts over the same remote MCP tools:

- `calle call plan` calls `plan_call`.
- `calle call run` calls `run_call`, then immediately calls `get_call_run` once with the returned `run_id`.
- `calle call status` calls `get_call_run`.

All command output is JSON. Access tokens are read from the local cache and are never printed.

## Options

Common options:

- `--base-url`
- `--broker-base-url`
- `--server-url`
- `--auth-base-url`
- `--channel`
- `--client-name`
- `--scope`
- `--cache-root`
- `--timeout-seconds`
- `--poll-timeout-seconds`
- `--force-login`
- `--no-browser-open`
- `--no-telemetry`
- `--json`
- `--args-json`
- `--to-phone`
- `--goal`
- `--language`
- `--region`
- `--plan-id`
- `--confirm-token`
- `--run-id`
- `--cursor`
- `--limit`

## Telemetry / Usage Data

The CLI sends best-effort usage telemetry to the configured Call-E service at `<base-url>/api/ui-telemetry/track` to help diagnose installation, authentication, MCP tool availability, and drop-off before a first `plan_call` reaches the server.

Collected fields include an anonymous installation ID stored under the CLI cache root, CLI version, integration source, command stage, outcome, error type, and server host/hash. The payload does not include phone numbers, call goals, OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact data.

Disable CLI telemetry with `DO_NOT_TRACK=1`, `CALLE_TELEMETRY=0`, or `--no-telemetry`:

```bash
CALLE_TELEMETRY=0 calle auth status
calle mcp tools --no-telemetry
```

Broker and MCP requests still create service-side security, audit, and business operation logs needed to authenticate users and run calls.

## Development

```bash
pnpm --filter @call-e/cli test
pnpm --filter @call-e/cli check
pnpm --filter @call-e/cli pack:dry-run
```

For offline smoke checks and live OAuth/MCP validation, see [docs/cli-verification.md](./docs/cli-verification.md).
