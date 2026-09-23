---
"@call-e/cursor-plugin": patch
---

Read `get_call_run` fields from `result{}`, treat all three MCP tools as
untrusted output, and stop agents repeating an uncertain `run_call`.
