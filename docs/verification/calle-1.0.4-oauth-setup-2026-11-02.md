# calle 1.0.4 OAuth setup boundary verification

Date: 2026-11-02 (Asia/Shanghai).

## Release scope

The standalone `calle` Skill keeps MCP-first routing and separates MCP connection
setup from API Key acquisition and storage. Start with the host connection
manager and let it discover OAuth metadata. A preliminary website visit or
manual metadata fetch is unnecessary when the host supports discovery. Any
host-required OAuth fields or allowed hosts come from actual server metadata
and the host schema, without a fixed authorization-host list. A separately
hosted authorization server remains part of MCP and is distinct from the
configured MCP server URL.

Skill/evaluation metadata and current installation references use `1.0.4`.
Existing interface choices, fallback conditions, authentication boundaries,
and existing-call recovery remain in place. npm and plugin package versions
are unchanged. Earlier verification records and release artifacts are preserved.

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
| Added and rewritten repository text | English |

The local npm launcher is a shell wrapper. The full Node/package suite used a
temporary PATH entry pointing directly to the installed npm JavaScript entry
point, without changing repository or global tooling. The generic Skill Creator
validator rejects the pre-existing `compatibility` frontmatter field; the
unmodified base revision produces the same rejection. The repository's Skill
metadata, compatibility, reference, and packaging checks pass.

| Artifact | SHA-256 |
| --- | --- |
| `calle.zip` | `f0755a90f86a3e9cfa2277a37ce6bc66769c8dce122be8dacd7e8cf325b4a316` |
| `calle-cli.zip` | `40a2fdde2640b13997bdf4e29804498060494c239fd87526d9e647f6871bc23b` |

The compatibility ZIP is byte-identical to the published `1.0.3` release asset.
The release manifest binds the final publication revision, per-file source
hashes, ZIP hashes, and GitHub CI evidence to `skills/calle@1.0.4`. Public source
and asset delivery are checked after publication.

## Pre-versioning Muse observations and limits

Before the metadata bump, the same instruction changes were tested as a local
candidate still labeled `1.0.3`. Its ZIP SHA-256 was
`d6d1b00e9db23ca8026694f8e1bb978a8fe5cf1f6a84c67fc9e0d647aa4256e2`.
USB transfer was verified by reading back and comparing the complete archive.
In a new Muse side chat, Muse reported installation of all 19 files, matching
archive and per-file checksums, and loading from its custom Skill directory.

After one user-authorized greeting-call instruction, the native connection card
displayed an added state, and Muse reported that its MCP connection succeeded
and call preparation was in progress. No API Key request was observed. The
terminal call result and complete tool inventory were not observed before USB
access became unavailable; the user then took over phone operation.

These are limited observations of the pre-versioning candidate, not complete
live acceptance of the `1.0.4` artifact or proof of the earlier error's cause.
The new `route-15` host-managed-discovery and separate-OAuth-host variants are
synthetic definitions and remain `NOT_RUN` until an Agent is evaluated.
No release-specific security scan, skills.sh index refresh, or completed live
call is claimed.

## Release decision

Patch release recommended for independently distributed standalone `calle`,
prepared as `1.0.4`. The empty-package Changeset
`calle-mcp-oauth-setup-boundary.md` records this independent release; no npm
package or plugin version bump is needed.
