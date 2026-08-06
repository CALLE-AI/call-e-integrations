---
"@call-e/cli": patch
"@call-e/core": patch
---

Give `plan_call` its own request timeout ceiling so `calle call plan` does not fail under the shared 15 second default. `callMcpTool` accepts a per-call `timeoutSeconds` that covers the `tools/call` request only. The session handshake keeps the shared ceiling. An explicit `--timeout-seconds` still applies to every request, planning included. The timeout message now names the ceiling that ran out. A per-call value that cannot arm a timer, because it is not finite, not above zero or past Node's timer maximum, falls back to the shared session ceiling instead of aborting the request immediately.
