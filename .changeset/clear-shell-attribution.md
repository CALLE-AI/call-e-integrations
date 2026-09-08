---
"@call-e/cli": patch
"@call-e/codex-plugin": patch
"@call-e/claude-plugin": patch
"@call-e/cursor-plugin": patch
---

Pass agent attribution with `--source`, `--integration`, and `--integration-version` so CLI commands run in PowerShell without Unix `env`. Keep environment-variable compatibility and update the packaged skills to use the new options.
