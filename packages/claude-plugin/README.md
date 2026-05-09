# @call-e/claude-plugin

Claude Code plugin bundle for using CALL-E through the shared `calle` CLI.

The plugin provides:

- a `/calle:phone-call` skill for setup checks, authentication recovery, phone
  call planning, planned call execution, and call status handling

The Claude Code integration uses the shared `calle` CLI as its primary path so
the skill can run `auth status`, start `auth login` when needed, display the
browser authorization URL, and continue after authorization completes.

For user installation steps, see [docs/install/claude-plugin.md](../../docs/install/claude-plugin.md).

## Package Layout

```text
plugin/
  .claude-plugin/plugin.json
  skills/
    phone-call/
      SKILL.md
      references/commands.md
```

The repo-local marketplace lives at `.claude-plugin/marketplace.json` and points to `./packages/claude-plugin/plugin`.

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/claude-plugin check
pnpm --filter @call-e/claude-plugin test
pnpm --filter @call-e/claude-plugin pack:dry-run
```

For local development from a clone, add this repository as a Claude Code
marketplace, install `calle@call-e-claude`, then invoke `/calle:phone-call`.
The skill prefers the repository-local CLI, then a global `calle`, then
`npx -y @call-e/cli@0.3.2`.

## Attribution

The skill runs CLI commands with this integration attribution:

```text
CALLE_SOURCE=claude CALLE_INTEGRATION=claude_code_plugin CALLE_INTEGRATION_VERSION=0.0.0
```

The version segment must stay in sync with this package version.
