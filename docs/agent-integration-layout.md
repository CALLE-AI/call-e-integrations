# Agent Integration Layout

This repository is a multi-ecosystem integration monorepo.

## Layout

- Keep ecosystem-specific marketplace entry points at the repository root.
- Keep ecosystem-specific implementations under `packages/`.
- Keep shared local capability in `packages/cli`.
- Keep package-scoped, productized skills under their owning package.
- Keep the skills.sh CLI compatibility `calle-cli` Skill at the repository root in `skills/`.
- Keep the standalone `callev2` source alongside it in `skills/`. It prefers
  host-managed OAuth MCP and can select direct HTTPS/API Key before business
  writes when the host explicitly lacks MCP support, the target MCP connection
  is confirmed not configured, or complete discovery confirms the required
  capability is missing. Authentication failure or cancellation does not trigger
  fallback.
  Business operations and updates use non-CLI host facilities. MCP setup prefers
  the current host's native management capabilities, with a limited official
  host-command exception defined in
  [connection lifecycle](../skills/callev2/references/connection.md).
  The earlier `calle-api-key` and `calle-mcp-oauth` entries are
  replaced by this unified entry; installed copies need explicit migration.
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

Current standalone layout:

```text
skills/calle-cli/  # Official CLI compatibility entry
skills/callev2/    # Personal MCP/API testing candidate
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
Use `skills/calle-cli/` for the skills.sh compatible CALL-E skill source so
skills.sh public search and detail pages can index the portable `calle-cli` Skill
from the default repository install path.
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

For skills.sh:

- The skills.sh package path must stay `packages/skills-sh-skill`.
- The skills.sh skill directory must stay `skills/calle-cli`.
- The skills.sh skill frontmatter `name` must stay `calle-cli`.
- The CLI executable remains `calle`; existing auth/cache and recovery paths stay unchanged.
- Existing standalone `calle` users explicitly install `calle-cli`, preserve their state,
  and retire only the intended old standalone copy after verification.
- The skills.sh CLI integration attribution must stay
  `skills_sh/skills_sh_skill/<version>`.

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

## Standalone Skills

The [staged migration plan](calle-skill-migration-plan.md) records the authorized
current layout: legacy `calle` becomes `calle-cli`, while the MCP/API candidate
uses `callev2` with display name `callev2`, invocation `$callev2`, and metadata
version `2.0.3` for personal testing. The later official `calle` takeover is not
implemented by this staging step; final artifact and delivery gates still apply.

`skills/callev2/` is distributed as a complete source directory and local
`dist/skills/callev2.zip`. Its metadata and repository evaluation version are
independent of the legacy CLI attribution version in private
`@call-e/skills-sh-skill`, currently `0.1.0`. That package continues validating
`skills/calle-cli/`; it does not own the new standalone version.

Use [callev2 installation](install/callev2.md) for the personal candidate and
[calle-cli installation](install/skills-sh-skill.md) for the official CLI entry.
The user selected the existing `CALLE-AI/call-e-integrations` repository for
`callev2`; personal testing does not change source ownership. Both source and
update metadata must target `main/skills/callev2` in that repository. Local files
do not establish publication, indexing, host activation, or renamed-artifact acceptance. Earlier
Connect verification records remain tied to their original hashes.

This customer Skill supports production only. Its fixed MCP endpoint is
`https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth`, and its fixed API base URL
is `https://api.heycall-e.com`. Setup uses those endpoints without an environment
selection. Resolve any different saved endpoint before sending credentials or
requests; changing a URL does not authorize reusing credentials from that URL.

Keep formal evaluation definitions at `tests/behavior/callev2-evals.json`
and other test fixtures under `tests/`, outside `skills/callev2/`. They are
repository development inputs and are not included in the installed directory or
ZIP. Keep the evaluation version aligned with the Skill metadata. Safe manual
testing guides remain in the Skill, with no dependency on repository-only fixtures.

Only the selected interface's detailed contract is loaded after routing. API
fallback is a pre-execution choice, not a retry for authentication errors or
unknown write results. A call retains its original interface, account and
endpoint unless interoperability has been verified. Records from a different
endpoint are outside this production Skill's recovery scope.

The CLI compatibility entry is `skills/calle-cli`; keep its original CLI
attribution, configuration and recovery behavior. CLI executable `calle` and
ecosystem marketplace/plugin identities remain unchanged. The personal candidate
is `skills/callev2`.

## External Codex Directory Follow-Up

CALL-E is also listed in
[`hashgraph-online/awesome-codex-plugins`](https://github.com/hashgraph-online/awesome-codex-plugins)
as `Call-E` under `Tools & Integrations`. Treat that listing as a downstream
discovery surface, not as the source of truth.

When changing the Codex plugin's visible metadata, source path, install payload,
or icon assets in this repository, check whether the external directory needs a
matching PR. Keep these fields aligned:

- `packages/codex-plugin/plugin/.codex-plugin/plugin.json`
  `interface.composerIcon`.
- `plugins/CALLE-AI/call-e-integrations/.codex-plugin/plugin.json` in
  `awesome-codex-plugins`.
- The `calle` entry in
  `awesome-codex-plugins/.agents/plugins/marketplace.json`.
- The mirrored icon asset path
  `plugins/CALLE-AI/call-e-integrations/assets/CALL-E-Icon-Black.svg`.

Current tracking references:

- CALL-E issue:
  [`CALLE-AI/call-e-integrations#35`](https://github.com/CALLE-AI/call-e-integrations/issues/35).
- External directory PR:
  [`hashgraph-online/awesome-codex-plugins#125`](https://github.com/hashgraph-online/awesome-codex-plugins/pull/125).

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

Then reload plugins in the current Claude Code session:

```text
/reload-plugins
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

skills.sh install example:

<!-- sync-with: docs/install/skills-sh-skill.md#install-from-github -->

Use the official repository root with `--skill calle-cli` and `-g` so skills.sh installs the
portable `calle-cli` Skill from the root skill source at user-level/global scope:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle-cli -g -y --agent <agent>
```

Or install the root skill source directly with the same user-level/global scope:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle-cli -g -y --agent <agent>
```
