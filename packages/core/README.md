# @call-e/core

`@call-e/core` contains shared CALL-E runtime helpers for brokered authentication, private local token cache files, JSON HTTP requests, and MCP streamable HTTP tool calls.

This package is used by CALL-E integrations such as `@call-e/cli`. It is not a standalone CLI, OAuth server, or MCP server.

## Modules

```js
import { tokenCachePath } from "@call-e/core/cache";
import { BrokerLoginError, createBrokerSession } from "@call-e/core/broker-client";
import { callMcpTool } from "@call-e/core/mcp-client";
```

Public subpaths:

- `@call-e/core/constants`
- `@call-e/core/config`
- `@call-e/core/cache`
- `@call-e/core/http`
- `@call-e/core/broker-client`
- `@call-e/core/mcp-client`
- `@call-e/core/sanitize`

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

## Per-Request Tool Timeout

`callMcpTool` accepts an optional `timeoutSeconds` override for the `tools/call`
request:

```js
await callMcpTool({
  config,
  toolName: "plan_call",
  toolArguments: { to_phones: ["+15551234567"], goal: "Confirm the appointment" },
  timeoutSeconds: 150,
});
```

The override applies only to the tool call. MCP session initialization keeps
using `config.timeoutSeconds`; when the override is omitted, the tool call uses
that configured timeout too.

## Tool Result Payloads

`callMcpTool` returns the MCP `CallToolResult` envelope and preserves its raw
`content`, `isError`, and metadata fields. When `structuredContent` is absent
but a text content block contains a JSON object, the client also exposes that
object as `structuredContent`. Non-JSON text, arrays, and scalar JSON remain
unchanged.

See the
[MCP tool result envelope](https://github.com/CALLE-AI/call-e-integrations/blob/main/docs/mcp/openagent-oauth.md#tool-result-envelope)
for the direct wire shape, compatibility fallback, and Python SDK field-name
differences.

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

## Errors and Remote Text

Every string that arrives from the network is untrusted. The library keeps it out of
`Error.message` and offers one sanitizer for displaying it.

```js
import { requestJson, HttpStatusError, TransportError, causeCodeOf } from "@call-e/core/http";
import { callMcpTool, McpHttpError } from "@call-e/core/mcp-client";
import { publicRemoteError, safeRemoteString } from "@call-e/core/sanitize";

try {
  await callMcpTool({ config, toolName: "plan_call" });
} catch (error) {
  if (error instanceof McpHttpError) {
    error.message;      // locally authored, safe to print: "Remote MCP error for tools/call"
    error.payload;      // raw server error, for programmatic use only
    error.remoteError;  // { code?, message? } sanitized, safe to display
    error.transport;    // true only when no usable response was received
    error.timedOut;     // true for the client-side timeout
    error.causeCode;    // "timeout", a Node.js system code such as "ENOTFOUND", or null
  }
}
```

| Type | Thrown by | Meaning |
| --- | --- | --- |
| `HttpStatusError` | `requestJson` | A non-success HTTP status. `statusCode`, `responseText`, `headers`, `url`. |
| `TransportError` | `requestJson` | No usable response: `fetch` rejected, the body could not be read, or the timeout fired. `url`, `method`, `timedOut`, `phase` (`connect` or `body`), `code` (`timeout`, or the system code such as `ECONNRESET` for a body-phase failure). |
| `InvalidResponseError` | `requestJson` | A 2xx whose body was not the expected JSON object. `responseText` holds the raw body; `message` never quotes it, because `JSON.parse` puts its input into its own message. |
| `McpHttpError` | MCP client | HTTP failure (`code: "http_error"`), JSON-RPC error (`"mcp_error"`), malformed or mismatched successful response (`"invalid_response"`), or transport failure (`"transport_error"`). |
| `BrokerLoginError` | `loginWithBroker` | A terminal broker outcome (`code: "broker_login_failed"`) or overall authorization wait timeout (`"broker_login_timeout"`). `message` is locally authored; sanitized service detail is in `remoteError`. |

`@call-e/core/sanitize`:

| Function | Purpose |
| --- | --- |
| `stripTerminalControls(value)` | Remove ANSI CSI/OSC/ESC sequences and C0/C1 control characters. |
| `redactSecrets(value)` | Replace credential-shaped substrings (bearer tokens, `token=`-style pairs, known prefixes, long opaque runs) with `[redacted]`. |
| `safeRemoteString(value, maxLength = 500)` | Controls removed first, then secrets redacted, then bounded. `undefined` for non-strings and empty results. |
| `safeRemoteCode(value)` | A machine code matching `-?[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}`; numbers only as safe integers; otherwise `undefined`. |
| `publicRemoteError(value)` | The only shape remote detail should take in a public payload: `{ code?, message? }` or `null`. |
| `sanitizeRemoteError(body)` | Reduce a JSON-RPC error, HTTP body, or tool result to `publicRemoteError` shape, reading only `code` / `message`. |

Controls are removed rather than replaced before secret detection, so
`access_token=abcd<ESC>[31m1234` is redacted as one credential instead of surviving as two
halves. Removal is by *sequence*, covering both the 7-bit `ESC [` / `ESC ]` forms and the
8-bit `U+009B` / `U+009D` introducers, plus invisible format characters such as zero-width
spaces and bidi controls and Unicode line/paragraph separators.

Removal covers every terminal string control — OSC, DCS, SOS, PM and APC, in their 7-bit
(`ESC ]`, `ESC P`, `ESC X`, `ESC ^`, `ESC _`) and 8-bit forms — through its terminator, and
through end of input when a sequence is left unterminated. Stripping only the introducer would
leave the payload behind as ordinary text, which is what splits a key name apart. An embedded
ESC sequence is consumed as payload unless it is the string terminator; it cannot make the
outer sequence fall back to character-at-a-time stripping. Other ECMA-35 escape functions,
including private, standardized, and intermediate-byte forms, are removed as complete
sequences; embedded C0/C1 controls do not make CSI parameter text survive. BEL is accepted as
a legacy OSC terminator only; inside DCS, SOS, PM, and APC it remains payload until ST.

Safety is checked over two canonicalizations, because they disagree and both matter. Consuming
a whole sequence is what a terminal does, but a sequence swallows its final byte, and that
byte can be chosen from the word being searched for: `Bea<U+009B>rer secret` is a valid CSI
sequence ending in `r`, so correct stripping yields `Beaer` and the credential stops looking
like one. Whenever the two readings differ at all, the whole string is replaced with
`[redacted]`. Requiring a recognised credential in either reading is not sufficient: mixed
sequences can require a different interpretation per sequence, so neither global reading
reconstructs the sensitive key even though the displayed value still contains its credential.

## Development

```bash
pnpm --filter @call-e/core test
pnpm --filter @call-e/core check
pnpm --filter @call-e/core pack:dry-run
```
