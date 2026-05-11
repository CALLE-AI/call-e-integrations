# Install The CALL-E Claude Code Plugin

The Claude Code plugin provides the `/calle:phone-call` skill. It uses the
shared `calle` CLI so authentication can be checked and recovered from Claude
Code without opening the native remote MCP authorization menu.

## Prerequisites

Install a Claude Code version that supports plugins and local shell command
execution. Check your version with:

```bash
claude --version
```

## Install

In Claude Code, add the latest released marketplace from this repository:

```text
/plugin marketplace add https://github.com/CALLE-AI/call-e-integrations.git#@call-e/claude-plugin@latest
```

Then install the plugin:

```text
/plugin install calle@call-e-claude
```

`@call-e/claude-plugin@latest` is a Git tag updated by the release workflow after `@call-e/claude-plugin` publishes. For a reproducible install, replace it with a package-level release tag such as `@call-e/claude-plugin@<version>`.

## Authorize

The plugin checks authentication when `/calle:phone-call` is invoked. To
pre-authorize before using the skill, run:

```bash
npx -y @call-e/cli@0.3.2 auth login
```

The command opens the CALL-E browser authorization flow, waits for completion,
then stores the token in the private local CLI cache. To verify setup:

```bash
npx -y @call-e/cli@0.3.2 auth status
npx -y @call-e/cli@0.3.2 mcp tools
```

The plugin uses the repository-local CLI when available, then a global `calle`,
then the pinned npm fallback above. CLI commands run by the skill include this
CALL-E attribution:

```text
CALLE_SOURCE=claude CALLE_INTEGRATION=claude_code_plugin CALLE_INTEGRATION_VERSION=0.0.0
```

## Use

Invoke:

```text
/calle:phone-call
```

Claude Code will use CALL-E for setup checks, call planning, planned call
execution, and call status checks. If authentication is missing or expired, the
skill runs blocking `calle auth login`, shows the browser authorization URL,
and continues after authorization completes.

## More

See [packages/claude-plugin/README.md](../../packages/claude-plugin/README.md) for package layout and local validation.
