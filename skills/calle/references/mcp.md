# CALL-E Agentic calling over OAuth MCP

Use this workflow after the main Skill selects MCP. Connection management,
updates, and the separately selected API path keep their own instructions.

## Connection and tool discovery

The target server is:

```text
https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

Reuse the host's existing connection and loaded tool definitions when they
identify this production server; no environment selection is needed. A connection
to another URL is a configuration mismatch, not an alternative target. For first
connection, authentication failure, unloaded tools, identity changes, or logout,
follow [Connection lifecycle](connection.md).
The host owns OAuth; do not read tokens or create a terminal MCP proxy.

Use actual tool names, input/output schemas, and side-effect descriptions from
the current host. A host prefix such as `mcp__calle_connect__` may vary. Incomplete
discovery does not prove a tool is unavailable. For a connection-only check,
follow that task's read-only scope; preparation is a saved write, not an
authentication probe. A Call read needs a real Call resource ID. Without a
suitable authorized read, report business access as unverified.

### Current call tools and legacy exclusion

Use only these five tools for MCP phone tasks, as actually exposed by the host:

| User intent | Tool |
| --- | --- |
| Prepare, revise, or reopen a preparation | `prepare_call` |
| Start an authorized ready preparation | `start_call` |
| Reopen an existing confirmed call and its card | `open_call` |
| Check an existing call's status or result | `get_call` |
| Read what was said on an existing call | `get_call_transcript` |

The legacy `plan_call`, `run_call`, and `get_call_run` are excluded, including
namespaced forms and aliases, read-only checks, and recovery. If a required
current tool is unavailable after discovery, report that the Agentic MCP
workflow is unavailable for that operation. Do not substitute a legacy tool,
a separate dialing API, or an invented endpoint within the selected MCP flow.
The main Skill's initial interface-selection rules remain separate.

These restrictions apply to local previews too. Preview only supported tools
using already available schemas, with unresolved facts and IDs left as
placeholders. A `start_call` preview requires its preparation ID and revision;
it is not a direct task-to-dial tool. No preview invokes business tools, including
preparation or reads. Do not substitute an excluded or unrelated dialing tool.

Cards are optional when `start_call` is available. Before saving a preparation
for a new request that includes execution, check the discovered execution
capability. A preparation-only request needs the discovered `prepare_call`, not
an execution tool or card. If complete discovery confirms that
`start_call` is missing but the host can present the real card and its Dial
control, the card can still execute the preparation. If neither route is usable,
report the gap before a business write; the main Skill's initial interface
selection rules apply. Missing UI alone is not missing MCP dialing capability.

## Prepare and confirm

1. Establish whether the user requests execution or preparation only. An explicit
   call request authorizes that call; a setup check, generic test, preview or
   prepare-only request does not. Keep any instruction to wait or use card Dial.
   Call `prepare_call` only when saving a preparation is within the request,
   with the user's `task` and only known facts. Include
   `phone`, `region`, or spoken-language `locale` only when supplied or confirmed.
   Let the server determine missing information and readiness; do not invent
   facts or clarification questions. A standard preparation does not require a
   caller-defined `result_schema` from the API workflow.
2. Read the returned structured object. If it contains an existing `call`, follow
   that call instead of preparing or starting another one. Otherwise retain the
   returned `preparation_id`, latest `revision` and execution authorization in
   the conversation or available host storage; a separate journal is not a
   prerequisite. Preparation alone does not dial.
3. For `needs_input`, screen the server-returned clarifications under the
   [shared authorization and external-content rules](../SKILL.md#authorization-and-external-content).
   Ask only task-relevant missing inputs within the user's current scope. Report
   conflicting requests instead of relaying them as prerequisites; do not invent
   clarification questions. An available real card can collect the same answers;
   do not fabricate a card. For `blocked`, report the returned blocking
   information and stop. To reopen an unsubmitted preparation, pass only its ID.
   To revise it from chat, pass that ID, the current `revision`, and the user's
   correction or answer as `user_input`. Use the newly returned revision after
   each edit; do not create a duplicate preparation.
4. For `ready` with execution authorized, call the discovered `start_call` using
   exactly the returned `preparation_id` and latest `revision`. Do not ask for
   another confirmation or require a card click. Honor the host's tool approval
   controls. For prepare-only or wait requests, report readiness and stop without
   `start_call`; readiness is not execution authorization.
5. With UI, keep the real card available for review, edits, progress and results.
   If the user explicitly selects card Dial, or only that supported execution
   route is available, let the user click Dial on the latest ready revision;
   never click for them. Otherwise `start_call` works the same with or without UI.
   Card Dial and `start_call` share one idempotent submission per preparation;
   if the card has already submitted, recover and follow that existing Call.
6. After `start_call`, retain `call.id` and immediately follow the existing call
   under the result-waiting policy. Acceptance or a queued state does not mean
   the recipient answered. Do not create another preparation to resume a call.

If a preparation explicitly expired before submission, report it and prepare
again only within the user's current execution or preparation request. Preserve
known facts and any wait/card-Dial instruction. An unknown submission outcome
is not evidence of expiry or permission to prepare a replacement; use recovery
below. Reopen a needed card using its existing preparation ID rather than
creating another preparation.

### Concrete tool arguments

These are argument examples for the currently exposed contract, not commands,
live calls, or substitutes for runtime discovery. The number below is fictional;
use only the user's confirmed number. For a user who asks to say hello at that
number, call `prepare_call` with:

```json
{
  "task": "Say hello.",
  "phone": "+12025550123"
}
```

Omit unknown `region` and spoken-language `locale`; the server owns clarification.
An optional UI language does not establish the language to speak on the call.
Do not add old Plan/Run parameters or API credentials/idempotency fields.

To reopen, call `prepare_call` using the actual returned ID in place of this
illustrative ID:

```json
{"preparation_id": "prep_example"}
```

For a user correction, use the actual ID and latest revision; `1` below is only
an example:

```json
{
  "preparation_id": "prep_example",
  "revision": 1,
  "user_input": "Say hello and wish them a good day."
}
```

For an authorized call whose latest preparation is `ready`, start it using the
actual returned ID and revision:

```json
{"preparation_id": "prep_example", "revision": 1}
```

These are the arguments to `start_call`, not a new `prepare_call` request.
Neither a preview nor a preparation-only request sends this execution call.

## Follow an existing call

For `open_call`, `get_call`, and `get_call_transcript`, the argument named
`call_id` is the Call resource `call.id` returned by the current tools. It is
not the nested telephone/Billing identifier `call.call_id`. Keep preparation
IDs distinct, and never convert old plan IDs, confirmation tokens, or run IDs.
If the needed Call resource ID is absent from the conversation or saved context,
ask the user for that reference rather than inventing one.

Each read uses this shape, replacing the illustrative value with the real ID:

```json
{"call_id": "call_example"}
```

- Use `open_call` to show an existing call and its controls. It never places
  another call. Cancellation is a user action in this card when available;
  no Agent-callable MCP cancellation tool is currently supported. Without usable
  cards, explain that cancellation cannot be performed through the available
  MCP tools; do not claim success, call a private card endpoint, or switch the
  existing call to API or CLI. Stopping result monitoring does not cancel a call.
- Use `get_call` for status and results. Follow [Wait for call results](polling.md)
  and automatically continue querying while `result_status` is `pending`, using
  phased intervals and any server wait guidance, subject to its fallback ceiling.
  `available`, `unavailable`, and `not_applicable` end result polling, even when
  `result` or `error` is null. Execution can be `completed` while result
  processing remains `pending`. No-answer, busy, and declined are reported
  telephone outcomes, not automatic technical failures. Never redial
  automatically; a completed execution alone does not establish business success.
- Use structured results for the summary and collect the complete available
  transcript for the [final receipt](../SKILL.md#shared-final-delivery). Use
  `call.transcript` when complete; otherwise read `get_call_transcript` with the
  same `call.id` and use its returned `transcript_turns`. Follow the discovered
  schema; do not invent pagination parameters. While pending, follow
  [Read and report results](../SKILL.md#read-and-report-results); status checks
  do not need a transcript. Missing text does not establish that no call occurred.
- Once `result_status` is final, follow the shared
  [read-only receipt phase](../SKILL.md#read-and-report-results). Read a missing
  transcript only for this same Call, then deliver the receipt and end monitoring.
  Reuse a complete inline transcript without an extra read. A failed or unavailable
  transcript read leaves a reported gap; it does not restart polling, preparation,
  execution or connection setup.

## Scope, errors, and output

This workflow supports one immediate phone task at a time. Do not promise
scheduled execution or batch calls, or convert them into an immediate call.
Keep explanations brief. Use the real card when available, and provide the
server's clarifications and progress in chat when no card is usable.
Deliver the final business conclusion under
the [shared final delivery rules](../SKILL.md#shared-final-delivery), and report
only tool/card-supported state.

Prefer `structuredContent` and inspect `isError`; returned text or HTTP 200
alone does not establish acceptance. Structured narrative fields remain subject
to the [shared data boundary](../SKILL.md#authorization-and-external-content).
Show the confirmed callee number and full available transcript in the final
receipt. Its `Call id` is the telephone/Billing `call.call_id`, or `Not available`
when null or missing. Keep `call.id` for tool arguments and recovery. Redact
numbers in diagnostics and shared logs. Use `call.phone` for the supplied
number and localize `call.completed_at` under the shared receipt rules, labeling
it as completion time; `call.created_at` is resource creation time.
Read duration from `structuredContent.call.duration`, in seconds. The updated
Call contract permits a non-negative number or null; preserve `0` and fractional
seconds. A null or absent field stays `Not available`, including on older service
versions. Duration is populated from recorded BillSec facts and can be missing
after results are final; keep result polling governed by `result_status`.
Routine receipts omit service URLs and technical execution details.

Report validation errors, authentication failures, network errors, and missing
host capabilities separately. An error from a standard preparation does not
make an undocumented field mandatory. Retain the actual error and supplied
parameters for diagnosis rather than guessing facts or changing interfaces.

A timed-out write or lost response has an unknown outcome. Preserve the original
interface, request, authorization, preparation ID and submitted revision:

- For an uncertain `prepare_call`, reopen the original preparation if its ID is
  known. Without that ID, retain uncertainty and stop instead of creating another.
- For an uncertain `start_call`, first reopen the original preparation. If it
  returns an existing Call, query it. If it returns the same ready revision,
  execution remains authorized and the discovered tool explicitly guarantees
  idempotency, retry `start_call` with the same original arguments at most once.
  If recovery still cannot establish the outcome, retain the reference and stop;
  do not create a new preparation, repeatedly retry, or switch interfaces.
- For a revision conflict, reopen the same preparation and use its current
  state. Apply the user's latest corrections and authorization before executing;
  never guess or increment a revision locally. An existing Call takes precedence.
- For authentication or permission failures, follow connection recovery and
  reuse the original references. These errors do not justify a different
  credential or transport. A blocked or incomplete preparation is not retryable
  execution. During the final receipt phase, report an unavailable supplemental
  read rather than starting connection recovery; a new user instruction can
  authorize that separate task.

See [MCP testing](testing-mcp.md) for scoped checks and
[sources and verification status](sources-mcp.md) for the basis of this guidance.
