# Canonical calle 2.0.0 source cutover

Date: 2026-10-28. The user authorized promoting the complete published
`callev2` `2.1.1` implementation to the canonical standalone `calle` `2.0.0`
and publishing the Skills. The fixed source baseline is commit
`ebab87942034cebbdde308a099c8aa1f92c7ebdc` (PR #168).

The user selected source publication first and explicitly retained an
unverified real-call acceptance status. No authentication, business request
or real phone call was performed for this cutover. Codex MCP remains the
initial live acceptance baseline; API and other-client live acceptance are
also unexecuted here. Earlier verification remains scoped to its original
inputs and does not establish acceptance of the canonical identity.

## Scope

- Complete source moved to `skills/calle`; frontmatter, UI identity,
  invocation, source/update URLs and evaluation version agree on `calle`
  `2.0.0`.
- Default README and stable-guide installation selects `calle`. The stable
  guide remains at `docs/install/CALL-E-installation-guide.md`; the README
  prompt reads that guide directly from raw GitHub.
- `skills/calle-cli` remains byte-for-byte unchanged. CLI/plugin payloads,
  package versions, authentication state and call recovery records are intact.
  The private compatibility package's development validator now checks the
  new default alongside the preserved compatibility guide.
- The installable `skills/callev2` tree is retired. Its documentation remains
  a short pointer. Migration of installed testing copies is outside scope.
- The evaluation inventory retains its scenario IDs and synthetic update
  comparisons under `tests/behavior/calle-evals.json`.

## Local verification

| Check | Result |
| --- | --- |
| `pnpm check` | PASS: branch, version synchronization, launcher synchronization, package checks, syntax and types. |
| `pnpm test` | PASS: 183 tests, 182 passed, one Windows-only skip on macOS. |
| `.venv/bin/python -m tests.run_offline` | PASS: 269 tests with the network/subprocess guard. |
| `pnpm pack:dry-run` | PASS: all seven workspace packages. |
| `pnpm pack:skill:calle` | PASS: 19 files with one `calle/` ZIP root. |
| `pnpm pack:skill:calle-cli` | PASS: four compatibility files. |
| Independent ZIP inspection | PASS: CRC, complete file set and every byte match source; no test fixtures, CLI launcher or private state in the canonical artifact. |
| Local standard skills CLI discovery | PASS: canonical `calle` and compatibility `calle-cli` found; no testing entry. Repository helper Skills are separately discoverable. |
| Isolated Codex project installation | PASS: standard `skills@1.7.4` copied all 19 canonical files, matching source. This checks saved files, not a host reload. |
| Independent source/diff review | No blocking findings. |
| `git diff --check` | PASS. |

The initial repository check/test runs exposed compatibility-validator
assertions requiring the old CLI default. Those assertions and their tests
were updated to the user-approved canonical default, while compatibility
assertions remain on `calle-cli`; the complete suites then passed. Logs of the
initial attempts and final runs remain separate.

The full JavaScript suite used a temporary PATH directory pointing `npm` at
the installed standard `npm-cli.js`, because the existing mise wrapper is a
shell script and one integration test launches the npm entry with Node.
No permanent toolchain or PATH change was made.

## Artifacts and evidence

| Artifact | Files | SHA-256 |
| --- | --- | --- |
| `dist/skills/calle.zip` | 19 | `c7f11346f5002b30d7f64023f1ab311b36013bcddebfc03264873edb83a05f7c` |
| `dist/skills/calle-cli.zip` | 4 | `40a2fdde2640b13997bdf4e29804498060494c239fd87526d9e647f6871bc23b` |

Local evidence is retained under
`dist/verification/calle-2.0.0-2026-10-28/`: preserved baseline files and hashes,
initial/final command logs, artifact manifests, discovery output and isolated
project installation. Public delivery, the accepted merge revision, immutable
tag `skills/calle@2.0.0`, downloadable assets and skills.sh indexing must be
recorded separately after publication. Source availability and copied files
do not establish activation or live acceptance.

## Release decision

- Decision: **Major release required**, fulfilled by the independent
  standalone designation `calle` `2.0.0`.
- Affected surface: root-distributed `calle`, its install/update entry points
  and the retired installable testing identity. No npm package version bump.
- Changeset: `.changeset/calle-200-canonical-cutover.md` is an empty
  no-npm-release record for this standalone release.
- Publication: publish accepted source and complete artifacts after CI;
  preserve real-call acceptance as unverified.
