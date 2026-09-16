# CALL-E `/mcp/openagent_oauth` MCP

`/mcp/openagent_oauth` is CALL-E's standard OAuth-protected Model Context
Protocol (MCP) endpoint. It lets any compatible MCP client connect to CALL-E
over Streamable HTTP, discover available tools, authorize the user, and run the
CALL-E one-shot call workflow through MCP tool calls.

This guide describes only the MCP surface: the endpoint, transport,
authorization behavior, tool discovery, tool contracts, and safe tool order.

## Endpoint

Production MCP URL:

```text
https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```

Transport:

```text
Streamable HTTP
```

## MCP Lifecycle

A compatible MCP client should treat this as a remote Streamable HTTP MCP
server:

1. Connect to the MCP URL.
2. Send `initialize`.
3. Complete OAuth authorization if the server returns an authorization
   challenge.
4. Send `tools/list`.
5. Call tools with `tools/call`.

The expected tool set is:

```text
plan_call
run_call
get_call_run
```

## Test With MCP Inspector

Use the MCP Inspector when you need to verify this endpoint outside a normal MCP
client. The Inspector is the MCP project's interactive test tool for connecting
to MCP servers, inspecting capability negotiation, listing tools, and invoking
tools with test input.

For Inspector-specific options, see the official
[MCP Inspector guide](https://modelcontextprotocol.io/docs/tools/inspector).

Start the Inspector locally:

```bash
npx @modelcontextprotocol/inspector
```

The Inspector starts a local web UI and prints the URL to open. Use the printed
URL because recent Inspector versions include a proxy session token in it.

In the Inspector UI:

1. Select the `streamable-http` transport.
2. Set the server URL to:

   ```text
   https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
   ```

3. Connect to the server.
4. Complete the OAuth browser flow if the server asks for authorization. If you
   are testing with an existing bearer token, enter it only in the Inspector
   authentication field and do not paste it into prompts, screenshots, or logs.
5. Open the Tools view and list tools.
6. Confirm the tool list contains `plan_call`, `run_call`, and `get_call_run`.
7. For a safe smoke test, invoke `plan_call` with incomplete or clearly
   non-running input and verify that the response asks for missing details.

Do not use `run_call` as a setup or connectivity test. `run_call` can place a
real outbound phone call. Only test `run_call` when the test intentionally
places or schedules a real call and the returned `plan_id` and `confirm_token`
come from the immediately preceding `plan_call` result.

## Authorization

This MCP endpoint requires OAuth authorization. If a request is unauthenticated
or the token is invalid, the MCP server can return an OAuth protected-resource
challenge. The MCP client should follow the advertised protected-resource
metadata, complete the browser authorization flow, and retry MCP requests with
the issued bearer token.

Clients must not expose OAuth access tokens, bearer tokens, authorization
codes, callback URLs, or refresh tokens to the model or user-visible logs.

## Tool Flow

The MCP tool order is:

```text
plan_call -> run_call -> get_call_run
```

`plan_call` prepares the call. `run_call` starts the prepared call. `get_call_run`
reads progress and results.

## Tool Result Envelope

All three tools return an MCP `CallToolResult` inside the JSON-RPC
`response.result` field. On the wire, `content` is the compatibility content
array and `structuredContent` is the optional machine-readable JSON object:

```json
{
  "jsonrpc": "2.0",
  "id": "calle-plan_call",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"plan_id\":\"plan_123\",\"ready_to_run\":true}"
      }
    ],
    "structuredContent": {
      "plan_id": "plan_123",
      "ready_to_run": true,
      "confirm_token": "<opaque confirmation token>"
    }
  }
}
```

Prefer `structuredContent` whenever it is present. A text block containing
serialized JSON is a compatibility representation, not a guaranteed
`content[0].text` contract: MCP content can contain multiple text or non-text
blocks, and the JSON text block is not required to be first.

`@call-e/core` and the CALL-E CLI preserve the raw `CallToolResult`. If a
content-only result has a text block that parses as a JSON object, they also
expose that object locally as `structuredContent`. They do not parse prose,
JSON arrays or scalars, Markdown fences, or combined fragments. Direct MCP
clients that do not use `@call-e/core` must implement that fallback themselves
when they need compatibility with a content-only response.

The MCP wire name and JavaScript or TypeScript property are
`structuredContent`. The official Python SDK 1.x uses the same attribute name;
Python SDK 2.x exposes `structured_content` on Python objects while serializing
the wire field as `structuredContent`. See the official Python SDK
[field-name migration](https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/migration.md#field-names-changed-from-camelcase-to-snake_case).

After extracting the structured object, use these handoff fields:

| Tool | Fields used by the next step |
| --- | --- |
| `plan_call` | `ready_to_run`, `plan_id`, `confirm_token`, and any `clarifying_questions` |
| `run_call` | `run_id`, current `status`, and `next_step` when present |
| `get_call_run` | `run_id`, `status`, `activity`, result fields, and `next_step` when present |

These are workflow handoff fields, not an exhaustive output schema. Follow the
current tool definitions returned by `tools/list` and do not infer fields that
the server did not return. See the MCP specification for
[structured tool results](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#structured-content).

### `plan_call`

Use `plan_call` first. It creates or refines a call plan and does not place a
phone call.

Important inputs:

- `user_input`: the user's latest message, passed verbatim.
- `to_phones`: destination phone numbers, only when known and unambiguous.
- `region`: region hint, only when known.
- `language`: call language, only when known.
- `goal`: call goal or instruction, only when known.
- `scheduled_at`: optional one-time execution time, only when supplied clearly.
- `plan_id`: an existing plan identifier when refining a previous plan.
- `ttl_seconds`: optional retention TTL for plan and run records.

Rules:

- Always preserve the user's latest message in `user_input`.
- Do not guess phone numbers, country codes, region, language, schedule time,
  or missing call goals.
- If `ready_to_run=false`, ask the user for the missing details and call
  `plan_call` again.
- If `ready_to_run=true`, preserve the returned `plan_id` and `confirm_token`
  exactly.

### `run_call`

Use `run_call` only after `plan_call` returns `ready_to_run=true` and the user
clearly intends to place the call.

Important inputs:

- `plan_id`: the exact plan identifier returned by `plan_call`.
- `confirm_token`: the exact confirmation token returned by `plan_call`.
- `ttl_seconds`: optional retention TTL override for the run record.

`run_call` can place a real outbound phone call. Do not synthesize, edit, or
reuse `plan_id` or `confirm_token` across plans.

If a call starts, do not call `run_call` again for the same plan unless the
server returns a `next_step` that explicitly requires another run action.

### `get_call_run`

Use `get_call_run` after `run_call` starts or schedules a run. It is read-only
and does not initiate calls.

Important inputs:

- `run_id`: the run identifier returned by `run_call`.
- `cursor`: optional pagination cursor from a previous `get_call_run` response.
- `limit`: optional maximum number of activity entries to return.

The response can include status, activity, summary, details, transcript, and
`next_step` guidance. Follow the workflow below until the run reaches a
terminal state.

### Reliable terminal-state workflow

`run_call` is asynchronous and can return before the run reaches a terminal
state. The returned `run_id` identifies the run for subsequent status checks.
A status such as `PREPARING` indicates progress; it is not a final result.

Use this completion workflow:

1. Store the exact `run_id` with the application record that requested the
   call.
2. Make the first `get_call_run` request after about 60 seconds. After that,
   follow `next_step` when present or poll every 5–10 seconds.
3. Treat every non-terminal status as progress, not as the final result.
4. If the client reaches its monitoring deadline, disconnects, or restarts,
   retain the `run_id` and resume `get_call_run`. Do not mark the call as
   failed or call `run_call` again.
5. When a terminal status is returned, persist the response and stop polling.

If you set `ttl_seconds` on `run_call`, choose a retention window long enough
for monitoring and recovery. Query availability is subject to that value and
any configured retention policy; a `run_id` is not queryable indefinitely.

Terminal statuses currently include `COMPLETED`, `FAILED`, `NO_ANSWER`,
`DECLINED`, `CANCELED`, `CANCELLED`, `VOICEMAIL`, `BUSY`, and `EXPIRED`. Treat
`NO ANSWER` as the same terminal outcome as `NO_ANSWER`. `COMPLETED` means the
run completed; it does not by itself confirm that the requested task
succeeded. Inspect the summary, details, and transcript, then apply your
application's success criteria. Other terminal statuses stop polling but
should not be treated as successful. For a status outside this documented
set, follow `next_step` rather than inferring terminality from elapsed time.

The suggested delay and polling cadence control query timing only. The MCP
contract does not specify a maximum completion time. Reaching a client-side
monitoring deadline or stopping the polling process does not fail or cancel
the phone call.

This workflow requires a `run_id`. If `run_call` has an uncertain outcome and
returns no `run_id`, direct MCP has no documented general lookup or recovery
operation. Do not create a new plan or retry automatically. Follow an explicit
server `next_step` if one is available; otherwise, escalate for operator
review. CALL-E CLI users should follow the returned `call recover` command in
the [CLI reference](../../packages/cli/docs/cli-reference.md#commands).

MCP `run_call` has no webhook or callback input. The `/calle/webhook` receiver
and `webhook_url` in the [Developer API flow](../../README.md#api) apply to
calls created through that API, not to MCP-started runs. Poll `get_call_run`
for MCP completion.

## Safety Contract

CALL-E can contact external people and businesses by phone. MCP clients must
keep the workflow plan-first and user-confirmed:

- Always call `plan_call` before `run_call`.
- Never call `run_call` for setup verification.
- Never auto-run `run_call`.
- Never guess call inputs or opaque identifiers.
- Never expose OAuth secrets.
- Treat `plan_id`, `confirm_token`, and `run_id` as opaque values.

## Minimal Manual MCP Config

Some MCP clients accept a JSON server definition similar to:

```json
{
  "mcpServers": {
    "call-e": {
      "url": "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth"
    }
  }
}
```

Exact config shape is client-specific. The invariant is the remote Streamable
HTTP URL:

```text
https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth
```
