---
"@call-e/cli": patch
"@call-e/codex-plugin": patch
"@call-e/claude-plugin": patch
"@call-e/cursor-plugin": patch
---

Select `@call-e/cli` by its verified JavaScript entry point in agent skills and setup instructions. Reuse that entry for login, status, and recovery to avoid sending auth or call arguments to the Developer API SDK's same-name command.
