# Install the calle-cli Compatibility Skill

This guide covers the CLI-based `calle-cli` skill. Its source of truth lives at
`skills/calle-cli` so skills.sh can index the public skill page and search results
directly from the repository root.

For the standalone `callev2` Skill, which prefers MCP with API Key fallback,
see [callev2 personal testing](./callev2.md) and its
[interface selection rules](./callev2.md#choose-the-interface).
Business operations and updates use non-CLI host facilities. MCP setup follows
the [host management boundary](../../skills/callev2/references/connection.md),
which permits a limited official host-command fallback.

## Install From GitHub

For most users, the recommended path is to ask the agent to install the skill:

```text
Install CALL-E for me: https://open.heycall-e.com/document/mcp-archive/CALL-E-installation-guide.md
```

The stable prompt points to the latest
[CALL-E installation guide](./CALL-E-installation-guide.md) and installs the
skill at user-level/global scope. Or run the equivalent command directly from
the repository root source:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle-cli -g -y --agent <agent>
```

Replace `<agent>` with the target agent name, such as `codex`, `openclaw`, or
another value supported by your local skills CLI.

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle-cli -g -y --agent codex
```

Or install the direct root skill path with the same user-level/global scope and
the appropriate target agent:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle-cli -g -y --agent <agent>
```

## Existing calle users

The standalone CLI Skill is now named `calle-cli`; the executable remains
`calle`. Install `calle-cli` explicitly from the official repository using the
command above, reload the host and verify `$calle-cli` in the intended scope.
Then disable the old standalone `calle` entry only as part of the authorized
migration. Preserve local edits, CLI authentication/configuration, cached state,
call or run references and recovery records. Do not log out, delete tokens,
convert identifiers, or replay an uncertain call as migration cleanup.

This is not an automatic rename of installed copies. Plugin-provided `calle`
Skills remain separate and must not be removed as if they were the old standalone
copy. The private package still owns attribution
`skills_sh/skills_sh_skill/0.1.0`; the Skill rename does not change it.
The official GitHub command requires the migration source to have been published;
local edits alone do not establish remote availability.

## CLI Availability

Follow [CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to select the trusted MCP package and prepare the launcher and `request.json`.
The JSON arrays below are values for that request's `argv`; execute them one
at a time with `node run-agent-command.mjs request.json`.

Prepare this installed entry point before invoking the skill. The skill does
not execute remote npm packages; it stops when no trusted installed CLI is
available.

To authenticate before using the skill:

```json
["auth", "login"]
```

## Verify The Package

```bash
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm --filter @call-e/skills-sh-skill pack:dry-run
npx -y skills-ref validate ./skills/calle-cli
npx -y skills add ./skills/calle-cli --list
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle-cli --list
```

## More

See [packages/skills-sh-skill/README.md](../../packages/skills-sh-skill/README.md)
for package layout, safety notes, and validation commands.
