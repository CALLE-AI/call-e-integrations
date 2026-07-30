# @call-e/core

`@call-e/core` contains shared CALL-E runtime helpers for brokered authentication, private local token cache files, JSON HTTP requests, and MCP streamable HTTP tool calls.

This package is used by CALL-E integrations such as `@call-e/cli`. It is not a standalone CLI, OAuth server, or MCP server.

## Modules

```js
import { tokenCachePath } from "@call-e/core/cache";
import { createBrokerSession } from "@call-e/core/broker-client";
import { callMcpTool } from "@call-e/core/mcp-client";
```

Public subpaths:

- `@call-e/core/constants`
- `@call-e/core/config`
- `@call-e/core/cache`
- `@call-e/core/http`
- `@call-e/core/broker-client`
- `@call-e/core/mcp-client`

TypeScript declarations are included for the root export and every public
subpath.

## Authentication Preflight

Check the cached token before starting an MCP request when the integration
needs to return its own typed authentication state:

```js
import { currentTokenDocument } from "@call-e/core/mcp-client";

if (!currentTokenDocument(config)) {
  return { ok: false, code: "not_authenticated" };
}
```

`currentTokenDocument` applies the configured minimum token TTL and returns
`null` when the cache is missing, malformed, or too close to expiry.
`tokenIsUsable` is also available from `@call-e/core` and
`@call-e/core/cache` for callers that already hold a token document.

## Broker Login Lifetime

Broker session timing is server-directed:

- Treat the returned `expires_at` as authoritative. Do not assume a fixed
  session lifetime.
- `loginWithBroker` follows `poll_after_ms`, clamped to 500-10,000 ms.
- `pollTimeoutSeconds` limits how long the client waits; it does not extend the
  login link lifetime. The fallback is 300 seconds.

Operator-facing integrations can use `ensurePendingLogin` when they need to
show the login URL and its remaining lifetime without blocking on the full
login flow.

## Outbound Call Contract

CALL-E's outbound tools follow this order:

```text
plan_call -> run_call -> get_call_run
```

`plan_call` prepares a call without placing it. Only call `run_call` after the
plan reports `ready_to_run=true`, using the exact `plan_id` and
`confirm_token` returned by that plan. `get_call_run` reads progress and
results using the `run_id` returned by `run_call`.

`run_call` can place a real outbound phone call. Keep it behind explicit user
approval and never use it as a connectivity test or auto-run tool.

See the
[OpenAgent OAuth MCP guide](https://github.com/CALLE-AI/call-e-integrations/blob/main/docs/mcp/openagent-oauth.md#tool-flow)
for the tool inputs, result handoffs, polling guidance, and complete safety
contract. At runtime, `listMcpTools` remains authoritative for the server's
current MCP schemas.

## Development

```bash
pnpm --filter @call-e/core test
pnpm --filter @call-e/core check
pnpm --filter @call-e/core pack:dry-run
```
