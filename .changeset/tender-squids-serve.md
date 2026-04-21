---
"@call-e/openagent": patch
---

Tighten Call-E tool routing so agents do not fall back to `exec` or subagents
when the native `calle_*` tools are available, and add coverage for the new
guidance.
