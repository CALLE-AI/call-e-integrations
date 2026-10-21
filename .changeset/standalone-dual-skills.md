---
---

No npm package release: consolidate the earlier standalone calle-api-key and
calle-mcp-oauth source entries into calle-connect 0.2.0, with one version,
MCP-first routing and pre-execution API Key fallback. Business operations and
updates use non-CLI host facilities. MCP connection management prefers native
host facilities, with a limited official host-command exception. Adjust
installation and migration documentation, offline evaluation definitions and
local single-Skill ZIP packaging.

These root sources are outside all existing npm and plugin payloads. The
CLI-based calle Skill and its package attribution remain unchanged. Publish
the standalone source separately after host acceptance; existing copies of the
earlier named Skills need an explicit migration notice and installation because
their same-name update checks cannot discover the renamed replacement. This
change does not publish source files or ZIPs.

Keep preview requests local across both paths: no HTTP requests, MCP business
calls, credential reads, or connection setup. Leave missing IDs unresolved and
require authorization beyond the preview request for any later lookup. Align
workflow instructions, testing guidance, and offline evaluation permissions.
Require English for new or rewritten repository-authored content in AGENTS.md.

Translate all newly added Skill instructions, HTTP template comments, evaluation
prompts, and supporting documentation into English while preserving their
behavior and leaving historical repository content unchanged.

Align the entry description with the detailed pre-execution fallback conditions.
Move the complete offline evaluation set to tests/behavior/calle-connect-evals.json
without changing its scenarios or assertions. Keep adversarial fixtures outside
the installed Skill, remove runtime links to them, and guard ZIP packaging
against test-only directories. The standalone draft remains at 0.2.0; existing
npm package payloads and versions are unaffected.

Reuse existing MCP connections and prefer the current host's exposed, permitted
native management tools, APIs or Agent-operable interface. When unavailable,
allow only that host's already-installed official MCP setup, authentication,
status and refresh commands; logout or removal requires a covering user request.
Keep explicit user limits and host permission denials binding. This exception
does not permit business CLI calls, command-line HTTP, dependency installation,
manual OAuth or token-cache access, other hosts' commands, or CLI Skill updates
and installation. Keep MCP-first business routing and API fallback conditions
unchanged, and synchronize connection guidance and regression scenarios.

Exclude the legacy CALL-E MCP tools plan_call, run_call, and get_call_run from
the standalone Skill, including namespaced forms, aliases, read-only checks, and
recovery. Document the observed prepare_call/card and Call query workflow,
preserve resource ID distinctions, and prohibit legacy fallback when tools or
cards are unavailable. Synchronize installation guidance and repository-only
evaluation scenarios without changing existing CLI or plugin integrations.

Align the standalone MCP call instructions with the user-supplied CALL-E 8.0.0
Agentic draft: use the task and known facts, real server cards, preparation
reopening and revision-aware edits, user Dial confirmation, pending-only result
polling, and card cancellation. Add concrete tool argument examples without
making a custom result_schema mandatory. MCP can retain references in the
conversation; API keeps its private recovery-record requirement. Connection,
update, API routing, existing package payloads, and the unshipped standalone
0.2.0 version remain unchanged. This alignment does not fix or deploy the service.
