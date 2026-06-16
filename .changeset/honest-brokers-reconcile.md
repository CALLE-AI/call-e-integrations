---
"@call-e/core": patch
"@call-e/cli": patch
"@call-e/codex-plugin": patch
---

Harden brokered auth cache reconciliation, prefer active pending logins over stale cached tokens, invalidate cached tokens rejected by MCP, and update Codex plugin auth recovery guidance.
