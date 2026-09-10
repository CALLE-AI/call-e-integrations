# Install The CALL-E CLI

`@call-e/cli` ships the `calle` command. The CLI handles brokered browser
login, private token caching, MCP client configuration, and LLM-friendly call
workflow shortcuts.

## Install

Follow [CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to select the trusted MCP package and prepare the launcher and `request.json`.
The JSON arrays below are values for that request's `argv`; execute them one
at a time with `node run-agent-command.mjs request.json`.

That guide also covers installing into a dedicated directory when needed.
Reuse the verified entry point for all commands below.

## Authenticate

```json
["auth", "login"]
```

The command opens the brokered login URL, polls until authorization completes,
exchanges the authorized session, and stores the token in a private local cache.
The token is never printed to stdout.

<!-- sync-with: install-guide.md#first-time-users-create-the-account -->
First time? On the sign-in page choose **Continue with Google** to register a
new account; the Google flow preserves the broker/MCP return parameters.
Details: [install-guide.md](./install-guide.md#first-time-users-create-the-account).

For agent integrations that need to show the authorization link before
continuing:

```json
["auth", "login", "--start-only", "--no-browser-open"]
```

## Verify

```json
["--version"]
```

```json
["auth", "status"]
```

```json
["mcp", "tools"]
```

## Plan A Call

Use command-specific help to see the parameters accepted by the installed CLI
version, then create a plan:

```json
["call", "plan", "--help"]
```

```json
["call", "plan", "--to-phone", "+15551234567", "--goal", "Confirm the appointment"]
```

Help follows the command hierarchy, so you can discover a group before choosing
a subcommand:

```json
["--help"]
```

```json
["call", "--help"]
```

```json
["call", "plan", "--help"]
```

When an argument is missing, unknown, or belongs to another subcommand, the
error output includes `help_argv`. Use that array as the next request's
`argv` through the same launcher.

## More

See [packages/cli/README.md](../../packages/cli/README.md) for package usage
details, and [packages/cli/docs/cli-reference.md](../../packages/cli/docs/cli-reference.md)
for the canonical command and option reference.

When embedding the CLI in a Node application on Windows, follow the
[shell-free child-process guidance](./troubleshooting.md#run-call-e-from-node-on-windows).
