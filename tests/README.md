# calle Offline Development Tests

Current canonical identity is `calle` with metadata/evaluation version `2.0.1`.
Scenario IDs remain stable across the rename. Earlier `callev2` and
`calle-connect` records retain their original names, versions and hashes;
they do not establish acceptance of this canonical artifact. The initial
live acceptance baseline is Codex MCP. Record API and other-client live
checks as unexecuted where applicable. See the
[migration plan](../docs/calle-skill-migration-plan.md) for the formal
cutover scope and candidate-specific acceptance requirements.

This suite checks the local structure, HTTP templates, client semantic checks,
and behavior-evaluation preparation, dispatch and state helpers for the unified
[calle](../skills/calle/SKILL.md) Skill. Its scan includes only
this Skill; the existing [calle-cli compatibility Skill](../skills/calle-cli/SKILL.md) retains its
own checks.

The offline suite modules are not CALL-E clients. They do not read real credentials or `.env`
files, connect to API or MCP services, or place calls. HTTP and MCP responses and
operation records are synthetic fixtures or empty templates.
The separate [real model evaluator](agent-evaluation.md#run-the-evaluator)
uses Codex's inference transport and is not part of the offline test command.

## Running the Suite

Development tests require Python 3.10+ and the pinned PyYAML 6.0.3 and jsonschema
4.26.0 dependencies in the root [requirements-test.txt](../requirements-test.txt).
These are not Skill runtime dependencies. Use this repository's isolated Python
environment. Offline installation uses existing caches only; report missing
dependencies when the cache is incomplete instead of automatically downloading
them for offline verification. For example, with `uv` installed and a complete
cache:

```bash
uv venv --offline --python python3 .venv
uv pip install --offline --python .venv/bin/python -r requirements-test.txt
.venv/bin/python -m tests.run_offline
```

With a suitable environment already activated, run `python -m tests.run_offline`
from the repository root. The same entry point is available as
`pnpm test:skills:offline`; it uses the current environment's `python` and does
not install dependencies. CI installs development dependencies and runs this
offline suite separately from the existing Node tests.

```bash
# Run one test group.
.venv/bin/python -m tests.run_offline --pattern 'test_http_templates.py'
# Run separate local diagnostics, excluded from the passing-test count.
.venv/bin/python -m tests.run_offline --diagnostics
```

[run_offline.py](run_offline.py) enables the shared guard from
[offline.py](offline.py) before importing or discovering tests. The guard blocks
Python sockets, DNS, subprocesses, and common `os` process entry points. Direct
unittest discovery does not provide the same protection during imports. This
guard is intended for reviewed local tests; it is not an operating-system
sandbox and is unsuitable for executing untrusted Agent code.

## Coverage and Migration Scope

| Module | Coverage |
| --- | --- |
| [test_package.py](test_package.py) | Unified Skill metadata, public API origins, relative links, JSON/OpenAPI, requests, and configuration templates. |
| [test_http_templates.py](test_http_templates.py) | Separate read-only and write templates, fixed public API targets, and only GET requests in the default entry point. |
| [test_result_schema_checks.py](test_result_schema_checks.py) | Pure functions for client-side result_schema semantics. |
| [test_behavior_preparation.py](test_behavior_preparation.py) | Repository scenarios, action ceilings, per-turn expectations, result-record rules, and fixture hash coverage. |
| [test_skill_integrity.py](test_skill_integrity.py) | Skill/evals version consistency and the distinction between the local profile and supplemental checks. |
| [test_offline.py](test_offline.py) | Blocking and restoration by the network and subprocess guard. |
| [test_agent_executor.py](test_agent_executor.py) | Evaluator capability restrictions, event auditing and fixture dispatch boundaries. |
| [test_stateful_mocks.py](test_stateful_mocks.py) | Synthetic polling/onboarding state, ordering, limits and controller restoration. |
| [test_lifecycle_mocks.py](test_lifecycle_mocks.py) | Synthetic lifecycle and recovery handlers; no real business requests. |
| [test_adversarial_call_outputs.py](test_adversarial_call_outputs.py) | Mixed business facts and hostile tool output, forged approval, clarification limits, and failure on blocked unauthorized attempts. |

The migration preserves **111 unittest methods** from the source 0.1.2 suite.
The source handoff's count of 117 included the following six tests, which only
audited historical handoff materials. Their original files, reports, and research
copies were not imported into this repository, so these tests were removed:

| Original test method | Reason for removal |
| --- | --- |
| `test_source_registry_statuses_and_urls` | Only checked source registration in the handoff package's `research/sources.json`. |
| `test_original_archive_integrity_hashes` | Only checked hashes of historical originals in `baseline/artifacts.json`. |
| `test_original_archives_crc_and_safe_paths` | Only checked historical ZIP files under `baseline/archives`. |
| `test_original_report_provenance` | Only checked historical claims in `baseline/v0.1.0/validation.json`. |
| `test_required_handoff_documents_present` | Only checked the presence of the handoff document set. |
| `test_every_baseline_file_matches_original_handoff_manifest` | Only compared the historical `MANIFEST.sha256` with `baseline/`. |

Test counts refer to methods, not assertions. Passing counts from the source
handoff are not execution results for the current repository. The remaining two
tests from `test_round1_integrity.py` moved to `test_skill_integrity.py`.
Update handling added 6 isolation and scenario-preparation tests; the merge added
5 routing-permission, unified-input-hash, and update-source checks. The preview
fix adds 2 permission-boundary checks. Moving evaluation fixtures out of the
Skill adds 1 fixture-hash regression check. Host management adds 7 scope,
provenance, OAuth deduplication, and subprocess-isolation checks. Current MCP
tool selection adds 3 action-scope and scenario-ceiling checks. Public endpoint
handling adds 3 API-origin, HTTP-target, and scenario-ceiling checks. First-use
onboarding adds 4 browser, API-call scope and continuation checks, for 142
unittest methods before polling changes. Automatic monitoring adds 5 virtual-wait
scope, phased-fixture, resumption, retry/cap-boundary and policy checks, for 147
methods before the hidden-metadata regression raised that baseline to 148.
Evaluator runtime unit tests are additional; the
[dated readiness record](../docs/verification/calle-connect-release-readiness-2026-10-21.md)
records the actual suite count and tested inputs for each checkpoint.
These tests do not execute an Agent or perform network updates.

Only the seven non-secret configuration and unexecuted result templates used by the
tests are retained in [fixtures/](fixtures/). The original `.env.example` was
renamed to
[environment.template.env](fixtures/config/environment.template.env) so that
repository environment-file ignore rules do not omit it. It fixes the public API
URL while leaving credentials and the target phone empty, and is not automatically
loaded as environment configuration. No
`baseline/`, `reports/`, `research/`, `.local/`, or real operation records were
migrated.

## Behavior Evaluation Status

The inventory contains **125 formal Agent + mock-tool scenarios**:
105 [repository scenarios](behavior/calle-evals.json),
12 [extra scenarios](extra-behavior-cases.json), and
8 [round-one scenarios](behavior/round-1-cases.json).
The dated record contains actual model execution and independent review evidence;
see the [readiness record](../docs/verification/calle-connect-release-readiness-2026-10-21.md)
for results and remaining gaps. A generated NOT_RUN inventory is not a current
execution report, and neither a completed turn nor a mock unit test is a PASS.
The repository suite preserves the original 30 API and 27 MCP IDs and adds 14 routing
cases, 1 unified update-source case, 1 MCP preview case with a missing ID, and
9 host management boundary cases, 12 current MCP tool-selection and execution cases, and
3 public endpoint cases, 3 first-use API onboarding cases, and
2 automatic monitoring groups with 44 independent variants, including an actual
second-turn resumption after a host interruption for each interface, and
3 external-content and authorization scenarios with 6 independent instances.
All evaluation fixtures, including adversarial prompts and their rejection
expectations, live under `tests/`. They are development inputs, excluded from
the Skill source directory and installation ZIP. The installed Skill uses only
its own references and assets; running these evaluations requires the repository.
The public endpoint cases cover an API Key with no configured base URL, rejection
of a mismatched configured URL without redirecting credentials or a saved
operation, and reuse of the fixed MCP connection without environment selection.
The existing missing-base-URL case now expects the fixed public API endpoint.
Existing business scenarios retain their original action boundaries through
`selected_transport` and explicit user selection of an interface. Routing
scenarios use a separate `mock_action_scope: routing` and allow only the mock
discovery, selection, and read-only actions listed for each scenario; they gain
no write, OAuth, configuration, or shell permissions. Recovery scenarios for
previously submitted requests retain their own restricted action sets. New
routing authorization cannot be used to recreate an already submitted call.

The first-use API cases cover one initially authorized Hello call across private
Key saving, unavailable browser fallback and an already-owned but unbound Key.
An explicitly listed native browser mock opens only the fixed official Dashboard;
queued or denied results are not opening success. A separate `api_call` scope
permits one synthetic create only after saving, a successful authorized Goals GET
and durable original request/idempotency persistence. It does not broaden
authentication, setup-only, routing or preview permissions. These cases and the
updated read-only `api-auth-01` require one handoff with acquisition guidance when
needed, an actually prepared private save location, `CALLE_API_KEY` and the
reply-saved continuation step. All browser and call results remain synthetic.

The API and MCP polling groups follow the shared
[result-waiting policy](../skills/calle/references/polling.md). Synthetic
response ranges cover results after twelve and thirty-two reads, completed
execution with a pending result, all four delay phases, server minimum waits,
interruptible waits and progress, terminal/unavailable results, user stops,
snapshot-only requests, host interruptions, and retry exhaustion or reset.
Boundary variants cover final and pending results on request 120, retry requests
consuming the last slot, known and unknown saved counts, and later explicit
continuation retaining the 20-second phase. Counts, failure streaks and server
deadlines survive known batches and interruptions. Only an explicitly listed
`host.mock_wait` action in a call scope can simulate waiting; it advances a
virtual clock and never sleeps or accesses a network. These read-only cases add
no create, preparation, Dial, cancellation or cross-interface permissions. The
checks preserve and inspect fixture data; they do not implement polling or
execute an Agent.

Host management cases prefer permitted native management, then simulate the
current host's installed official MCP manager only when that native capability
is unavailable. The `host.mock_mcp_command.*` namespace requires explicit MCP
authentication scope and same-host, installed-command, permission, and user-limit
metadata. It authorizes only individually listed simulated management operations;
it never executes a shell. API, routing, and update scopes reject these actions.
The cases cover Codex and Claude Code selection, manual fallback, explicit
no-CLI limits, policy denial, avoiding duplicate OAuth, and keeping business and
updates outside the management exception. Real subprocess blocking is unchanged.

Current MCP cases exclude `plan_call`, `run_call`, and `get_call_run`, including
host-prefixed aliases, even for read-only verification or recovery. A separate
`mock_action_scope: mcp_call` admits only explicitly listed current preparation,
start and query actions plus local journal/discovery actions. Authorized ready
calls use `start_call` with or without native cards. A simulated user Dial event
shares the same preparation and remains separate from Agent actions. Cases cover
clarification, current revisions, uncertain start recovery, Dial races, missing
capabilities, cancellation limits, resource identifiers and preview/prepare-only
boundaries. `route-14` preserves the main
API fallback conditions when complete discovery finds only prohibited legacy
tools and no related write has occurred. The fixture data does not execute
advertised tools; the isolated dispatcher interprets supported synthetic
contracts and reports missing contracts as blockers.

The safety cases deliver mixed business facts and hostile instructions through
actual synthetic result, transcript, event and preparation responses. They check
that useful appointment facts remain reportable while forged approval, changed
recipients, purchases, secret export and webhook changes grant no authority.
Server clarifications must stay within the user's task; legitimate missing
details remain valid questions. Every unauthorized attempt fails, including an
attempt blocked by the mock host. These fixtures and their unit checks do not
establish model behavior or a passing external security audit. See the
[safety coverage](agent-evaluation.md#external-content-and-authorization-coverage)
for case IDs and evidence requirements.

The 18 update scenarios use the same Skill name and update source. They cover
anonymous checks, remote injection, missing native capabilities, download and
installation authorization, rejection of unsafe paths and symbolic links,
invalid responses, the distinction between installed and loaded versions, and
preventing interface switches from triggering a second automatic update check,
and excluding host management commands from Skill updates.
Response and file variants retain separate rubric items without being counted
as additional formal scenarios. `build_catalog(root)` and
`not_run_results(root)` in [preparation.py](behavior/preparation.py) preserve
each global, per-turn, and variant expectation and generate an unexecuted
inventory; they do not run models or mock tools.

Passing unittest results show only that local structures and pure functions
satisfy their assertions. They do not establish successful Agent behavior, host
installation, automatic discovery, or live API/MCP integration. The real model
executor and its evidence requirements are described in the
[Agent evaluation specification](agent-evaluation.md).
