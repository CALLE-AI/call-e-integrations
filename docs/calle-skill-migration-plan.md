# Staged callev2 and calle-cli Migration Plan

Originally recorded on 2026-10-20; staging authorization updated on 2026-10-21.

**Initial staging authorization: move the legacy standalone `calle` to `calle-cli` and
stage the MCP/API implementation as `callev2` version `2.0.0` for personal testing.
The eventual official `calle` takeover remains a separate cutover.**

This explicitly authorized staging step supersedes the earlier instruction to
leave all migration implementation deferred. It permits the local source,
metadata, packaging, test and documentation changes for these two identities.
It does not authorize publishing, replacing installed copies automatically,
placing calls, or treating historical acceptance as acceptance of new names.
The user will publish the prepared source when ready.

Publication follow-up on 2026-10-21: the initial `2.0.0` source was published
through PR #161. The user separately authorized publishing the `2.0.1` patch
to verify same-name updates, while retaining the installed `2.0.0` test copy.
This follow-up supersedes the initial publication restriction above; the formal
`calle` cutover remains separate. The initial migration decision and evidence
below retain their original `2.0.0` scope.

The selected repository remains `CALLE-AI/call-e-integrations`. Personal testing
means using `callev2` in the user's own host and account, not changing repository
ownership. The selected source directory is `skills/callev2`; no personal fork
or additional publisher URL is assumed.

The [Connect readiness record](verification/calle-connect-release-readiness-2026-10-21.md)
retains the completed readiness work, scoped acceptance and explicit evidence
limits for its original inputs. Preserve that record and all earlier hashes.
The [staged migration verification record](verification/callev2-migration-2026-10-21.md)
tracks the renamed files separately. Later formal cutover requires its own evidence.

## Identity and version ownership

| Surface | Authorized staged state | Later formal state |
| --- | --- | --- |
| MCP/API standalone Skill | `skills/callev2`, name/display `callev2`, invocation `$callev2`, metadata/evaluation version `2.0.1` | `skills/calle`, name/display `calle`, invocation `$calle`, only after the formal cutover gates |
| Legacy standalone CLI Skill | `skills/calle-cli`, name/display `calle-cli`, invocation `$calle-cli` | Remain available as the compatibility and legacy-recovery entry |
| Legacy CLI attribution | Private `@call-e/skills-sh-skill` owns `skills_sh/skills_sh_skill/0.1.0` | Preserve its independent version authority |
| CLI executable/package | `calle` / `@call-e/cli` | Unchanged names and independent releases |
| Ecosystem plugins | Existing plugin identifiers and package-scoped `calle` Skills | No automatic migration or version bump |

`2.0.0` is the chosen standalone release designation for the new generation's
setup, confirmation and recovery contract. It does not assert that the legacy
Skill published a `1.x` release. Historical Connect metadata was `0.2.0`;
private legacy attribution is still `0.1.0`. Neither determines CLI or plugin
package versions. Keep metadata, current evaluation inputs and the new release
record aligned without rewriting historical records.

The updater supports stable numeric `major.minor.patch` comparisons. Do not
assume a prerelease such as `2.0.0-rc.1` is supported; use explicit candidate
revisions for testing. Once published, a version's artifact contents must remain
immutable. A change to a separately named Skill still needs an explicit migration.

## Authorized implementation now

### callev2 candidate

Move the complete accepted MCP/API source from `skills/calle-connect` to
`skills/callev2`. Align frontmatter, title, UI display, default prompt, references,
metadata and current evaluation inputs. Source metadata targets:

- Source: `https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/callev2`
- Update: `https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/callev2/SKILL.md`

Keep production-only routing, native MCP preparation/cards and user Dial,
API persistence/idempotency, original resource recovery, result waiting and final
delivery behavior. Business operations and updates remain outside the CLI;
the limited official host MCP management exception stays separate.
Do not add a CLI launcher, credentials, operation records or repository-only
evaluation fixtures to this artifact.

`pnpm pack:skill:callev2` builds `dist/skills/callev2.zip` with top-level
`callev2/`. An optional manual-publication source bundle contains only the complete
`skills/callev2/` tree plus root README and LICENSE; it is distinct from the host
import ZIP. Preserve the repository path so the configured metadata stays valid.
No generated file or local URL is proof of upload, indexing or public availability.

### calle-cli compatibility entry

Move the original standalone CLI implementation to `skills/calle-cli`; update
identity, UI display, invocation and installation references. Preserve its CLI
selection, configuration/cache addressing, authentication, recovery behavior,
call/run identifiers and `skills_sh/skills_sh_skill/0.1.0` attribution.
Cache continuity does not prove that a credential remains valid.

`pnpm pack:skill:calle-cli` builds the separate compatibility ZIP. The official
repository install explicitly selects `--skill calle-cli`. Existing installed
`calle` copies are not renamed automatically: users install and verify the new
entry, preserve state, then retire only the intended old standalone copy.
Do not log out, delete tokens, convert identifiers or replay calls as cleanup.
No removal date is set for the compatibility entry.

### Shared repository work

| Area | Required staged behavior |
| --- | --- |
| Launcher and version synchronization | Target `skills/calle-cli` for legacy CLI launchers and attribution; keep plugin targets intact and leave `callev2` free of CLI launchers. |
| `packages/skills-sh-skill` | Remain the private owner of legacy CLI validation and attribution; assert the new `calle-cli` identity and paths. |
| CLI integration tests | Retarget only the standalone legacy fixture; retain plugin identities and attribution. |
| Root scripts, packer and CI | Package both `callev2` and `calle-cli`; remove obsolete `pack:skill:connect` and `pack:skill:calle` commands during staging. |
| `tests/` | Use `tests/behavior/callev2-evals.json`, current Skill `callev2`, version `2.0.1` and selected update URLs; preserve stable scenario IDs and historical evidence. |
| Current documentation | Synchronize layout, maintenance, install guides, root README and test guides. Keep the stable `docs/install/CALL-E-installation-guide.md` file and old-guide pointers. |

The canonical candidate guide is [callev2](install/callev2.md); the old
[Connect guide](install/calle-connect.md) remains a pointer. Historical
`docs/verification/` and earlier changeset records retain their original names,
hashes, results and claims. The old source directory must not remain a third
installable Skill merely to preserve a documentation link.

## Migration boundaries

| User state | Current path | State boundary |
| --- | --- | --- |
| Existing standalone CLI `calle` user | Explicitly install and verify `calle-cli`, then retire the intended old standalone copy. | Preserve CLI auth/configuration and legacy recovery; no forced logout. |
| Existing `calle-connect` tester | Explicitly install `callev2`, reload and verify its name/version before retiring the old tester copy. | Preserve configuration references, API request/idempotency records and MCP Call/preparation context. |
| New personal tester | Install the complete local candidate or published exact `callev2` source. | Installation does not authorize service requests or a call. |
| Plugin user | Keep the plugin's own `calle` entry unless separately migrated. | Root Skill changes do not update plugin payloads. |
| User with a different saved service endpoint | Keep the existing supported recovery route and resolve the mismatch explicitly. | Do not rebind credentials or old calls to production. |

Confirm project/global scope, local edits, symlinks and plugin copies before
cleanup. File installation, host reload and actual activation are distinct.
Keep legacy plan/run IDs on their original CLI recovery path; do not convert
them to new MCP Call IDs. API calls retain their own request records. Unknown
write outcomes never authorize recreating the call through another interface.
The new Skill must not invoke `calle-cli` as a fallback for missing cards/tools.

The migration does not rename the CLI, service APIs, existing MCP connections or
host tool namespaces. Where a host cannot distinguish overlapping Skills,
enable the appropriate entry explicitly for that context.

## Release sequence and remaining gates

### Gate A: preserve the completed readiness evidence and its limits

The earlier readiness work is recorded for the original Connect inputs. The
user now authorizes staging despite the remaining formal publication and
renamed-artifact gates. Do not describe this authorization as a blanket PASS for
every host or conditional scenario. Preserve unresolved fixture/live acceptance
limits and revalidate behavior changed after the recorded inputs.

### Staging: local callev2 and calle-cli preparation

Implement the authorized names, versions, packaging and synchronized guidance.
Record offline and artifact checks for both resulting trees. The user owns
remaining installation, activation and acceptance of `callev2` in the intended
host/account, including any separately authorized service actions. Publishing
is a later user action. The current repository source is the selected origin;
do not substitute a fork or a guessed hosted ZIP.

### Gate B: accept final identities and artifacts before formal calle cutover

Validate the complete staged artifacts, real host loading, explicit legacy and
Connect migration, coexistence, update source binding and rollback. Offline
checks or old Connect results alone do not close this gate. Any required failure
or unexecuted acceptance condition must remain explicit or the claimed support
scope must be narrowed.

The later canonical candidate changes `callev2` to `calle`, including UI,
source/update URLs, packaging and install guidance. Revalidate that candidate;
passing `callev2` tests does not itself authorize overwriting the official
`calle` identity. Publish and verify the `calle-cli` recovery/install route before
that formal takeover. Preserve immutable source revisions and artifact hashes.

Use controlled mock metadata and fixed candidate revisions before publication;
label that evidence as simulation. Actual public source delivery belongs to C01.
A major version is a compatibility signal, not a guarantee that existing
unpinned source installations require a fresh opt-in before updates.

### Gate C: publish and verify the formal cutover

After Gate B and the separate cutover authorization, coordinate canonical
source, version metadata, packaging, install guidance and migration notice.
Verify actual public source, complete artifacts, canonical/compatibility
installation and loaded identity. Index refresh is separate from publishing;
do not promise retained rankings or installation statistics.

Resolve the standalone immutable-tag/release-record convention using
[Git naming rules](git-naming-conventions.md). Do not create a repository-wide
`v2.0.0` tag or reuse an unrelated package namespace. Changesets does not publish
root Skill ZIPs automatically. The current user-authorized staging work does
not perform this publication or formal takeover.

## Acceptance matrix

Candidate-specific outcomes belong in the new migration verification record.
Earlier Connect results remain valid only for their recorded inputs and scope.
This plan does not assign PASS to renamed artifacts or published delivery.
Record evidence, candidate revision, host/version and outcome for each row.
Use `PASS`, `FAIL`, `NOT_RUN`, or `NOT_APPLICABLE` with a reason. Required
`FAIL` or `NOT_RUN` results block the corresponding gate.

| ID | Acceptance requirement | Gate |
| --- | --- | --- |
| A01 | Current offline suite and actual Agent/mock scenarios pass for the behavior to be migrated; unexecuted scenarios are identified. | A |
| A02 | Each claimed host/interface supports setup, required tools or HTTP, confirmation, result delivery and appropriate persistence. Record authorized live evidence separately from mocks. | A |
| B01 | Directory, frontmatter, UI display and prompt match `callev2` and `calle-cli` during staging, then the formal `calle` candidate at cutover; a fresh host loads the intended entry. | B |
| B02 | Metadata and evaluation versions match the selected standalone release; source/update URLs target the selected identity and repository (`callev2` during staging, `calle` only at formal cutover). Legacy attribution matches its private package authority. | B |
| B03 | Both ZIPs have the correct root directory and complete internal resources. The new MCP/API artifact contains no CLI launcher, stale legacy references, credentials, records or repository test fixtures. | B |
| B04 | Synchronization and versioning checks preserve the separation on a clean working copy. Existing CLI/plugin tests remain valid; no unrelated payload/version changes appear. | B |
| B05 | CLI users can install `calle-cli` and use the original configuration and recovery paths without forced logout or token conversion. Invalid credentials produce an honest auth result. | B |
| B06 | At the later formal cutover, updating/replacing old standalone `calle` loads the new workflow without stale-file mixing, lost local edits or removal of another installation scope. | B |
| B07 | Connect testers migrate explicitly, preserve configuration references and operation records, retire the correct tester copy and verify the new loaded version. | B |
| B08 | Legacy IDs remain on CLI recovery; new MCP Call IDs and API records remain on their original interfaces. Unknown write outcomes never cause a second call. | B |
| B09 | New MCP uses the real card, latest revision and user Dial action. Missing card support does not trigger a legacy tool or post-submission API fallback. | B |
| B10 | API setup, production endpoint validation, secret injection and pre-write persistence work. Auth rejection, incomplete discovery and endpoint mismatch do not silently change credentials or routes. | B |
| B11 | Result waiting and final delivery preserve the accepted contract, including pending results after call completion, interruptions and the documented ceiling. | B |
| B12 | Standalone/plugin and project/global combinations resolve correctly or produce clear activation guidance. Explicit CLI requests do not execute through the new MCP/API path. | B |
| B13 | Controlled candidate updater cases cover update success, no update, unavailable source and name mismatch. Fixed-revision installation tests distinguish saved files from host-confirmed activation. | B |
| B14 | Rollback restores a usable chosen Skill without deleting records, copying tokens across interfaces or replaying calls. Published version contents remain immutable. | B |
| C01 | Released public source, version and artifacts match the accepted candidate; actual canonical update delivery and canonical/compatibility installations load correctly. | After cutover |
| C02 | Migration links remain usable, tester retirement is documented, and advertised discovery/indexing has actually been checked. | After cutover |

For implementation, run the applicable existing repository checks:
`pnpm check`, `pnpm test`, `pnpm test:skills:offline` with its documented Python
environment, and `pnpm pack:dry-run`. Also build and inspect both standalone
ZIPs with their final packaging commands. Record the actual command results
against the candidate hashes. Offline success does not replace host installation, activation, live acceptance or publication
checks; this documentation authorizes no calls or publication.

## Rollback and support

Record immutable revisions and hashes for the last legacy `calle`, the accepted
`calle-cli` and each new candidate. Restore only the selected installation scope,
preserve local changes and records, and verify loaded identity after reload.
Changing a Skill does not transfer a pending call to another interface.

If the new workflow is unsuitable, use the accepted compatibility entry or a
pinned prior installation while keeping existing MCP/API calls on their original
recovery path. Do not replace already released version contents or move immutable
tags; publish corrections under an appropriate new version.

The user owns the remaining publication and formal-cutover decisions. This local
migration delivers reviewable source and artifacts; it does not silently install,
remove, publish or accept the candidate on the user's behalf.

## Release decision

- **Decision:** Major release required for the breaking standalone identity and
  install-path migration; the new standalone version is `2.0.0`.
- **Affected surface:** Root-distributed `callev2` and `calle-cli` Skills and their
  install/update metadata. Private `@call-e/skills-sh-skill` continues owning
  legacy validation/attribution at `0.1.0`.
- **Changeset:** Record the standalone migration and release boundary in the
  migration changeset/release notes. No unrelated CLI/plugin npm bump is implied;
  the root Skill distribution is not an npm publish performed by Changesets.
- **Suggested version bump:** `callev2` metadata/evaluation `2.0.0`; keep unchanged
  CLI/plugin package and private attribution versions independent.
- **Remaining work:** Candidate-specific Gate B evidence, user publication and
  public-delivery verification; later official `calle` cutover remains separate.
