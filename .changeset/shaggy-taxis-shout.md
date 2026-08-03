---
"@call-e/core": patch
---

Guard the MCP request timeout against a non-numeric duration.

`Math.max(NaN, 1000)` is `NaN`, and `setTimeout(fn, NaN)` fires after 1ms, so an unreadable timeout aborted every request immediately instead of falling back to a usable one.
