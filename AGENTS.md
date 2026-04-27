# AGENTS.md

## Project Overview

Call-E Integrations is a multi-ecosystem agent integration monorepo.

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

- `skills/calle`: local Call-E OpenClaw skill packaging source.
- `skills/github-ci-triage`: project-local skill for inspecting and diagnosing
  GitHub Actions CI, release, deploy, and workflow failures.

## Repository Conventions

- Follow existing package layout and scripts before adding new tooling.
- Follow [docs/git-naming-conventions.md](./docs/git-naming-conventions.md)
  when naming branches, commits, tags, PR titles, remotes, and stash entries.
- Keep user-facing installation steps in the root `README.md` and package
  `README.md` files.
- Before changing marketplace entry points, plugin names, visible labels, or
  install commands, read and follow
  [docs/agent-integration-layout.md](./docs/agent-integration-layout.md).
