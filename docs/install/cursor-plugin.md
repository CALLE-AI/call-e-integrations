# Install The CALL-E Cursor Plugin

The Cursor plugin bundles the CALL-E MCP server config, a `calle` skill, and an
always-on safety rule. It is prepared for Cursor Marketplace submission through
`.cursor-plugin/marketplace.json`, but this repository does not claim the
plugin has been published to the public Cursor Marketplace.

For a quick MCP-only setup, use [docs/install/cursor.md](./cursor.md).

## Prerequisites

Install a Cursor version that supports plugins, skills, rules, and MCP servers.

The bundled MCP server URL is:

```text
https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

## Marketplace Payload

When Cursor loads this repository as a plugin marketplace, it reads:

```text
.cursor-plugin/marketplace.json
```

That marketplace entry points `calle` to:

```text
./packages/cursor-plugin/plugin
```

The plugin payload already includes:

```text
plugin/.cursor-plugin/plugin.json
plugin/mcp.json
plugin/skills/calle/SKILL.md
plugin/rules/call-e-safety.mdc
```

If you install through that marketplace payload, do not also create a separate
manual `.cursor/mcp.json` entry unless you intentionally want an MCP-only
fallback outside the plugin.

## Local Plugin Setup

From a local clone, symlink the plugin payload into Cursor's local plugin
directory:

```bash
mkdir -p ~/.cursor/plugins/local
ln -s /path/to/call-e-integrations/packages/cursor-plugin/plugin ~/.cursor/plugins/local/calle
```

Reload Cursor, then verify that the plugin components loaded:

- the `calle` MCP server is present
- the `calle` skill is available
- the CALL-E safety rule is enabled

After authorization, verify that the `calle` MCP server exposes:

```text
plan_call
run_call
get_call_run
```

## Optional CLI Preflight

The plugin should prefer Cursor MCP tools. If the skill falls back to CLI
commands, it uses the repository-local CLI when available, then a global
`calle`, then the npm fallback:

```bash
npx -y @call-e/cli auth status
npx -y @call-e/cli mcp tools
```

CLI commands run by the Cursor skill include this CALL-E attribution:

```text
CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0
```

## Safety

`run_call` places real outbound phone calls. Always use `plan_call` first,
preserve returned `plan_id` and `confirm_token` exactly, and only call
`run_call` when the user clearly intends to place the call.

Do not configure CALL-E `run_call` for auto-run.

Do not print, request, or expose OAuth tokens, bearer tokens, authorization
codes, callback URLs, refresh tokens, or access tokens.

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/cursor-plugin check
pnpm --filter @call-e/cursor-plugin test
pnpm --filter @call-e/cursor-plugin pack:dry-run
```

## More

See [packages/cursor-plugin/README.md](../../packages/cursor-plugin/README.md)
for package layout and local validation.
