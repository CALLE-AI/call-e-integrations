# CALL-E Integrations

CALL-E Integrations is a public monorepo for shipping cross-platform agent integrations.

## Packages

- `packages/openclaw-plugin`: the publishable OpenClaw plugin package for OpenAgent.
  See [packages/openclaw-plugin/README.md](./packages/openclaw-plugin/README.md) for installation screenshots, OpenClaw UI usage, and package-specific configuration.
- `packages/cli`: the publishable `@call-e/cli` package that ships the `calle` CLI for brokered login and MCP client configuration.
  See [packages/cli/README.md](./packages/cli/README.md) for CLI commands and package-specific setup.
- `packages/codex-plugin`: the Codex plugin bundle that lets Codex use the installed `calle` CLI.
  See [packages/codex-plugin/README.md](./packages/codex-plugin/README.md) for marketplace installation and local validation.
- `packages/openclaw-cli-skill`: the package-scoped OpenClaw skill source that lets OpenClaw use the installed `calle` CLI.
  See [packages/openclaw-cli-skill/README.md](./packages/openclaw-cli-skill/README.md) for skill layout and local validation.

## Agent Client Layout

This monorepo keeps client-specific marketplace entry points at the repository
root and client-specific implementations under `packages/`.

```text
.agents/plugins/marketplace.json          # Codex marketplace entry
packages/codex-plugin/plugin/             # CALL-E for Codex
packages/openclaw-cli-skill/skills/        # CALL-E CLI skill for OpenClaw
packages/cli/                             # Shared calle CLI
packages/openclaw-plugin/                 # OpenClaw plugin
skills/                                   # Repository-local skill source
```

Future Claude, Copilot, VS Code, Gemini, or MCP-only integrations should add
their own ecosystem entry point instead of sharing the Codex marketplace. For
example, a Claude-compatible marketplace can live at
`.claude-plugin/marketplace.json` once that integration is ready.

## Community

- [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run package test suites:

```bash
pnpm test
pnpm check
pnpm --filter @call-e/cli test
pnpm --filter @call-e/cli check
pnpm --filter @call-e/codex-plugin test
pnpm --filter @call-e/codex-plugin check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/openclaw-cli-skill check
```

## Telemetry / Usage Data

The `calle` CLI sends best-effort usage telemetry to CALL-E to diagnose installation, authentication, MCP tool availability, and early usage drop-off before a first `plan_call` reaches the server.

CLI telemetry includes an anonymous installation ID, CLI version, integration source such as `cli/cli/<version>` or `codex/codex_plugin/<version>`, command stage, outcome, error type, and server host/hash. It does not include phone numbers, call goals, OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact data.

Disable CLI telemetry with any of:

```bash
DO_NOT_TRACK=1 calle auth status
CALLE_TELEMETRY=0 calle auth status
calle auth status --no-telemetry
```

Broker and MCP requests still create service-side security, audit, and business operation logs needed to authenticate users and run calls.

Create a dry-run package tarball:

```bash
pnpm pack:dry-run
pnpm --filter @call-e/cli pack:dry-run
pnpm --filter @call-e/codex-plugin pack:dry-run
pnpm --filter @call-e/openclaw-cli-skill pack:dry-run
```

## Install The Codex Plugin

You do not need to install the shared CLI globally before installing the Codex
plugin. The plugin uses the repository-local CLI when available, then a global
`calle` command when available, then falls back to `npx -y @call-e/cli@0.3.1`.

To authenticate before installing the plugin, run:

```bash
npx -y @call-e/cli@0.3.1 auth login
```

The official marketplace install command requires `codex-cli >= 0.122.0`.
Check your version with `codex --version`; older Codex releases are outside the
primary support path for this command.

Then add the latest released Codex marketplace from this repository:

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@latest' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

`@call-e/codex-plugin@latest` is a Git tag updated by the release workflow after
`@call-e/codex-plugin` publishes. For a reproducible install, replace it with a
package-level release tag such as `@call-e/codex-plugin@<version>`.

Open Codex, run `/plugins`, choose the `CALL-E` marketplace, and
install `CALL-E`.

If you are pinned to a Codex CLI older than `0.122.0` and cannot use
`codex plugin marketplace add`, upgrade Codex when possible. As a manual
fallback, add the equivalent sparse payload from the same Git ref to your
workspace root:

```text
.agents/plugins/marketplace.json
packages/codex-plugin/plugin/
```

Keep those paths exactly as shown so the marketplace entry can resolve
`./packages/codex-plugin/plugin`.

For local development from a clone, restart Codex from this repository and use
the repo-local marketplace at `.agents/plugins/marketplace.json`.

## Use The OpenClaw CLI Skill

The CLI-based OpenClaw skill source lives in
`packages/openclaw-cli-skill/skills/phone-call-calle`. It is package-scoped so the
published integration source stays separate from repository-local skills under
the root `skills/` directory.

This skill uses the repository-local CLI when available, then a global `calle`
command when available, then falls back to `npx -y @call-e/cli@0.3.1`.

For local development from a clone, point OpenClaw skill loading at
`packages/openclaw-cli-skill/skills`, then start a new OpenClaw session and use
the `Phone Call - CALL-E` skill.

Validate the package with:

```bash
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/openclaw-cli-skill pack:dry-run
```

## Install The OpenClaw Plugin

On the machine that runs `openclaw-gateway`, the quickest path is:

```bash
curl -fsSL https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/openclaw-setup.sh | bash
```

If you already cloned this repository on that machine, you can run:

```bash
./openclaw-setup.sh
```

The script:

- installs `@call-e/openagent`
- enables `calle`
- merges `plugins.entries.calle.enabled` and `plugins.allow` into `~/.openclaw/openclaw.json`
- prompts before restarting `openclaw-gateway`

It only depends on `openclaw` and `node`. Python is not required.

Animated terminal walkthrough for installing, enabling, and restarting the plugin:

![Terminal install walkthrough (GIF)](./packages/openclaw-plugin/docs/images/terminal-install.gif)

If you prefer the manual path, run:

```bash
openclaw plugins install @call-e/openagent
openclaw plugins enable calle
openclaw gateway restart
```

For installation screenshots, OpenClaw UI examples, and package-specific setup details, see [packages/openclaw-plugin/README.md](./packages/openclaw-plugin/README.md).

## Remote Service Contract

The OpenClaw plugin is self-contained, but it depends on a compatible remote OpenAgent deployment for authentication and MCP tool execution.

See [docs/openclaw-service-contract.md](./docs/openclaw-service-contract.md) for the required HTTP endpoints, token exchange flow, and MCP expectations.

## Release Workflow

This repository uses `pnpm`, Changesets, and GitHub Actions for releases.

- Add a changeset for user-visible package changes.
- Merge the resulting release PR.
- The release workflow publishes changed `@call-e/*` packages to npm through Changesets and creates package-level git tags.
- For the Codex plugin, the release workflow also maintains the
  `@call-e/codex-plugin@latest` install alias.
