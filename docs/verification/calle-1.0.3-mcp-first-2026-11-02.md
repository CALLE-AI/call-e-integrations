# calle 1.0.3 MCP-first verification

Date: 2026-11-02 (Asia/Shanghai).

## Candidate scope

The independently distributed standalone `calle` Skill changes its default route
to MCP whenever the host supports it, including authorized setup and OAuth for a
missing connection. An absent CALL-E connector, unloaded tools or unavailable
Agent management access requires setup, discovery or a user handoff. These
conditions no longer permit automatic API Key fallback.

Explicit interface choices, existing-call recovery, authentication and permission
boundaries, and fallback before business writes for an explicitly unsupported
host or a capability confirmed missing by complete discovery remain in place.
Current metadata, evaluation versions and installation guidance use `1.0.3`.
CLI, plugin and npm package versions are unchanged.

## Local validation

| Check | Result |
| --- | --- |
| Repository version, syntax and metadata checks | PASS |
| Full Node/package suite through Corepack pnpm 10.18.3 | PASS |
| `.venv/bin/python -m tests.run_offline` | PASS: 274 tests |
| `pnpm pack:skill:calle` | PASS: complete 19-file Skill |
| `pnpm pack:skill:calle-cli` | PASS: unchanged four-file compatibility Skill |
| `pnpm pack:dry-run` | PASS |
| ZIP CRC, file inventory and byte comparison with source | PASS for both ZIPs |
| Added and rewritten repository text | English; historical verification records preserved |

The initial full Node run encountered a local mise `npm` shell wrapper that the
mixed-install test tried to execute as JavaScript. The affected test and full
suite passed with a temporary PATH entry pointing directly to the installed npm
JavaScript entry point. No repository or global tooling change was needed.

| Artifact | SHA-256 |
| --- | --- |
| `calle.zip` | `038f26547d42f06482b6775799608b3d278a9179d1629e3a2b5dfdf13db77e65` |
| `calle-cli.zip` | `40a2fdde2640b13997bdf4e29804498060494c239fd87526d9e647f6871bc23b` |

The compatibility ZIP hash matches the published `skills/calle@1.0.1` artifact.
The release manifest binds the final publication revision, source file hashes
and ZIP hashes to the immutable `skills/calle@1.0.3` tag. GitHub CI and public
delivery are verified separately from these local checks.

## Unexecuted acceptance

The new `route-15` native-custom-connector, user-managed-setup and
unknown-host-support variants are synthetic definitions marked `NOT_RUN` until
an Agent is evaluated. Offline fixture checks do not establish Muse behavior.
No fresh Muse installation or activation, OAuth flow, live call, release-specific
security scan or skills.sh index refresh is established by this record.

## Release decision

Patch release recommended for standalone `calle`, prepared as `1.0.3`.
The empty-package Changeset `calle-mcp-first-routing.md` records this independent
release; no npm package or plugin version bump is included.
