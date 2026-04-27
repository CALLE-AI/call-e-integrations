import { readJson, tokenCachePath, tokenIsUsable } from "./cache.js";

const PROTOCOL_VERSION = "2025-11-25";

export class AuthRequiredError extends Error {
  constructor(message = "A usable Calle auth token is required.") {
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
    "mcp-protocol-version": PROTOCOL_VERSION,
    Authorization: `Bearer ${accessToken}`,
  };

  const initialize = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: commonHeaders,
    payload: buildJsonRpcPayload({
      id: "calle-initialize",
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "calle",
          version: "0.1.0",
        },
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

export async function callMcpTool({ config, toolName, toolArguments = {}, fetchImpl = globalThis.fetch } = {}) {
  const { rpcHeaders, timeoutMs } = await openMcpSession({ config, fetchImpl });
  const response = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      id: `calle-${toolName}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArguments,
      },
    }),
    timeoutMs,
  });
  return response.body?.result ?? {};
}
