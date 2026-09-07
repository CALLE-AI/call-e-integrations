# CALL-E For Claude Code

This Claude Code plugin connects Claude Code to CALL-E through the shared
`calle` CLI and provides the `/calle:calle` skill.

When `/calle:calle` is invoked, the skill checks `calle auth status`. If
authentication is missing or expired, it runs blocking `calle auth login`,
shows the browser authorization URL, and continues after authorization
completes.

The plugin uses a verified absolute `@call-e/cli` entry point. Follow
[CLI entry point selection](../../cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to verify the package and set `CALLE_CLI_ENTRY` before running CLI commands.

CLI commands run with:

```text
CALLE_SOURCE=claude CALLE_INTEGRATION=claude_code_plugin CALLE_INTEGRATION_VERSION=0.2.2
```
