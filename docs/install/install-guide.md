# CALL-E Install Guide

Use this guide when the recommended prompt-based install is unsupported, or
when you need a client-specific setup path.

## Recommended Prompt-Based Install

For most users, copy this into your agent:

```text
To install the CALL-E skill for your agent, use the following command.
Replace <agent> with the name of your current agent:

npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -y --agent <agent>

Steps:
1. Replace <agent> with the name of your current agent.
2. Run the command in your terminal to install the skill.
3. If dependencies are not automatically installed, navigate to the skill folder and run `npm install`.
4. Reload or restart your agent according to its instructions to make the skill available.
```

This is the preferred path for local agents that can run shell commands. It
keeps the install request client-agnostic and lets the receiving agent complete
the setup in its own environment.

## Manual Install Options

### skills.sh Compatible Agents

Install the portable `calle` skill from the repository root:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -y --agent <agent>
```

Replace `<agent>` with the target agent name, such as `codex`, `openclaw`, or
another value supported by your local skills CLI.

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -y --agent codex
```

For direct source installs, use:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -y --agent <agent>
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
npx -y @call-e/cli@0.3.3 --help
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
npx -y @call-e/cli@0.3.3 auth login
```

Then verify:

```bash
npx -y @call-e/cli@0.3.3 auth status
npx -y @call-e/cli@0.3.3 mcp tools
```

The Codex, Claude Code, Cursor plugin, OpenClaw, and skills.sh skills use the
repository-local CLI when available, then a global `calle`, then the pinned
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
