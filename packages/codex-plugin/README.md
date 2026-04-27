# @call-e/codex-plugin

Codex plugin bundle for using the `calle` CLI from Codex.

This first local-validation version does not configure Codex to connect to the
remote MCP server directly. Instead, the bundled skill tells Codex how to call
the existing `@call-e/cli` commands so authentication, token caching, JSON
output, and MCP error handling remain owned by the CLI package.

## Install from Git marketplace

Install and authenticate the shared CLI first:

```bash
npm install -g @call-e/cli
calle auth login
```

Then add the Codex marketplace from this repository. Replace
`@call-e/codex-plugin@0.1.0` with the package release tag you want to install.

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@0.1.0' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

Open Codex, run `/plugins`, choose the `Call-E` marketplace, and
install `Calle`.

## Local validation

From the repository root:

```bash
pnpm --filter @call-e/codex-plugin check
pnpm --filter @call-e/codex-plugin test
pnpm --filter @call-e/codex-plugin pack:dry-run
```

Restart Codex from this repository, open `/plugins`, choose the `Call-E`
marketplace, and install `Calle`.

After installing the plugin, use:

```text
$calle
```

to let Codex handle Call-E setup checks, authentication recovery, call
planning, automatic call execution after planning completes, and call status
checks.

## Plugin layout

```text
plugin/
  .codex-plugin/plugin.json
  skills/
    calle/SKILL.md
```

The repo-local marketplace lives at `.agents/plugins/marketplace.json` and
points to `./packages/codex-plugin/plugin`.

Keep the marketplace at the repository root. This lets the monorepo expose one
Codex marketplace while the plugin implementation stays scoped to this package;
future Claude, Copilot, VS Code, Gemini, or MCP-only integrations should use
their own ecosystem-specific entry points.
