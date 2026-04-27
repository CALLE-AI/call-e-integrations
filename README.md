# Call-E Integrations

Call-E Integrations is a public monorepo for shipping cross-platform agent integrations.

## Packages

- `packages/openclaw-plugin`: the publishable OpenClaw plugin package for OpenAgent.
  See [packages/openclaw-plugin/README.md](./packages/openclaw-plugin/README.md) for installation screenshots, OpenClaw UI usage, and package-specific configuration.
- `packages/cli`: the publishable `@call-e/cli` package that ships the `calle` CLI for brokered login and MCP client configuration.
  See [packages/cli/README.md](./packages/cli/README.md) for CLI commands and package-specific setup.
- `packages/codex-plugin`: the Codex plugin bundle that lets Codex use the installed `calle` CLI.
  See [packages/codex-plugin/README.md](./packages/codex-plugin/README.md) for marketplace installation and local validation.

## Agent Client Layout

This monorepo keeps client-specific marketplace entry points at the repository
root and client-specific implementations under `packages/`.

```text
.agents/plugins/marketplace.json          # Codex marketplace entry
packages/codex-plugin/plugin/             # Calle for Codex
packages/cli/                             # Shared calle CLI
packages/openclaw-plugin/                 # OpenClaw plugin
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
```

Create a dry-run package tarball:

```bash
pnpm pack:dry-run
pnpm --filter @call-e/cli pack:dry-run
pnpm --filter @call-e/codex-plugin pack:dry-run
```

## Install The Codex Plugin

You do not need to install the shared CLI globally before installing the Codex
plugin. The plugin uses the repository-local CLI when available, then a global
`calle` command when available, then falls back to `npx -y @call-e/cli@0.1.0`.

To authenticate before installing the plugin, run:

```bash
npx -y @call-e/cli@0.1.0 auth login
```

Then add the Codex marketplace from this repository. Replace
`@call-e/codex-plugin@0.1.1` with the package release tag you want to install.

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@0.1.1' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

Open Codex, run `/plugins`, choose the `Call-E` marketplace, and
install `Calle`.

For local development from a clone, restart Codex from this repository and use
the repo-local marketplace at `.agents/plugins/marketplace.json`.

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
- The release workflow publishes `@call-e/openagent` and `@call-e/cli` to npm.
