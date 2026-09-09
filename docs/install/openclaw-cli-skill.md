# Install The CALL-E OpenClaw CLI Skill

The OpenClaw integration path in this repository is the CLI skill at
`packages/openclaw-cli-skill/skills/phone-call-calle`. It teaches OpenClaw
agents to use CALL-E through the shared `calle` CLI.

This route does not register OpenClaw-native tools and does not require a
gateway restart from this repository.

## CLI Availability

Follow [CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to select the trusted MCP package and prepare the launcher and `request.json`.
The JSON arrays below are values for that request's `argv`; execute them one
at a time with `node run-agent-command.mjs request.json`.

To authenticate before using the skill:

```json
["auth", "login"]
```

## Local Development

From a clone of this repository, point OpenClaw skill loading at:

```text
packages/openclaw-cli-skill/skills
```

Then start a new OpenClaw session and use the `Phone Call - CALL-E` skill.

## Verify The Package

```bash
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/openclaw-cli-skill pack:dry-run
```

## More

See [packages/openclaw-cli-skill/README.md](../../packages/openclaw-cli-skill/README.md)
for package layout, safety notes, and validation commands.
