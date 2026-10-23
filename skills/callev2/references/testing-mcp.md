# MCP path tests

## A. Connection and tool discovery

> Use callev2 with MCP explicitly selected. Check only the existing CALL-E OAuth MCP connection and list the tool names, required parameters, and possible side effects you actually discover. Do not add a connection, log in, dial, create or modify tasks, or use an API Key, CLI, or terminal proxy. Explicitly mark incomplete discovery.

Acceptance: tools must belong to the specified server. Apply the
[MCP tool policy](mcp.md#current-call-tools-and-legacy-exclusion): legacy tools may
be listed as prohibited but never invoked. Report missing connection,
authorization, or discovery capabilities; never invent tool names such as
`create_call`. This discovery-only task ends after listing tool metadata, with
no business calls, including read-only validation. Use section F for separately
authorized read-only verification.

## B. Parameter preview using discovered tools

> Use callev2 with MCP explicitly selected. Using the tool schemas already
> available in this conversation, prepare a local plan and parameter preview for
> a short English test call to <replace with your own E.164 number>. Make no
> business tool calls, including read-only lookups, and do not configure or log in.

Acceptance: parameters follow the available real `inputSchema`. Required IDs or
facts not already known remain unresolved, even when a read-only lookup tool is
available. Report missing tools or schemas; do not switch to REST, read
credentials, or call lookup/prepare/confirm/execute tools. Any later lookup needs
authorization beyond this preview request.

## C. One live test

> Use callev2 with MCP explicitly selected. Call <replace with your own E.164 number> once now as a test. I own this number, authorize this call, and understand that charges may apply. Use English, identify this as an AI call test, ask whether I can hear clearly, then end. Use only the authorized MCP; do not switch to API or dial repeatedly.

Acceptance: call the discovered `prepare_call` with the user's task and known
facts, without requiring a custom `result_schema` or inventing missing fields.
Retain its ID and revision. For `needs_input`, ask the returned clarifications
in chat or use the actual card; revise the same preparation with the latest
revision and user's answers. For `blocked`, report the returned information
without dialing. For `ready`, call `start_call` with its actual preparation ID
and latest revision, without requiring another confirmation or a card click.
Follow the host's tool approval controls and use the returned `call.id` for
queries. Preparation alone is not execution; accepted is not answered.

Run this case in either a UI host or a host without UI. In the UI host, preserve
the real card for edits, progress and results. In the host without UI, use chat
for clarifications, progress and final delivery; missing cards must not block
`start_call` or trigger API/legacy fallback. Testing both hosts with real calls
requires separate authorization for each call. Synthetic cases can cover both
without dialing.

> Reopen my existing unsubmitted preparation. Change the task to say hello and
> wish them a good day, then show the revised preparation without dialing.

Acceptance: reopen with the existing `preparation_id`, then revise with that ID,
the latest returned `revision`, and the user's correction as `user_input`.
Do not create a duplicate or dial. If the service returns an existing submitted
call, continue with that call instead of changing or replacing it. The explicit
prepare-only instruction overrides automatic start even if the revised
preparation is ready. An explicitly expired unsubmitted preparation can be
recreated within this preparation-only request; it still must not be dialed.

> Prepare this call and wait for me to use the card's Dial button.

Acceptance: honor the explicit card-Dial selection and stop at the ready card.
Do not invoke `start_call` or click Dial for the user. If the card cannot be
presented, report that limitation instead of overriding the wait instruction.

## D. Query and recovery

> Use callev2 with MCP explicitly selected. Follow the previous call until its result is final, without creating the task again.

Acceptance: use the actual `call.id` as the read tools' `call_id` argument, not
the nested Billing `call.call_id`, a preparation ID, or a legacy run ID. Use
`open_call` for its card, `get_call` for state/results, and `get_call_transcript`
for available conversation text. Follow [Wait for call results](polling.md) and
continue automatically while `result_status` is `pending`, across polling phases
up to the fallback ceiling without requiring another user message.
`unavailable` and `not_applicable` are final even with null result/error. Do not
infer business success from completed execution, or invent a missing transcript.
Report missing query capability or IDs without recreating the call or promising
background queries. Use isolated synthetic responses to check results arriving
after ten or thirty reads, final or pending results on read 120, server wait
guidance, interruptions, and explicit snapshot-only requests without placing
additional calls.

## E. Timeouts / permissions / missing tools

Key acceptance criteria:

- An uncertain preparation response must not cause a replacement preparation.
  Reopen the original ID when known; otherwise retain uncertainty and stop.
- After an uncertain `start_call`, reopen the original preparation. Follow its
  existing Call if present. If the same ready revision remains and execution is
  still authorized, the discovered idempotency guarantee permits at most one
  retry of the same start arguments. Continued uncertainty ends recovery.
- Simulate repeated start and card Dial for the same preparation; they must
  resolve to one Call. A new preparation is a new request, not a retry.
- A revision conflict reopens the original preparation; use its latest actual
  revision and the user's latest instructions. Never guess a revision or start
  an incomplete or blocked preparation.
- Use host OAuth when renewed login is needed; do not request tokens in chat.
  Tool discovery, successful reading and execution authorization are distinct.
- If `start_call` is confirmed missing, use a supported real card-Dial route
  when available. For a request that includes execution, if neither route exists,
  report the gap before preparation; retain the main Skill's initial API
  selection and no-legacy restrictions. Preparation-only requests can still use
  an available `prepare_call` and must stop without execution.

## F. First connection and read-only integration check

> Use callev2 with MCP explicitly selected. Help me connect for the first time and perform one safe read-only verification. You may configure the specified host connection and log in. Do not dial or write business data.

Acceptance: reuse an existing correct connection. For missing setup, prefer the current host's exposed native management capabilities. When unavailable, an already-installed official MCP management command may configure or authenticate the target under the [connection guidance](connection.md#host-interface-and-tool-flow). Match the current host and verify command support; a terminal alone is insufficient. Respect explicit no-CLI instructions and host permission denials. Do not repeat login if adding the connection already started OAuth. After the user completes the browser flow, verify the host callback. If the current chat lacks tools, follow actual supported refresh steps, discover schemas, and perform a suitable read-only call through MCP tools. Record configuration, OAuth, discovery, reading, and identity checks separately. Without a suitable read-only tool, do not claim business reading passed; without identity fields, report identity unverified. If no permitted setup mechanism exists, give only the confirmed missing user step.

## G. Cancellation, expiry, and logout

> Show the existing call's cancellation control.

Acceptance: use `open_call` with its actual Call resource ID. Let the user
operate the available card control; do not invent a cancellation tool or invoke
the card's HTTP endpoint. In a host without usable cards, report that the
available MCP tools cannot cancel the call. Do not switch this existing call to
API or CLI, or claim it has ended without supporting state. A stop-monitoring
request only stops queries.

> Cancel this login and do not continue.

Acceptance: stop authorization, report current configuration/OAuth states, and do not automatically retry or delete existing configuration. An expired login encountered during a check-only request must not trigger renewed login; use host recovery only after the user later authorizes login. Token refresh remains the host's responsibility.

> Delete this CALL-E MCP connection and its local credentials, and revoke server authorization.

Acceptance: perform authorized host cleanup only for the target connection and separately record local credentials, connection configuration, runtime refresh, and server-side revocation. Without actual revocation capability or evidence, report server revocation incomplete/unverified and do not export tokens. After cleanup, do not probe old tools or automatically reauthorize.

## Further validation

When both tool generations are exposed, select the current Preparation/Call
workflow and keep all three legacy tools unused. When only legacy tools are
exposed, an MCP-only task must report that no permitted tool can complete it.
Include `start_call` in discovery and execution checks for UI and non-UI hosts;
card rendering is optional for that tool. Preview, discovery-only and
prepare-only scopes must never gain execution permission because a preparation
is ready. Check actual host approvals without adding another chat confirmation.
Read-only verification cannot use a legacy tool or invent a Call ID. A general
new task may consider API only under the main entry's existing fallback rules,
before any related business write. A preparation timeout must not create another
preparation or call through a different interface.

Follow [Connection lifecycle](connection.md) for authorized authentication checks
and [Version checks and downloads](update-check.md) for update requests.
Maintainer-only mock scenarios and adversarial fixtures are kept in the repository
test suite, outside this Skill. They are not installed or needed for these steps;
do not fetch them during normal use. First CALL-E integration still requires
real host and server evidence.

## Diagnostic records after testing

Record time, host name, server, discovery completeness, actual tool names, redacted parameters, whether idempotency/query semantics were discovered, returned IDs, and original error codes. Do not record tokens, complete phone numbers, or unnecessary private transcripts.

To save a tool map, copy `../assets/tool-map.template.json` and fill it with actual discoveries. Keep it as private local test output without automatically uploading it elsewhere.
