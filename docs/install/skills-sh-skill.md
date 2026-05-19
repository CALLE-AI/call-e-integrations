# Install The CALL-E skills.sh Skill

The skills.sh compatible integration path in this repository is the `calle`
skill. Its source of truth lives at `skills/calle` so skills.sh can index the
public skill page and search results directly from the repository root.

## Install From GitHub

For most users, the recommended path is to ask the agent to install the skill:

```text
To install the CALL-E skill for your agent, use the following command.
Replace <agent> with the name of your current agent:

npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -y --agent <agent>

Steps:
1. Replace <agent> with the name of your current agent.
2. Run the command in your terminal to install the skill.
3. If dependencies are not automatically installed, navigate to the skill folder and run `npm install`.
4. Reload or restart your agent according to its instructions to make the skill available.
```

Or run the same command directly from the repository root source:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -y --agent <agent>
```

Replace `<agent>` with the target agent name, such as `codex`, `openclaw`, or
another value supported by your local skills CLI.

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -y --agent codex
```

Or install the direct root skill path with the appropriate target agent:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -y --agent <agent>
```

## CLI Availability

The skill uses the repository-local CLI when available, then a global `calle`
command when available. The skill does not execute remote npm packages from
inside the agent workflow. Install or verify the official CLI yourself before
using the skill when no local `calle` command is available:

```bash
npx -y @call-e/cli@0.3.3
```

To authenticate before using the skill:

```bash
npx -y @call-e/cli@0.3.3 auth login
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
