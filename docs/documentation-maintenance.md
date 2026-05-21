# Documentation Maintenance

This document defines how to keep repository documentation synchronized as the
integration surface grows. Use it before changing user-facing docs, install
steps, package usage, marketplace metadata, visible labels, or repeated CLI
commands.

## Sources of Truth

- Installation guides live in `docs/install/`. Root and package `README.md`
  files should link to the relevant guide instead of copying full setup steps.
- Branch, commit, PR, tag, remote, and stash naming rules live in
  `docs/git-naming-conventions.md`.
- Agent integration layout, marketplace entry points, plugin names, visible
  labels, install payloads, and public install commands live in
  `docs/agent-integration-layout.md`.
- Package-specific usage belongs in the owning package `README.md`, with links
  back to canonical guides when the content is also user-facing install or
  support guidance.
- Productized OpenClaw skill source lives in
  `packages/openclaw-cli-skill/skills`.
- The skills.sh public `calle` skill source lives in `skills/calle`.
- Repository-local Codex helper skills live in `.agents/skills/`.

## Update Workflow

1. Identify the canonical source for the topic before editing.
2. Prefer updating the canonical source and replacing secondary copies with
   links.
3. Search for related copies before changing commands, package names, plugin
   names, visible labels, metadata, install paths, version references, or
   troubleshooting steps.
4. Update every synchronized copy in the same change, or deliberately leave a
   secondary copy as a short pointer to the canonical source.
5. In the final response for documentation changes, mention which related docs
   were checked and whether synchronized copies were updated.

## Search Checklist

Use `rg` with the most stable phrases involved in the change. Search exact
commands, package names, manifest keys, plugin names, visible labels, install
paths, section titles, and error messages.

At minimum, search these areas when the topic may be duplicated:

```bash
rg -n "<phrase>" README.md docs packages .agents skills
```

For install, marketplace, or plugin metadata changes, also search root
marketplace entry points and package plugin directories:

```bash
rg -n "<phrase>" .agents .claude-plugin .cursor-plugin packages docs README.md
```

## Intentional Duplication

Prefer links over duplicated instructions. When duplication is necessary because
the copy is part of a quick start, marketplace listing, plugin payload, or
standalone package README, keep the duplicate short and add a Markdown sync
comment near it:

```md
<!-- sync-with: docs/install/codex-plugin.md#install -->
```

The comment should point to the canonical source or the closest stable section.
When editing a section with a `sync-with` comment, check the referenced source
and update both sides if needed.

## When To Add A New Canonical Doc

Add a new canonical doc only when the topic is repeated across multiple files or
is likely to become a long-lived maintenance surface. Keep the doc focused, then
link to it from `AGENTS.md`, root `README.md`, package `README.md`, or another
canonical guide as appropriate.
