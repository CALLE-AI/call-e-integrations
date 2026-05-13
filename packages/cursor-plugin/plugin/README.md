# CALL-E For Cursor

This Cursor plugin connects Cursor to CALL-E through a remote MCP server and
provides a `calle` skill plus an always-on real-call safety rule.

The bundled MCP config registers the `calle` server:

```text
https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

After Cursor loads the plugin and completes authorization, verify that these
MCP tools are available:

```text
plan_call
run_call
get_call_run
```

`run_call` places real outbound phone calls. Keep `run_call` plan-first and
explicit; do not configure it for auto-run.

If Cursor MCP tools are unavailable, the skill can fall back to the shared
`calle` CLI. CLI commands run with:

```text
CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=0.1.0
```
