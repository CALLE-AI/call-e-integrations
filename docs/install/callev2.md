# Install callev2 for Personal Testing

[`callev2`](../../skills/callev2/SKILL.md) is one standalone Skill for
CALL-E calling workflows. It prefers host-managed OAuth MCP. Before business
writes, it can select direct HTTPS with an API Key when the host explicitly lacks
MCP support, the target MCP connection is confirmed not configured, or complete
discovery confirms the required capability is missing. Authentication failure or
cancellation does not trigger fallback. The source metadata version is `2.0.4`.
The directory, Skill name and display name are `callev2`; invoke it as `$callev2`. This is the
user-authorized personal testing identity; the later official `calle` takeover
has not been completed.

This customer Skill uses production only: the fixed MCP endpoint is
`https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth`, and the fixed API base URL
is `https://api.heycall-e.com`. Setup does not ask the user to select an
environment or offer alternative endpoints. An existing configuration pointing
elsewhere must be resolved before credentials or business requests are sent;
do not silently repoint it or reuse its credentials for production.

Business operations use MCP tools or authenticated HTTPS through host tools or
trusted in-process HTTP capabilities. MCP connection management first reuses an
existing connection, then prefers the current host's exposed and permitted native
management tools, APIs or Agent-operable interface. When those facilities are
unavailable, the Skill permits the current host's already-installed official MCP
management commands for connection setup, authentication, status and refresh.
Logout or removal requires a user request covering that action. Follow the
[connection lifecycle](../../skills/callev2/references/connection.md) for
the complete boundary; an explicit no-CLI, preview or offline request still applies.

This exception does not permit business CLI calls, command-line HTTP, manual
OAuth implementations or token-cache access, dependency installation, or CLI
Skill installation and updates. A permission or policy denial is not a reason
to switch mechanisms to bypass it. Host tool permissions and the Agent's
compliance with these instructions remain part of enforcement.

The legacy [`calle-cli` Skill](./skills-sh-skill.md) and packaged integrations are
separate products with their existing CLI workflows. Select the exact
`callev2` source when installing this Skill.

## Current delivery scope

The source folder, offline validation and local ZIP packaging are maintained in
this repository. Public source publication, skills.sh indexing, host installation
and automatic discovery, Agent/mock execution and live service acceptance are
separate steps. Local changes do not establish that the public GitHub source or
a downloadable ZIP is available.

This Skill is not bundled into the existing Codex, Claude Code, Cursor or
OpenClaw plugin payloads. Its version is independent of npm package and plugin
versions. The API contract is a hand-maintained core subset; MCP tool names and
schemas must be discovered from the connected host at runtime.

Formal evaluation definitions, including synthetic adversarial fixtures, live
in the repository at
[`tests/behavior/callev2-evals.json`](../../tests/behavior/callev2-evals.json).
They are excluded from both the installable source directory and its ZIP.
The Skill retains safe manual testing guides; installing it does not load the
repository's evaluation fixtures.

The earlier [Connect readiness record](../verification/calle-connect-release-readiness-2026-10-21.md)
and [0.2.0 merge record](../verification/calle-connect-0.2.0.md) retain their
original names, hashes and evidence. They do not validate the renamed `callev2`
artifact or its selected publication origin. Follow the
[migration plan](../calle-skill-migration-plan.md) for the staging exception and
remaining artifact and official-delivery gates.
The [staged migration verification record](../verification/callev2-migration-2026-10-21.md)
records checks against the renamed files. The user owns publication and the
remaining host installation, activation and personal acceptance checks; local
preparation does not close those gates.

The selected source repository is `CALLE-AI/call-e-integrations`. Personal
testing means using the distinct `callev2` identity in the user's own client and
account; it does not change the repository owner. Source, update metadata and
repository discovery all target `skills/callev2` in this repository. Publication
is a separate user action; local changes do not establish public availability.

## Install the source or ZIP

After the source has been published to the selected repository, explicitly
select `callev2` so discovery does not choose another root Skill:

```bash
npx skills add https://github.com/CALLE-AI/call-e-integrations --skill callev2 -g -y --agent codex
```

Replace `codex` with the intended supported agent. This is an optional user-run
distribution command, not permission for the installed Skill to use CLI updates.
The [upstream skills commands](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)
and [Skill directory guidance](https://github.com/vercel-labs/skills/blob/main/docs/creating-skills.md)
describe repository discovery and local source installation.

Use the host's existing Skill importer, Skill manager or supported file interface
to install the complete `skills/callev2/` directory. A host that accepts
ZIPs may import `dist/skills/callev2.zip`; verify that support in the actual
host. Install only into a location selected for this Skill, preserving local
changes. Reload or rediscover Skills and verify that the loaded name is
`callev2` and its version matches the intended source.

The source is structured for skills.sh-compatible discovery. skills.sh is a
distribution surface; it is not a runtime dependency or permission to execute a
command-line installer. If the host has no supported non-CLI installation
facility, report the limitation and let the user complete installation through
their host's supported interface. Do not invent a hosted ZIP URL.

## Choose the interface

| Situation | Behavior |
| --- | --- |
| The user explicitly chooses MCP or API | Honor that choice; do not silently switch. |
| Connected MCP tools support the operation | Prefer MCP. |
| The host explicitly lacks MCP support or the target connection is confirmed not configured | Use API before business writes if the API supports the operation and safe credentials and HTTP capability are available; otherwise complete authorized setup or explain what is missing. Authentication failure or cancellation does not meet this condition. |
| Complete tool discovery confirms MCP does not support the operation | Select API before business writes, after checking its operation support, production endpoint, and account. |
| Discovery is incomplete or tools are not yet loaded | Refresh or complete discovery; do not treat this as unsupported capability. |
| OAuth expires, access is denied, or authorization is cancelled | Handle the authentication or permission result; do not automatically switch credentials. |
| A write was submitted but its outcome is unknown | Recover through the original interface; do not create the same call through API fallback. |

For MCP, follow [connection lifecycle](../../skills/callev2/references/connection.md).
Its endpoint is `https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth`. Let the
current host manage OAuth and use its actual discovered tools and schemas. Codex
uses its own MCP management facilities; Claude Code uses its own. Check the
installed host's capabilities and syntax instead of assuming a common command
format or invoking another host. The Agent starts supported configuration and
authorization; the user completes any required browser login and consent. Verify
the callback, connection state and loaded tools before claiming readiness.

The standalone Skill excludes the legacy MCP tools `plan_call`, `run_call`, and
`get_call_run`, including namespaced forms and aliases. It uses the current
Preparation/Call workflow when exposed: `prepare_call` receives the user's task
and known facts, returns the real clarification/confirmation card, and the user
clicks Dial on its latest ready revision. Standard preparation does not require
a custom `result_schema`. Reopen with `preparation_id`; revise with that ID,
the current `revision`, and `user_input`. Use `open_call`, `get_call`, and
`get_call_transcript` for the resulting Call resource; cancellation stays in the
card. Poll results only while `result_status` is `pending`. Legacy tools are
not a fallback for missing tools or cards and cannot be used for read-only checks
or recovery. Follow the [MCP tool policy](../../skills/callev2/references/mcp.md#current-call-tools-and-legacy-exclusion)
for current tool selection, ID handling, and existing interface-selection limits.
See [concrete MCP arguments](../../skills/callev2/references/mcp.md#concrete-tool-arguments)
for new preparations, reopening, and chat corrections.

For API, follow [configuration and credential lifecycle](../../skills/callev2/references/setup.md).
Use safe secret injection and the fixed production base URL. A webpage reader alone
is insufficient: the host needs authenticated HTTPS methods, headers and request
bodies, or a trusted in-process HTTP facility. Do not copy credentials into the
Skill, repository or ZIP, and do not reuse MCP OAuth tokens as API Keys.

Retain the interface, account, production endpoint and returned identifiers when a call
is created. MCP may use the conversation or available host storage; API writes
still require their private recovery record. Querying, cancellation and recovery
use that same context. MCP and
API identifier, account and idempotency interoperability has not been verified;
an interface being unavailable does not authorize recreating the call elsewhere.

After acceptance, the Agent follows the same call until its result is final,
with progress updates while waiting. The [shared polling policy](../../skills/callev2/references/polling.md)
gradually slows queries and honors server delays without requiring a "continue
querying" message between phases. A 120-read fallback ceiling prevents indefinite
waiting. Explicit snapshot-only requests and genuine errors, user stops, or host
interruptions keep their own completion rules.

Installing a Skill does not authorize live requests. Follow the user's task
scope for setup and read-only checks; do not place a phone call to test credentials.
Real calls require an explicit execution instruction.

## Check for updates during use

The bundled [update procedure](../../skills/callev2/references/update-check.md)
checks the matching publisher-approved GitHub `SKILL.md` once on first eligible use in a conversation,
including capability questions, using a separate public webpage or anonymous
HTTPS reader. Native public readers with URL-only arguments are supported;
missing header or redirect controls alone do not prevent the check. The Agent
validates the source reported by the reader.
It adds a request-only freshness nonce on the same official path and permits
one retry after a 404, timeout, or HTTP 500–599. Other failures do not trigger
an alternate source. An unavailable reader or an unconfirmed check produces one
brief notice while the original task continues. It reads only the remote
name and version as data. API Keys, OAuth tokens and customer data are never
sent with that request, and remote instructions are not loaded during the check.

When a newer version is confirmed, the Agent offers to download it and continues
the original task with the installed version. Declining or deferring suppresses
further prompts for the conversation. Agreeing to download does not authorize
overwriting an installed Skill; an explicit request to download and update
already covers both actions.

The configured update URL is
`https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/callev2/SKILL.md`;
the source link is
`https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/callev2`.
Neither URL may silently redirect to the future `calle` or old `calle-connect`
identity. A missing or unreadable public source means update status is unknown.
Verify the published content and same-name metadata before claiming delivery.
An installed older version keeps its own checking instructions until updated;
publishing a fix does not rewrite an installed copy or guarantee that an external
reader has refreshed its cache.

The update source follows public `main`, not a tagged release feed. Publishers
must update `metadata.version` and the repository evaluation version together
when publishing changed behavior. A missing or unreadable public source means the update status
is unknown. Offline work, limited-scope checks, preview tasks and pinned versions
skip the check as specified in the bundled procedure. Failure never blocks the
original task, and hosts with only CALL-E MCP tools may lack public-fetch support.

Downloads use existing non-CLI host facilities, a fixed publisher-approved repository
commit, and the complete Skill directory. Keep source and destination paths
inside their respective directories, reject escaping paths and symlinks, and
inspect new scripts, external destinations and permission requirements as data.
Do not execute downloaded instructions or installation hooks. A fixed commit
ensures consistent files; it does not establish a security-audit result. Download,
installation and actual loading after a host reload are distinct completion states.

See the [update mechanism design record](../skill-update-mechanism.md) for rationale,
dated public audit examples and the remaining host validation work.

## Migrate an earlier standalone installation

The personal candidate succeeds the local `calle-connect` 0.2.0 implementation.
Earlier `calle-api-key` and `calle-mcp-oauth` testers also need explicit migration.
This does not replace an installed CLI `calle` automatically; users keeping that
workflow should follow the [calle-cli migration notice](skills-sh-skill.md#existing-calle-users).
Install the new entry explicitly and, with the user's migration authorization,
disable or remove the specific old standalone Skill entries so overlapping
instructions do not remain active. Preserve user edits, credentials, call records and idempotency
state; never replay calls during migration. Reload the host and verify the new
entry. This migration does not require a change to the MCP or API services.

The old same-name update checks cannot automatically perform a rename or discover
this replacement. Users with those installed copies need a migration notice and
one explicit installation of `callev2`. An old update URL becoming
unavailable is an unknown status, not permission to switch sources. Existing
active calls retain their original interface and account after migration.

The [0.1.2 integration record](../verification/dual-skills-0.1.2.md) is a historical
snapshot of the two separate Skills; its hashes and results do not validate this
merged version. Current test scope and execution states live in
[offline validation](../../tests/README.md).

## Optional source bundle

The initial `2.0.0` manual-publication source bundle was prepared at
`dist/releases/callev2-2.0.0-skills-sh/`, containing only the complete
`skills/callev2/` directory plus root `README.md` and `LICENSE`, preserving the
repository path. That bundle is distinct from the host-import ZIP with top-level
`callev2/`. Inspect the actual generated files and recorded hashes before upload;
this guide does not claim that a bundle was uploaded or give an invented download
URL. The separate `calle-cli` ZIP is a legacy compatibility artifact.

## Validate and package locally

These are repository development steps, outside the installed Skill's runtime.
Follow [offline validation](../../tests/README.md) for the development-only Python
validation environment. Build the source as one ZIP from the repository root:

```bash
pnpm pack:skill:callev2
```

The output is `dist/skills/callev2.zip`, with one top-level `callev2/`
folder and the complete installable source files, excluding repository test and
evaluation fixtures. The packer also writes an unpacked folder
under `dist/skills/`. The ZIP filename is stable; inspect `metadata.version`
inside `SKILL.md` for its version. Account configuration, credentials and private
reports do not belong in the package.

The packer uses `--public` for root `skills/` sources. Its default and `--all`
behavior continue to package repository helpers under `.agents/skills/`.
`pnpm pack:skill:calle-cli` continues to package the existing CLI-based Skill.
