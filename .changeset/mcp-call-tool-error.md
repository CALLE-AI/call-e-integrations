---
"@call-e/cli": patch
---

Treat MCP tool `isError` as a failed `calle mcp call` with a CLI-owned
`mcp_tool_error` summary, conservative `run_call` retry defaults, and
sanitized untrusted remote detail.

Closes #127
