# Install The CALL-E OpenClaw CLI Skill

The OpenClaw integration path in this repository is the CLI skill at
`packages/openclaw-cli-skill/skills/phone-call-calle`. It teaches OpenClaw
agents to use CALL-E through the shared `calle` CLI.

This route does not register OpenClaw-native tools and does not require a
gateway restart from this repository.

## CLI Availability

The skill uses the repository-local CLI when available, then a global `calle`
command when available, then falls back to:

```bash
npx -y @call-e/cli@0.3.2
```

To authenticate before using the skill:

```bash
npx -y @call-e/cli@0.3.2 auth login
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
