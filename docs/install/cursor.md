# Install CALL-E In Cursor With MCP

This is the quick MCP-only path for Cursor. It configures Cursor to connect
directly to the CALL-E remote MCP server without installing the full Cursor
plugin bundle.

## Configure

Create or edit the project-level MCP config:

```text
.cursor/mcp.json
```

Or create or edit the user-level global MCP config:

```text
~/.cursor/mcp.json
```

Add the CALL-E server:

```json
{
  "mcpServers": {
    "calle": {
      "url": "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
    }
  }
}
```

Restart Cursor or reload the window, then authorize the `calle` MCP server
when Cursor prompts.

## Verify

After authorization, verify that the `calle` MCP server exposes:

```text
plan_call
run_call
get_call_run
```

`plan_call` creates the call plan and returns run credentials. `run_call`
starts a real outbound phone call. `get_call_run` returns progress and final
results when available.

## Safety

`run_call` places real outbound phone calls. Always use `plan_call` first,
preserve returned `plan_id` and `confirm_token` exactly, and only call
`run_call` when the user clearly intends to place the call.

Do not add `run_call` to Cursor auto-run permissions. CALL-E call execution
should remain explicit.

Do not print, request, or expose OAuth tokens, bearer tokens, authorization
codes, callback URLs, refresh tokens, or access tokens.

If Cursor authorization fails, the CALL-E MCP server may need to allow Cursor's
OAuth callback behavior or support Cursor's client registration flow. This is
an operational server requirement; it is not handled by changing local Cursor
configuration.

## Full Plugin

For the MCP config plus the CALL-E Cursor skill and real-call safety rule, see
[docs/install/cursor-plugin.md](./cursor-plugin.md).
