---
"@call-e/cli": patch
---

Reject duration flags that are not plain numbers, and bound the ones backed by a timer.

`--timeout-seconds 30s` used to resolve to `NaN`, which reached the MCP timeout arithmetic where `Math.max(NaN, 1000)` stays `NaN` and `setTimeout` substitutes 1ms, so every call aborted before it left. Durations are now validated where they are read, with the offending flag named in the error.

The constraints are per option rather than shared: `--min-ttl-seconds 0` keeps working, since zero disables the minimum remaining-lifetime window, while the timeout flags stay strictly positive. Timer-backed values are also capped at 2147483 seconds, because `setTimeout` collapses any longer delay to 1ms and would reproduce the same immediate abort.
