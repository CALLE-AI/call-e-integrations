# @call-e/codex-plugin

Codex plugin bundle for using the `calle` CLI from Codex.

This first local-validation version does not configure Codex to connect to the
remote MCP server directly. Instead, the bundled skill tells Codex how to call
the existing `@call-e/cli` commands so authentication, token caching, JSON
output, and MCP error handling remain owned by the CLI package.

## Install from Git marketplace

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

Open Codex, run `/plugins`, choose the `Call-E` marketplace, and
install `Calle`.

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

When `$calle` is invoked, the skill checks `calle auth status` first. If the
user is not authorized, it runs blocking `calle auth login`, shows the brokered
authorization link, and continues automatically after browser authorization
completes.

## Telemetry / Usage Data

When Codex runs the bundled Call-E skill, the skill invokes the shared `calle` CLI with source attribution environment variables so local telemetry and service-side call data can be grouped as `codex/codex_plugin/<version>`.

CLI telemetry is best-effort and is used to diagnose installation, authentication, MCP tool availability, and drop-off before a first `plan_call` reaches the server. It includes an anonymous installation ID, CLI version, integration source, command stage, outcome, error type, and server host/hash. It does not include phone numbers, call goals, OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact data.

Disable CLI telemetry with `DO_NOT_TRACK=1`, `CALLE_TELEMETRY=0`, or by adding `--no-telemetry` to a direct `calle` command. Broker and MCP requests still create service-side security, audit, and business operation logs needed to authenticate users and run calls.

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
