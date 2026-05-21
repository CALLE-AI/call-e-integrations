# Install The CALL-E skills.sh Skill

The skills.sh compatible integration path in this repository is the `calle`
skill. Its source of truth lives at `skills/calle` so skills.sh can index the
public skill page and search results directly from the repository root.

## Install From GitHub

For most users, the recommended path is to ask the agent to install the skill:

```text
Install CALL-E for me: https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/docs/install/CALL-E-installation-guide.md
```

The stable prompt points to the latest
[CALL-E installation guide](./CALL-E-installation-guide.md) and installs the
skill at user-level/global scope. Or run the equivalent command directly from
the repository root source:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent <agent>
```

Replace `<agent>` with the target agent name, such as `codex`, `openclaw`, or
another value supported by your local skills CLI.

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent codex
```

Or install the direct root skill path with the same user-level/global scope and
the appropriate target agent:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -g -y --agent <agent>
```

## CLI Availability

The skill uses the repository-local CLI when available, then a global `calle`
command when available. The skill does not execute remote npm packages from
inside the agent workflow. Install or verify the official CLI yourself before
using the skill when no local `calle` command is available:

```bash
npx -y @call-e/cli
```

To authenticate before using the skill:

```bash
npx -y @call-e/cli auth login
```

## Verify The Package

```bash
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm --filter @call-e/skills-sh-skill pack:dry-run
npx -y skills-ref validate ./skills/calle
npx -y skills add ./skills/calle --list
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle --list
```

## More

See [packages/skills-sh-skill/README.md](../../packages/skills-sh-skill/README.md)
for package layout, safety notes, and validation commands.
