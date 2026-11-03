# Installation routing documentation verification

Date: November 3, 2026 (Asia/Shanghai).

## Candidate and scope

The installation guides now prefer the Skills CLI after confirming support for
the current host. If the host is unsupported, support cannot be confirmed, or
required command execution or tooling is unavailable, they use the host's own
Skill installation interface. Support is checked against the
[upstream supported-agent list](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)
or available CLI help; shell access alone is insufficient.

The synchronized documents are:

- [Stable installation entry point](../install/CALL-E-installation-guide.md).
- [Canonical standalone guide](../install/calle.md#install-the-source-or-zip).
- [Manual installation guide](../install/install-guide.md#standalone-skill-for-compatible-agents).

The stable guide candidate SHA-256 is
`3021b5cf993f569f6bc22f8ced9ab4ef59693d5ad9a3cf438cf9b813e9e09d13`.
Native GitHub import continues to use the complete `skills/calle` directory,
including `SKILL.md` and bundled references. Installation, loading, and account
connection remain separate completion states.

## Validation

- `pnpm --filter @call-e/skills-sh-skill check` passed.
- `pnpm run check:versions` passed.
- `git diff --check` passed for the installation guide changes.
- All fenced command blocks in the three guides match their versions in `HEAD`.
- Added passages passed the English-content scan, and local file links resolved.
- The standalone Skill entry point and bundled update procedure match `HEAD`.
- Root README and integration-layout guidance were checked; they retain the
  stable entry point and compatible CLI examples and required no edits.

These are documentation and static compatibility checks. No host installation,
download, OAuth flow, or business operation was performed for this candidate.

## Historical evidence boundary

The [Cue clean-install record](cue-clean-install-2026-11-03.md) tested the earlier
guide with SHA-256
`c2867e026d4066219f350d404ff0f1ae3b39a3189ff6085a901249b4836078dc`.
It retains its original results and scope. Its live observations do not establish
that this revised candidate was executed in Cue. Other hosts and delivery of the
revised guide through the public URL were not tested here.

## Release decision

- Decision: **No release needed**.
- Affected packages: none; changes are repository installation documentation.
- Changeset: not needed.
- Reason: existing distribution methods and commands are retained; the guides
  clarify their selection order without changing packaged artifacts or runtime
  behavior.
- Suggested version bump: none.
- Follow-up release commands: none.
