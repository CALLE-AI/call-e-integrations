import { readJson, tokenCachePath, tokenIsUsable } from "./cache.js";
import {
  DEFAULT_MCP_CLIENT_NAME,
  DEFAULT_MCP_CLIENT_VERSION,
  DEFAULT_TIMEOUT_SECONDS,
  INTEGRATION_HEADER,
  MCP_PROTOCOL_VERSION,
} from "./constants.js";

// setTimeout collapses any delay above 2_147_483_647ms (~24.8 days) to 1ms, so a very
// large timeout fires the abort almost at once and cancels the request the caller meant
// to keep waiting on. Capping an oversized value at that ceiling instead would be worse:
// it turns a malformed or attacker-influenced timeout into a ~24.8-day one that holds the
// request, socket, AbortController and caller resources open rather than failing. The CLI
// validates --timeout-seconds against this ceiling (see packages/cli/lib/config.js), but
// the public callMcpTool timeoutSeconds override and a caller-built config.timeoutSeconds
// reach the timer arithmetic below without it, so validate the seconds here and fall back
// to a safe timeout rather than trusting or capping the value.
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_TIMER_SECONDS = Math.floor(MAX_TIMER_DELAY_MS / 1000);

function boundedTimeoutMs(seconds, fallbackMs) {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_TIMER_SECONDS) {
    return fallbackMs;
  }
  return Math.max(Math.ceil(parsed * 1000), MIN_TIMEOUT_MS);
}

export class AuthRequiredError extends Error {
  constructor(message = "A usable CALL-E auth token is required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class McpHttpError extends Error {
  constructor(message, { statusCode = null, responseText = "", payload = null, headers = {}, code = "http_error" } = {}) {
    super(message);
    this.name = "McpHttpError";
    this.statusCode = statusCode;
    this.responseText = responseText;
    this.payload = payload;
    this.headers = headers;
    this.code = code;
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

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try {
      body = parseResponseBody(text);
    } catch {
      body = null;
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

    if (body?.error) {
      const error = body.error;
      throw new McpHttpError(error.message || `Remote MCP error for ${payload.method}`, {
        payload: error,
        headers: responseHeaders,
        code: "mcp_error",
      });
    }

    return { body, headers: responseHeaders };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new McpHttpError(`MCP request timed out for ${payload.method}`, { code: "http_error" });
    }
    throw error;
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
  const timeoutMs = boundedTimeoutMs(config.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS * 1000);
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
    : boundedTimeoutMs(timeoutSeconds, timeoutMs);
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
