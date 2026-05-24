import { readJson, tokenCachePath, tokenIsUsable } from "./cache.js";
import {
  DEFAULT_MCP_CLIENT_NAME,
  DEFAULT_MCP_CLIENT_VERSION,
  INTEGRATION_HEADER,
  MCP_PROTOCOL_VERSION,
} from "./constants.js";

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

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function retryDelayMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader && !Number.isNaN(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 30000);
  }
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), 10000);
}

async function requestJsonRpc(fetchImpl, url, { headers, payload, timeoutMs, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
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
        const err = new McpHttpError(`MCP HTTP ${response.status} for ${payload.method}`, {
          statusCode: response.status,
          responseText: text,
          payload: body,
          headers: responseHeaders,
        });
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRY_ATTEMPTS) {
          lastError = err;
          await sleepImpl(retryDelayMs(attempt, responseHeaders["retry-after"]));
          continue;
        }
        throw err;
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
      if (error instanceof McpHttpError) {
        throw error;
      }
      lastError = error;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleepImpl(retryDelayMs(attempt, null));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
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
  const timeoutMs = Math.max(Math.ceil(config.timeoutSeconds * 1000), 1000);
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

  const serverProtocolVersion = initialize.body?.result?.protocolVersion;
  if (serverProtocolVersion && serverProtocolVersion !== MCP_PROTOCOL_VERSION) {
    config._onProtocolVersionMismatch?.(serverProtocolVersion, MCP_PROTOCOL_VERSION);
  }

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
  const response = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      id: `calle-${toolName}`,
      method: "tools/call",
      params: toolCallParams,
    }),
    timeoutMs,
  });
  return response.body?.result ?? {};
}
