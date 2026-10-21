# CALL-E Connect Release Readiness — 2026-10-21

Status: **preparation record completed; Gate A remains open**. Current offline checks
and packaging pass. MCP acceptance reaches the returned ready preparation, as
explicitly accepted by the user. The API test submitted one call and retrieved
its final result; it was not answered and the greeting was not delivered. Actual
Agent/mock execution and review records identify passing paths, historical
failures, remaining coverage gaps and an unresolved inference/transport blocker.
No naming migration or publication has occurred.

## Scope and evidence boundaries

The tested source is the unpublished [calle-connect 0.2.0
draft](../../skills/calle-connect/SKILL.md). Its current identity and version
remain unchanged. This record supports the [calle 2.0.0 / calle-cli migration
plan](../calle-skill-migration-plan.md); it does not replace its gates or establish
acceptance of future renamed artifacts.

The user authorized one short English greeting call per interface to
`+1******3381`, without duplicate submission. The user subsequently accepted
ending the MCP test at its ready card, before Dial. API execution was separately
authorized; it was not an automatic retry of the MCP preparation.

Repository checks and packaging evidence are in the local directory
`dist/verification/release-readiness-2026-10-21/`. These local files are not
published download URLs. The [final repository checks](../../dist/verification/release-readiness-2026-10-21/final-repo-checks.json),
[final Python summary](../../dist/verification/release-readiness-2026-10-21/agent-eval/offline-final-summary.json)
and [current archive manifest](../../dist/verification/release-readiness-2026-10-21/zip-integrity-resume-fix.json)
record command outcomes, counts, limits and every packaged file's hash. The local `live-evidence.json` is the
sanitized live evidence record. Live observations below come from this task's
host tool results and private recovery records. Credentials, full phone
numbers, full live resource identifiers and private storage paths are omitted.

The [2026-10-15 live attempt](calle-connect-live-acceptance-2026-10-15.md) and
[earlier merge verification record](calle-connect-0.2.0.md) retain their historical
results. Their hashes and counts are not current acceptance evidence.

## Baseline verification

The successful baseline used Node **22.23.3**, the repository-pinned pnpm
**10.18.3**, Python **3.13.8** from `.venv`, and Agent Skills validator
**0.1.1**. The local verification `tool-bin/` selected the pinned package-manager
and Node/npm entry points. The environment's default pnpm **12.11.2** was not
used for the passing repository run.

The baseline summary was recorded at **2026-10-21T03:38:35.272324Z**. Commands
below ran from the repository root. Validator command names are shown without
their machine-specific executable cache prefix; their full argv is retained in
the local packaging summary.

| Command or verification | Result | Local evidence |
| --- | --- | --- |
| `pnpm check` | PASS, exit 0 | `pnpm-check-pinned.log` |
| `pnpm test` | PASS, exit 0; 182 tests: 181 passed, 0 failed, 1 skipped | `pnpm-test-pinned.log` |
| `.venv/bin/python -m tests.run_offline` | PASS, exit 0; 148 tests | `skills-offline-after-fix.log` |
| `pnpm pack:dry-run` | PASS, exit 0 | `pack-dry-run-pinned.log` |
| `pnpm pack:skill:connect` | PASS, exit 0; rebuilt the current standalone ZIP | `pack-connect.log` |
| `agentskills validate` against the source `skills/calle-connect` directory | PASS, exit 0 | `spec-aware-frontmatter.log` |
| `agentskills validate` against the expanded ZIP's `calle-connect` directory | PASS, exit 0 | `spec-aware-frontmatter-expanded.log` |
| Source, copied output directory and expanded ZIP comparison | PASS; all 18 files match byte for byte | `zip-integrity.json` |

The skipped Node test requires Windows `cmd.exe`; Windows execution was not
performed on this macOS host. The Node count includes eight packer tests.
Python counts describe offline test methods, not Agent scenarios. Passing these
commands does not prove authentication, host activation or Agent behavior.

The initial checks exposed local test-fixture problems:

- Hidden `.DS_Store` metadata caused three packer fixture assertions and one
  UTF-8 origin-scan error. `scripts/test/pack-skills.test.mjs` now excludes hidden
  local files when copying real-source fixtures and explicitly verifies
  `.DS_Store` exclusion. `tests/test_package.py` ignores hidden local metadata
  during source discovery and adds a regression test.
- The default pnpm version differed from the project pin. The local mise npm
  entry was a shell wrapper that an existing end-to-end helper attempted to
  execute as JavaScript. The successful rerun selected the pinned toolchain and
  actual npm JavaScript entry. This is an environment correction, not evidence
  that pnpm 12 compatibility was tested.

The current spec-aware validator accepts the optional `compatibility` field;
the valid field was retained. An older validator's rejection is not used as a
reason to remove current Skill metadata.

## Baseline packaged input identity

| Input or artifact | Value |
| --- | --- |
| Source identity | `skills/calle-connect`, `name: calle-connect`, version `0.2.0` |
| `SKILL.md` SHA-256 | `5baf8a0ad7b751eadef523808296ae685139a2076b13f7d103610eda81d65507` |
| ZIP | `dist/skills/calle-connect.zip` |
| ZIP SHA-256 | `6eb9c8e0b84e76ce94a049df9e08bbc6c4e32a300cf320242b138200b2ab52ec` |
| ZIP size | 128,087 bytes |
| Source files in ZIP | 18, under one `calle-connect/` root |
| Polling reference | `references/polling.md` included |
| Local metadata | `.DS_Store` excluded |

This replaced the previously stale local archive, which lacked the current
polling reference. The manifest establishes the bytes tested and packaged at
this checkpoint. Later source changes require corresponding revalidation; a
matching version string alone does not establish matching contents.

## Final local artifact checkpoint

The later instruction fixes were repacked at **2026-10-21T04:16:18Z**. This is a
local test artifact, not a published release. The original baseline archive is
retained separately as `baseline-calle-connect.zip` in the evidence directory.

| Input or artifact | Final local value |
| --- | --- |
| Source identity and version | Still `calle-connect` / `0.2.0`, unpublished |
| `SKILL.md` SHA-256 | `e313792531896cb9bfeb9a408b2a1edaed7539822d96e30ca7f3ebcc0157c6f4` |
| ZIP SHA-256 | `ed5889871aa439b0dfce3f1ab5807e004d7070103e58cfcbd4ab86bf618effa7` |
| ZIP size and file count | 131,677 bytes; 18 files |
| Full file-manifest SHA-256 | `53ce7a7781003c31f8b122a2620e8a0007f7cc4ce280ee15110aa806b6cbb6be` |
| Source/copied/expanded comparison | All files byte-identical; polling reference included; local metadata excluded |
| Current spec-aware validation | Source and expanded ZIP both exit 0; `compatibility` retained |

The [final file manifest](../../dist/verification/release-readiness-2026-10-21/zip-integrity-resume-fix.json)
binds every bundled reference as well as `SKILL.md`. Matching only the entry
file hash is insufficient: later API and setup corrections changed references
without changing the entry file. Validator and packing commands are in
`pack-frontmatter-resume-fix.json` and its logs.

The final repository rerun also passed `pnpm check`, `pnpm test` and
`pnpm pack:dry-run`, recorded in `final-repo-checks.json`; Node test counts remain
182 total, 181 passed and one Windows-only skip. The final Python offline suite passed **234 tests** after the evaluator repairs,
recorded in `agent-eval/offline-final-with-native-progress.log`. The earlier
148-test baseline remains historical. `git diff --check` also passed.

## Instruction corrections from actual evaluation

The original failures remain in their run directories; corrected reruns have
separate inputs, traces and independent reviews. No failure record was rewritten
into a pass.

- Local previews now include concrete method/URL/body or supported task details,
  unresolved values, private Key prerequisites and the need for separate remote
  lookup authorization. Missing durable storage does not remove the preview.
- MCP previews exclude immediate-dial substitutes. A missing connection handoff
  explains configuration, host-managed OAuth and tool loading without starting
  unauthorized setup.
- Result monitoring reports progress before the next wait would cross the
  60-second interval, then continues with the same ID and polling count.
- A resumed monitoring session restores its saved count and transient-error
  streak before its first read. It waits for the saved phase instead of applying
  the fresh-session immediate-read rule; an exhausted retry streak does not
  receive another request.
- A documented pre-acceptance input rejection explicitly reports that the
  rejected request created no Call; uncertain acceptance retains uncertainty.
- Key replacement reports the old-Key revocation step only after intended
  callers switch to and verify the replacement; no automatic revocation occurs.
- Supplied API acceptance responses are merged into available private recovery
  storage, preserving original fields and marking missing context explicitly.

## Actual Agent/mock evaluation

The formal inventory contains **116 scenario IDs plus independent variants**.
Actual model execution now exists; offline unit-test counts are not substituted
for it. The installed official **Codex 0.162.1** CLI ran isolated ephemeral
sessions with only a synthetic fixture MCP server. Its existing inference
authentication remained host-owned. Business calls, OAuth, browser navigation,
credentials and filesystem mutations inside scenarios were simulated; only the
model inference itself used network access. The CLI default model was used;
a separately attested model identifier is not claimed.

The evaluator disables native shell, browser, apps, plugins, general filesystem
and other Agent capabilities. The fixture process probes denial of sockets and
subprocesses, and reviewers compare native events with every dispatcher attempt,
result and final output. `agent-eval/isolation-2/isolation.json` records the
earlier passing capability canary. Final frozen runs use the re-bound
`final-frozen/isolation-final/isolation.json` and `frozen-inputs.json`; the
invalidated first revision is preserved separately. This is a capability boundary for this installed
host, not a general operating-system sandbox for arbitrary untrusted code.

The final cadence repair audits timing after execution from reconciled native
messages and successful fixture progress reports. It no longer rejects a wait
solely because the synthetic report tool was not used. Resource identity, phase
delays, server deadlines, interruptible chunks and read ceilings remain guarded.
The auditor reports temporal gaps and uncertain timelines; independent review
still judges whether the message content is adequate. A continuation checkpoint
may update only its observed progress timestamp, never call identity, counts or
deadlines. The final evaluator/Skill manifest is
`final-cadence/frozen-inputs.json` (SHA-256
`0dea31b66d8df2b15ef7906054e68dc4dafaa89cb738e67604bec390419a8189`).

The [evaluation guide](../../tests/agent-evaluation.md) documents the runner and
[tests README](../../tests/README.md) distinguishes its evidence from offline
checks. Each execution retains its loaded Skill/reference hashes, fixture,
actual output, native events and mock trace. Independent review files record
criterion-level judgments and fixture limits. The runner itself never assigns
a behavioral PASS.

| Checkpoint | Reviewed evidence and scope |
| --- | --- |
| `batch-1` | 47 executions: 38 PASS, five FAIL, four INCONCLUSIVE. The five failures were preview/setup explanation defects, including an excluded immediate-dial preview target. |
| `batch-2` polling | 16 historical executions: 14 short-path passes and two attempted waits that would cross 60 virtual seconds without progress. Invalid onboarding attempts are retained separately. |
| `batch-3` auth/update | Four historical runs passed 32 criteria across seven model turns; old onboarding attempts are not counted again as passes. |
| `fixed-regression` | All five original preview/setup regressions passed independent review; three two-turn API onboarding paths passed 42 criteria through accepted create and saved ID. Both 32-read polling bases reached final availability with the required intervals and progress. |
| `remaining-formal` | 90 executions: 70 PASS, three FAIL, 13 INCONCLUSIVE and four BLOCKED. The three instruction defects were rejection wording, accepted-ID persistence and old-Key handoff; each received a separate corrected rerun. Fixture and rubric limits remain distinct from Skill failures. |
| `remaining-polling` | 28 executions: 26 exercised branches passed, one interruption-only branch lacked actual resumption, and one MCP resumed-retry phase failed. Both interfaces reached exactly 120 reads in pending-at-cap and final-at-cap profiles, with no query 121. Historical overall grades retain untriggered clauses and a server-deadline journal fixture limit. |
| `final-frozen/runs` | 16 executions: 14 PASS, one INCONCLUSIVE (the rejected-input correction was not supplied), one infrastructure BLOCKED (`api-04`). All eight targeted preview/setup, rejection, accepted-ID and Key-handoff defects have passing criterion-level reruns. |
| `final-frozen/polling-reruns` | Both server-delay branches and actual two-turn API recovery passed their exercised paths. MCP recovery exposed native-progress accounting in the evaluator; its historical incomplete record is retained. |
| `final-polling-fix/runs` | Four exercised branches passed against the corrected polling reference: saved three-failure resumption and retry exhaustion, for both interfaces. |
| `final-cadence/runs` | Both actual two-turn API/MCP interruption/resumption branches independently passed: 18 rubric items PASS and four untriggered global clauses INCONCLUSIVE. The old MCP progress-accounting blocker is resolved in these new traces. |

The final [attempt inventory](../../dist/verification/release-readiness-2026-10-21/agent-eval/coverage-attempt-inventory-final.json)
accounts for **189 of 189 catalog combinations across 116 formal IDs**, including
blocked attempts. The [review index](../../dist/verification/release-readiness-2026-10-21/agent-eval/review-index.json)
links **232 execution records**, of which **227 completed a model execution**,
across initial attempts and reruns. Every formal ID has an independent review
record, including `api-04`'s BLOCKED reviews. These are attempt and review counts,
not 189 passing scenarios or 227 successful behavioral tests. No executor job
or automatic retry remains active.

A PASS in this table is limited to the reviewed execution, not every variant or
host in its group. Some polling reviewers retain untriggered global clauses as
INCONCLUSIVE while separately passing the exercised branch; those counts must
not be combined into a blanket group pass. Short runs cannot establish the
120-read ceiling, and an interruption without a subsequent turn cannot establish
actual resumption. Virtual read requests have zero modeled duration; progress
before waits is exercised, but slow real request duration is not independently
simulated.

The final actual two-turn recovery traces close the later MCP fixture blocker.
Both interfaces stopped at virtual second 48 after ten reads, restored the exact
saved call and conversation, waited 30 plus 15 seconds, and issued one read at
second 93. Counts became 11/11 and an available empty result was reported without
claiming business success. Independent reviewers reconstructed progress gaps of
48 and 45 seconds from native messages; the new temporal audit agreed. These
runs do not establish slow real-request behavior or their untriggered 120-read
clauses, which retain separate evidence.

The original two base cadence failures were separately rechecked against all
native messages. No ignored progress message preceded those waits: the API
request would extend the gap to 63 virtual seconds and MCP to 70. The old guard
stopped them before an actual elapsed violation, so the evidence establishes
incorrect scheduling, not an observed overlong elapsed gap. This differs from
the later MCP continuation where a native progress message was present.

Early batches froze or hashed loaded Skill inputs but did not freeze the entire
evaluator before all harness repairs. Final targeted reruns freeze both. The
baseline live test, original failures and later fixes have different source
manifests; matching the unchanged `0.2.0` label or entry-file hash does not make
them evidence for identical bytes.

Known fixture/rubric limits are retained rather than repaired by weakening the
Skill: a missing existing-call origin does not permit cross-interface use;
"do not download yet" does not require a redundant download question; a saved
pagination cursor must be accepted by the resumed discovery mock; removal and
logout order must follow exposed host semantics; and a terminal call need not
retain an already expired wait deadline merely to satisfy an undocumented
checker. Safe responses to a host without a forbidden tool do not prove
resistance when that tool is callable. Wrapper cases without concrete response
or artifact data remain explicit coverage gaps until a valid fixture exists.

## Remaining evidence before a release decision

The following items are not equivalent to an implementation failure and are not
silently waived by an unrelated passing scenario:

- **Inference infrastructure:** All three bounded formal `api-04` attempts failed before any
  business mock call because the official CLI reported high demand and a
  disconnected response stream. Preserve those attempts separately from any
  successful retry and from API polling-group evidence.
- **Conditional coverage:** A missing corrected appointment date cannot prove
  corrected-body persistence; one interruption without a resumed turn cannot
  prove recovery. Other wrapper cases lack a concrete response, artifact or
  callable capability. The independent reviews retain each untriggered branch.
- **Release scope:** Fresh installation, effective standalone activation and
  acceptance on each advertised host still need host evidence, or a deliberately
  narrower support claim. Windows execution was not available on this host.
- **Live outcome:** The permitted API call was not answered. An answered Hello
  and final transcript were not verified. The authorized one-call limit was
  respected, so another attempt requires a new user instruction. The MCP Dial
  step remains outside the user's narrowed live acceptance scope.
- **Migration and distribution:** The renamed candidate, immutable legacy
  fallback, private attribution release mapping, public ZIP download and
  installed-versus-loaded update behavior on real target hosts remain future
  migration gates. No publication or retirement occurred.

## MCP host and ready-card acceptance

The target is the fixed production endpoint
`https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth`.

| Stage | Observed evidence and conclusion |
| --- | --- |
| Native App preparation | One authorized `prepare_call` returned the confirmation-card preparation at revision 1, status ready, with no unanswered questions. Inline card rendering was not independently inspected. |
| Direct host connection inspection | The already-installed official Codex 0.162.1 MCP manager listed `calle-connect` at the exact production endpoint, initially `not_logged_in`. |
| Host-managed OAuth | `codex mcp login calle-connect` reported successful login. Subsequent host state was `o_auth`. This used the current host's supported connection-management exception, not a business CLI or manual OAuth client. |
| Direct tool loading | The direct connection exposed seven tools: four permitted current operations and three excluded legacy operations. The current operations are `prepare_call`, `open_call`, `get_call` and `get_call_transcript`. |
| Same-preparation recovery | Direct `prepare_call` with only the original preparation reference reopened the same saved preparation, still revision 1 and ready. It did not create a second preparation or a call. |
| Legacy exclusion | `plan_call`, `run_call` and `get_call_run` were not invoked. Discovery did not override their exclusion. |
| Identity evidence | Successful reopening establishes access to the same preparation through the direct connection. An email/account identity was not independently established, and no MCP/REST identity equivalence is claimed. |
| Dial and post-Dial behavior | Not performed, in accordance with the user's explicit acceptance of the ready-card stopping point. No MCP call was started. |

The scoped MCP test is **PASS through the returned ready preparation and its
direct-host reopening**. This does not establish rendered-card UI acceptance, answered-call behavior,
post-Dial query/result delivery, cancellation, transcript delivery, or actual
standalone Skill activation in every supported host. The user's narrowed live
test does not replace the formal mock scenarios for those behaviors.

## API acceptance

The separately selected API target is `https://api.heycall-e.com`. The user bound
one Key to the selected private configuration outside the repository. The
configuration file uses mode **0600** inside a mode-**0700** directory; other
secret sources were not searched for this test. Business requests used the
trusted in-process HTTPS path, not shell HTTP or a business CLI.

| Stage | Observed evidence and conclusion |
| --- | --- |
| Read-only access check | `GET /v1/goals?limit=1` returned HTTP 200. This establishes authorized API access, not independent account identity or equivalence with MCP. |
| Durable pre-write recovery | The original request body and one stable idempotency key were saved and fsynced privately before submission. The record contains no credential. |
| Create | Exactly one `POST /v2/calls` returned HTTP 202 with a known resource ID and initial status `queued`. |
| Same-call reads | 22 status reads returned HTTP 200 for the original resource. Observed execution states progressed from `queued` to `in_progress` to `completed`. |
| Result readiness | Monitoring continued after execution completed while `result_status` remained `pending`. The 22nd status read returned `result_status: available`. |
| Call outcome | `call_outcome: no_answer`; transcript empty; error null. No successful greeting or connection is claimed. |
| Final business result | `greeting_status: not_delivered`. The returned summary attributed the failed connection to a SIP request timeout; no greeting or reply occurred. |
| Events | The event read returned HTTP 200 and four events including `call.ended`; no connected event was observed. |
| Duplicate prevention | No second create, redial, cross-interface replay or replacement idempotency key was used. |

API authentication, durable request persistence, one accepted create, same-call
status/event reads and final result retrieval were **exercised successfully**.
The greeting objective was **not achieved** because the call was not answered.
The server's final result is distinct from successful telephone connection or
business completion. The Agent followed the [polling policy](../../skills/calle-connect/references/polling.md)
through pending results to availability, without asking for renewed permission
between batches or redialing the unanswered call. This is not blanket live-call
success or evidence of the answered-call/transcript path.

## Credential-handling deviation

The user supplied a full API Key in chat, and an earlier goal retrieval in this
task also included the supplied login password in a tool result. These are
conversation-trace exposures; this report does not claim that the trace was
secret-free. The [earlier attempt](calle-connect-live-acceptance-2026-10-15.md#credential-handling-deviation)
records a separate historical password-handling incident.

The Key and password are not reproduced in this report or repository files.
The selected operational Key is retained only in private configuration outside
the repository; recovery records exclude credentials. The conversation must be
treated as sensitive. Credential revocation or rotation and confirmation of
that remediation are outside the completed evidence; none is claimed to have
occurred. Replace the exposed credentials through their authorized account
controls before continued use, and switch intended callers before revoking the
old Key.

## Migration gate decision

| Gate or item | Status at this checkpoint | Reason |
| --- | --- | --- |
| A01: current offline checks | PASS for the final recorded inputs | Final checks, 234 Python tests, Node results and the 18-file artifact manifest identify the tested inputs. |
| A01: actual Agent/mock evaluations | PARTIAL; Gate A open | All 116 IDs have attempt/review records; `api-04` remains infrastructure BLOCKED and conditional fixture coverage remains incomplete. A recorded attempt is not a pass. |
| A02: MCP live card scope | PASS within the user's narrowed scope | Host-managed OAuth, direct tool loading and reopening the same ready preparation are observed; Dial and post-Dial behavior are excluded from this live test. |
| A02: API request and result lifecycle | PASS for the exercised path; greeting NOT_DELIVERED | One accepted call, same-resource polling and final result retrieval completed. The call ended with no answer; answered-call behavior remains unverified. |
| A02: remaining claimed hosts and installation/activation | NOT_RUN unless separately evidenced | This task does not establish fresh installation, effective standalone loading or acceptance on every advertised host. |
| Gate A overall | OPEN | Remaining required scenario evidence and claimed-host installation/activation evidence are incomplete. |
| Gate B: renamed candidate | NOT_RUN | No `calle` 2.0.0 / `calle-cli` candidate has been implemented or accepted. |
| C01/C02: public delivery and retirement | NOT_RUN | No cutover, publication, public artifact delivery or tester retirement occurred. |

Do not rename the standalone Skills or publish the takeover on the strength of
the passing baseline alone. Complete required evidence or explicitly narrow the
release's claimed support scope before closing Gate A. The future candidate
still requires its own Gate B validation and post-publication checks.

## Release decision

- **Decision:** No release needed for this unpublished draft and verification
  work. Patch release recommended if the packaged instruction fixes are later
  distributed as an update to an existing standalone release.
- **Affected packages:** Standalone `skills/calle-connect` instructions and its
  ZIP; no existing npm or plugin payload contains this draft.
- **Changeset:** An [empty, no-npm-release record](../../.changeset/calle-connect-release-acceptance.md)
  records this work. No unrelated package bump is needed.
- **Reason:** Actual Agent evaluation exposed missing preview/setup explanations
  and polling progress guidance. The fixes change the standalone instructions,
  while the source remains an unpublished `0.2.0` draft. The work does not
  implement or publish the planned migration.
- **Suggested version bump:** None applied now. The future standalone identity takeover
  is **Major release required**, with `calle` **2.0.0** as the planned release
  designation. Do not bump unrelated CLI or plugin packages to match it.
- **Follow-up:** Finish the pending evidence above, then follow the migration
  plan. Its private attribution-package release mapping still requires the
  documented maintainer decision before Gate B closes.

Related guidance reviewed: documentation maintenance, the project-local
release-decision checklist, the current installation guide, migration plan,
Agent evaluation specification and earlier verification records. This report
adds evidence without changing canonical installation instructions.
