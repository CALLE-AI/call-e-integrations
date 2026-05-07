# @call-e/openclaw-cli-skill

Make real outbound phone calls, run planned calls, and check call status in
OpenClaw with CALL-E through the `calle` CLI. New users get 20 free calls to
get started.

This package is the OpenClaw integration path maintained in this repository. It
does not register OpenClaw-native tools or require a gateway restart from this
repo. Instead, the skill teaches the OpenClaw agent how to run the shared
`@call-e/cli` commands for authentication, MCP tool discovery, call planning,
call execution, and call status checks.

For setup steps, see
[docs/install/openclaw-cli-skill.md](../../docs/install/openclaw-cli-skill.md).

## Layout

```text
skills/
  phone-call-calle/
    SKILL.md
    references/
      commands.md
```

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/openclaw-cli-skill pack:dry-run
```

## CLI Selection

The skill uses the repository-local CLI when available, then a global `calle`
command when available, then falls back to `npx -y @call-e/cli@0.3.1`.

## Safety

CALL-E can place real phone calls. The skill always plans first, uses returned
credentials exactly as provided, and does not place a call unless the user
clearly intends to do so.
