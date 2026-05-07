# Agent Integration Layout

This repository is a multi-ecosystem integration monorepo.

## Layout

- Keep ecosystem-specific marketplace entry points at the repository root.
- Keep ecosystem-specific implementations under `packages/`.
- Keep shared local capability in `packages/cli`.
- Keep package-scoped, productized skills under their owning package.
- Keep root `skills/` for repository-local skill source and legacy/local skill
  packaging source.

Current Codex layout:

```text
.agents/plugins/marketplace.json
packages/codex-plugin/plugin/
packages/cli/
```

Current OpenClaw layout:

```text
packages/openclaw-cli-skill/skills/
skills/
```

Use `packages/openclaw-cli-skill/skills/` for the OpenClaw CALL-E skill source.
Root `skills/` remains available for repository-local helper skills and should
not be the default place for new productized client-specific skill packages.

## Marketplace Naming Rules

Do not rename marketplace identifiers or visible marketplace labels freely.
They are part of the install and support surface.

For Codex:

- `.agents/plugins/marketplace.json` is the Codex marketplace entry point.
- The marketplace `name` must stay `call-e-codex`.
- The marketplace `interface.displayName` must stay `CALL-E`.
- The Codex plugin entry name must stay `calle`.
- The Codex plugin source path must stay `./packages/codex-plugin/plugin`.

Use ecosystem-specific internal marketplace names when adding other clients:

```text
call-e-codex
call-e-claude
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
- Pinned package and CLI version references are synced during release PR
  versioning by `scripts/sync-install-doc-versions.mjs`.
- The release workflow initializes `@call-e/codex-plugin@latest` from the
  current package release tag when missing, then updates it only after
  `@call-e/codex-plugin` publishes.

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
