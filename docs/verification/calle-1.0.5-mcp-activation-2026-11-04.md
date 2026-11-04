# calle 1.0.5 MCP activation guidance verification

Date: 2026-11-04 (Asia/Shanghai).

## Release scope

The standalone `calle` Skill presents activation guidance after successful MCP
installation and OAuth, before checking tool availability. When the current
session has no loaded tools, recommend starting a new session and offer fully
quitting and reopening the Agent application as the alternative. The user
performs either action. The guidance uses generic host wording and does not
assume a universal runtime hot-reload API.

Configuration, OAuth authentication, actual tool discovery, and scoped
verification have separate completion evidence. Missing tools alone must not
trigger reinstallation or repeated OAuth. Preserve supported host refresh,
MCP-first routing, API fallback conditions, and existing business workflows.

Skill/evaluation metadata and current installation references use `1.0.5`.
The existing `mcp-host-07` and `mcp-host-08` acceptance expectations and bundled
manual checks include the activation handoff. npm and plugin package versions
are unchanged. Historical records, tags, and release assets retain their
original identities and contents.

## Local validation

| Check | Result |
| --- | --- |
| `corepack pnpm check` | PASS |
| `corepack pnpm test` | PASS: full Node/package suite |
| `.venv/bin/python -m tests.run_offline` | PASS: 274 tests |
| `corepack pnpm pack:skill:calle` | PASS: complete 19-file Skill |
| `corepack pnpm pack:skill:calle-cli` | PASS: unchanged four-file compatibility Skill |
| `corepack pnpm pack:dry-run` | PASS |
| ZIP CRC, inventory, and byte comparison with source | PASS for both ZIPs |
| `git diff --check` | PASS |
| Activation guidance relative links and anchors | PASS |
| Added and rewritten repository text | English |

The local npm launcher is a shell wrapper. The full Node/package suite used a
temporary PATH entry pointing directly to the installed npm JavaScript entry
point, without changing repository or global tooling. The generic Skill Creator
validator rejects the pre-existing `compatibility` frontmatter field on both
the unmodified base and the candidate. Repository Skill metadata, compatibility,
reference, and packaging checks pass.

| Artifact | SHA-256 |
| --- | --- |
| `calle.zip` | `0185c185064fe7c3ee2d287f680308e2a813b67d33e6095eec4cd436e0c4085e` |
| `calle-cli.zip` | `40a2fdde2640b13997bdf4e29804498060494c239fd87526d9e647f6871bc23b` |

The compatibility ZIP is byte-identical to the published `1.0.4` release asset.
The release manifest binds the publication revision, per-file source hashes,
ZIP hashes, and GitHub CI evidence to `skills/calle@1.0.5`. Public source and
asset delivery are checked separately after publication.

## Evidence limits

The revised Agent expectations remain `NOT_RUN` until evaluated by an Agent.
No live host OAuth, session restart, application restart, completed call,
release-specific security scan, or skills.sh indexing refresh was performed.
Offline tests and publication do not establish those outcomes. Earlier host
observations remain scoped to their original artifacts and sessions.

## Release decision

Patch release recommended for independently distributed standalone `calle`,
prepared as `1.0.5`. The empty-package Changeset
`calle-mcp-activation-guidance.md` records this independent release; no npm
package or plugin version bump is needed.
