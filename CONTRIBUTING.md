# Contributing

Thanks for contributing to CALL-E Integrations.

## Development Setup

This repository targets:

- Node.js `>=22`
- pnpm `10.18.3` (the exact version pinned in `packageManager` and CI)

Check `pnpm --version` before installing. If your global pnpm differs, use
`npx pnpm@10.18.3` in place of `pnpm` for the commands below. Newer pnpm
versions can use different dependency-build approval settings; this repository
does not require a pnpm 11 upgrade or a new build-script approval.

Install dependencies from the repository root:

```bash
pnpm install
```

Run the required checks before opening a pull request:

```bash
pnpm test
pnpm check
pnpm pack:dry-run
```

## Changesets

This repository uses Changesets for versioning and release notes.

Add a changeset whenever a change affects:

- published package behavior
- package metadata
- installation or configuration guidance

Create one with:

```bash
pnpm changeset
```

## Pull Requests

Please keep pull requests focused and include:

- a clear summary of the change
- test coverage or a reason tests were not added
- documentation updates when behavior or configuration changed

## Code Style

- Keep runtime code dependency-light and compatible with the published plugin model.
- Avoid adding build steps unless they are clearly necessary.
- Prefer small, explicit modules over clever abstractions.
