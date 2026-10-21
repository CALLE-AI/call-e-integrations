# CALL-E Dual Skill 0.1.2 Repository Integration Record

Date: 2026-10-14, Asia/Shanghai. Integration baseline: `7c76816`; the workspace
was clean at the start. Based on `HANDOFF_2026-10-14.md` in the local handoff
directory, this record describes only this repository integration and its actual
offline checks. Machine-readable results and SHA-256 hashes for every source file
are in the [verification record](dual-skills-0.1.2.json).

This is a historical snapshot from 2026-10-14. Subsequent workspace changes added
the update mechanism and removed MCP command-line connection examples. Current
source and ZIP files no longer match the historical hashes below. See the
[offline testing guide](../../tests/README.md) for the current scenario catalog
and execution states, and the [design record](../skill-update-mechanism.md) for
mechanism boundaries.

2026-10-15 addendum: the two source entries have now been merged into
[calle-connect](../../skills/calle-connect/SKILL.md). The two old source paths below
record their paths at the time; those directories have since been removed.
See the [unified installation guide](../install/calle-connect.md) for migration.
The historical test results, versions, and hashes below remain unchanged and do
not validate the merged version.

## Changes made

- Added 11 files under `skills/calle-api-key`
  and 6 files under `skills/calle-mcp-oauth`.
  All 17 files matched the handoff directory's 0.1.2 source byte for byte,
  preserving its authentication guidance, `compatibility`, API/MCP separation,
  and evals.
- Preserved existing `skills/calle`, all plugin payloads, package versions, and
  marketplace entry points. The API Key Skill uses only direct HTTPS; the MCP
  Skill uses only host OAuth MCP. They do not automatically fall back to each other.
- Imported [offline tests](../../tests/README.md), 7 empty non-secret templates,
  and development dependency guidance. Retained 111 of the original 117 tests.
  The 6 removed tests only audited historical handoff documents, original baseline
  files, and research records; their names and reasons were recorded individually.
  The originals remain in the handoff directory and were neither overwritten nor
  imported into this repository.
- Public Skill packaging selects root `skills/` through `--public`, preserving
  the default helper packaging behavior. Fixed `pack:skill:calle`, which pointed
  to missing `.agents/skills/calle`. Added `pack:skills:dual` and 7 ZIP content,
  CRC, and boundary tests.
- Added separate Python offline validation and dual-ZIP packaging steps to CI.
  CI may install test dependencies first. Local dependency preparation used the
  `uv --offline` cache; Python network access and subprocesses were blocked
  during test execution.

No handoff credential files or host token caches were read. No CALL-E connection,
login, business write, call, commit, push, or publication occurred. `.local`,
`.env`, historical reports, baseline files, third-party reference Skills, and
installed virtual environments were not imported.

## Validation performed

| Check | Actual result |
| --- | --- |
| `.venv/bin/python -m tests.run_offline` | 111/111 passed. |
| `node --test scripts/test/pack-skills.test.mjs` | 7/7 passed; also included in root `pnpm test`. |
| `pnpm test` | 180 passed, 1 skipped, 0 failed, 181 total; included local mock CLI tests. |
| `pnpm check` | Passed existing metadata, version, documentation synchronization, type, and syntax checks. |
| `pnpm pack:dry-run` | All existing packages passed. |
| `pnpm pack:skills:dual` | Generated two separate ZIPs containing 11 and 6 files respectively. |
| Independent ZIP review | Python zipfile CRC and per-file content checks passed; each package had one Skill root directory. |
| `git diff --check` | Passed. |
| Skill Creator `quick_validate.py` | Both failed: the validator's allowlist does not accept the existing `compatibility` field; the field was retained. |
| Formal Agent + mock tools | 0 executed, 60 NOT_RUN; behavioral acceptance has not passed. |
| Host installation, automatic discovery, and live API/MCP integration | NOT_RUN in this round. |

Runtime: Node 22.21.1, pnpm 10.18.3, Python 3.13.8. PyYAML 6.0.3 and jsonschema
4.26.0 were installed from the local cache into this repository's `.venv`.
The bundled quick_validate failure is an observed compatibility limitation.
Repository structural tests can validate the field, but that does not establish
acceptance by the target host.

The first repository check encountered a conflict between the global pnpm 11.22.0
and required pnpm 10.18.3; it passed with a temporary local Corepack shim. The
first full test run also had 1 existing CLI test treat mise's npm shell wrapper
as JavaScript. After a temporary PATH selected the real npm-cli, both that case
and the full suite passed with `npm_config_offline=true`. System installations
and CLI source were not changed.

Complete local execution output remains in Git-ignored `dist/verification/`,
including `dual-skills-unittest.txt`, `pnpm-test-final.txt`, `pnpm-check.txt`,
`pnpm-pack-dry-run.txt`, and per-scenario `agent-results-not-run.json`.
Portable result summaries and source hashes are saved in the JSON in this
directory; rerunning tests does not require carrying caches or logs.

## Local package artifacts

| Path | SHA-256 |
| --- | --- |
| `dist/skills/calle-api-key.zip` | `b8ae072a34383abb510e8d75233e1b7bd5efb812b3f3c792f29e8a69400d72fd` |
| `dist/skills/calle-mcp-oauth.zip` | `c5cdad5d26d9ba3521e0aa2190211d87774746d2dace98c5874c1db36502374b` |

Rebuilt with the repository's deterministic ZIP writer, so archive hashes differ
from the handoff ZIPs while all extracted source bytes match. ZIP filenames are
stable; `metadata.version` inside each package determines its version.

## Documentation synchronization and remaining acceptance

Synchronized the root README, stable installation entry
`docs/install/CALL-E-installation-guide.md`, skills.sh guide, integration layout,
and documentation maintenance rules to point to the
[dual Skill installation and packaging guide](../install/dual-skills.md).
Checked existing package READMEs, plugins, and marketplace directories; they
continue to describe existing CLI/plugin entries and need no replacement or rename.

Formal behavioral acceptance still requires an isolated Agent/mock executor
following the [evaluation specification](../../tests/agent-evaluation.md), with
actual tool traces and per-expectation scores. The existing 60 scenarios remain
NOT_RUN. Host installation and automatic discovery require separate verification.
Historical successful API read-only operations and MCP authentication/reads in
the handoff are facts from earlier conversations, not new results from this round.
The historical MCP connection was ultimately removed and cannot be considered
available. These states were not revalidated here, and no real account or phone
data was copied.

## Release decision

- Decision: **No release needed** (existing npm packages).
- Affected package(s): No existing npm package or plugin payload changed; additions are standalone root Skill source.
- Changeset: No package-version changeset needed; empty `.changeset/standalone-dual-skills.md` records this integration.
- Reason: The delivery contains source, development validation, and local ZIPs, without changing existing package output or the default CLI installation flow.
- Suggested version bump: None; retain source Skill version 0.1.2 and leave package versions unchanged.
- Follow-up: Public distribution, host acceptance, and live operations remain subsequent tasks; publication has not occurred.
