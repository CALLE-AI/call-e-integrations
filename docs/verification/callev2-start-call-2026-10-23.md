# callev2 UI and non-UI start_call verification

Recorded on 2026-10-23 for the local working-copy candidate. This adds current
evidence without changing earlier verification records. The formal `calle`
cutover remains deferred under the [migration plan](../calle-skill-migration-plan.md).

## Scope and inputs

The current host exposes `prepare_call`, `start_call`, `open_call`, `get_call`
and `get_call_transcript` alongside three excluded legacy tools. Tool metadata
and local MCP service source were inspected without invoking business tools.
This candidate adapts the standalone Skill, current documentation and isolated
mock tests; it does not change the service, CLI or ecosystem plugins, install a
Skill, authenticate an account or place a call.

Source and evaluation metadata remain `2.0.3` in this working copy. This is an
unpublished development candidate, not a replacement for that published version.
The standalone release recommendation is `2.1.0`; align the source/evaluation
version and current version guidance before publication.

| Input | SHA-256 |
| --- | --- |
| `skills/callev2/SKILL.md` | `ad1aff5333f105e2e7436ad496dd88dff78035dc3ee761aacca5733b2d84d21f` |
| `skills/callev2/references/mcp.md` | `1e40f35ade997439edacc3e0ea5fc463f52bdd41633f201f69f27b1efe44d23b` |
| `tests/behavior/callev2-evals.json` | `906ea2ead39ea918c41c94146d19f9f1e2c16048f248b5905811202f106f4690` |
| `dist/skills/callev2.zip` | `0cc4133d975dea31fc90c2ec3b01e132923100e9287129256268353a882b3fb4` |

## Checks performed

| Check | Result |
| --- | --- |
| `.venv/bin/python -m tests.run_offline` | PASS: 256 tests; sockets, DNS and subprocesses blocked by the offline runner. |
| `pnpm check` | PASS. |
| `pnpm test` | PASS with the test-only npm entry-point adjustment below; the initial normal-PATH run failed on the existing mise wrapper. |
| `pnpm pack:dry-run` | PASS; no npm package published. |
| `pnpm pack:skill:callev2` | PASS; ZIP CRCs and all 19 packaged files checked against source bytes; repository tests excluded. |
| `git diff --check` | PASS. |

The existing mixed-install CLI test invokes the discovered npm entry with Node.
The normal PATH selects a mise Bash wrapper and fails parsing `set -euo pipefail`.
The full passing rerun used a temporary PATH directory containing an `npm`
symlink to the installed npm JavaScript entry point. No test code or global
toolchain files were changed. The temporary directory was removed after the run.

The bundled Skill Creator quick validator rejects the existing `compatibility`
frontmatter key on both the unchanged HEAD source and this candidate. Its
accepted-key list does not cover that existing field. Repository structural,
compatibility, relative-link and packaging checks pass; the field was preserved.

## Behavioral evidence and limits

Eleven new mock unit tests cover UI/non-UI execution, chat clarification and
revision reuse, incomplete/blocked preparations, prepare-only and later wait
instructions, repeated start, a native Dial race, lost acceptance responses,
authentication/schema checks and cancellation limits. The scenario inventory now
contains 122 cases, including six additional current-MCP groups. Their formal
model-evaluation results remain NOT_RUN.

An independent Agent performed a static forward simulation against the updated
Skill and synthetic tool observations. Ten cases covered authorized calls with
and without cards, prepare-only, chat clarification, lost-response recovery,
explicit card Dial, cancellation without UI, card-only compatibility without
`start_call`, revision conflict and setup-only scope. It found no blocking
instruction conflict. This walkthrough is separate from running the isolated
model-evaluation harness or calling the live service.

NOT_RUN: real UI rendering, real host tool execution/approval, OAuth/account
checks and live phone calls in either host mode. These checks do not establish
live dialing success. No Agent-callable MCP cancellation tool is exposed;
cancellation still requires usable supported card controls.

## Release decision

- Decision: Minor release recommended for the standalone Skill's added execution
  capability; suggested standalone version `2.1.0`.
- Affected packages: none; the root-distributed `callev2` artifact changes.
- Changeset: `.changeset/callev2-ui-and-headless-mcp.md` records the standalone
  release boundary without an npm package bump.
- Publication and installation were not performed. Existing `calle`,
  `calle-cli` and installed `callev2` copies remain on their current paths.


## 2.1.0 source-release preparation

The user authorized publishing the current `callev2` to its existing skills.sh
source on 2026-10-23. The candidate was rebased onto public `main`
`08851adf64f2d59b10b920320503de0d61b80b03` (`2.0.5`), retaining the native public
reader and update-acceptance fixes. Current Skill/evaluation metadata and version
guidance now use `2.1.0`. Earlier input hashes and 256-test results above retain
their original working-copy scope.

After integration, 265 offline tests pass. `pnpm check`, `pnpm test` with the
same temporary real-npm entry point described above, `pnpm pack:dry-run`, and
both standalone Skill packaging commands pass. The `callev2` ZIP contains 19
source-identical files with valid CRCs. No CLI, plugin or `calle-cli` source
changes are included.

Independent integration review identified two guidance/fixture inconsistencies:
execution-capability preflight must not block preparation-only requests, and
an accepted-response-loss scenario must reopen the original preparation and
read its existing Call instead of requiring another start attempt. Both were
corrected; the complete 265-test offline suite passed again. The idempotent
retry remains bounded and uses only the original preparation and arguments.

| Release-candidate input | SHA-256 |
| --- | --- |
| `skills/callev2/SKILL.md` | `c8d10fa3ab7ba1f30d2051e30d4d1400ecb2ab2a834e4bb6590dc5c0096138b1` |
| `skills/callev2/references/mcp.md` | `4094229e225f4413418d15be0563ce8e28110a76847bf14354dbd3a5d0b44e87` |
| `tests/behavior/callev2-evals.json` | `f3c9d3a2f0363a564fcb6e22a218f80b457600ac0e6593fd7129fd9465d9ac3d` |
| `dist/skills/callev2.zip` | `0cccedd73e685da9a2f71a81861cd6e7fb6ed99ab16a227b94fb3acc813fda28` |

Publication is complete only after public `main` exposes this candidate.
Source delivery, skills.sh page freshness, local installation, host activation
and live-call acceptance remain separate checks. This release preparation does
not install a local Skill, place a call, or perform the deferred `calle` cutover.
