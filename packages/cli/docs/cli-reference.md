# CALL-E CLI Reference

This is the canonical reference for `calle` commands, options, defaults, and
parameter examples. When changing CLI commands or options, update this document
and any synchronized command guidance in the same change.

Successful command stdout is JSON except `--help`, `-h`, `--version`, and `-V`.
Some top-level or local failures may print plain stderr.

## JSON Result Envelopes

`calle mcp call`, `calle call plan`, and `calle call status` wrap the MCP tool
result in CLI metadata. Read the actionable object from
`result.structuredContent`:

```json
{
  "ok": true,
  "server_url": "https://example.test/mcp/openagent_oauth",
  "tool_name": "plan_call",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"plan_id\":\"plan_123\",\"ready_to_run\":true}"
      }
    ],
    "structuredContent": {
      "plan_id": "plan_123",
      "ready_to_run": true
    }
  }
}
```

The CLI preserves the raw MCP `content` array. When the server omits
`structuredContent` but one text block contains a JSON object, the CLI exposes
that parsed object at `result.structuredContent` as a compatibility fallback.
Plain text, invalid JSON, arrays, and scalar JSON remain content only.

`call start`, `call run`, and `call recover` return workflow envelopes. Read
the latest `get_call_run` object from `status_result.structuredContent`. When
`run_result` is present, it is the initial `run_call` acknowledgement rather
than the latest call state. See the
[MCP tool result envelope](../../../docs/mcp/openagent-oauth.md#tool-result-envelope)
for the direct protocol shape and SDK field-name differences.

## Finding Command Help

Help is available at the root, command-group, and subcommand levels:

```bash
calle --help
calle call --help
calle call plan --help
```

Use the most specific form to see that subcommand's usage, required arguments,
supported options, global options, and examples. Argument errors return
`error.code: "invalid_arguments"` and a directly runnable `help_command`, such
as `calle call plan --help`. Unknown options and options belonging to another
subcommand are rejected instead of being silently ignored.

## Commands

| Command | Purpose | Required arguments |
| --- | --- | --- |
| `calle auth login` | Start or finish brokered login and cache the token locally. | None |
| `calle auth status` | Show local token and pending login cache status. | None |
| `calle auth logout` | Remove local token, pending login, and call recovery cache files. | None |
| `calle mcp config` | Print MCP client configuration JSON. | None |
| `calle mcp tools` | List tools from the configured MCP server. | None |
| `calle mcp call <tool-name>` | Call an arbitrary MCP tool. | `<tool-name>` |
| `calle call plan` | Plan a phone call through `plan_call`. | `--to-phone`, `--goal` |
| `calle call start` | Plan and run a phone call without printing confirmation data. | `--to-phone`, `--goal` |
| `calle call run` | Run a planned phone call, then fetch status once. | `--plan-id`, `--confirm-token` |
| `calle call recover` | Safely repeat an uncertain `run_call` with its original private confirmation data. | `--recovery-id` |
| `calle call status` | Query a call run through `get_call_run`. | `--run-id` |
| `calle regions list` | Print the supported regions and languages documentation URL. | None |

`calle regions list` is local and does not require authentication or call
`plan_call`. It returns:

```json
{
  "supported_regions_and_languages_url": "https://github.com/CALLE-AI/call-e-integrations#supported-regions-and-languages"
}
```

If `plan_call` returns `ready_to_run: false`, `calle call start` exits without
calling `run_call`. The JSON error uses code `plan_not_ready` and includes the
first clarification question when available.

Call workflow failures include a `stage` of `plan_call`, `run_call`, or
`get_call_run`, plus `call_started` and `retry_safe` guidance. A `plan_call`
failure reports `call_started: false` and is safe to retry. If `run_call` may
have been accepted but no stable `run_id` was received, the CLI reports
`call_started: "unknown"`, `retry_safe: false`, an opaque `recovery_id`, and a
directly runnable `next_command`. Run that recovery command instead of starting
a new plan:

```bash
calle call recover --recovery-id <recovery_id>
```

The corresponding `plan_id` and `confirm_token` are kept in a private local
file with mode `0600`; they are not printed. Recovery reuses that exact pair and
removes the record after a stable `run_id` is returned. `auth logout` also
removes outstanding recovery records. Its JSON result reports `removed_cache`,
`removed_pending`, and `removed_call_recoveries` booleans.

If `run_call` returns a `run_id` but the first `get_call_run` query fails,
`call start`, `call run`, and `call recover` still exit successfully with
`ok: true`, `call_started: true`, the stable `run_id`,
`status_query_succeeded: false`, and a structured `status_error`. Continue with
the returned `next_command`; do not submit the call again. Server tool errors
only expose the allowlisted `error_code`, `status`, and `message` fields, along
with boolean `retry_safe` and boolean-or-`"unknown"` `call_started` guidance.

## Common Options

These options are accepted by all commands. Runtime configuration is resolved
before command dispatch; some commands only use the subset relevant to their
network requests or output.

| Option | Value | Default | Applies to | Required | Repeatable | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--help`, `-h` | Boolean | `false` | Every command level | No | No | Print help for the current root, group, or subcommand and exit. | `calle call plan --help` |
| `--version`, `-V` | Boolean | `false` | Every command level | No | No | Print the installed CLI version and exit. | `calle --version` |
| `--base-url` | URL | `https://seleven-mcp-sg.airudder.com` | All commands | No | No | Base CALL-E service URL used to derive broker, auth, MCP, and telemetry URLs unless those are set separately. | `calle mcp tools --base-url https://example.test` |
| `--broker-base-url` | URL | `--base-url` | Auth commands | No | No | Broker API base URL for browser login sessions. | `calle auth login --broker-base-url https://example.test` |
| `--server-url` | URL | `<base-url>/mcp/<channel>` | MCP and call commands, auth cache identity | No | No | Remote MCP server URL and token cache identity. | `calle mcp tools --server-url https://example.test/mcp/openagent_oauth` |
| `--auth-base-url` | URL | `--base-url` | Auth commands | No | No | OAuth authorization base URL used by brokered login. | `calle auth login --auth-base-url https://example.test` |
| `--channel` | Text | `openagent_oauth` | All commands | No | No | MCP channel used when deriving `--server-url`. Ignored when `--server-url` is set. | `calle mcp config --channel openagent_oauth` |
| `--client-name` | Text | `calle Login` | Auth commands | No | No | OAuth client display name sent during brokered login. | `calle auth login --client-name "calle Login"` |
| `--scope` | Text | `openid email profile` | Auth commands | No | No | OAuth scopes requested during brokered login. | `calle auth login --scope "openid email profile"` |
| `--cache-root` | Path | `~/.calle-mcp/cli` | All commands | No | No | Directory for token, pending login, call recovery, and telemetry cache files. `~` is expanded. | `calle auth status --cache-root ~/.calle-mcp/cli` |
| `--min-ttl-seconds` | Number | `300` | Auth login/status, MCP and call token checks | No | No | Minimum remaining token lifetime for a cached token to count as usable. | `calle auth status --min-ttl-seconds 60` |
| `--timeout-seconds` | Number | `15`; `plan_call`: `150` | Auth, MCP, and call network requests | No | No | Request timeout in seconds. An explicit value overrides the extended `plan_call` default. | `calle mcp tools --timeout-seconds 30` |
| `--poll-timeout-seconds` | Number | `300` | `auth login` | No | No | Maximum time to poll for brokered login completion. | `calle auth login --poll-timeout-seconds 600` |
| `--server-name` | Text | `calle` | `mcp config` | No | No | MCP server key used in the generated client configuration. | `calle mcp config --server-name calle` |
| `--json` | Boolean | `false` | All commands | No | No | Accepted for compatibility. Successful command stdout is already JSON except help and version output. | `calle auth status --json` |

## Auth Options

| Option | Value | Default | Applies to | Required | Repeatable | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--force-login` | Boolean | `false` | `auth login` | No | No | Start a new brokered login even when a usable cached token or pending login exists. | `calle auth login --force-login` |
| `--start-only` | Boolean | `false` | `auth login` | No | No | Create or reuse a pending login and print `login_url` without polling for completion. | `calle auth login --start-only --no-browser-open` |
| `--no-browser-open` | Boolean | `false` | `auth login` | No | No | Do not open the login URL in a browser. Useful for agents that display the URL to the user. | `calle auth login --no-browser-open` |

## MCP Options

| Option | Value | Default | Applies to | Required | Repeatable | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--args-json` | JSON object | `{}` | `mcp call` | No | No | JSON object passed as tool arguments. Required in practice for tools that need arguments. | `calle mcp call plan_call --args-json '{"user_input":"Call Alex"}'` |
| `--timezone` | IANA timezone | System timezone | `mcp call plan_call` | No | No | Adds planning timezone metadata when calling `plan_call`. | `calle mcp call plan_call --timezone Asia/Shanghai --args-json '{"user_input":"Call Alex"}'` |

## Call Options

| Option | Value | Default | Applies to | Required | Repeatable | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--to-phone` | Phone number | None | `call plan`, `call start` | Yes | Yes | Destination phone number. Provide one flag per number and do not infer country codes. | `calle call plan --to-phone +15551234567 --goal "Confirm the appointment"` |
| `--goal` | Text | None | `call plan`, `call start` | Yes | No | Call goal or instruction for `plan_call`. | `calle call start --to-phone +15551234567 --goal "Confirm the appointment"` |
| `--language` | Text | None | `call plan`, `call start` | No | No | Language hint passed to `plan_call`. Only provide when explicitly known. | `calle call plan --to-phone +15551234567 --goal "Confirm" --language English` |
| `--region` | Text | None | `call plan`, `call start` | No | No | Region hint passed to `plan_call`. Only provide when explicitly known. | `calle call plan --to-phone +15551234567 --goal "Confirm" --region US` |
| `--timezone` | IANA timezone | System timezone | `call plan`, `call start`, `call run`, `call recover`, `call status` | No | No | Adds planning timezone metadata for planning commands and localizes returned call timestamps for run/status commands. | `calle call status --run-id run_123 --timezone Asia/Shanghai` |
| `--plan-id` | Text | None | `call run` | Yes | No | Planned call ID returned by `plan_call`. Preserve exactly. | `calle call run --plan-id plan_123 --confirm-token token_123` |
| `--confirm-token` | Text | None | `call run` | Yes | No | Execution confirmation token returned by `plan_call`. Preserve exactly. | `calle call run --plan-id plan_123 --confirm-token token_123` |
| `--recovery-id` | Opaque text | None | `call recover` | Yes | No | Private-cache lookup ID returned when `run_call` has an uncertain outcome. Use only with the returned recovery command. | `calle call recover --recovery-id <recovery_id>` |
| `--run-id` | Text | None | `call status` | Yes | No | Call run ID returned by `run_call` or `call start`. | `calle call status --run-id run_123` |
| `--cursor` | Text | None | `call status` | No | No | Pagination cursor for `get_call_run` activity entries. | `calle call status --run-id run_123 --cursor cursor_123` |
| `--limit` | Positive integer | None | `call status` | No | No | Maximum number of activity entries to request. | `calle call status --run-id run_123 --limit 20` |

## Telemetry Options

The CLI sends best-effort usage telemetry for setup, auth, and MCP readiness
diagnostics. Telemetry does not include phone numbers, call goals, OAuth tokens,
broker login URLs, full argument JSON, transcripts, or contact data.

| Option | Value | Default | Applies to | Required | Repeatable | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--no-telemetry` | Boolean | `false` | All commands | No | No | Disable CLI telemetry for the invocation. | `calle mcp tools --no-telemetry` |
| `--telemetry` | Boolean | Environment/default | All commands | No | No | Enable telemetry when set, or disable it with `--telemetry=false`. `--no-telemetry` takes precedence. | `calle auth status --telemetry=false` |
| `--telemetry-url` | URL | `<base-url>/api/ui-telemetry/track` | All commands | No | No | Override the telemetry endpoint. `CALLE_TELEMETRY_URL` is also supported. | `calle auth status --telemetry-url https://example.test/track` |
| `--telemetry-timeout-seconds` | Number | `1.5` | All commands | No | No | Timeout for telemetry requests. Minimum effective timeout is 250 ms. | `calle auth status --telemetry-timeout-seconds 1` |

Telemetry can also be disabled with `DO_NOT_TRACK=1` or `CALLE_TELEMETRY=0`.
