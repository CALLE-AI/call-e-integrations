# @call-e/openclaw-cli-skill

OpenClaw skill bundle for using Call-E through the `calle` CLI.

This package is separate from the self-contained OpenClaw plugin package. It
does not register OpenClaw-native tools or require a gateway restart. Instead,
the skill teaches the OpenClaw agent how to run the shared `@call-e/cli`
commands for authentication, MCP tool discovery, call planning, call execution,
and call status checks.

## Layout

```text
skills/
  calle-cli/
    SKILL.md
    references/
      commands.md
```

## Local validation

From the repository root:

```bash
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/openclaw-cli-skill pack:dry-run
```

## OpenClaw use

For local development from a clone, point OpenClaw skill loading at this
package's `skills/` directory, or install the `calle-cli` skill through the
normal skill distribution flow once published.

The skill uses the repository-local CLI when available, then a global `calle`
command when available, then falls back to `npx -y @call-e/cli@0.2.1`.

To authenticate before using the skill:

```bash
npx -y @call-e/cli@0.2.1 auth login
```

## Safety

Call-E can place real phone calls. The skill always plans first, uses returned
credentials exactly as provided, and does not place a call unless the user
clearly intends to do so.
