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
npx -y @call-e/cli@0.3.1 --help
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
calle auth status
calle mcp tools
```

## More

See [packages/cli/README.md](../../packages/cli/README.md) for command
reference, options, telemetry details, and development checks.
