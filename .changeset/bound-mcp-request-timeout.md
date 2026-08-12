---
"@call-e/core": patch
---

Bound the MCP request timeout on both ends before arming setTimeout. A `callMcpTool`
`timeoutSeconds` override or a `config.timeoutSeconds` above 2147483 seconds used to reach
`setTimeout` unchanged, where Node collapses any delay past 2147483647ms to 1ms and aborts
the request almost immediately. Oversized values are now capped at that ceiling. Non-finite
or non-positive values fall back to the session timeout. This matches the cap the CLI
already applies to `--timeout-seconds`.
