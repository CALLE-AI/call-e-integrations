# Install The CALL-E skills.sh Skill

The skills.sh compatible integration path in this repository is the `calle`
skill at `packages/skills-sh-skill/skills/calle`. It teaches any compatible
agent to use CALL-E through the shared `calle` CLI.

## Install From GitHub

Install the direct skill path:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/packages/skills-sh-skill/skills/calle -a codex
```

Or install from the package skills directory and select `calle`:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/packages/skills-sh-skill/skills --skill calle -a codex
```

Replace `codex` with another supported agent when needed.

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

## Verify The Package

```bash
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm --filter @call-e/skills-sh-skill pack:dry-run
npx -y skills-ref validate ./packages/skills-sh-skill/skills/calle
npx -y skills add ./packages/skills-sh-skill/skills/calle --list
```

## More

See [packages/skills-sh-skill/README.md](../../packages/skills-sh-skill/README.md)
for package layout, safety notes, and validation commands.
