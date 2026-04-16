# Call-E Integrations

Call-E Integrations is a public monorepo for shipping cross-platform agent integrations.

## Packages

- `packages/openclaw-plugin`: the publishable OpenClaw plugin package for OpenAgent.
  See [packages/openclaw-plugin/README.md](./packages/openclaw-plugin/README.md) for installation screenshots, OpenClaw UI usage, and package-specific configuration.

## Community

- [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the plugin test suite:

```bash
pnpm test
pnpm check
```

Create a dry-run package tarball:

```bash
pnpm pack:dry-run
```

## Install The Plugin

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
- The release workflow publishes `@call-e/openagent` to npm.
