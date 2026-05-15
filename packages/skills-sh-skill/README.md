# @call-e/skills-sh-skill

skills.sh compatible CALL-E skill for making real outbound phone calls,
running planned calls, and checking call status through the `calle` CLI.
This package remains the source of truth; the repository root mirrors it at
`skills/calle` for skills.sh public discovery and search indexing.

For setup steps, see
[docs/install/skills-sh-skill.md](../../docs/install/skills-sh-skill.md).

## Layout

```text
skills/
  calle/
    SKILL.md
    agents/
      openai.yaml
    references/
      commands.md
```

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm --filter @call-e/skills-sh-skill pack:dry-run
npx -y skills-ref validate ./packages/skills-sh-skill/skills/calle
npx -y skills add ./skills/calle --list
npx -y skills add ./packages/skills-sh-skill/skills/calle --list
```

## CLI Selection

The skill uses the repository-local CLI when available, then a global `calle`
command when available, then falls back to `npx -y @call-e/cli@0.3.2`.

## Safety

CALL-E can place real phone calls. The skill always plans first, uses returned
credentials exactly as provided, and does not place a call unless the user
clearly intends to do so.
