# AGENTS.md

## Project Overview

CALL-E Integrations is a multi-ecosystem agent integration monorepo.

- Shared local CLI capability lives in `packages/cli`.
- Client-specific integrations live under `packages/`.
- Ecosystem marketplace entry points live at the repository root.

## Setup Commands

- Install dependencies: `pnpm install`

## Build and Test

- Run all checks: `pnpm check`
- Run all tests: `pnpm test`
- Check the Codex plugin: `pnpm --filter @call-e/codex-plugin check`
- Test the Codex plugin: `pnpm --filter @call-e/codex-plugin test`
- Dry-run package output: `pnpm pack:dry-run`

## Project-Local Skills

- `.agents/skills/github-ci-triage`: project-local skill for inspecting and diagnosing
  GitHub Actions CI, release, deploy, and workflow failures.
- `.agents/skills/claude-plugin-reinstall`: project-local skill for refreshing,
  reinstalling, and locally testing the CALL-E Claude Code plugin.
- `.agents/skills/change-review-agent`: project-local skill for starting a
  read-only review agent after code modifications when explicitly requested.
- `.agents/skills/release-decision`: project-local skill for deciding whether a
  change requires a package release, changeset, or maintainer release decision.

Productized OpenClaw skill source lives in `packages/openclaw-cli-skill/skills`.

## Release Decision

Before finishing any code, docs, package metadata, marketplace, plugin, or
install-flow change, assess whether the change requires a package version
release.

Use `.agents/skills/release-decision` for the release decision checklist.
Report one of:

- `No release needed`
- `Patch release recommended`
- `Minor release recommended`
- `Major release required`
- `Needs maintainer decision`

Include the reason, affected package(s), and whether a changeset is needed.

## Repository Conventions

- Follow existing package layout and scripts before adding new tooling.
- Follow [docs/git-naming-conventions.md](./docs/git-naming-conventions.md)
  when naming branches, commits, monorepo package release tags, PR titles,
  remotes, and stash entries.
- Before creating a new branch, validate the candidate with
  `pnpm run check:branch-name -- --branch <type>/<short-kebab-summary>` or
  create it through `pnpm run branch:create -- <type>/<short-kebab-summary>`.
- Keep user-facing installation steps in `docs/install/`, with root and package
  `README.md` files linking to the relevant install guide.
- Treat `docs/install/CALL-E-installation-guide.md` as the stable public
  install entry point for the root `README.md` prompt and raw GitHub URL. Do not
  delete, rename, or move it; if install docs are reorganized, keep this file in
  place and point it to the canonical guide.
- Before changing user-facing documentation, repeated commands, install steps,
  package usage, or visible integration metadata, read and follow
  [docs/documentation-maintenance.md](./docs/documentation-maintenance.md).
- Before changing marketplace entry points, plugin names, visible labels, or
  install commands, read and follow
  [docs/agent-integration-layout.md](./docs/agent-integration-layout.md).
