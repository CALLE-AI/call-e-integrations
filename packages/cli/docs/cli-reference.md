# CALL-E CLI Reference

This is the canonical reference for `calle` commands, options, defaults, and
parameter examples. When changing CLI commands or options, update this document
and any synchronized command guidance in the same change.

## Commands

Successful command stdout is JSON except `--help` and `-h`. Some
top-level or local failures may print plain stderr.

| Command | Purpose | Required arguments |
| --- | --- | --- |
| `calle auth login` | Start or finish brokered login and cache the token locally. | None |
| `calle auth status` | Show local token and pending login cache status. | None |
| `calle auth logout` | Remove local token and pending login cache files. | None |
| `calle mcp config` | Print MCP client configuration JSON. | None |
| `calle mcp tools` | List tools from the configured MCP server. | None |
| `calle mcp call <tool-name>` | Call an arbitrary MCP tool. | `<tool-name>` |
| `calle call plan` | Plan a phone call through `plan_call`. | `--to-phone`, `--goal` |
| `calle call start` | Plan and run a phone call without printing confirmation data. | `--to-phone`, `--goal` |
| `calle call run` | Run a planned phone call, then fetch status once. | `--plan-id`, `--confirm-token` |
| `calle call status` | Query a call run through `get_call_run`. | `--run-id` |

## Common Options

These options are accepted by all commands because runtime configuration is
resolved before command dispatch. Some commands only use the subset relevant to
their network requests or output.

| Option | Value | Default | Applies to | Required | Repeatable | Purpose | Example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--help`, `-h` | Boolean | `false` | Top-level CLI | No | No | Print help text and exit. | `calle --help` |
| `--base-url` | URL | `https://seleven-mcp-sg.airudder.com` | All commands | No | No | Base CALL-E service URL used to derive broker, auth, MCP, and telemetry URLs unless those are set separately. | `calle mcp tools --base-url https://example.test` |
| `--broker-base-url` | URL | `--base-url` | Auth commands | No | No | Broker API base URL for browser login sessions. | `calle auth login --broker-base-url https://example.test` |
| `--server-url` | URL | `<base-url>/mcp/<channel>` | MCP and call commands, auth cache identity | No | No | Remote MCP server URL and token cache identity. | `calle mcp tools --server-url https://example.test/mcp/openagent_oauth` |
| `--auth-base-url` | URL | `--base-url` | Auth commands | No | No | OAuth authorization base URL used by brokered login. | `calle auth login --auth-base-url https://example.test` |
| `--channel` | Text | `openagent_oauth` | All commands | No | No | MCP channel used when deriving `--server-url`. Ignored when `--server-url` is set. | `calle mcp config --channel openagent_oauth` |
| `--client-name` | Text | `calle Login` | Auth commands | No | No | OAuth client display name sent during brokered login. | `calle auth login --client-name "calle Login"` |
| `--scope` | Text | `openid email profile` | Auth commands | No | No | OAuth scopes requested during brokered login. | `calle auth login --scope "openid email profile"` |
| `--cache-root` | Path | `~/.calle-mcp/cli` | All commands | No | No | Directory for token, pending login, and telemetry cache files. `~` is expanded. | `calle auth status --cache-root ~/.calle-mcp/cli` |
| `--min-ttl-seconds` | Number | `300` | Auth login/status, MCP and call token checks | No | No | Minimum remaining token lifetime for a cached token to count as usable. | `calle auth status --min-ttl-seconds 60` |
| `--timeout-seconds` | Number | `15` | Auth, MCP, and call network requests | No | No | Request timeout in seconds. | `calle mcp tools --timeout-seconds 30` |
| `--poll-timeout-seconds` | Number | `300` | `auth login` | No | No | Maximum time to poll for brokered login completion. | `calle auth login --poll-timeout-seconds 600` |
| `--server-name` | Text | `calle` | `mcp config` | No | No | MCP server key used in the generated client configuration. | `calle mcp config --server-name calle` |
| `--json` | Boolean | `false` | All commands | No | No | Accepted for compatibility. Successful command stdout is already JSON except help. | `calle auth status --json` |

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
| `--timezone` | IANA timezone | System timezone | `call plan`, `call start`, `call run`, `call status` | No | No | Adds planning timezone metadata for planning commands and localizes returned call timestamps for run/status commands. | `calle call status --run-id run_123 --timezone Asia/Shanghai` |
| `--plan-id` | Text | None | `call run` | Yes | No | Planned call ID returned by `plan_call`. Preserve exactly. | `calle call run --plan-id plan_123 --confirm-token token_123` |
| `--confirm-token` | Text | None | `call run` | Yes | No | Execution confirmation token returned by `plan_call`. Preserve exactly. | `calle call run --plan-id plan_123 --confirm-token token_123` |
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
