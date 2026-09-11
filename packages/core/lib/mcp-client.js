import { readJson, tokenCachePath, tokenIsUsable } from "./cache.js";
import {
  DEFAULT_MCP_CLIENT_NAME,
  DEFAULT_MCP_CLIENT_VERSION,
  INTEGRATION_HEADER,
  MCP_PROTOCOL_VERSION,
} from "./constants.js";
import { causeCodeOf } from "./http.js";
import { sanitizeRemoteError } from "./sanitize.js";

export class AuthRequiredError extends Error {
  constructor(message = "A usable CALL-E auth token is required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/**
 * `message` is always authored locally and safe to print. Whatever the server said is kept
 * raw in `payload` / `responseText` for programmatic use, and in sanitized, bounded form in
 * `remoteError` for display. Nothing remote reaches `message`.
 */
export class McpHttpError extends Error {
  constructor(message, {
    statusCode = null,
    responseText = "",
    payload = null,
    headers = {},
    code = "http_error",
    transport = false,
    timedOut = false,
    phase = null,
    cause,
  } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "McpHttpError";
    this.statusCode = statusCode;
    this.responseText = responseText;
    this.payload = payload;
    this.headers = headers;
    this.code = code;
    this.transport = Boolean(transport);
    this.timedOut = Boolean(timedOut);
    /** "connect" or "body" on a transport failure; null otherwise. */
    this.phase = transport ? (phase ?? "connect") : null;
    /** "timeout", the system error code behind a rejected fetch, or null. */
    this.causeCode = timedOut ? "timeout" : causeCodeOf(cause);
    this.remoteError = sanitizeRemoteError(payload ?? responseText);
  }
}

export function isUnauthorizedMcpError(error) {
  return error instanceof McpHttpError && (error.statusCode === 401 || error.statusCode === 403);
}

function buildJsonRpcPayload({ id, method, params }) {
  const payload = {
    jsonrpc: "2.0",
    method,
  };
  if (id !== undefined) {
    payload.id = id;
  }
  if (params !== undefined) {
    payload.params = params;
  }
  return payload;
}

function parseResponseBody(text) {
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text);
}

async function requestJsonRpc(fetchImpl, url, { headers, payload, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      throw new McpHttpError(`MCP request timed out for ${payload.method}`, {
        code: "transport_error",
        transport: true,
        timedOut: true,
        phase: "connect",
      });
    }
    // fetch rejected before any response: DNS, connection, TLS. Only this path is transport.
    throw new McpHttpError(`MCP request failed before a response was received for ${payload.method}`, {
      code: "transport_error",
      transport: true,
      phase: "connect",
      cause: error,
    });
  }

  // Headers arrived; the body can still fail (timeout mid-stream, socket reset). Map that to
  // the same typed transport error as a rejected fetch.
  let text;
  try {
    text = await response.text();
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      throw new McpHttpError(`MCP request timed out for ${payload.method}`, {
        code: "transport_error",
        transport: true,
        timedOut: true,
        phase: "body",
      });
    }
    throw new McpHttpError(`MCP response body could not be read for ${payload.method}`, {
      code: "transport_error",
      transport: true,
      phase: "body",
      cause: error,
    });
  }

  try {
    let body = null;
    let parseFailed = false;
    try {
      body = parseResponseBody(text);
    } catch {
      parseFailed = true;
    }
    const responseHeaders = Object.fromEntries(response.headers.entries());

    if (!response.ok) {
      throw new McpHttpError(`MCP HTTP ${response.status} for ${payload.method}`, {
        statusCode: response.status,
        responseText: text,
        payload: body,
        headers: responseHeaders,
      });
    }

    // A successful status is not a successful RPC when the response cannot be interpreted.
    // Keep the raw body available for the shared sanitizer, but never let JSON.parse's
    // remote-quoting SyntaxError escape or silently turn malformed input into an empty result.
    const expectsResponse = payload.id !== undefined;
    const bodyIsObject = Boolean(body && typeof body === "object" && !Array.isArray(body));
    const hasRpcResult = bodyIsObject && Object.hasOwn(body, "result");
    const hasRpcErrorField = bodyIsObject && Object.hasOwn(body, "error");
    const hasRpcError = hasRpcErrorField && Boolean(
      body.error
      && typeof body.error === "object"
      && !Array.isArray(body.error)
      && Number.isInteger(body.error.code)
      && typeof body.error.message === "string",
    );
    const bodyIsEmptyObject = bodyIsObject && Object.keys(body).length === 0;

    // HTTP acknowledgements for notifications have no JSON-RPC response to correlate. Keep
    // accepting an empty body (and the existing empty-object acknowledgement), while still
    // rejecting malformed non-empty JSON.
    const validNotificationAck = !expectsResponse
      && !parseFailed
      && (!text.trim() || bodyIsEmptyObject);

    // A request response is valid only when it belongs to this exact request and carries one
    // outcome. Checking merely for `result` let stale/wrong-version responses and envelopes
    // containing both `result` and `error` pass as successes.
    const validRpcResponse = expectsResponse
      && !parseFailed
      && bodyIsObject
      && body.jsonrpc === "2.0"
      && Object.hasOwn(body, "id")
      && body.id === payload.id
      && hasRpcResult !== hasRpcErrorField
      && (hasRpcResult || hasRpcError);

    if (!validNotificationAck && !validRpcResponse) {
      throw new McpHttpError(`MCP response was invalid for ${payload.method}`, {
        statusCode: response.status,
        responseText: text,
        payload: bodyIsObject ? body : null,
        headers: responseHeaders,
        code: "invalid_response",
      });
    }

    if (hasRpcError) {
      // The server's message is untrusted: it is kept in `payload` and, sanitized, in
      // `remoteError`. The Error message itself stays locally authored.
      throw new McpHttpError(`Remote MCP error for ${payload.method}`, {
        payload: body.error,
        headers: responseHeaders,
        code: "mcp_error",
      });
    }

    return { body, headers: responseHeaders };
  } finally {
    clearTimeout(timeout);
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is not available in this Node.js runtime");
  }
}

function mcpClientInfo(config) {
  return {
    name: config.mcpClientName || DEFAULT_MCP_CLIENT_NAME,
    version: config.mcpClientVersion || config.cliVersion || DEFAULT_MCP_CLIENT_VERSION,
  };
}

function nonEmptyMetaObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return Object.keys(value).length > 0 ? value : null;
}

function objectRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function jsonObjectFromTextContent(content) {
  if (!Array.isArray(content)) {
    return null;
  }

  for (const item of content) {
    if (item?.type !== "text" || typeof item.text !== "string" || !item.text.trim()) {
      continue;
    }
    try {
      const parsed = objectRecord(JSON.parse(item.text));
      if (parsed) {
        return parsed;
      }
    } catch {
      // Text content is not required to contain JSON.
    }
  }

  return null;
}

function normalizeMcpToolResult(result) {
  const envelope = objectRecord(result);
  if (!envelope) {
    return {};
  }

  if (objectRecord(envelope.structuredContent)) {
    return envelope;
  }

  const structuredContent = objectRecord(envelope.structured_content)
    || jsonObjectFromTextContent(envelope.content);
  if (!structuredContent) {
    return envelope;
  }

  return {
    ...envelope,
    structuredContent,
  };
}

export function currentTokenDocument(config) {
  const cacheDocument = readJson(tokenCachePath(config.cacheRoot, config.serverUrl));
  if (!tokenIsUsable(cacheDocument, config.minTtlSeconds)) {
    return null;
  }
  return cacheDocument;
}

function accessTokenFromCache(config) {
  const tokenDocument = currentTokenDocument(config);
  const accessToken = tokenDocument?.token?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new AuthRequiredError();
  }
  return accessToken;
}

async function openMcpSession({ config, fetchImpl }) {
  requireFetch(fetchImpl);
  const accessToken = accessTokenFromCache(config);
  const timeoutMs = Math.max(Math.ceil(Number(config.timeoutSeconds || 15) * 1000), 1000);
  const commonHeaders = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    Authorization: `Bearer ${accessToken}`,
    ...(config.integrationHeader ? { [INTEGRATION_HEADER]: config.integrationHeader } : {}),
  };

  const initialize = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: commonHeaders,
    payload: buildJsonRpcPayload({
      id: "calle-initialize",
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: mcpClientInfo(config),
      },
    }),
    timeoutMs,
  });

  const sessionId = initialize.headers["mcp-session-id"] || initialize.headers["Mcp-Session-Id"] || "";
  const rpcHeaders = sessionId ? { ...commonHeaders, "mcp-session-id": sessionId } : commonHeaders;

  await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      method: "notifications/initialized",
      params: {},
    }),
    timeoutMs,
  });

  return { rpcHeaders, timeoutMs };
}

export async function listMcpTools({ config, fetchImpl = globalThis.fetch } = {}) {
  const { rpcHeaders, timeoutMs } = await openMcpSession({ config, fetchImpl });
  const response = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      id: "calle-tools-list",
      method: "tools/list",
      params: {},
    }),
    timeoutMs,
  });
  return response.body?.result ?? {};
}

export async function callMcpTool({
  config,
  toolName,
  toolArguments = {},
  requestMeta = null,
  timeoutSeconds = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { rpcHeaders, timeoutMs } = await openMcpSession({ config, fetchImpl });
  const toolCallParams = {
    name: toolName,
    arguments: toolArguments,
  };
  const normalizedRequestMeta = nonEmptyMetaObject(requestMeta);
  if (normalizedRequestMeta) {
    toolCallParams._meta = normalizedRequestMeta;
  }
  const toolCallTimeoutMs = timeoutSeconds === null
    ? timeoutMs
    : Math.max(Math.ceil(Number(timeoutSeconds) * 1000), 1000);
  const response = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      id: `calle-${toolName}`,
      method: "tools/call",
      params: toolCallParams,
    }),
    timeoutMs: toolCallTimeoutMs,
  });
  return normalizeMcpToolResult(response.body?.result);
}
