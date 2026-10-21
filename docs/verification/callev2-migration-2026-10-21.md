# callev2 and calle-cli Staged Migration — 2026-10-21

The authorized local migration and test-artifact preparation are complete.
The new MCP/API standalone Skill is `callev2` at metadata version `2.0.0`.
The original CLI standalone Skill is now `calle-cli`. The user selected the
existing `CALLE-AI/call-e-integrations` repository as the test source and will
perform publication and the remaining host/service acceptance work.

This record does not claim public delivery, an installed host's activation,
skills.sh indexing, or the later official `calle` takeover. No commit, push,
release, host configuration change, model evaluation batch or live call was
performed as part of this migration work.

## Candidate and scope

The candidate is an uncommitted working tree based on
`016876d464e21d588875de429982b6c2bfe9f286`, including pre-existing development
changes. That base commit alone does not identify the candidate. Per-file
candidate hashes and pre-migration hashes are recorded in the local evidence
directory `dist/verification/callev2-migration-2026-10-21/`.

| Surface | Result |
| --- | --- |
| New standalone source | `skills/callev2`; name, display name and `$callev2` prompt aligned; version `2.0.0`. |
| New source/update origin | Current repository `main/skills/callev2`; strict same-name checks reject a different Skill identity. |
| Legacy standalone source | `skills/calle-cli`; name, display name, invocation, install guidance and validation paths aligned. |
| Legacy runtime | Executable remains `calle`; attribution remains `skills_sh/skills_sh_skill/0.1.0`. Launcher, command reference and 12,160-byte workflow suffix match the preserved original bytes. |
| Existing connections and state | MCP connection/tool namespaces and private configuration references retained; no credential migration or logout. |
| Other integrations | 23 captured plugin files unchanged. CLI/plugin package versions unchanged; private `@call-e/skills-sh-skill` remains `0.1.0`. |
| Shared repository surfaces | Packaging commands, CI, synchronization scripts, CLI fixture path, current docs and offline evaluation identity updated. |
| Historical records | Earlier Connect verification records, changesets and execution evidence retained under their original names. |

The two former standalone source directories are absent. This does not remove
an installed copy from any host. Users must explicitly install and verify the
replacement, preserve local edits and recovery state, then retire only the
intended old standalone entry. Plugin-owned `calle` entries remain separate.
See the [legacy migration notice](../install/skills-sh-skill.md#existing-calle-users)
and [candidate installation guide](../install/callev2.md).

## Artifacts

| Local path | Purpose | Files | Bytes |
| --- | --- | ---: | ---: |
| `dist/skills/callev2.zip` | Host-import candidate with top-level `callev2/` | 19 | 132863 |
| `dist/skills/calle-cli.zip` | Legacy compatibility Skill with top-level `calle-cli/` | 4 | 31192 |
| `dist/releases/callev2-2.0.0-skills-sh.zip` | Manual-publication bundle containing `skills/callev2/`, a handoff README and LICENSE | 21 | 55717 |

Unpacked copies are available beside the Skill ZIPs and in
`dist/releases/callev2-2.0.0-skills-sh/`. The source bundle README is a handoff
note, not a replacement for the existing repository's root README. Publish the
legacy migration from the working repository as well; it is not included in
the new candidate's source bundle.

SHA-256 values:

| Artifact | SHA-256 |
| --- | --- |
| `callev2.zip` | `cdd2857fc95325b9d6c4cce85e8c3fbed1ce4f168872bf4eaf2ed3c277ce25d7` |
| `calle-cli.zip` | `40a2fdde2640b13997bdf4e29804498060494c239fd87526d9e647f6871bc23b` |
| `callev2-2.0.0-skills-sh.zip` | `351866e1fe3f8516a61f6ef3af9df6548a0610e442eb6507a6cb1ac9279cc017` |
| Original legacy rollback ZIP | `929af3deee66cc65c2046b27fd5f63619acb051ca70079af471caed9269b7e98` |

The legacy rollback artifact is
`dist/verification/callev2-migration-2026-10-21/legacy-calle-before-migration.zip`.
It preserves the pre-migration source for local recovery; no immutable public
tag or tested host rollback is claimed.

Both final Skill ZIPs passed CRC, path, complete-file and byte-identity checks
against the copied trees and publishable source files. The local `.DS_Store`
was correctly excluded. Neither artifact contains private credentials, runtime
records, repository evaluation fixtures or caches; known live-key and private-key
patterns were also absent. `callev2` contains no CLI launcher. The source bundle's
Skill files match the host-import candidate exactly.

## Validation

Environment: Node `22.23.3`, repository-pinned pnpm `10.18.3`, Python `3.13.8`,
cached official skills CLI `1.7.2`, and AgentSkills validator `0.1.1`.

| Check | Result |
| --- | --- |
| `pnpm check` | PASS on final synchronized source. |
| `pnpm test` | PASS: 182 tests, 181 passed and one platform-specific skip. |
| `.venv/bin/python -m tests.run_offline` | PASS: 237 offline tests, including three new identity/update-namespace checks. No real model or service execution. |
| `pnpm pack:dry-run` | PASS for workspace packages. |
| `pnpm pack:skill:callev2` and `pnpm pack:skill:calle-cli` | PASS; final artifacts recorded above. |
| Spec-aware validation of both source trees and extracted ZIPs | PASS for all four targets. |
| Cached official skills CLI `add <local-path> --list` | PASS for each Skill and repository-root discovery; both names found. Telemetry disabled, no installation performed. |
| Legacy preservation and focused checks | PASS: 12 private-package tests, nine documented CLI argument arrays, launcher/version synchronization and baseline byte comparisons. |
| Current documentation | Local links, English-only rewritten content and whitespace checked. |

An initial repository check/test run overlapped documentation migration and
reported a missing synchronized global install command. The final completed
documentation resolves that failure; `pnpm-check-final.log` and
`pnpm-test-final.log` contain the successful reruns. Initial logs remain for
traceability. An initial artifact comparison included the excluded `.DS_Store`;
the final comparison distinguishes publishable files from local state.

The older bundled skill-creator quick validator does not accept the existing
standard `compatibility` field. Spec-aware validation passes, so that valid field
was retained rather than changing the Skill to satisfy the older validator.

Local evidence includes `artifacts.json`, `candidate-source.json`,
`source-before.json`, `checks-final.json`, `artifact-validation.json`,
`legacy-preservation.json`, `environment.json`, `python-offline-237.log` and
the command logs in the evidence directory above. These local generated files
are not runtime Skill contents or a public evidence URL.

## Remaining user acceptance and publication

This work completes local preparation within the user's requested scope.
The [migration plan](../calle-skill-migration-plan.md) still controls the formal
cutover; its combined acceptance rows must not be marked PASS from only their
offline portions. In particular, the following remain separate:

- Publish the reviewed source and verify the actual remote name, version and
  update URL; check skills.sh discovery/indexing after publication.
- Install in the intended client/account, reload and verify activation; test
  old standalone migration, plugin coexistence and real host rollback.
- Complete the remaining Agent/mock and authorized service acceptance for the
  claimed host/interface scope. Historical Connect results apply only to their
  original inputs; this migration did not repeat live calls or model batches.
- After successful personal testing and separate cutover authorization, prepare
  the official `calle` candidate with its own identity, URLs, artifacts and
  verification. Publish and verify the `calle-cli` recovery path first.

## Release decision

- **Decision:** Major release required for the breaking standalone identity and
  install-path migration. `callev2` metadata/evaluation version is `2.0.0`.
- **Affected surface:** Root standalone `callev2` and `calle-cli`; private
  `@call-e/skills-sh-skill` validation/attribution. No unrelated npm package or
  plugin version bump.
- **Changeset:** Empty/no-npm-release record
  [callev2-staged-migration](../../.changeset/callev2-staged-migration.md) added.
  Changesets does not publish these root Skill ZIPs.
- **Next release action:** User publication of the accepted test candidate;
  official `calle` takeover remains deferred.
