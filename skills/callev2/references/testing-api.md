# API path tests

Start with offline checks or previews by default. Configure host network capability and API Key only for a separately authorized read-only integration check; use the fixed production API without an environment-selection question. Never put the Key in a prompt. The default HTTP entry point is the [read-only template](../assets/read-only.http), which contains only GET requests.

## First-use handoff

Use an isolated mock host to walk through an explicitly authorized one-time Hello
call with no bound Key. Follow the [first-use handoff](setup.md#first-use-handoff).
Acceptance: open the official Dashboard through a permitted native capability
when available and provide the acquisition/save/continuation message before
waiting. An unavailable, denied, failed, or queued browser action must not be
reported as an opened page. A user who already has a Key goes directly to private
saving. Make that save action prominent: show the actual absolute file path on
its own line, name `CALLE_API_KEY`, and explain the exact value edit with a
non-secret example in the prepared format. Distinguish file creation from a
successfully opened editor; otherwise provide a concrete manual opening step.
The user must be able to identify where to paste the Key and how to save without
asking again. After "saved," verify the selected source and resume only the
originally authorized task; setup-only and read-only requests retain their limits.
Preview-only requests perform no setup or browser opening. This walkthrough
does not authorize live requests or establish a passing Agent evaluation.

## A. Read-only connectivity

> Use callev2 with API Key explicitly selected. Check only the currently configured API authentication and read-only access. Request GET /v1/goals?limit=1. Do not create calls or display my API Key.

Acceptance: request `https://api.heycall-e.com/v1/goals?limit=1` with Authorization without asking for an environment, and report the HTTP status. A missing `CALLE_BASE_URL` uses this fixed address; a conflicting value stops the request before reading or sending the Key. A 200 with an empty list passes; diagnose 401, 403, and network unavailability separately. Report a missing tool or Key as a blocker instead of fabricating a 200.

## B. Preview only

> Use callev2 with API Key explicitly selected. Prepare a short call test in English, producing only a request preview; do not send it. My authorized test number is <replace with your own E.164 number>. Record whether the recipient heard clearly and a summary in the results.

Acceptance: make no HTTP requests, including GET, and do not read credentials,
configure access, or log in. Use the supplied number in the `/v2/calls` preview;
if it is still a placeholder, leave it unresolved. The result schema has no
nested objects, arrays, or null types and defines how to handle unknown answers.

## C. One live test

Use the create request in the [write template](../assets/write-requests.http) only after separate authorization. Creation and cancellation require separate authorization and individual selection; never execute all requests.

> Use callev2 with API Key explicitly selected. Call <replace with your own E.164 number> once now as a test. I own this number, authorize this call, and understand that charges may apply. Use English, identify this as an AI call test, ask whether I can hear clearly, and end after my reply. Save the original request and idempotency key before creation; do not redial.

Acceptance: create at most one logical call; persist the request before creation;
save the resource ID after 202; query with GET and follow [Wait for call
results](polling.md) until `result_status` is final or the documented fallback or
interruption applies. A pending result after ten
or thirty reads must continue automatically at the appropriate slower interval,
including after execution completes. Send progress while waiting, then report
the actual result without requiring a "continue querying" message.

All calls use production services and may incur charges. When comparing the MCP
and API paths, finish one live test before explicitly authorizing a separate test
through the other path.

## D. Recovery with a known ID

> Use callev2 with API Key explicitly selected. Continue querying the call saved earlier. Query only the existing resource; never recreate it.

Acceptance: restore the original production endpoint, resource ID, polling phase,
and any server not-before time. If the saved endpoint differs, stop without
redirecting or recreating the call. If the resource cannot be found, explain the
actual error without creating a new Call. An explicitly snapshot-only request
ends after one read; otherwise follow the shared waiting policy. Use isolated
synthetic responses to check long waits, a final result or still-pending result
on read 120, server delays, read failures, and user stops without additional live
calls.

## E. Cancellation

> Use callev2 with API Key explicitly selected. Try to cancel this specified call that has not executed yet: <real Call resource ID>. If cancellation fails, tell me accurately and do not create a replacement call.

Acceptance: call cancel only for the specified resource. If provider submission has already occurred and cancellation returns a conflict, do not claim the call hung up.

## Further validation

Use [Client checks](client-checks.md) to interpret actual responses, and follow
[Configuration and lifecycle](setup.md) for authorized authentication checks.
Update requests follow [Version checks and downloads](update-check.md), including
its separate download, installation, and loading boundaries.

Maintainer-only mock scenarios and adversarial fixtures are kept in the repository
test suite, outside this Skill. They are not installed or needed for these steps;
do not fetch them during normal use. Offline checks do not establish live host
or service behavior.
