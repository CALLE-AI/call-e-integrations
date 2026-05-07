import {
  INTEGRATION_HEADER,
  MCP_PROTOCOL_VERSION,
} from "@call-e/core/constants";

type McpSession = {
  serverUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

export class McpHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null = null,
    public readonly code: string = "mcp_error"
  ) {
    super(message);
    this.name = "McpHttpError";
  }
}

function jsonRpcPayload(id: string | undefined, method: string, params?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
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

async function postJsonRpc(session: McpSession, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), session.timeoutMs);
  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  try {
    const response = await fetch(session.serverUrl, {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text.trim() ? JSON.parse(text) : {};

    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? "auth_required" : "mcp_http_error";
      throw new McpHttpError(`MCP HTTP ${response.status} for ${payload.method}`, response.status, code);
    }
    if (body?.error) {
      throw new McpHttpError(body.error.message || `MCP error for ${payload.method}`, null, "mcp_error");
    }
    return { body, headers: response.headers };
  } catch (error) {
    if (error instanceof McpHttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new McpHttpError(`MCP request timed out for ${payload.method}`, null, "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function openMcpSession({
  serverUrl,
  accessToken,
  timeoutSeconds,
  integrationHeader,
}: {
  serverUrl: string;
  accessToken: string;
  timeoutSeconds: number;
  integrationHeader: string;
}): Promise<McpSession> {
  const timeoutMs = Math.max(Math.ceil(timeoutSeconds * 1000), 1000);
  const commonHeaders: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    Authorization: `Bearer ${accessToken}`,
    [INTEGRATION_HEADER]: integrationHeader,
  };
  const initializeSession: McpSession = {
    serverUrl,
    headers: commonHeaders,
    timeoutMs,
  };
  const initialize = await postJsonRpc(
    initializeSession,
    jsonRpcPayload("broker-example-initialize", "initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "calle-broker-example",
        version: "0.0.0",
      },
    })
  );
  const sessionId = initialize.headers.get("mcp-session-id") || "";
  const session = {
    serverUrl,
    headers: sessionId ? { ...commonHeaders, "mcp-session-id": sessionId } : commonHeaders,
    timeoutMs,
  };
  await postJsonRpc(session, jsonRpcPayload(undefined, "notifications/initialized", {}));
  return session;
}

export async function listTools(session: McpSession) {
  const response = await postJsonRpc(session, jsonRpcPayload("broker-example-tools-list", "tools/list", {}));
  return response.body?.result || {};
}

export async function callTool(session: McpSession, name: string, toolArguments: Record<string, unknown>) {
  const response = await postJsonRpc(
    session,
    jsonRpcPayload("broker-example-tools-call", "tools/call", {
      name,
      arguments: toolArguments,
    })
  );
  return response.body?.result || {};
}

export async function listResources(session: McpSession) {
  const response = await postJsonRpc(session, jsonRpcPayload("broker-example-resources-list", "resources/list", {}));
  return response.body?.result || {};
}

export async function readResource(session: McpSession, uri: string) {
  const response = await postJsonRpc(
    session,
    jsonRpcPayload("broker-example-resources-read", "resources/read", {
      uri,
    })
  );
  return response.body?.result || {};
}
