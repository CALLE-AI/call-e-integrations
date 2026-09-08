---
"@call-e/cli": patch
"@call-e/codex-plugin": patch
"@call-e/claude-plugin": patch
"@call-e/cursor-plugin": patch
---

Run agent commands through a bundled launcher that verifies the MCP package and help before passing JSON argument arrays without a shell. Preserve structured login, help, and recovery arguments and integration attribution across Bash, PowerShell, and cmd, including installations with SDK releases that also export `calle`.
