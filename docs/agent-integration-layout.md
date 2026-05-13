# Agent Integration Layout

This repository is a multi-ecosystem integration monorepo.

## Layout

- Keep ecosystem-specific marketplace entry points at the repository root.
- Keep ecosystem-specific implementations under `packages/`.
- Keep shared local capability in `packages/cli`.
- Keep package-scoped, productized skills under their owning package.
- Keep repository-local Codex helper skills in `.agents/skills/`.

Current Codex layout:

```text
.agents/plugins/marketplace.json
.agents/skills/
packages/codex-plugin/plugin/
packages/cli/
```

Current OpenClaw layout:

```text
packages/openclaw-cli-skill/skills/
```

Current Claude Code layout:

```text
.claude-plugin/marketplace.json
packages/claude-plugin/plugin/
```

Current Cursor layout:

```text
.cursor-plugin/marketplace.json
packages/cursor-plugin/plugin/
```

Use `packages/openclaw-cli-skill/skills/` for the OpenClaw CALL-E skill source.
Use `.agents/skills/` for repository-local Codex helper skills. Do not put
productized client-specific skill packages there; keep them under their owning
package.

## Marketplace Naming Rules

Do not rename marketplace identifiers or visible marketplace labels freely.
They are part of the install and support surface.

For Codex:

- `.agents/plugins/marketplace.json` is the Codex marketplace entry point.
- The marketplace `name` must stay `call-e-codex`.
- The marketplace `interface.displayName` must stay `CALL-E`.
- The Codex plugin entry name must stay `calle`.
- The Codex plugin source path must stay `./packages/codex-plugin/plugin`.

For Claude Code:

- `.claude-plugin/marketplace.json` is the Claude Code marketplace entry point.
- The marketplace `name` must stay `call-e-claude`.
- The Claude Code plugin entry name must stay `calle`.
- The Claude Code plugin source path must stay `./packages/claude-plugin/plugin`.
- The Claude Code CLI integration attribution must stay
  `claude/claude_code_plugin/<version>`.

For Cursor:

- `.cursor-plugin/marketplace.json` is the Cursor marketplace entry point.
- The marketplace `name` must stay `call-e-cursor`.
- The Cursor plugin entry name must stay `calle`.
- The Cursor plugin display name must stay `CALL-E`.
- The Cursor plugin source path must stay `./packages/cursor-plugin/plugin`.
- The Cursor MCP server key must stay `calle`.
- The Cursor CLI fallback attribution must stay
  `cursor/cursor_plugin/<version>`.

Use ecosystem-specific internal marketplace names when adding other clients:

```text
call-e-codex
call-e-claude
call-e-cursor
call-e-copilot
call-e-gemini
```

Prefer the user-visible marketplace display name `CALL-E` when public install
instructions use sparse checkout and expose only one ecosystem entry point. Add
an ecosystem suffix to `interface.displayName` only when a single install path
intentionally exposes multiple CALL-E marketplaces in the same client UI.

## Cross-Ecosystem Rules

- Do not put Claude, Copilot, VS Code, Gemini, Cursor, Windsurf, Zed, Cline, Roo,
  Continue, or other non-Codex entries in `.agents/plugins/marketplace.json`.
- Add each future ecosystem's entry point separately, for example
  `.claude-plugin/marketplace.json` for Claude-compatible plugin distribution.
- Only add `.github/plugin/marketplace.json` if Copilot needs a separate
  marketplace from the Claude-compatible one.
- Public install docs should use sparse checkout and include only the relevant
  marketplace entry point plus that ecosystem's package path.
- Public Codex install docs should use `--ref '@call-e/codex-plugin@latest'`
  so users get the latest released Codex plugin without typing a version
  number. Mention package-level release tags only as the reproducible
  pinned-install option.
- Public Claude Code install docs should use
  `#@call-e/claude-plugin@latest` in the marketplace Git URL so users get the
  latest released Claude Code plugin without typing a version number. Mention
  package-level release tags only as the reproducible pinned-install option.
- Public Cursor quick-start docs should document `.cursor/mcp.json` and
  `~/.cursor/mcp.json` for direct MCP configuration. Cursor plugin docs must
  not claim public marketplace availability until the Cursor plugin has been
  submitted, reviewed, and accepted.
- Pinned package and CLI version references are synced during release PR
  versioning by `scripts/sync-install-doc-versions.mjs`.
- The release workflow initializes `@call-e/codex-plugin@latest` from the
  current package release tag when missing, then updates it only after
  `@call-e/codex-plugin` publishes.
- The release workflow initializes `@call-e/claude-plugin@latest` from the
  current package release tag when missing, then updates it only after
  `@call-e/claude-plugin` publishes.

Latest Codex public install example:

This command is the official Codex plugin install path and requires
`codex-cli >= 0.122.0`. Users pinned to older Codex releases should upgrade
when possible; if they cannot, they may manually add the sparse payload from the
same Git ref:

```text
.agents/plugins/marketplace.json
packages/codex-plugin/plugin/
```

Keep those paths exactly as shown so the marketplace entry can resolve
`./packages/codex-plugin/plugin`.

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@latest' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

For reproducible installs, replace `@call-e/codex-plugin@latest` with a
package-level release tag such as `@call-e/codex-plugin@<version>`.

Latest Claude Code public install example:

Run these slash commands inside Claude Code. The marketplace entry resolves
`./packages/claude-plugin/plugin` from the git-hosted marketplace root.

```text
/plugin marketplace add https://github.com/CALLE-AI/call-e-integrations.git#@call-e/claude-plugin@latest
```

Then install:

```text
/plugin install calle@call-e-claude
```

The installed `/calle:calle` skill uses the shared `calle` CLI for
authentication checks, brokered login, tool discovery, and call workflow
commands.

For reproducible installs, replace `@call-e/claude-plugin@latest` with a
package-level release tag such as `@call-e/claude-plugin@<version>`.

Cursor MCP quick install example:

Create `.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for global
Cursor configuration:

```json
{
  "mcpServers": {
    "calle": {
      "url": "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
    }
  }
}
```

The full Cursor plugin payload lives at:

```text
.cursor-plugin/marketplace.json
packages/cursor-plugin/plugin/
```

The plugin bundles the same remote MCP server with a `calle` skill and an
always-on real-call safety rule. It is prepared for Cursor Marketplace
submission; publication is a separate operational step.
