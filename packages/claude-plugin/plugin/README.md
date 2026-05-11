# CALL-E For Claude Code

This Claude Code plugin connects Claude Code to CALL-E through the shared
`calle` CLI and provides the `/calle:calle` skill.

When `/calle:calle` is invoked, the skill checks `calle auth status`. If
authentication is missing or expired, it runs blocking `calle auth login`,
shows the browser authorization URL, and continues after authorization
completes.

The skill uses the repository-local CLI when available, then a global `calle`,
then `npx -y @call-e/cli@0.3.2`.

CLI commands run with:

```text
CALLE_SOURCE=claude CALLE_INTEGRATION=claude_code_plugin CALLE_INTEGRATION_VERSION=0.2.0
```
