<div align="center">

# CALL-E 📞

**The voice layer for AI agents.**

Your agent can think, plan, and write. CALL-E picks up the phone — booking appointments, calling businesses, following up, waiting on hold, and reporting the result back to you.

**Less thinking. More doing. CALL-E handles the calls.**

[Website](https://www.heycall-e.com/) · [Try on ClawHub](https://clawhub.ai/call-e-dev/phone-call-calle) · [Quick install](#-quick-install) · [Docs](#-developer-docs) · [Troubleshooting](#-troubleshooting) · [Discord](https://discord.gg/6AbXUzUV8w)

![npm](https://img.shields.io/npm/v/@call-e/cli?label=%40call-e%2Fcli)
![Codex](https://img.shields.io/badge/Codex-CALL--E-black)
![Claude Code](https://img.shields.io/badge/Claude%20Code-CALL--E-orange)
![Cursor](https://img.shields.io/badge/Cursor-CALL--E-blue)
![OpenClaw](https://img.shields.io/badge/OpenClaw-ClawHub-purple)
![Hermes Agent](https://img.shields.io/badge/Hermes%20Agent-ClawHub%20Prompt-green)
![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)

</div>

> [!IMPORTANT]
> CALL-E can place real outbound phone calls. Integrations must **plan first** and only start a real call when the user clearly intends to place that call. Agent-facing flows should prefer `calle call start` so execution confirmation data stays inside the CLI.

## 🚀 Quick install

For most users, the simplest path is to ask your agent to install the portable
CALL-E skill.

Copy this stable prompt into a local agent that can run shell commands or
install skills:

```text
Install CALL-E for me: https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/docs/install/CALL-E-installation-guide.md
```

The linked guide contains the install steps, so the prompt can stay unchanged
when those steps need to evolve.

New users get 20 free calls to get started.

If the prompt flow is not supported in your client, use the
[manual install guide](./docs/install/install-guide.md). It covers Codex,
Claude Code, Cursor, OpenClaw, Hermes Agent, CLI-only, and MCP-only setup.
The native Claude Code plugin path uses
`/plugin marketplace add https://github.com/CALLE-AI/call-e-integrations.git#@call-e/claude-plugin@latest`.

Install guides: [Manual](./docs/install/install-guide.md) · [CLI](./docs/install/cli.md) · [Codex](./docs/install/codex-plugin.md) · [skills.sh](./docs/install/skills-sh-skill.md) · [Claude Code](./docs/install/claude-plugin.md) · [Cursor MCP](./docs/install/cursor.md) · [Cursor plugin](./docs/install/cursor-plugin.md) · [OpenClaw source](./docs/install/openclaw-cli-skill.md)

## 🧯 Troubleshooting

If installation, authentication, or MCP tool verification fails, start with the
[CALL-E troubleshooting guide](./docs/install/troubleshooting.md).

It covers local agent environment issues such as Cursor sandbox/network
restrictions, `CONNECT tunnel failed, response 403`, `calle auth login` failures,
and verification that `plan_call`, `run_call`, and `get_call_run` are available.

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
| Real outbound call execution | `calle call start`, `calle call run`, or MCP `run_call` |
| Status, activity, summary, details, transcript | `calle call status` or MCP `get_call_run` |
| Agent-client UX | `$calle` in Codex; `calle` through skills.sh; `/calle:calle` in Claude Code; `calle` MCP/skill in Cursor; **Phone Call - CALL-E** in OpenClaw; ClawHub Prompt flow in Hermes Agent |

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
calle call start --to-phone +15551234567 --goal "Confirm the appointment"
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
- If the user asked to place a call from an agent-facing flow, prefer `calle call start` so planning and execution confirmation stay inside the CLI.
- If the user only asked to verify setup or draft a plan, do not place the call.
- Do not guess phone numbers, country codes, language, region, execution confirmation data, or `run_id`.
- Do not print, request, or expose access tokens.

## 📦 Developer docs

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@call-e/core` | Shared runtime helpers for brokered auth, private token cache files, JSON HTTP, and MCP Streamable HTTP calls. |
| `packages/cli` | `@call-e/cli` | Shared `calle` command for auth, MCP config, tool listing, and phone-call workflow shortcuts. |
| `packages/codex-plugin` | `@call-e/codex-plugin` | Codex plugin bundle that exposes CALL-E as the `$calle` skill. |
| `packages/claude-plugin` | `@call-e/claude-plugin` | Claude Code plugin bundle that exposes CALL-E through the shared CLI and `/calle:calle`. |
| `packages/cursor-plugin` | `@call-e/cursor-plugin` | Cursor plugin bundle that exposes CALL-E through MCP, a `calle` skill, and a safety rule. |
| `packages/openclaw-cli-skill` | `@call-e/openclaw-cli-skill` | Private validation/source package for the OpenClaw skill published through ClawHub. |
| `packages/skills-sh-skill` | `@call-e/skills-sh-skill` | Private validation package for the portable skills.sh `calle` skill. |

```text
.agents/plugins/marketplace.json              # Codex marketplace entry
.claude-plugin/marketplace.json               # Claude Code marketplace entry
.cursor-plugin/marketplace.json               # Cursor marketplace entry
packages/codex-plugin/plugin/                 # Codex plugin source
packages/claude-plugin/plugin/                # Claude Code plugin source
packages/cursor-plugin/plugin/                # Cursor plugin source
packages/openclaw-cli-skill/skills/            # OpenClaw skill source
skills/calle/                                  # skills.sh compatible skill source
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
| Claude Code marketplace | `name` | `call-e-claude` |
| Claude Code plugin entry | name | `calle` |
| Claude Code plugin source | path | `./packages/claude-plugin/plugin` |
| Claude Code CLI attribution | env | `claude/claude_code_plugin/<version>` |
| Cursor marketplace | `name` | `call-e-cursor` |
| Cursor plugin entry | name | `calle` |
| Cursor plugin display name | displayName | `CALL-E` |
| Cursor plugin source | path | `./packages/cursor-plugin/plugin` |
| Cursor MCP server | key | `calle` |
| Cursor CLI attribution | env | `cursor/cursor_plugin/<version>` |
| OpenClaw skill | slug | `phone-call-calle` |
| OpenClaw skill | name | `Phone Call - CALL-E` |
| skills.sh skill | name | `calle` |
| skills.sh skill source | path | `skills/calle` |
| skills.sh CLI attribution | env | `skills_sh/skills_sh_skill/<version>` |

## 🧪 Examples

Runnable MCP client demos live under [examples](./examples):

- [Standard MCP OAuth clients](./examples/mcp-oauth-client): TypeScript and Python clients for standard MCP OAuth over Streamable HTTP.
- [CALL-E broker login MCP clients](./examples/mcp-broker-client): TypeScript and Python clients for CALL-E brokered login, local token cache, and MCP HTTP calls.

These examples are runnable demos, not a CALL-E SDK or supported application API.

## 🧭 Boundaries

- The CLI is not an OAuth server and not an MCP server. It is a local wrapper over the CALL-E broker API and remote MCP HTTP endpoint.
- Codex, Claude Code, OpenClaw, skills.sh, and Hermes Agent integrations intentionally reuse the shared `calle` CLI for authentication, token caching, JSON output, MCP tool discovery, and call workflow shortcuts.
- The Cursor plugin reuses the existing remote CALL-E MCP server and does not implement a new local MCP server or backend.
- The OpenClaw route in this repository does not register OpenClaw-native tools and does not require a gateway restart from this repository.
- Hermes Agent support uses the ClawHub Prompt flow for the published OpenClaw skill; this repository does not maintain a separate Hermes plugin.
- Future Copilot, VS Code, Gemini, Windsurf, Zed, Cline, Roo, Continue, or other ecosystem integrations should add their own ecosystem-specific entry point instead of sharing the Codex, Claude Code, or Cursor marketplaces.

See [docs/agent-integration-layout.md](./docs/agent-integration-layout.md) for layout and marketplace naming rules.

## 🔒 Telemetry / usage data

The `calle` CLI sends best-effort usage telemetry to CALL-E to diagnose installation, authentication, MCP tool availability, and early usage drop-off before a first `plan_call` reaches the server.

CLI telemetry includes an anonymous installation ID, CLI version, integration source such as `cli/cli/<version>`, `codex/codex_plugin/<version>`, `claude/claude_code_plugin/<version>`, `cursor/cursor_plugin/<version>`, `openclaw/openclaw_cli_skill/<version>`, or `skills_sh/skills_sh_skill/<version>`, command stage, outcome, error type, and server host/hash. It does **not** include phone numbers, call goals, OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact data.

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
pnpm --filter @call-e/claude-plugin check
pnpm --filter @call-e/claude-plugin test
pnpm --filter @call-e/cursor-plugin check
pnpm --filter @call-e/cursor-plugin test
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm run check:examples
```

For user-visible package changes, add a changeset. The release workflow publishes changed `@call-e/*` packages to npm and maintains the `@call-e/codex-plugin@latest` and `@call-e/claude-plugin@latest` install aliases.

## 💬 Community

- Website: [heycall-e.com](https://www.heycall-e.com/)
- Discord: [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)
