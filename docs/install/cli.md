# Install The CALL-E CLI

`@call-e/cli` ships the `calle` command. The CLI handles brokered browser
login, private token caching, MCP client configuration, and LLM-friendly call
workflow shortcuts.

## Install

For a persistent local command:

```bash
npm install -g @call-e/cli
```

For one-off usage without a global install:

```bash
npx -y @call-e/cli --help
```

## Authenticate

```bash
calle auth login
```

The command opens the brokered login URL, polls until authorization completes,
exchanges the authorized session, and stores the token in a private local cache.
The token is never printed to stdout.

For agent integrations that need to show the authorization link before
continuing:

```bash
calle auth login --start-only --no-browser-open
```

## Verify

```bash
calle --version
calle auth status
calle mcp tools
```

## Plan A Call

Use command-specific help to see the parameters accepted by the installed CLI
version, then create a plan:

```bash
calle call plan --help
calle call plan --to-phone +15551234567 --goal "Confirm the appointment"
```

Help follows the command hierarchy, so you can discover a group before choosing
a subcommand:

```bash
calle --help
calle call --help
calle call plan --help
```

When an argument is missing, unknown, or belongs to another subcommand, the
error output includes the corresponding `help_command` to run.

## More

See [packages/cli/README.md](../../packages/cli/README.md) for package usage
details, and [packages/cli/docs/cli-reference.md](../../packages/cli/docs/cli-reference.md)
for the canonical command and option reference.

When embedding the CLI in a Node application on Windows, follow the
[shell-free child-process guidance](./troubleshooting.md#run-call-e-from-node-on-windows).
