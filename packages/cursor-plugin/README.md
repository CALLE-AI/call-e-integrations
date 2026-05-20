# @call-e/cursor-plugin

Cursor plugin bundle for using CALL-E through Cursor MCP, a CALL-E skill, and
an always-on safety rule.

The plugin provides:

- a `calle` remote MCP server config for `plan_call`, `run_call`, and
  `get_call_run`
- a `calle` skill for setup checks, authentication recovery, phone call
  planning, planned call execution, and call status handling
- an always-on safety rule that keeps real call execution plan-first and
  explicit

The bundled MCP config points to:

```text
https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

`run_call` places real outbound phone calls. Keep `run_call` plan-first and
explicit; do not configure it for auto-run.

For MCP-only setup, see [docs/install/cursor.md](../../docs/install/cursor.md).
For plugin setup, see
[docs/install/cursor-plugin.md](../../docs/install/cursor-plugin.md).

## Package Layout

```text
plugin/
  .cursor-plugin/plugin.json
  mcp.json
  rules/call-e-safety.mdc
  skills/
    calle/
      SKILL.md
      references/commands.md
```

The repo-local marketplace lives at `.cursor-plugin/marketplace.json` and
points to `./packages/cursor-plugin/plugin`.

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/cursor-plugin check
pnpm --filter @call-e/cursor-plugin test
pnpm --filter @call-e/cursor-plugin pack:dry-run
```

For local development from a clone, symlink the plugin payload into Cursor's
local plugin directory and reload Cursor:

```bash
mkdir -p ~/.cursor/plugins/local
ln -s /path/to/call-e-integrations/packages/cursor-plugin/plugin ~/.cursor/plugins/local/calle
```

The plugin is prepared for Cursor Marketplace submission through
`.cursor-plugin/marketplace.json`; marketplace publication is outside this
package's local validation flow.

## Attribution

When the Cursor skill falls back to CLI commands, it uses this integration
attribution:

```text
CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.1
```

The version segment must stay in sync with this package version.
