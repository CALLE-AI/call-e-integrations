# CALL-E Integrations

CALL-E Integrations is a public monorepo for shipping CALL-E agent
integrations across CLI, Codex, and OpenClaw skill surfaces.

## Packages

| Path | Package | Purpose |
| --- | --- | --- |
| `packages/cli` | `@call-e/cli` | Shared `calle` CLI for brokered login, token cache management, MCP config, and call workflow shortcuts. |
| `packages/codex-plugin` | `@call-e/codex-plugin` | Codex plugin bundle that lets Codex use CALL-E through the `calle` CLI. |
| `packages/openclaw-cli-skill` | `@call-e/openclaw-cli-skill` | OpenClaw CLI skill source that teaches OpenClaw agents to use CALL-E through the `calle` CLI. |

## Install Paths

- CLI: [docs/install/cli.md](./docs/install/cli.md)
- Codex plugin: [docs/install/codex-plugin.md](./docs/install/codex-plugin.md)
- OpenClaw CLI skill: [docs/install/openclaw-cli-skill.md](./docs/install/openclaw-cli-skill.md)

For package-specific development notes, see each package README.

## Example Clients

Minimal TypeScript and Python MCP client demos live under
[examples](./examples).

- [Standard MCP OAuth clients](./examples/mcp-oauth-client)
- [CALL-E broker login MCP clients](./examples/mcp-broker-client)

These are runnable examples, not a CALL-E SDK.

## Demos

Add short GIF walkthroughs here after recording them:

| Surface | Demo |
| --- | --- |
| CLI | `docs/assets/demos/cli.gif` |
| Codex plugin | `docs/assets/demos/codex-plugin.gif` |
| OpenClaw CLI skill | `docs/assets/demos/openclaw-cli-skill.gif` |

Recommended flow: keep each GIF short, show the real tool surface, and avoid
including phone numbers, access tokens, broker login URLs, transcripts, or other
sensitive data.

## Repository Layout

```text
.agents/plugins/marketplace.json          # Codex marketplace entry
packages/codex-plugin/plugin/             # CALL-E for Codex
packages/openclaw-cli-skill/skills/        # CALL-E CLI skill for OpenClaw
packages/cli/                             # Shared calle CLI
skills/                                   # Repository-local helper skills
```

Future Claude, Copilot, VS Code, Gemini, or MCP-only integrations should add
their own ecosystem entry point instead of sharing the Codex marketplace. See
[docs/agent-integration-layout.md](./docs/agent-integration-layout.md) for the
layout and marketplace naming rules.

## Development

Install dependencies:

```bash
pnpm install
```

Run all checks and tests:

```bash
pnpm check
pnpm test
pnpm pack:dry-run
```

Run package-specific checks:

```bash
pnpm --filter @call-e/cli check
pnpm --filter @call-e/cli test
pnpm --filter @call-e/codex-plugin check
pnpm --filter @call-e/codex-plugin test
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm run check:examples
```

## Telemetry / Usage Data

The `calle` CLI sends best-effort usage telemetry to CALL-E to diagnose
installation, authentication, MCP tool availability, and early usage drop-off
before a first `plan_call` reaches the server.

CLI telemetry includes an anonymous installation ID, CLI version, integration
source such as `cli/cli/<version>` or `codex/codex_plugin/<version>`, command
stage, outcome, error type, and server host/hash. It does not include phone
numbers, call goals, OAuth tokens, broker login URLs, full argument JSON,
transcripts, or contact data.

Disable CLI telemetry with any of:

```bash
DO_NOT_TRACK=1 calle auth status
CALLE_TELEMETRY=0 calle auth status
calle auth status --no-telemetry
```

Broker and MCP requests still create service-side security, audit, and business
operation logs needed to authenticate users and run calls.

## Community

- [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)

## Release Workflow

This repository uses `pnpm`, Changesets, and GitHub Actions for releases.

- Add a changeset for user-visible package changes.
- Merge the resulting release PR.
- The release workflow publishes changed `@call-e/*` packages to npm through
  Changesets and creates package-level git tags.
- For the Codex plugin, the release workflow also maintains the
  `@call-e/codex-plugin@latest` install alias.
