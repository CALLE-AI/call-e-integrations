# CALL-E Install Guide

Use this guide when the recommended prompt-based install is unsupported, or
when you need a client-specific setup path.

## Recommended Prompt-Based Install

For most users, copy this into your agent:

```text
Install CALL-E for me: https://open.heycall-e.com/document/mcp-archive/CALL-E-installation-guide.md
```

This is the preferred path for local agents that can run shell commands. The
stable prompt points to the latest
[CALL-E installation guide](./CALL-E-installation-guide.md), keeping the install
request client-agnostic while letting the receiving agent complete the setup in
its own environment.

## Manual Install Options

### skills.sh Compatible Agents

Install the portable `calle` skill globally from the repository root:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent <agent>
```

Replace `<agent>` with the target agent name, such as `codex`, `openclaw`, or
another value supported by your local skills CLI.

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent codex
```

For direct source installs, use the same user-level/global scope:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -g -y --agent <agent>
```

### Codex

The official Codex plugin install path requires `codex-cli >= 0.122.0`.

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@latest' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

Then open Codex, run `/plugins`, choose the `CALL-E` marketplace, install
`CALL-E`, and invoke:

```text
$calle
```

For a pinned install, replace `@call-e/codex-plugin@latest` with a package-level
release tag such as `@call-e/codex-plugin@<version>`.

### Claude Code

Run these slash commands inside Claude Code:

```text
/plugin marketplace add https://github.com/CALLE-AI/call-e-integrations.git#@call-e/claude-plugin@latest
/plugin install calle@call-e-claude
/reload-plugins
```

Invoke:

```text
/calle:calle
```

For a pinned install, replace `@call-e/claude-plugin@latest` with a
package-level release tag such as `@call-e/claude-plugin@<version>`.

### Cursor

For lightweight MCP-only setup, create or edit `.cursor/mcp.json` in a project,
or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "calle": {
      "url": "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
    }
  }
}
```

Restart Cursor or reload the window, authorize the `calle` MCP server, and
verify `plan_call`, `run_call`, and `get_call_run` are available.

For the full Cursor plugin payload, see the
[Cursor plugin install guide](./cursor-plugin.md). The plugin bundles the MCP
server config, `calle` skill, and real-call safety rule.

### OpenClaw

Install the published ClawHub skill:

```bash
openclaw skills install phone-call-calle
```

Then start a new OpenClaw session and use `Phone Call - CALL-E`.

### Hermes Agent

Open [Phone Call - CALL-E on ClawHub](https://clawhub.ai/call-e-dev/phone-call-calle),
choose `Prompt`, then paste the ClawHub install prompt into Hermes Agent.

### CLI

Install the shared `calle` command:

```bash
npm install -g @call-e/cli
```

Then authenticate and verify:

```bash
calle auth login
calle auth status
calle mcp tools
```

One-off usage without a global install:

```bash
npx -y @call-e/cli --help
```

### MCP-Only Clients

Configure a Streamable HTTP MCP server:

```text
Transport: Streamable HTTP
URL:       https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

Complete the client OAuth flow, then verify the server exposes:

```text
plan_call
run_call
get_call_run
```

## Authentication And Verification

CLI-based integrations can pre-authorize with:

```bash
npx -y @call-e/cli auth login
```

Then verify:

```bash
npx -y @call-e/cli auth status
npx -y @call-e/cli mcp tools
```

The Codex, Claude Code, Cursor plugin, OpenClaw, and skills.sh skills use the
repository-local CLI when available, then a global `calle`, then the
npm fallback.

## Safety

CALL-E can place real outbound phone calls. Integrations must plan first,
preserve returned `plan_id` and `confirm_token` exactly, and only run a planned
call when the user clearly intends to place that call.

Do not print, request, or expose OAuth tokens, bearer tokens, authorization
codes, callback URLs, refresh tokens, or access tokens.

## More

- [CLI](./cli.md)
- [Codex](./codex-plugin.md)
- [skills.sh](./skills-sh-skill.md)
- [Claude Code](./claude-plugin.md)
- [Cursor MCP](./cursor.md)
- [Cursor plugin](./cursor-plugin.md)
- [OpenClaw source](./openclaw-cli-skill.md)
- [Troubleshooting](./troubleshooting.md)
