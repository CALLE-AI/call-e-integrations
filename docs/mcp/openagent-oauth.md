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
`next_step` guidance. After a new call starts, wait about 60 seconds before the
first status query, then poll every 5-10 seconds until the run reaches a
terminal state or `next_step` says otherwise.

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
