---
"@call-e/core": patch
---

Validate the MCP request timeout before arming setTimeout and fall back to a safe value
rather than capping. A `callMcpTool` `timeoutSeconds` override or a `config.timeoutSeconds`
reaches Node's timer, where any delay past 2147483647ms (~24.8 days) collapses to 1ms and
aborts the request almost immediately. The seconds value is now required to be finite,
positive and no greater than 2147483 (the largest whole-second delay the timer keeps intact).
An out-of-range or non-finite session value falls back to the 15s default; an out-of-range or
non-finite per-call override falls back to the already computed session timeout. Capping an
oversized value at the ceiling was worse than the abort it replaced: it turned a malformed
value into a ~24.8-day timeout that held the request, socket and caller resources open instead
of failing. This matches the validation the CLI already applies to `--timeout-seconds`.
