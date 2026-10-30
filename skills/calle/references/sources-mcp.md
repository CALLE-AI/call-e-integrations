# Sources and verification status

Initially compiled on 2026-10-13. Authentication sources reviewed on 2026-10-14. Host management preferences and update boundaries revised on 2026-10-15.

## Evidence for this CALL-E MCP

On 2026-10-30, the user-supplied service candidate added `duration` to its shared
Call response, exposed as `structuredContent.call.duration` by MCP. It uses
recorded BillSec seconds, permits null, and preserves zero and fractional values
independently of business-result readiness. This is local source evidence, not
confirmation of deployment or an authenticated response with the new field.

The user initially supplied `https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth` and specified OAuth. The earlier observations below remain scoped to that endpoint.

During initial compilation, ordinary webpage reading did not obtain content, and direct network access from that runtime also failed. The package does not embed an authenticated tool snapshot. Historical host tests do not establish the current connection, identity, schema, or permissions. This instruction revision makes no new CALL-E authentication or account requests; its documentation and offline checks do not establish that the server is offline or that OAuth is valid or expired.

All business capabilities must therefore be discovered after connection; no invented server-specific function names are provided. Fictional tools in evals are solely offline behavioral evaluation fixtures.

On 2026-10-15, the current Codex chat exposed seven CALL-E tool definitions:
`plan_call`, `run_call`, `get_call_run`, `prepare_call`, `get_call`, `open_call`,
and `get_call_transcript`. Their descriptions and input/output schemas were read
without invoking any business tool. The user excluded the three legacy Plan/Run
tools from this Skill. The [MCP tool policy](mcp.md#current-call-tools-and-legacy-exclusion)
records that boundary and the observed Preparation/Call contract. This is a
host-exposed metadata observation, not a complete server inventory or a live
authentication, account, card-rendering, or execution test. Other hosts must
discover their own current schemas and still apply the exclusion.

The MCP call workflow is also aligned with `skills/agentic-call/SKILL.md` and
the review cases in `.codex-plugin/plugin.json` from the user-supplied
`call-e-8.0.0-agentic-draft.zip`. Its `.mcp.json` names the same server above.
The draft specifies the four current tools, task plus known facts, server-owned
clarification, revision-aware card editing, user Dial confirmation, existing-call
queries, and card cancellation. It does not require an explicit `result_schema`.
The ZIP contains instructions and metadata, not server implementation or live
acceptance evidence. Its plugin version `8.0.0` does not change this standalone
Skill's independent version, connection/update guidance, or API mode. The ZIP is
provenance only; the installed Skill does not need access to it.

### Current tool contract observed on 2026-10-23

The current Codex chat exposed `start_call` alongside `prepare_call`, `open_call`,
`get_call`, `get_call_transcript` and the three excluded legacy tools. Its input
is `preparation_id` plus `revision`; its output contains the existing Call
snapshot. The updated `prepare_call` description directs an authorized ready
preparation to `start_call` without an additional confirmation, and routes
server-owned clarifications through chat or the real card. Cards are optional
for execution through this tool. This supersedes the earlier card-only workflow;
it does not authorize dialing for previews, setup checks or prepare-only tasks.

Local service source and its 2026-10-22 specification were also inspected. The
tool and card Dial share preparation submission, current-revision checks and a
durable idempotency key per preparation. Existing accepted Calls are recovered
using that same preparation identity. A new preparation has a new identity and
is not a retry. The exposed tools still contain no MCP cancellation operation.

This is host-metadata and local-source evidence. The source tests cover
non-card start, ownership, readiness, revision conflicts and duplicate submission,
but this Skill update does not execute those service tests or establish deployed
execution, current OAuth, account permissions, card rendering or a successful
live call. Other hosts must discover their own schemas and tool approval controls.
No local service checkout is needed to install or use this Skill.

### Production endpoint selected on 2026-10-27

The user selected `https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth`
as this Skill's fixed production MCP target. Local service source routes both
OAuth entry points through the same gateway and exposes the same five Agentic
tools and card resources. This source inspection does not verify deployed
behavior, current OAuth, account permissions, or host rendering. Discover the
tools through the selected host connection; existing connections and saved call
references retain their original endpoint until explicitly resolved under the
[connection guidance](connection.md).

### Public publisher attribution verified on 2026-10-28

The [official CALL-E usage page](https://www.heycall-e.com/how-to-use/)
identifies AI Rudder as CALL-E's parent company, links CALL-E login to
`https://botlab.airudder.com`, and directs agent installation to this
repository's stable guide. The official site's
[public discovery file](https://heycall-e.com/llms.txt) also links
`CALLE-AI/call-e-integrations` for agent plugins and MCP setup. That repository's
[published source](https://github.com/CALLE-AI/call-e-integrations/blob/7c8c62c4589a656f65c158d58c2ac8b9335be877/skills/calle/SKILL.md)
designates `https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth` as the fixed
production MCP target.

These public sources establish publisher attribution for the selected target.
Verify deployed tools, OAuth, account identity and permissions through the host's
actual connection. The dated observations above retain their original scope.
These links document provenance; they add no runtime downloads or permissions.

## General format and protocol sources

- [Agent Skills Specification](https://agentskills.io/specification): Skill directories, metadata, and progressive loading.
- [MCP Tools, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): tool discovery, pagination, inputSchema, outputSchema, tool errors, and structured results.
- [MCP Authorization, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): OAuth client responsibilities, metadata, and credential protection for HTTP MCP.
- [Codex MCP management](https://learn.chatgpt.com/docs/extend/mcp) and [Claude Code MCP management](https://code.claude.com/docs/en/mcp): host-specific configuration and authentication entry points. Check the installed host's actual capabilities and permissions; these documents do not establish that a management tool is exposed in the current chat.

The dated MCP specifications serve as general protocol references. They do not establish that this service declares support for those versions or that every host currently uses them.

## Completed and outstanding work

Completed: authored host OAuth connection guidance, dynamic tool mapping, a single-call workflow, and safe recovery rules. Version v0.1.2 added first-connection guidance, host checks after returning from the browser, tool refresh, read-only completion criteria, layered cleanup, and eight authentication scenarios for offline multi-turn evaluation. Actual reports govern structural check and Agent behavior evaluation status; definitions alone do not imply passing results.

Version 0.2.0 merged both access paths into calle-connect, preferring MCP and selecting API fallback before execution based on confirmed capabilities. Update sources, authorized downloading, and full-directory validation are shared. MCP connection management prefers native host facilities, then permits verified official commands of the current host within the connection guidance. Business operations, API setup, and Skill updates remain non-CLI. This version identifies local source; it does not establish publication or a passed platform security audit.

Not established by this revision: current CALL-E OAuth, the complete server tool inventory beyond the host-exposed definitions above, query/create/cancel permissions, identity, automatic token refresh, server-side revocation, live calls, or direct ZIP installation in a specific host. Prior test records remain scoped to their original host and run; they do not replace current discovery. `verified-on` identifies only the guidance review date.

The initial canonical standalone `calle` release was version 2.0.0, adopting the tested
`callev2` implementation and its existing MCP and API business contracts.
Existing host connections, private credential locations and saved call records
keep their original references. The initial live acceptance baseline is Codex
MCP; unexecuted API and other-client live checks remain explicitly unverified.
Earlier verification remains evidence only for its recorded source and scope.

On 2026-10-28, the publisher selected 1.0.0 as the current release designation,
retaining the 2.0.1 MCP/API workflow and result-handling protections. Earlier
release artifacts and verification records retain their original versions; this
version reset does not establish new service, host or security-audit acceptance.
