# Agent Integration Layout

This repository is a multi-ecosystem integration monorepo.

## Layout

- Keep ecosystem-specific marketplace entry points at the repository root.
- Keep ecosystem-specific implementations under `packages/`.
- Keep shared local capability in `packages/cli`.

Current Codex layout:

```text
.agents/plugins/marketplace.json
packages/codex-plugin/plugin/
packages/cli/
```

## Marketplace Naming Rules

Do not rename marketplace identifiers or visible marketplace labels freely.
They are part of the install and support surface.

For Codex:

- `.agents/plugins/marketplace.json` is the Codex marketplace entry point.
- The marketplace `name` must stay `call-e-codex`.
- The marketplace `interface.displayName` must stay `Call-E`.
- The Codex plugin entry name must stay `calle`.
- The Codex plugin source path must stay `./packages/codex-plugin/plugin`.

Use ecosystem-specific internal marketplace names when adding other clients:

```text
call-e-codex
call-e-claude
call-e-copilot
call-e-gemini
```

Prefer the user-visible marketplace display name `Call-E` when public install
instructions use sparse checkout and expose only one ecosystem entry point. Add
an ecosystem suffix to `interface.displayName` only when a single install path
intentionally exposes multiple Call-E marketplaces in the same client UI.

## Cross-Ecosystem Rules

- Do not put Claude, Copilot, VS Code, Gemini, Cursor, Windsurf, Zed, Cline, Roo,
  Continue, or other non-Codex entries in `.agents/plugins/marketplace.json`.
- Add each future ecosystem's entry point separately, for example
  `.claude-plugin/marketplace.json` for Claude-compatible plugin distribution.
- Only add `.github/plugin/marketplace.json` if Copilot needs a separate
  marketplace from the Claude-compatible one.
- Public install docs should use sparse checkout and include only the relevant
  marketplace entry point plus that ecosystem's package path.
- Versioned install examples are synced during release PR versioning by
  `scripts/sync-install-doc-versions.mjs`.

Codex public install example:

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@0.1.0' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```
