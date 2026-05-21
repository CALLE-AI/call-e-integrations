---
name: release-decision
description: Use this project-local skill when deciding whether a CALL-E Integrations change needs a package version release, changeset, or maintainer release decision, especially before finishing code, docs, marketplace, plugin, package metadata, or install-flow changes.
---

# Release Decision

Use this skill to decide whether a repository change needs a package version
release and what release action to recommend.

## Workflow

1. Identify the reviewed scope:
   - For local work, inspect `git status --short` and the relevant diff.
   - For a commit or PR, inspect the diff against its base.
2. Map changed files to package(s):
   - Use each package's `package.json` name and `private` field.
   - Treat root marketplace files, plugin manifests, install docs, package
     READMEs, and packaged skill files as user-visible surfaces.
3. Classify the highest-impact user-visible change.
4. Decide whether a changeset is needed.
5. Report the decision in the response shape below.

Do not manually edit package versions just to satisfy this checklist. Version
bumps are handled through Changesets and the release workflow unless the user
explicitly asks for release-versioning work.

## Decisions

### No release needed

Use when the change does not alter published package behavior, public APIs,
packaged output, marketplace-visible metadata, or install behavior.

Common examples:

- Tests, fixtures, CI-only behavior, or local developer tooling.
- Formatting, comments, or internal refactors with no behavior change.
- Agent-only instructions such as `AGENTS.md` or project-local skills, unless
  they are packaged and shipped to users.
- Root documentation or maintenance notes that do not change install or package
  usage semantics.
- Changes limited to private packages, unless their versioned artifact or
  distribution path is part of the release plan.

If the change is user-visible but intentionally has no package release, mention
whether an empty/no-release changeset is useful for project history.

### Patch release recommended

Use for backward-compatible fixes to published package behavior or package
output.

Common examples:

- Bug fixes in `@call-e/cli`, `@call-e/core`, `@call-e/codex-plugin`,
  `@call-e/claude-plugin`, or `@call-e/cursor-plugin`.
- Compatibility fixes for supported host tools.
- Corrections to packaged manifests, plugin metadata, skills, command guidance,
  bundled assets, or package READMEs.
- Runtime dependency updates that affect published behavior.
- Install or usage documentation corrections that are shipped inside a package
  or required to keep a packaged integration accurate.

### Minor release recommended

Use for backward-compatible new functionality.

Common examples:

- New commands, flags, options, agent capabilities, or integration workflows.
- New marketplace-visible capabilities or packaged skills.
- New package entry points that do not break existing consumers.
- Backward-compatible expansion of documented public APIs.

### Major release required

Use for breaking changes.

Common examples:

- Removing or renaming commands, flags, package exports, plugin identifiers,
  marketplace identifiers, skills, or install entry points.
- Changing documented behavior in an incompatible way.
- Changing required setup or install commands in a way that breaks existing
  users.
- Incompatible public API, package layout, or telemetry attribution changes.

### Needs maintainer decision

Use when the semver or release boundary is unclear.

Common examples:

- Multi-package changes where dependent package bump levels are ambiguous.
- Marketplace alias, `latest` tag, package naming, or release workflow changes.
- Private packages or productized skills whose distribution path is unclear.
- Security fixes where urgency, disclosure, or backport policy affects the
  release shape.
- Conflicts between Changesets behavior and project release expectations.

## Changesets

For user-visible package changes, recommend a changeset for the affected
package(s). Use the smallest semver bump that matches the highest-impact change.

For a deliberate no-release record, this repository may use an empty changeset:

```md
---
---

No release: <short reason>.
```

Relevant commands:

```bash
pnpm changeset
pnpm run check:versions
pnpm pack:dry-run
```

For release PR work only:

```bash
pnpm run version-packages
```

## Repository Checks

When relevant, inspect:

- Root `package.json` scripts for release and validation commands.
- Package-level `package.json` files under `packages/`.
- `.changeset/config.json` and existing `.changeset/*.md` files.
- `docs/documentation-maintenance.md` before changing user-facing docs,
  repeated commands, install steps, package usage, or visible metadata.
- `docs/agent-integration-layout.md` before changing marketplace entry points,
  plugin names, visible labels, or install commands.
- `pnpm pack:dry-run` output when packaged files or manifests changed.

## Response Shape

Always report:

- Decision:
- Affected package(s):
- Changeset:
- Reason:
- Suggested version bump:
- Follow-up commands, if any:
