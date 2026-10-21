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
- `calle` CLI commands, options, defaults, required arguments, output shape, and
  parameter examples live in `packages/cli/docs/cli-reference.md`.
- Productized OpenClaw skill source lives in
  `packages/openclaw-cli-skill/skills`.
- The skills.sh CLI compatibility Skill source lives in `skills/calle-cli`.
- The standalone MCP-first Skill source lives in `skills/callev2`; its
  install, migration and local ZIP guidance lives in `docs/install/callev2.md`.
  Keep `docs/install/calle-connect.md` and `docs/install/dual-skills.md` as
  pointers for earlier links. The current personal testing identity is `callev2`
  with metadata/evaluation version `2.0.5`; the future official `calle` takeover
  remains a separate gate in `docs/calle-skill-migration-plan.md`. The Skill's
  metadata version is independent of the CLI-based skills.sh package attribution.
  Shared routing and business workflow live in `SKILL.md`; MCP and API contracts
  stay in their own references. Shared result-waiting behavior and phased polling
  live in `references/polling.md`; keep both interface guides, manual tests, and
  repository evaluation policy aligned with it. Keep pre-execution fallback,
  explicit interface choice, incomplete discovery, authentication failures and
  unknown write outcomes synchronized with evaluation scenarios.
  This customer Skill supports production only, with fixed MCP endpoint
  `https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth` and API base URL
  `https://api.heycall-e.com`. Keep setup, templates, manual checks, and repository
  scenarios aligned: no environment-selection prompts or alternative service
  endpoints. Existing configuration mismatches require resolution before sending
  credentials or requests; credentials must not be silently reused at a new URL.
  The MCP tool policy in `skills/callev2/references/mcp.md` excludes the
  legacy Plan/Run tools from this standalone Skill; keep that exclusion aligned
  across the entry point, connection verification, manual tests, and repository
  scenarios. Discovery does not override the exclusion. Other integration
  products retain their separately maintained tool guidance.
- Standalone Skill evaluation definitions live in
  `tests/behavior/callev2-evals.json`, outside the installable Skill source
  and ZIP. Keep their version aligned with `skills/callev2/SKILL.md`.
  Keep synthetic adversarial fixtures in repository tests, and keep bundled
  instructions and manual testing guides free of links to repository-only files.
  Moving fixtures does not establish that Agent scenarios were executed or that
  a security audit passed.
- Standalone Skill update checks read the same Skill's publisher-approved public
  `SKILL.md` on `main`. For `callev2`, the confirmed publisher/repository is
  `CALLE-AI/call-e-integrations`, using `skills/callev2`; never substitute the
  old Connect or future official `calle` URL. Keep `metadata.update-source` and `metadata.source` aligned with the
  Skill directory, and change its version when publishing changed behavior.
  The canonical bundled update procedure is
  `skills/callev2/references/update-check.md`; it covers both interfaces with
  one version and source. Keep fresh request nonces, the two-attempt limit,
  retryable failure set, and unavailable/unknown-result notices aligned with the
  update evaluation fixtures. Cover both controlled HTTPS and URL-only native
  public readers, including reader-attributed source validation; do not assume
  a host exposes headers or redirect controls. The canonical source metadata remains query-free.
  Renaming an entry requires a migration notice: an old
  same-name update check cannot discover a replacement automatically.
  Design rationale, public examples, dated audit findings, and rollout limits
  live in `docs/skill-update-mechanism.md`; keep it aligned with the bundled
  procedure without treating historical audit results as current guarantees.
  Standalone business operations, API setup and updates use non-CLI facilities.
  MCP connection management follows `skills/callev2/references/connection.md`:
  reuse existing connections, prefer the current host's permitted native
  facilities, and allow its already-installed official MCP management commands
  only within the defined exception. Keep connection guidance and evaluation
  fixtures aligned, including user restrictions and permission denials.
  Repository development and optional distribution commands do not authorize
  business, API or update CLI fallbacks.
- Historical records in `docs/verification/` keep their recorded identities,
  hashes, results and evidence limits. Add candidate-specific migration evidence;
  do not rename historical records or promote old acceptance to the new identity.
- The legacy `calle-cli` Skill keeps CLI executable `calle`, private package
  attribution `skills_sh/skills_sh_skill/<version>`, authentication and recovery
  paths. Plugin names and package-scoped `calle` Skills are separate surfaces.
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
