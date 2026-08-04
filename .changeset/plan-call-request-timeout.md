---
"@call-e/cli": patch
"@call-e/core": patch
---

Give `plan_call` its own request timeout ceiling so `calle call plan` does not fail under the shared 15 second default. `callMcpTool` accepts a per-call `timeoutSeconds` that covers the `tools/call` request only. The session handshake keeps the shared ceiling. An explicit `--timeout-seconds` still applies to every request, planning included. The timeout message now names the ceiling that ran out.
