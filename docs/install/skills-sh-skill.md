# Install The CALL-E skills.sh Skill

The skills.sh compatible integration path in this repository is the `calle`
skill. The package source lives at `packages/skills-sh-skill/skills/calle`, and
the repository root mirrors it at `skills/calle` so skills.sh can index the
public skill page and search results.

## Install From GitHub

For most users, the recommended path is to ask the agent to install the skill:

```text
Please install the CALL-E skill using the following command:
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle
```

Or run the same command directly from the repository root source:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle
```

If your skills CLI requires an explicit target agent, add the supported
`-a <agent>` value for that client:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -a codex
```

Or install the direct package skill path with the appropriate target agent:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/packages/skills-sh-skill/skills/calle -a codex
```

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
npx -y skills add ./skills/calle --list
npx -y skills add ./packages/skills-sh-skill/skills/calle --list
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle --list
```

## More

See [packages/skills-sh-skill/README.md](../../packages/skills-sh-skill/README.md)
for package layout, safety notes, and validation commands.
