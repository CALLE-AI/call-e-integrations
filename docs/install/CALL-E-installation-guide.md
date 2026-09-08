# CALL-E Installation Guide

These steps are for AI agents installing CALL-E from the stable installation
prompt. Some authentication steps require the user to finish authorization in a
browser.

## Requirements

Before installing, make sure the environment has:

- Node.js with `npm` and `npx`
- A local agent environment that can run shell commands
- Browser access for CALL-E authorization

## Step 1 Install The Skill

Install the portable CALL-E skill at user-level/global scope.

```bash
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g
```

Reload or restart the agent according to its instructions so the `calle` skill
is available.

## Step 2 Ensure The CLI Is Available

Follow [CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to select a trusted checkout or installed `@call-e/cli`, verify its package and
MCP command help, and set `CALLE_CLI_ENTRY` to its absolute `bin/calle.js` path.
Follow that guide's shell-specific assignment syntax. The commands below work
in Bash and PowerShell.

Install into a dedicated directory if needed, following the same guide. Finish
this setup before invoking the skill; the skill does not download remote npm
packages.

Verify the command:

```bash
node "$CALLE_CLI_ENTRY" --help --source skills_sh --integration skills_sh_skill --integration-version 0.1.0
```

## Step 3 Authenticate

Run the login command and let the user complete browser authorization:

```bash
node "$CALLE_CLI_ENTRY" auth login --source skills_sh --integration skills_sh_skill --integration-version 0.1.0
```

For agents that need to show the authorization link without opening a browser
inside the agent environment, run:

```bash
node "$CALLE_CLI_ENTRY" auth login --start-only --no-browser-open --source skills_sh --integration skills_sh_skill --integration-version 0.1.0
```

After the user confirms authorization is complete, finish the pending login:

```bash
node "$CALLE_CLI_ENTRY" auth login --no-browser-open --source skills_sh --integration skills_sh_skill --integration-version 0.1.0
```

## Step 4 Verify

```bash
node "$CALLE_CLI_ENTRY" auth status --source skills_sh --integration skills_sh_skill --integration-version 0.1.0
node "$CALLE_CLI_ENTRY" mcp tools --source skills_sh --integration skills_sh_skill --integration-version 0.1.0
```

Confirm that the tool list includes:

```text
plan_call
run_call
get_call_run
```

CALL-E can place real outbound phone calls. Setup verification must not start a
call; only place a call when the user clearly asks for one.

The `--source`, `--integration`, and `--integration-version` options preserve
install and setup telemetry attribution for the portable skills.sh integration.

## More

For client-specific setup paths, see the
[manual install guide](./install-guide.md).

For CLI command details, see the [CLI install guide](./cli.md).
