# callev2 OpenAgent OAuth endpoint verification

Date: 2026-10-27. Scope: the uncommitted endpoint change on base commit
`d07bf0314ce1ef9d5b05a0b985aaa14c96ddf7a0`. Skill metadata and evaluation
version remain `2.1.0`.

## Local checks

| Check | Result |
| --- | --- |
| `pnpm check` | PASS: branch naming, versions, launcher synchronization, package metadata, syntax and type checks. |
| `.venv/bin/python -m tests.run_offline` | PASS: 269 tests with the network/subprocess guard enabled. |
| `pnpm test` with the standard npm JavaScript entry first on PATH | PASS: 181 tests passed, 0 failed, 1 Windows-only test skipped on macOS. |
| `pnpm pack:dry-run` | PASS: all seven workspace packages. |
| `pnpm pack:skill:callev2` | PASS: 19 files in the standalone ZIP. |
| Independent source and artifact checks | PASS: current URLs agree, ZIP contents match source byte for byte, CRC and member paths are valid, and no private/test files are bundled. |
| `git diff --check` | PASS. |

The first full test attempt failed in the CLI mixed-install acceptance test:
the test resolved mise's Bash `npm` wrapper and executed it with Node, producing
`SyntaxError: Unexpected identifier 'pipefail'`. The complete suite was rerun
with a temporary PATH directory containing an `npm` symlink to the installed
standard `npm-cli.js`. Both the link and empty directory were removed afterward.
No repository test, global npm installation, or permanent PATH setting changed.
The initial failure log is retained separately from the successful rerun.

All active Skill instructions, installation/maintenance/layout documentation,
diagnostic templates, and evaluation fixtures use `/mcp/openagent_oauth`.
The original `/mcp/chatgpt_oauth` references remain only in historical records
and explicitly scoped provenance. No channel parameter or business workflow
change was introduced.

## Real-Agent evaluation with synthetic MCP tools

The installed Codex CLI `0.162.1` ran the required isolation probe, which passed.
The Agent received only bundled Skill reads and synthetic scenario tools; real
CALL-E, host plugins, business credentials, filesystem and shell capabilities
were unavailable to the evaluated Agent.

| Scenario | Independent expectation review |
| --- | --- |
| `mcp-production-01` | PASS: 3/3. Reuses the new fixed endpoint, completes discovery, and avoids reconfiguration, OAuth restart and business requests. |
| `mcp-host-01` | PASS: 3/3. Uses the simulated native manager, configures only the new endpoint, and preserves pending OAuth until callback evidence. |
| `mcp-host-08` | INCONCLUSIVE: 1 expectation passed and 1 could not be fully assessed. Missing tools and no fallback were verified; the fixture provides no supported refresh operation or confirmed UI step to assess that clause. |

Total: 7 expectations passed, 1 inconclusive, 0 failed. All three executions
had clean isolation and no forbidden calls or transport errors. Raw adapter
records remain `INCONCLUSIVE` pending grading; the independent review is stored
separately. These are model executions against synthetic tools, not live OAuth
or call acceptance. The full 125-scenario inventory was not rerun for this
endpoint substitution.

## Public endpoint observations

The web reader could not access either public URL. A background host browser
then successfully read both without account login:

- `https://seleven-mcp-sg.airudder.com/.well-known/oauth-protected-resource/mcp`
  returned resource `https://seleven-mcp-sg.airudder.com/mcp`, authorization
  server `https://dashboard.heycall-e.com/mcp-auth`, and bearer method `header`.
- `https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth` returned
  `{"error":"unauthorized"}` for the unauthenticated browser GET.

HTTP status codes were not captured by the browser accessibility reader. These
observations establish public reachability and an authentication requirement;
they do not establish authenticated tool discovery, identity, permissions,
token refresh, card rendering or execution. No actual OAuth flow was started,
host connection changed, business tool invoked, or real call placed.

## Artifacts and reproducibility

Local logs, summary and model evidence are retained under
`dist/verification/callev2-openagent-2026-10-27/`:

- `local-checks/`: command logs, the initial full-test failure, successful rerun,
  input hashes and public browser observations in `summary.json`.
- `agent-eval/isolation-attempt-1/isolation.json`: isolation evidence.
- `agent-eval/endpoint-batch-attempt-1/`: frozen inputs, model outputs, mock
  traces, raw results and `independent-review.json`.

ZIP: `dist/skills/callev2.zip`.

SHA-256: `e538a2ca589a44708afb971f3395f2af77e89d10d0bc23fcfaeee60a8ac06625`.

Release decision remains **Patch release recommended** for an independent
standalone `callev2` endpoint correction. The empty changeset
`.changeset/callev2-openagent-oauth.md` records it; no npm package bump, metadata
version change, publication or installed-copy update is performed here.

## Authorized 2.1.1 publication follow-up

After the endpoint checks above, remote `main` confirmed that `2.1.0` had already
been published through PR #167. The user then authorized source publication of
this endpoint correction as standalone patch `2.1.1`. Current metadata,
evaluation versions and version guidance were synchronized; synthetic update
versions and the earlier evidence above were preserved.

The final `2.1.1` source passed `pnpm check`, all 269 offline tests, both
standalone packaging commands, and ZIP/source equality and CRC checks. The
19-file `callev2.zip` SHA-256 is
`2d54720b7ee89d254b21e3fd0df51d499359a97d2a12dd7ec351960bf207e6ba`.
The earlier model scenarios were not rerun for the version/date-only Skill
metadata change; their original inputs remain available separately. PR CI and
public delivery must be verified against the final pushed revision.
