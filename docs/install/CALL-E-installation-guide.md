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

The skill uses the local `calle` CLI. If `calle` is not already available,
install it:

```bash
npm install -g @call-e/cli
```

Verify the command:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle --help
```

## Step 3 Authenticate

Run the login command and let the user complete browser authorization:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth login
```

For agents that need to show the authorization link without opening a browser
inside the agent environment, run:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth login --start-only --no-browser-open
```

After the user confirms authorization is complete, finish the pending login:

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth login --no-browser-open
```

## Step 4 Verify

```bash
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle auth status
env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=0.1.0 calle mcp tools
```

Confirm that the tool list includes:

```text
plan_call
run_call
get_call_run
```

CALL-E can place real outbound phone calls. Setup verification must not start a
call; only place a call when the user clearly asks for one.

The `CALLE_SOURCE`, `CALLE_INTEGRATION`, and `CALLE_INTEGRATION_VERSION`
environment variables preserve install and setup telemetry attribution for the
portable skills.sh integration.

## More

For client-specific setup paths, see the
[manual install guide](./install-guide.md).

For CLI command details, see the [CLI install guide](./cli.md).
