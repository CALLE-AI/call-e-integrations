<div align="center">

# CALL-E 📞

**The voice layer for AI agents.**

Your agent can think, plan, and write. CALL-E picks up the phone — booking appointments, calling businesses, following up, waiting on hold, and reporting the result back to you.

**Less thinking. More doing. CALL-E handles the calls.**

[Website](https://www.heycall-e.com/) · [Try on OpenClaw](https://clawhub.ai/call-e-dev/phone-call-calle) · [Quick install](#-quick-install) · [Docs](#-developer-docs) · [Discord](https://discord.gg/6AbXUzUV8w)

![npm](https://img.shields.io/npm/v/@call-e/cli?label=%40call-e%2Fcli)
![Codex](https://img.shields.io/badge/Codex-CALL--E-black)
![OpenClaw](https://img.shields.io/badge/OpenClaw-ClawHub-purple)
![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)

</div>

> [!IMPORTANT]
> CALL-E can place real outbound phone calls. Integrations must **plan first**, preserve returned `plan_id` / `confirm_token` exactly, and only run a planned call when the user clearly intends to place that call.

## ✨ Ask an agent to install CALL-E

For most users, the simplest path is to ask your agent to install the published CALL-E phone-call skill/plugin for its own environment.

Copy this into Codex, OpenClaw, or another local agent that can run shell commands:

```text
Install the published CALL-E phone-call skill/plugin for this agent environment.

Use the native release path when available:
- OpenClaw: run `openclaw skills install phone-call-calle`.
- Codex: add the CALL-E plugin marketplace from `CALLE-AI/call-e-integrations` using the official Codex command in this README.
- CLI users: install `@call-e/cli`, then run `calle auth login`.
- MCP-only clients: use Streamable HTTP with `https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth`.

After install or MCP configuration, authenticate with CALL-E, verify `plan_call`, `run_call`, and `get_call_run`, and never print OAuth tokens.
```

## 🚀 Quick install

Choose the surface your agent uses.

New users get 20 free calls to get started.

### Codex

Add the released CALL-E marketplace from this repository:

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@latest' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

Then open Codex → `/plugins` → choose the `CALL-E` marketplace → install `CALL-E` → invoke:

```text
$calle
```

### OpenClaw

Install the published ClawHub skill:

```bash
openclaw skills install phone-call-calle
```

Then start a new OpenClaw session and use **Phone Call - CALL-E**.

### CLI

Install the shared `calle` command:

```bash
npm install -g @call-e/cli
calle auth login
calle auth status
calle mcp tools
```

One-off usage without a global install:

```bash
npx -y @call-e/cli --help
```

### MCP

For MCP-capable clients, configure a Streamable HTTP server:

```text
Transport: Streamable HTTP
URL:       https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

Then complete the client OAuth flow and verify the available tools include `plan_call`, `run_call`, and `get_call_run`.

<details>
<summary><strong>Install notes</strong></summary>

- Codex marketplace install requires `codex-cli >= 0.122.0`; check with `codex --version`.
- The Codex plugin uses the repository-local CLI when available, then a global `calle`, then `npx -y @call-e/cli`.
- For reproducible Codex installs, replace `@call-e/codex-plugin@latest` with a package-level release tag such as `@call-e/codex-plugin@<version>`.
- Optional pre-auth for CLI-based agent installs: `npx -y @call-e/cli auth login`.
- OpenClaw user installs should use ClawHub: `openclaw skills install phone-call-calle`.
- This repository keeps the OpenClaw skill source at `packages/openclaw-cli-skill/skills/phone-call-calle` for local development and validation.

Install guides: [CLI](./docs/install/cli.md) · [Codex](./docs/install/codex-plugin.md) · [OpenClaw source](./docs/install/openclaw-cli-skill.md)

</details>

## 🧠 What CALL-E gives your agent

```text
plan_call → run_call → get_call_run
```

| Capability | Surface |
| --- | --- |
| Brokered browser login | `calle auth login` |
| Private local token cache | `~/.calle-mcp/cli` |
| MCP client configuration | Streamable HTTP URL or `calle mcp config` |
| Tool discovery | `calle mcp tools` |
| Call planning | `calle call plan` or MCP `plan_call` |
| Real outbound call execution | `calle call run` or MCP `run_call` |
| Status, activity, summary, details, transcript | `calle call status` or MCP `get_call_run` |
| Agent-client UX | `$calle` in Codex; **Phone Call - CALL-E** in OpenClaw |

`plan_call` creates the call plan and returns run credentials. `run_call` starts the real outbound call. `get_call_run` returns progress and final results when available.

## ⚡ CLI command map

```bash
calle auth login
calle auth login --start-only --no-browser-open
calle auth status
calle auth logout

calle mcp config
calle mcp tools
calle mcp call plan_call --args-json '{"to_phones":["+15551234567"],"goal":"Confirm the appointment"}'

calle call plan --to-phone +15551234567 --goal "Confirm the appointment"
calle call run --plan-id <plan_id> --confirm-token <confirm_token>
calle call status --run-id <run_id>
```

Defaults used by the CLI:

```text
Base URL:      https://seleven-mcp-sg.airudder.com
MCP channel:   openagent_oauth
MCP URL:       https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
Token cache:   ~/.calle-mcp/cli
```

All command output is JSON except `--help`. Access tokens are read from the local cache and are never printed.

## 🛡️ Agent safety contract

- Real calls may contact external people or businesses.
- Always plan first.
- If the user asked to place a call, run it after planning returns a valid `plan_id` and `confirm_token`.
- If the user only asked to verify setup or draft a plan, do not place the call.
- Do not guess phone numbers, country codes, language, region, `plan_id`, `confirm_token`, or `run_id`.
- Do not print, request, or expose access tokens.

## 📦 Developer docs

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@call-e/core` | Shared runtime helpers for brokered auth, private token cache files, JSON HTTP, and MCP Streamable HTTP calls. |
| `packages/cli` | `@call-e/cli` | Shared `calle` command for auth, MCP config, tool listing, and phone-call workflow shortcuts. |
| `packages/codex-plugin` | `@call-e/codex-plugin` | Codex plugin bundle that exposes CALL-E as the `$calle` skill. |
| `packages/openclaw-cli-skill` | `@call-e/openclaw-cli-skill` | Private validation/source package for the OpenClaw skill published through ClawHub. |

```text
.agents/plugins/marketplace.json              # Codex marketplace entry
packages/codex-plugin/plugin/                 # Codex plugin source
packages/openclaw-cli-skill/skills/            # OpenClaw skill source
packages/cli/                                  # Shared calle CLI
packages/core/                                 # Shared runtime helpers
examples/                                      # Runnable MCP demos, not an SDK
```

### Stable identifiers

| Surface | Identifier | Value |
| --- | --- | --- |
| Codex marketplace | `name` | `call-e-codex` |
| Codex marketplace | display name | `CALL-E` |
| Codex plugin entry | name | `calle` |
| Codex plugin source | path | `./packages/codex-plugin/plugin` |
| OpenClaw skill | slug | `phone-call-calle` |
| OpenClaw skill | name | `Phone Call - CALL-E` |

## 🧪 Examples

Runnable MCP client demos live under [examples](./examples):

- [Standard MCP OAuth clients](./examples/mcp-oauth-client): TypeScript and Python clients for standard MCP OAuth over Streamable HTTP.
- [CALL-E broker login MCP clients](./examples/mcp-broker-client): TypeScript and Python clients for CALL-E brokered login, local token cache, and MCP HTTP calls.

These examples are runnable demos, not a CALL-E SDK or supported application API.

## 🧭 Boundaries

- The CLI is not an OAuth server and not an MCP server. It is a local wrapper over the CALL-E broker API and remote MCP HTTP endpoint.
- Codex and OpenClaw integrations intentionally reuse the shared `calle` CLI for authentication, token caching, JSON output, MCP tool discovery, and call workflow shortcuts.
- The OpenClaw route in this repository does not register OpenClaw-native tools and does not require a gateway restart from this repository.
- Future Claude, Copilot, VS Code, Gemini, Cursor, Windsurf, Zed, Cline, Roo, Continue, or other ecosystem integrations should add their own ecosystem-specific entry point instead of sharing the Codex marketplace.

See [docs/agent-integration-layout.md](./docs/agent-integration-layout.md) for layout and marketplace naming rules.

## 🔒 Telemetry / usage data

The `calle` CLI sends best-effort usage telemetry to CALL-E to diagnose installation, authentication, MCP tool availability, and early usage drop-off before a first `plan_call` reaches the server.

CLI telemetry includes an anonymous installation ID, CLI version, integration source such as `cli/cli/<version>`, `codex/codex_plugin/<version>`, or `openclaw/openclaw_cli_skill/<version>`, command stage, outcome, error type, and server host/hash. It does **not** include phone numbers, call goals, OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact data.

Disable CLI telemetry with any of:

```bash
DO_NOT_TRACK=1 calle auth status
CALLE_TELEMETRY=0 calle auth status
calle auth status --no-telemetry
```

Broker and MCP requests still create service-side security, audit, and business operation logs needed to authenticate users and run calls.

## 👩‍💻 Development

This repository uses Node `>=22`, pnpm `>=10.18.3`, Changesets, and GitHub Actions.

```bash
pnpm install
pnpm check
pnpm test
pnpm pack:dry-run
```

Package-specific checks:

```bash
pnpm --filter @call-e/core check
pnpm --filter @call-e/core test
pnpm --filter @call-e/cli check
pnpm --filter @call-e/cli test
pnpm --filter @call-e/codex-plugin check
pnpm --filter @call-e/codex-plugin test
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm run check:examples
```

For user-visible package changes, add a changeset. The release workflow publishes changed `@call-e/*` packages to npm and maintains the `@call-e/codex-plugin@latest` install alias.

## 💬 Community

- Website: [heycall-e.com](https://www.heycall-e.com/)
- OpenClaw: [Phone Call - CALL-E on ClawHub](https://clawhub.ai/call-e-dev/phone-call-calle)
- Discord: [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)
