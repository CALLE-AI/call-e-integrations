# Install The CALL-E CLI

`@call-e/cli` ships the `calle` command. The CLI handles brokered browser
login, private token caching, MCP client configuration, and LLM-friendly call
workflow shortcuts.

## Install

Follow [CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to select a trusted checkout or installed `@call-e/cli`, verify its package and
MCP command help, and set `CALLE_CLI_ENTRY` to its absolute `bin/calle.js` path.

That guide also covers installing into a dedicated directory when needed.
Reuse the verified entry point for all commands below.

## Authenticate

```bash
node "$CALLE_CLI_ENTRY" auth login
```

The command opens the brokered login URL, polls until authorization completes,
exchanges the authorized session, and stores the token in a private local cache.
The token is never printed to stdout.

For agent integrations that need to show the authorization link before
continuing:

```bash
node "$CALLE_CLI_ENTRY" auth login --start-only --no-browser-open
```

## Verify

```bash
node "$CALLE_CLI_ENTRY" --version
node "$CALLE_CLI_ENTRY" auth status
node "$CALLE_CLI_ENTRY" mcp tools
```

## Plan A Call

Use command-specific help to see the parameters accepted by the installed CLI
version, then create a plan:

```bash
node "$CALLE_CLI_ENTRY" call plan --help
node "$CALLE_CLI_ENTRY" call plan --to-phone +15551234567 --goal "Confirm the appointment"
```

Help follows the command hierarchy, so you can discover a group before choosing
a subcommand:

```bash
node "$CALLE_CLI_ENTRY" --help
node "$CALLE_CLI_ENTRY" call --help
node "$CALLE_CLI_ENTRY" call plan --help
```

When an argument is missing, unknown, or belongs to another subcommand, the
error output includes the corresponding `help_command`. Run its arguments
with the same verified entry point.

## More

See [packages/cli/README.md](../../packages/cli/README.md) for package usage
details, and [packages/cli/docs/cli-reference.md](../../packages/cli/docs/cli-reference.md)
for the canonical command and option reference.

When embedding the CLI in a Node application on Windows, follow the
[shell-free child-process guidance](./troubleshooting.md#run-call-e-from-node-on-windows).
