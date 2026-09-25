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

// Upper bounds for a single text/event-stream response. The stream is rejected
// with an mcp_protocol_error once either limit is exceeded.
const DEFAULT_MAX_SSE_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_SSE_EVENTS = 10_000;

function positiveLimit(value, fallback) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : fallback;
}

function sseLimits(config) {
  return {
    maxBytes: positiveLimit(config.maxSseResponseBytes, DEFAULT_MAX_SSE_RESPONSE_BYTES),
    maxEvents: positiveLimit(config.maxSseEvents, DEFAULT_MAX_SSE_EVENTS),
  };
}

function isEventStreamResponse(headers) {
  const contentType = String(headers["content-type"] || "");
  return contentType.split(";")[0].trim().toLowerCase() === "text/event-stream";
}

function createSseParser() {
  let buffer = "";
  let started = false;
  let eventType = "";
  let dataLines = [];

  function processLine(line) {
    if (line === "") {
      const event = dataLines.length > 0
        ? { event: eventType || "message", data: dataLines.join("\n") }
        : null;
      eventType = "";
      dataLines = [];
      return event;
    }
    if (line.startsWith(":")) {
      return null;
    }
    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "data") {
      dataLines.push(value);
    } else if (field === "event") {
      eventType = value;
    }
    return null;
  }

  function drain({ final }) {
    const events = [];
    const lineBreak = /\r\n|\r|\n/gu;
    let lineStart = 0;
    let match;
    while ((match = lineBreak.exec(buffer)) !== null) {
      if (!final && match[0] === "\r" && match.index === buffer.length - 1) {
        // A CR at the end of a chunk may be the first half of a CRLF.
        break;
      }
      const event = processLine(buffer.slice(lineStart, match.index));
      lineStart = match.index + match[0].length;
      if (event) {
        events.push(event);
      }
    }
    // Anything left is an unterminated line. At the end of the stream it is
    // dropped together with any event that was not closed by a blank line.
    buffer = final ? "" : buffer.slice(lineStart);
    return events;
  }

  return {
    push(chunk) {
      buffer += started ? chunk : chunk.replace(/^\uFEFF/u, "");
      started = started || buffer.length > 0;
      return drain({ final: false });
    },
    finish() {
      return drain({ final: true });
    },
  };
}

function sseProtocolError(message, { responseText, headers }) {
  return new McpHttpError(message, {
    responseText,
    headers,
    code: "mcp_protocol_error",
  });
}

async function* sseTextChunks(response, { maxBytes, onLimit }) {
  const reader = typeof response.body?.getReader === "function" ? response.body.getReader() : null;
  if (!reader) {
    // Some fetch implementations (and test doubles) only expose text().
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      onLimit(text);
    }
    yield text;
    return;
  }

  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let bytesRead = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        const tail = decoder.decode();
        if (tail) {
          yield tail;
        }
        return;
      }
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        onLimit(decoder.decode(value, { stream: true }));
      }
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    if (!finished) {
      // Stop the transfer when a limit is hit, an error is thrown, or the
      // matching response has already been found.
      reader.cancel().catch(() => {});
    }
  }
}

async function readJsonRpcEventStream(response, { payload, headers, limits }) {
  const expectsResponse = payload.id !== undefined;
  const parser = createSseParser();
  let responseText = "";
  let eventCount = 0;
  let orphanError = null;

  const protocolError = (message) => sseProtocolError(`${message} for ${payload.method}`, { responseText, headers });

  // Returns the matching JSON-RPC response, or null to keep reading.
  const handleEvents = (events) => {
    for (const event of events) {
      eventCount += 1;
      if (eventCount > limits.maxEvents) {
        throw protocolError(`MCP event stream exceeded ${limits.maxEvents} events`);
      }
      if (event.event !== "message") {
        continue;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        throw protocolError("MCP event stream contained malformed JSON");
      }
      for (const candidate of Array.isArray(message) ? message : [message]) {
        const record = objectRecord(candidate);
        if (!record || record.method !== undefined || !("result" in record || "error" in record)) {
          // Server-initiated requests and notifications can be interleaved before the response.
          continue;
        }
        if (expectsResponse && record.id === payload.id) {
          return record;
        }
        if (record.id === null && record.error && !orphanError) {
          orphanError = record;
        }
      }
    }
    return null;
  };

  const chunks = sseTextChunks(response, {
    maxBytes: limits.maxBytes,
    onLimit(chunk) {
      responseText += chunk;
      throw protocolError(`MCP event stream exceeded ${limits.maxBytes} bytes`);
    },
  });
  for await (const chunk of chunks) {
    responseText += chunk;
    const matched = handleEvents(parser.push(chunk));
    if (matched) {
      // Leaving the loop cancels the rest of the stream.
      return matched;
    }
  }
  const matched = handleEvents(parser.finish());
  if (matched) {
    return matched;
  }

  if (orphanError) {
    return orphanError;
  }
  if (!expectsResponse) {
    return null;
  }
  throw protocolError("MCP event stream ended without a JSON-RPC response");
}

async function requestJsonRpc(fetchImpl, url, { headers, payload, timeoutMs, limits }) {
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
    const responseHeaders = Object.fromEntries(response.headers.entries());
    let body = null;

    if (response.ok && isEventStreamResponse(responseHeaders)) {
      body = await readJsonRpcEventStream(response, { payload, headers: responseHeaders, limits });
    } else {
      const text = await response.text();
      try {
        body = parseResponseBody(text);
      } catch {
        body = null;
      }

      if (!response.ok) {
        throw new McpHttpError(`MCP HTTP ${response.status} for ${payload.method}`, {
          statusCode: response.status,
          responseText: text,
          payload: body,
          headers: responseHeaders,
        });
      }
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
  const timeoutMs = Math.max(Math.ceil(Number(config.timeoutSeconds || 15) * 1000), 1000);
  const limits = sseLimits(config);
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
    limits,
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
    limits,
  });

  return { rpcHeaders, timeoutMs, limits };
}

export async function listMcpTools({ config, fetchImpl = globalThis.fetch } = {}) {
  const { rpcHeaders, timeoutMs, limits } = await openMcpSession({ config, fetchImpl });
  const response = await requestJsonRpc(fetchImpl, config.serverUrl, {
    headers: rpcHeaders,
    payload: buildJsonRpcPayload({
      id: "calle-tools-list",
      method: "tools/list",
      params: {},
    }),
    timeoutMs,
    limits,
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
  const { rpcHeaders, timeoutMs, limits } = await openMcpSession({ config, fetchImpl });
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
    limits,
  });
  return normalizeMcpToolResult(response.body?.result);
}
