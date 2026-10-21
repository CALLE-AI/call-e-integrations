# CALL-E Connect 0.2.0 Merge Verification Record

The merge, preview-boundary, translation, evaluation-relocation, host-management,
and legacy-tool-exclusion results below are historical snapshots. See the
production-only follow-up at the end for the current customer endpoint policy.

Date: 2026-10-15, Asia/Shanghai. This record covers the local unified Skill merge
and checks. It does not establish publication, host installation, or live-account
integration testing.

The two old source directories have been merged into
[calle-connect](../../skills/calle-connect/SKILL.md). The main file shares interface
selection, authorization, operation records, and the update entry point; API and
MCP protocol details are loaded on demand. MCP/API services and existing plugin
payloads were not changed. Configuration, business operations, and updates
explicitly prohibit CLI, shell, terminal commands, and subprocess workarounds.

Prefer MCP when it supports the current operation. API can be selected before a
business write when MCP is not configured, the host lacks support, or complete
discovery confirms a missing capability. Authentication failure, cancelled
authorization, incomplete discovery, and unknown write outcomes do not trigger
automatic switching. Existing calls retain their original interface, identity,
and environment.

## Checks performed

| Check | Result |
| --- | --- |
| `.venv/bin/python -m tests.run_offline` | 122/122 passed: structure, HTTP templates, pure functions, and evaluation preparation checks. |
| `node --test scripts/test/pack-skills.test.mjs` | 7/7 passed, including unified ZIP bytes/CRC, reproducible packaging, and path and secret exclusions. |
| `pnpm check` | Passed using a Corepack entry in a temporary PATH to select the repository-required pnpm 10.18.3. |
| `pnpm test` | The initial run had 1 existing CLI mixed-installation test fail because the local npm shell wrapper was read as JavaScript; the other tests completed. After a temporary PATH selected the real npm-cli, the failed case passed in a targeted rerun. The npm installation and test source were not changed, and the full suite was not rerun. |
| `pnpm pack:dry-run` | Existing npm package output checks passed. |
| `pnpm pack:skill:connect` | Generated one `calle-connect.zip` containing 18 source files. |
| Independent ZIP review | Python zipfile CRC, file set, per-file bytes, and expanded directory matched the source at that time. |
| Independent instruction walkthrough | Checked routing, recovery, non-CLI execution, and update boundaries across 8 synthetic scenarios; no material issue found. This was not actual Agent/mock execution. |
| Independent evaluation catalog review | 91 scenarios, 284 expectations, no duplicate IDs, and 0 record-consistency errors; all NOT_RUN. |
| Skill Creator `quick_validate.py` | Failed: its field allowlist does not accept the retained `compatibility` field. Repository structural checks accept it; this does not establish successful host installation. |

The system-default pnpm 11.22.0 did not match the repository requirement, so full
checks used a temporary Corepack wrapper. The global package manager was not
changed. Test and packaging commands are repository development steps, not
execution steps for the installed Skill.

## Artifacts and evidence limits

- Merge-time ZIP: `dist/verification/calle-connect-0.2.0/pre-preview-fix/calle-connect.zip`.
- SHA-256: `3c8000f178d6a0a284fa10a16c9690ae69a61769575ef3070c492949e06845d2`.
- Merge-time input hashes and NOT_RUN records: `dist/verification/calle-connect-0.2.0/pre-preview-fix/`.
- Older locally generated packages remain in `dist/verification/pre-merge-skill-artifacts/` and are no longer current distribution artifacts.

The merged formal evaluation contained 71 bundled scenarios and 20 repository
supplemental scenarios. Earlier business scenarios explicitly select API/MCP;
new routing scenarios have separate action limits, and update scenarios receive
no business, credential, or OAuth permissions. The preparer does not run a model.
Scenario definitions and offline assertions cannot replace behavioral acceptance.

Not executed: live CALL-E authentication or calling, target-host installation and
automatic discovery, complete Agent/mock scenarios, real update download and
reload, or skills.sh security audits. No push, publication, or change to the user's
installed Skill occurred. See the [installation guide](../install/calle-connect.md)
for old-name migration and the required one-time installation.

## Release decision

**No release needed (existing npm packages)**: the unified entry is separate from
existing package and plugin payloads and does not change their versions or stable
entry points. Two empty changesets were synchronized to record the local merge
and update mechanism; no package-version changeset is needed. `calle-connect`
uses independent source version `0.2.0`. Public distribution of the complete
directory and migration of old installations still require subsequent work.

## Preview boundary follow-up — 2026-10-15

The MCP testing guide previously allowed a read-only lookup for a missing ID
during a preview, contradicting the main Skill's local-only preview rule. API
preview guidance prohibited POST but did not explicitly exclude GET or credential
setup. The main Skill, both interface workflows, and both testing guides now
agree: use available schemas and data, leave missing fields unresolved, and make
no HTTP requests or MCP business calls. Preview requests do not authorize
credential reads, setup, login, or subsequent lookups. Tool listing also stops
at discovery; authorized read-only verification remains a separate task.

The repository AGENTS.md now requires English for new or rewritten authored
content. It governs repository files, while conversation language follows the
user's preference. This is an instruction, not an automated CI language gate;
existing non-English content was not bulk-translated.

Validation after the fix:

- 124 offline tests passed, including two regression checks for preview and
  discovery-only fixture permissions.
- 7 packaging tests passed.
- Independent instruction review found no actionable contradiction or regression
  in MCP preference, API Key fallback, non-CLI execution, or update boundaries.
- The 18-file ZIP was rebuilt; CRC, file names, bytes, and expanded files match
  the current source.
- The catalog contains 92 scenarios (72 bundled) and 288 expectations. All remain
  `NOT_RUN`; no real Agent/mock execution, CALL-E operation, or skills.sh audit
  was performed.

Preview-fix ZIP: `dist/verification/calle-connect-0.2.0/pre-english-translation/calle-connect.zip`.

SHA-256: `6c31174eee75278985b797b390716e025903c36fa844de3a429af7ffc4e083fd`.

Preview-fix source hashes and unexecuted scenario records:
`dist/verification/calle-connect-0.2.0/pre-english-translation/`.

Release decision: **No release needed** for existing npm packages. The affected
standalone `calle-connect` source is still an unpublished 0.2.0 draft outside
their payloads. The existing empty changeset records this correction; no new
package-version changeset or version bump is needed for this follow-up.

## English translation follow-up — 2026-10-15

Translated all 22 files containing Chinese in the newly added Git changes:
Skill instructions and references, HTTP template comments, evaluation prompts,
test guides, and supporting design and verification documents. Existing tracked
repository content was left untouched during this translation. The 52 new files
were scanned for non-English-script letters, including decoded JSON strings,
with no remaining findings. The nine tracked files with prior working changes
remained byte-identical to their pretranslation copies.

Translation integrity checks:

- All 109 translated JSON strings were originally Chinese prompts. JSON keys,
  structure, order, case counts, fixture data, action permissions, expected
  assertions, and existing English strings remained unchanged.
- HTTP request content remained byte-identical after excluding comments.
- Independent review of the main, API, and MCP workflows found no meaningful
  omission or change to authorization, preview, routing, or recovery rules.
  Update guidance retains anonymous reads, remote-content isolation, download
  and installation boundaries, and the prohibition on CLI execution.
- All 90 relative Markdown links in new files resolved. The translated events
  anchor was synchronized; removed historical source paths are now plain text
  rather than broken links.
- 124 offline tests and 7 packaging tests passed. The 18-file ZIP passed CRC,
  file-set, and byte comparison against both source and expanded output.

Translation ZIP: `dist/verification/calle-connect-0.2.0/pre-eval-relocation/calle-connect.zip`.

SHA-256: `9bab1c4bea1869478768194b55b4a12a753254763911bb1a18467da85e778c95`.

Translation source hashes and scenario records:
`dist/verification/calle-connect-0.2.0/pre-eval-relocation/`. The 92 formal Agent scenarios and 288
expectations remain `NOT_RUN`; translation checks do not establish live host
behavior or a skills.sh security audit result.

Release decision: **No release needed** for existing npm packages. This translates
the unpublished standalone `calle-connect` 0.2.0 draft and its supporting files,
outside existing package payloads. The existing empty changeset records the work;
no additional changeset or package version bump is needed.

## Repository-only evaluation follow-up — 2026-10-15

Aligned the entry description with the detailed routing rules: honor explicit
interface choices and existing-call origins; automatic API Key fallback for new
operations requires confirmed missing host support, a confirmed unconfigured
target connection, or complete discovery of a missing capability, before any
related business write. Authentication failure, cancelled authorization,
incomplete discovery, and unknown write outcomes do not trigger fallback.

Moved all 72 primary evaluation scenarios, including adversarial payloads and
their refusal expectations, unchanged from the installed Skill into
[`tests/behavior/calle-connect-evals.json`](../../tests/behavior/calle-connect-evals.json).
The file is byte-identical to the previous English ZIP, with SHA-256
`6235f11c122dc709244f24977ca3981aad3e945d8db694c7956e61bcadb3a848`.
Runtime instructions no longer link to repository fixtures, while safe manual
testing steps remain available. The packer additionally excludes directories
named `evals` or `tests`, case-insensitively at any depth. Source installations
also exclude the fixtures because they now live outside the Skill directory.

Validation:

- 125 offline tests passed, including fixture loading, independent fixture hash
  coverage, version alignment, and local links contained within the Skill.
- 8 packaging tests passed, including removal of test fixtures from stale ZIP
  and expanded outputs, and preservation of the legacy `calle` launcher.
- Independent review found no contradiction between the description and body
  or remaining runtime dependency on the relocated evaluation file.
- The 17-file ZIP passed CRC, exact file-set, and byte comparison against source
  and expanded output. No test or evaluation directory remains in these files.
- New and rewritten authored content remains English. All 92 formal Agent
  scenarios and 288 expectations are preserved and remain `NOT_RUN`.

Evaluation-relocation ZIP: `dist/verification/calle-connect-0.2.0/pre-host-management/calle-connect.zip`.

SHA-256: `14e9f168d9859d178303b6732891e10a9afae8223c65883ba71f648a9e57abc4`.

Evaluation-relocation source hashes and unexecuted scenario records:
`dist/verification/calle-connect-0.2.0/pre-host-management/`. The preceding translation
artifact and evidence are retained under `pre-eval-relocation/`. These local checks do not
establish publication, live host behavior, or a skills.sh security audit result.

Release decision: **No release needed** for existing npm packages. The affected
standalone `calle-connect` source remains an unpublished 0.2.0 draft outside their
payloads. The existing empty changeset records these changes; no additional
changeset or package version bump is needed.

## Host management follow-up — 2026-10-15

MCP connection management now reuses existing connections and prefers the current
host's exposed native tools, APIs, or permitted Agent-operable settings interface.
If these are unavailable, an already-installed official MCP management command
of that same host may handle help/status, authorized configuration and OAuth,
supported refresh, or explicitly requested logout/removal. Codex uses Codex's
capabilities; Claude Code uses Claude Code's. Command identity and supported
syntax must be verified. Missing capabilities do not justify installing a new
client, and a host permission denial does not justify changing mechanisms.

Business operations still use actual MCP tools or direct authenticated HTTPS.
API setup, version checks, downloads, and Skill installation remain non-CLI.
Explicit user no-CLI restrictions and offline/preview boundaries take precedence.
The Agent starts authorized setup and opens the host-generated authorization
link; the user completes browser login and consent. Adding a connection may
already initiate OAuth, so the flow must not start a second login. Authentication,
current-chat tool loading, identity verification, and business reads remain
separate completion states. MCP preference and API fallback conditions are
unchanged.

The entry point, connection/MCP guidance, manual acceptance guidance, source
notes, install and maintenance docs, update design record, and existing empty
changesets were synchronized. Repository-only fixtures add nine host management
scenarios; four prior authentication scenarios were aligned with this boundary.
Mock management commands require explicit MCP authentication scope and verified
same-host, installed-official-command, permission, native-unavailability, and
user-limit fixture metadata. Each scenario retains its own action allowlist.
API, routing, and update scopes cannot acquire this permission, and the offline
guard still blocks real subprocesses and network access.

Validation:

- 132 offline tests passed, including seven new fixture isolation and preparation
  checks. Eight packaging tests passed.
- Independent read-only instruction review found no actionable conflicts or
  broad permission leakage. A written walkthrough covered native preference,
  Claude Code command fallback, explicit no-CLI restrictions, permission denial,
  shell-only update checks, and authentication without loaded tools. This was
  instruction review, not execution of the formal Agent/mock suite.
- The 17-file ZIP passed CRC, exact file-set, and byte comparison against source
  and expanded output. Evaluation fixtures remain outside the installed Skill.
- All 53 new text files and added lines in tracked files passed a non-English
  script scan. All 127 relative Markdown paths resolved, and `git diff --check`
  passed.
- The formal catalog contains 101 scenarios and 313 expectations, all `NOT_RUN`.
  No live MCP setup, OAuth, business request, or skills.sh security audit ran as
  part of this instruction revision.
- The generic `skill-creator` quick validator rejected the existing
  `compatibility` frontmatter key because it is absent from that validator's
  allowlist. This is recorded as a validator limitation, not a passing check;
  the field was preserved. Repository offline validation passed separately.

Host-management ZIP: `dist/verification/calle-connect-0.2.0/pre-legacy-tool-ban/calle-connect.zip`.

SHA-256: `ff5d2bad9dbfa764363b2f8cdeec945899bbb923c3ca0d484465ed1e58a1258a`.

Host-management source hashes and unexecuted scenario records:
`dist/verification/calle-connect-0.2.0/pre-legacy-tool-ban/`. The previous ZIP and evidence are
preserved under `pre-host-management/`.

Release decision: **No release needed** for existing npm packages. The affected
standalone `calle-connect` source is still an unpublished 0.2.0 draft outside
existing npm and plugin payloads. The existing empty changesets record the
change; no additional package-version changeset or version bump is needed.
Publishing changed standalone behavior later requires synchronized version
metadata and distribution checks; this local revision does not publish it.

## Legacy tool exclusion follow-up — 2026-10-15

The standalone Skill now explicitly prohibits `plan_call`, `run_call`, and
`get_call_run`, including host-prefixed names and aliases. The exclusion covers
preparation, execution, read-only authentication checks, queries, and recovery.
Discovery may list these tools as prohibited; neither their presence nor missing
current tools authorizes invoking them through MCP or another transport.

The current Preparation/Call flow uses the discovered `prepare_call` contract
and the user's Dial action in its host card. Preparation is a saved write, not
a preview, authentication probe, or completed call. Current reads use the Call
resource ID rather than a preparation, legacy run, or telephone/Billing ID.
Missing cards and uncertain preparation outcomes do not trigger automatic API
redial. Ordinary API fallback for a new operation retains the existing complete
discovery, pre-write, authorization, and explicit-interface conditions.

The main Skill, MCP and connection references, manual test guide, source notes,
installation guide, documentation maintenance rules, and existing empty
changeset were synchronized. Existing CLI and plugin integrations were not
changed. The seven host-exposed definitions were inspected as metadata only;
no business tool was invoked.

Validation:

- 135 offline tests and 8 packaging tests passed. Three new offline tests check
  explicit MCP call fixture permissions and separation from other scopes.
- Seven new repository scenarios cover tool coexistence, legacy-only discovery,
  read-only checks and recovery, ID distinctions, unavailable cards and unknown
  preparation results, local previews, and permitted pre-write API fallback.
  The formal catalog now has 108 scenarios and 339 expectations, all `NOT_RUN`.
- Independent read-only simulation of six scenarios found no remaining conflict
  after clarifying that discovery alone completes only metadata/tool-listing
  checks, not read-only business verification. This was instruction review, not
  formal Agent/mock or live service execution.
- The rebuilt 17-file ZIP passed CRC and exact file/byte comparisons against
  source and expanded output. Repository evaluation fixtures remain excluded.
- All 53 new text files and tracked added lines passed the non-English script
  scan; all 133 relative Markdown paths resolved. The 50 bundled relative links
  and anchors also resolved within the Skill. `git diff --check` passed.
- The generic Skill validator still rejects the existing `compatibility`
  frontmatter key because of its allowlist; this is not recorded as a pass.
  No live authentication, dialing, or skills.sh audit was performed.

Legacy-tool-exclusion ZIP at the time: `dist/skills/calle-connect.zip`.

SHA-256: `5ac0bb052c2f09167561df7b4d80a70058f11e4cd360b761ef0fe4a01d7841f0`.

Legacy-tool-exclusion source hashes and unexecuted scenario records:
`dist/verification/calle-connect-0.2.0/`. Previous host-management artifacts are
preserved under `pre-legacy-tool-ban/`.

Release decision: **No release needed** for existing npm packages. This changes
only the unpublished standalone `calle-connect` 0.2.0 draft and supporting
repository files, outside existing package/plugin payloads. The existing empty
changeset records the change; no additional package-version changeset or version
bump is needed. Public standalone distribution remains a separate step.

## Production-only customer setup follow-up — 2026-10-19

The customer Skill now fixes the MCP endpoint to
`https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth` and the API base URL to
`https://api.heycall-e.com`. Setup uses production directly without asking users
to choose an environment or offering alternative service endpoints. A different
saved URL requires resolution before sending credentials or requests; credentials
and existing operation records must not be silently moved to production.

The source, setup and interface references, HTTP assets, manual guidance,
repository scenarios, installation guide, and maintenance/layout guidance are
synchronized. The historical live-acceptance report labels its earlier endpoint
selection as superseded and points continuations to the fixed production setup;
its zero-submission outcome is unchanged. Earlier counts, hashes, and acceptance
limits in this record remain historical evidence, not validation of this revision.

Validation of this revision:

- `.venv/bin/python -m tests.run_offline`: 138 passed.
- `node --test scripts/test/pack-skills.test.mjs`: 8 passed. Manifest-version
  checks and `sync-install-doc-versions.mjs --check` also passed.
- `node scripts/pack-skills.mjs --public calle-connect` rebuilt the 17-file ZIP.
  Independent zipfile CRC, exact filename, and byte comparisons passed against
  source and expanded output. The ZIP contains only the customer API origin
  `https://api.heycall-e.com`, with no test/evaluation fixtures. The Skill's English
  script scan found no non-English text.
- All 111 formal Agent/mock scenarios remain `NOT_RUN`. A separate fresh-Agent
  hypothetical reading of three local cases found no contradictory instructions;
  this was not formal, mock-tool, or live execution.
- The generic Skill validator still rejects the preexisting `compatibility`
  frontmatter key; this is not recorded as a pass. The initial
  `pnpm pack:skill:connect` dependency preflight reported an ignored esbuild build
  script but still packaged; direct Node packaging and tests passed without that
  preflight. No publication or live service tests occurred.

Current ZIP: `dist/skills/calle-connect.zip`.

SHA-256: `6a6dee18a05c32ddddb7bfc3defe6331cb5b65427a564e93d0728b154f1dca9b`.

Release decision: **No release needed** for existing npm packages. Only the
unpublished standalone `calle-connect` 0.2.0 draft and supporting repository files
change, outside existing npm and plugin payloads. The empty
`calle-connect-production-only` changeset records the customer behavior change;
no package-version changeset, version bump, or publication is included.
