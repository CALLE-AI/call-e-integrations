---
"@call-e/cli": patch
---

Treat MCP tool `isError` as a failed `calle mcp call` with a CLI-owned
`mcp_tool_error` summary, conservative `run_call` retry defaults, and
sanitized untrusted remote detail. Omit messages containing credential
assignments and preserve unknown call state when a status lookup fails.

Closes #127
