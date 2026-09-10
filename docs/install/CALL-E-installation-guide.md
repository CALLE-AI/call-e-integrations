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
to select the trusted MCP package and prepare the launcher and `request.json`.
The JSON arrays below are values for that request's `argv`; execute them one
at a time with `node run-agent-command.mjs request.json`.

Install into a dedicated directory if needed, following the same guide. Finish
this setup before invoking the skill; the skill does not download remote npm
packages.

Verify the command:

```json
["--help"]
```

## Step 3 Authenticate

Run the login command and let the user complete browser authorization:

```json
["auth", "login"]
```

For agents that need to show the authorization link without opening a browser
inside the agent environment, run:

```json
["auth", "login", "--start-only", "--no-browser-open"]
```

After the user confirms authorization is complete, finish the pending login:

```json
["auth", "login", "--no-browser-open"]
```

## Step 3.5 First-Time Users: Create The Account

<!-- sync-with: docs/install/install-guide.md#first-time-users-create-the-account -->

`calle auth login` uses the same flow for new and existing accounts: it opens
the brokered dashboard sign-in, where **Continue with Google** registers a new
account or signs in an existing one while preserving the broker/MCP return
parameters. Full first-time-user detail:
[First-Time Users](./install-guide.md#first-time-users-create-the-account).

## Step 4 Verify

```json
["auth", "status"]
```

```json
["mcp", "tools"]
```

Confirm that the tool list includes:

```text
plan_call
run_call
get_call_run
```

CALL-E can place real outbound phone calls. Setup verification must not start a
call; only place a call when the user clearly asks for one.

Include the portable skill's attribution in `request.json`:

```json
{"integration": {"source": "skills_sh", "name": "skills_sh_skill", "version": "0.1.0"}}
```

The launcher sets the corresponding child-process environment variables.

## More

For client-specific setup paths, see the
[manual install guide](./install-guide.md).

For CLI command details, see the [CLI install guide](./cli.md).
