# Cue GitHub Skill import validation

Date: November 3, 2026 (Asia/Shanghai).

Scope: Diagnose the user's CALL-E installation instructions and compare a
repository URL with a complete Skill-directory URL in Cue by Manus. This is a
dated compatibility record, not full CALL-E acceptance.

## Environment and existing state

- Physical iPhone XS over USB, running iOS 18.7.10.
- Cue bundle ID `ai.manus.agents`, version `26.18.8`, build `16`.
- The phone already had an enabled `calle` Skill before this test. Its Cue
  details screen displayed an opaque version identifier; this was not treated
  as the Skill's semantic version.
- The existing WebDriverAgent installation was used for USB UI access. No new
  phone application or dependency was installed.

## Installation-guide input

The [hosted installation guide](https://open.heycall-e.com/document/mcp-archive/CALL-E-installation-guide.md)
returned HTTP 200 and matched the local stable guide byte for byte at inspection.
Its SHA-256 was
`c7331a02ad8c72df69f48ce621c33099807fc98232fd1f0b67d5041290b56371`.

The guide leads with the Skills CLI and a repository URL plus `--skill calle`.
It also already contains the correct complete `skills/calle/` source link as an
alternative for a host's supported importer.
[Local source](../install/CALL-E-installation-guide.md)

The existing Cue conversation reported that its installer did not have a Cue
target, then instructed the user to import the repository root and select
`calle`. That conversation is evidence of what the agent told the user, not an
independent trace of the CLI command it ran. The current upstream
[Skills CLI agent registry](https://github.com/vercel-labs/skills/blob/main/src/agents.ts)
also contained no Cue agent identifier when checked. The CLI package version
previously executed inside Cue was not established.

## Native GitHub importer comparison

Observed route: `Settings > Skills > Add Skill > Import from GitHub`. The phone
displayed these controls in Chinese. The Add Skill menu also offered creation
through chat and file upload; those two routes were not tested.

| Input | Observed result | Conclusion |
| --- | --- | --- |
| `https://github.com/CALLE-AI/call-e-integrations` | `SKILL.md not found in zip file(401505)` on two submissions | Reproduced repository-root import failure |
| `https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle` | Confirmation that importing would replace an existing same-name Skill | The complete directory was recognized; replacement was canceled |

No Skill was replaced or deleted. The second result establishes recognition
and duplicate detection, not a newly completed installation during this test.

Public-source checks independently found:

- Repository-root `main/SKILL.md`: HTTP 404.
- `main/skills/calle/SKILL.md`: HTTP 200, name `calle`, metadata version `1.0.4`.

[Skill directory](https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle)

The evidence supports the following explanation for this repository and Cue
build: the native importer needs the directory that directly contains
`SKILL.md`; it did not discover the nested Skill from the repository root.
The CLI's repository discovery and `--skill` selection are a separate workflow.
No generic claim is made about every Cue importer version or repository layout.

## Existing Skill loading and file checks

A diagnostic message asked the existing Cue agent to load the enabled Skill
and read its installed entry point and two references. It prohibited downloads,
updates, account connections, OAuth, and CALL-E business-tool calls.

Cue reported loading `calle` version `1.0.4` from
`/home/ubuntu/.manus/skills/calle/`, with all three requested files readable.
A second local-only diagnostic requested SHA-256 digests and byte sizes. The
values returned through the Cue conversation matched independent calculations
over the corresponding files in this repository:

| File relative to the installed `calle/` directory | Bytes | SHA-256 |
| --- | ---: | --- |
| `SKILL.md` | 25107 | `e8f09bc0d860c65da60b0e56c916b38d5bd950284610a7e94e16c3d43f369f55` |
| `references/connection.md` | 15441 | `3958d50e2b745a1ec4c0cfbccc6654d86288011f1bb9e00faa55cb4ed338406c` |
| `references/polling.md` | 7478 | `19ff662817b59ec7276673246a05819dfdb7a6fc6368c25de78d7424c6f8d882` |

These are observed agent-reported local file results corroborated by matching
repository hashes. The Cue filesystem was not mounted or directly inspected
from the Mac. The remaining bundled files were not individually hashed.

## Recommended installation-guide clarification

No public installation instructions were changed in this analysis.

1. Make native Skill import a distinct path, with the complete directory URL
   explicitly identified as the input for Cue.
2. Document the observed Cue route and enablement check. Do not instruct Cue
   users to paste the repository root and then select a Skill.
3. Keep the existing CLI repository URL and `--skill calle` example for
   supported CLI hosts; a valid Skill-directory URL alone does not create a
   missing Cue installation target in that CLI.
4. Separate import recognition, actual installation, agent loading, and account
   connection. A same-name replacement prompt is not installation completion.

## Validation limits and repository impact

- Root failure was reproduced twice; the complete path reached the duplicate
  safeguard. The existing enabled installation was preserved.
- Entry-point loading and the two reference-file checks passed as described.
- No new Skill installation or overwrite was completed in this test.
- OAuth, MCP discovery or business reads, API access, and real calls were not
  tested. No account connection was initiated.
- Raw phone UI captures remain outside the repository; private conversation
  history, device identifiers, and credentials are not included in this record.

Related sources checked: `docs/documentation-maintenance.md`,
`docs/agent-integration-layout.md`, the stable installation entry point, and
`docs/install/calle.md`. No installation guide, package, manifest, or Skill
source was changed. The earlier
[public-source research note](../research/cue-app-extensions-2026-11-03.md)
retains its original research scope and links to this later evidence.

Release decision: **No release needed**. Affected packages: none. Changeset:
not needed. Suggested version bump: none. Reason: dated diagnostic evidence
only; published package and installation behavior are unchanged. Follow-up
release commands: none.
