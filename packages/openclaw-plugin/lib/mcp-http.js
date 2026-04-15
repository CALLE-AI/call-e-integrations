export class McpHttpError extends Error {
  constructor(message, { statusCode = null, responseText = "", payload = null, headers = {} } = {}) {
    super(message);
    this.name = "McpHttpError";
    this.statusCode = statusCode;
    this.responseText = responseText;
    this.payload = payload;
    this.headers = headers;
  }
}

function normalizeToolResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  const normalized = { ...result };
  if ("structured_content" in normalized && !("structuredContent" in normalized)) {
    normalized.structuredContent = normalized.structured_content;
    delete normalized.structured_content;
  }
  if ("is_error" in normalized && !("isError" in normalized)) {
    normalized.isError = normalized.is_error;
    delete normalized.is_error;
  }
  return normalized;
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
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!response.ok) {
      throw new McpHttpError(`MCP HTTP ${response.status} for ${payload.method}`, {
        statusCode: response.status,
        responseText: text,
        payload: body,
        headers: Object.fromEntries(response.headers.entries()),
      });
    }
    return {
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new McpHttpError(`MCP request timed out for ${payload.method}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function isUnauthorizedMcpError(error) {
  if (!(error instanceof McpHttpError)) {
    return false;
  }
  return error.statusCode === 401 || error.statusCode === 403;
}

export async function callRemoteTool({
  fetchImpl = globalThis.fetch,
  serverUrl,
  accessToken,
  toolName,
  arguments: toolArguments = {},
  timeoutSeconds = 15,
  pluginName = "calle",
  pluginVersion = "0.1.0",
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is not available in this OpenClaw runtime");
  }
  const timeoutMs = Math.max(Math.ceil(timeoutSeconds * 1000), 1000);
  const protocolVersion = "2025-11-25";
  const commonHeaders = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "mcp-protocol-version": protocolVersion,
    Authorization: `Bearer ${accessToken}`,
  };

  const initialize = await requestJsonRpc(fetchImpl, serverUrl, {
    headers: commonHeaders,
    payload: buildJsonRpcPayload({
      id: `${pluginName}-initialize`,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: pluginName,
          version: pluginVersion,
        },
      },
    }),
    timeoutMs,
  });
  const sessionId = initialize.headers["mcp-session-id"] || initialize.headers["Mcp-Session-Id"] || "";
  const rpcHeaders = sessionId
    ? {
        ...commonHeaders,
        "mcp-session-id": sessionId,
      }
    : commonHeaders;

  await requestJsonRpc(fetchImpl, serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      method: "notifications/initialized",
      params: {},
    }),
    timeoutMs,
  });

  const toolResponse = await requestJsonRpc(fetchImpl, serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      id: `${pluginName}-${toolName}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArguments,
      },
    }),
    timeoutMs,
  });

  if (toolResponse.body?.error) {
    const error = toolResponse.body.error;
    throw new McpHttpError(error.message || `Remote MCP error for ${toolName}`, {
      payload: error,
      headers: toolResponse.headers,
    });
  }

  const result = normalizeToolResult(toolResponse.body?.result);
  if (!result) {
    throw new McpHttpError(`Remote MCP returned an unexpected payload for ${toolName}`, {
      payload: toolResponse.body,
      headers: toolResponse.headers,
    });
  }
  return result;
}
