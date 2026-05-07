import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com";
const DEFAULT_CHANNEL = "openagent_oauth";
const DEFAULT_SCOPE = "openid email profile";
const DEFAULT_CLIENT_NAME = "calle Login";
const DEFAULT_TIMEOUT_SECONDS = 15;
const DEFAULT_MIN_TTL_SECONDS = 300;
const MCP_PROTOCOL_VERSION = "2025-11-25";
const INTEGRATION_HEADER = "X-Call-E-Integration";
const SESSION_SECRET_HEADER = "X-OpenAgent-Session-Secret";

type Config = {
  baseUrl: string;
  serverUrl: string;
  brokerBaseUrl: string;
  authBaseUrl: string;
  channel: string;
  scope: string;
  clientName: string;
  cacheRoot: string;
  timeoutSeconds: number;
  minTtlSeconds: number;
  pollTimeoutSeconds: number;
  integrationHeader: string;
  toolName: string | null;
  toolArgs: Record<string, unknown>;
};

type PendingLogin = {
  session_id: string;
  session_secret: string;
  login_url: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  error_message: string | null;
  poll_after_ms: number | null;
};

type McpSession = {
  serverUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

class McpHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null = null,
    public readonly code = "mcp_error"
  ) {
    super(message);
    this.name = "McpHttpError";
  }
}

function emit(event: string, payload: Record<string, unknown> = {}) {
  const line = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });
  console.log(line);
  writeLogLine(line);
}

function emitError(payload: Record<string, unknown>) {
  const line = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });
  console.error(line);
  writeLogLine(line);
}

function writeLogLine(line: string) {
  const logFile = process.env.MCP_LOG_FILE;
  if (!logFile) {
    return;
  }
  fs.mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 });
  fs.appendFileSync(logFile, `${line}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(logFile, 0o600);
  } catch {
    // Best effort only.
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/u, "");
}

function expandHome(value: string) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function resolveServerUrl({ serverUrl, baseUrl, channel }: { serverUrl?: string; baseUrl: string; channel: string }) {
  if (serverUrl) {
    return serverUrl;
  }
  const resolvedChannel = channel.trim().toLowerCase() || DEFAULT_CHANNEL;
  return `${normalizeBaseUrl(baseUrl)}/mcp/${resolvedChannel}`;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, got: ${value}`);
  }
  return parsed;
}

function parseJsonObject(value: string | undefined, label: string) {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function readConfig(env = process.env): Config {
  const baseUrl = env.MCP_BASE_URL || DEFAULT_BASE_URL;
  const channel = env.MCP_CHANNEL || DEFAULT_CHANNEL;
  const serverUrl = resolveServerUrl({ serverUrl: env.MCP_SERVER_URL, baseUrl, channel });
  return {
    baseUrl,
    serverUrl,
    brokerBaseUrl: normalizeBaseUrl(env.MCP_BROKER_BASE_URL || baseUrl),
    authBaseUrl: normalizeBaseUrl(env.MCP_AUTH_BASE_URL || baseUrl),
    channel,
    scope: env.MCP_SCOPE || DEFAULT_SCOPE,
    clientName: env.MCP_CLIENT_NAME || DEFAULT_CLIENT_NAME,
    cacheRoot: expandHome(env.MCP_CACHE_ROOT || path.join(os.homedir(), ".calle-mcp", "examples", "broker-standalone")),
    timeoutSeconds: parsePositiveNumber(env.MCP_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS),
    minTtlSeconds: parsePositiveNumber(env.MCP_MIN_TTL_SECONDS, DEFAULT_MIN_TTL_SECONDS),
    pollTimeoutSeconds: parsePositiveNumber(env.MCP_POLL_TIMEOUT_SECONDS, 300),
    integrationHeader: env.CALLE_EXAMPLE_INTEGRATION || "examples/mcp-broker-client-ts-standalone/0.0.0",
    toolName: env.MCP_TOOL_NAME || null,
    toolArgs: parseJsonObject(env.MCP_TOOL_ARGS_JSON, "MCP_TOOL_ARGS_JSON"),
  };
}

function serverHash(serverUrl: string) {
  return crypto.createHash("md5").update(serverUrl, "utf8").digest("hex");
}

function tokenCachePath(config: Config) {
  return path.join(config.cacheRoot, serverHash(config.serverUrl), "token.json");
}

function pendingCachePath(config: Config) {
  return path.join(config.cacheRoot, serverHash(config.serverUrl), "pending_login.json");
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePrivateJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort only.
  }
}

function removeFile(filePath: string) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Ignore cleanup failures.
  }
}

function parseIsoDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tokenIsUsable(document: Record<string, unknown> | null, minTtlSeconds: number) {
  if (!document) {
    return false;
  }
  const token = document.token;
  if (!token || typeof token !== "object" || typeof (token as Record<string, unknown>).access_token !== "string") {
    return false;
  }
  const expiresAt = parseIsoDate(document.expires_at);
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() - Date.now() > minTtlSeconds * 1000;
}

function normalizePendingLogin(value: Record<string, unknown> | null): PendingLogin | null {
  if (!value) {
    return null;
  }
  for (const field of ["session_id", "session_secret", "login_url", "status", "created_at"]) {
    if (typeof value[field] !== "string" || !value[field]) {
      return null;
    }
  }
  return {
    session_id: String(value.session_id),
    session_secret: String(value.session_secret),
    login_url: String(value.login_url),
    status: String(value.status).toUpperCase(),
    created_at: String(value.created_at),
    expires_at: typeof value.expires_at === "string" ? value.expires_at : null,
    error_message: typeof value.error_message === "string" ? value.error_message : null,
    poll_after_ms: Number(value.poll_after_ms || 0) || null,
  };
}

function pendingIsExpired(pending: PendingLogin | null) {
  const expiresAt = parseIsoDate(pending?.expires_at);
  return Boolean(expiresAt && Date.now() >= expiresAt.getTime());
}

async function requestJson(method: string, url: string, { headers = {}, json }: { headers?: Record<string, string>; json?: unknown } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await response.text();
  const body = text.trim() ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${method} ${url}`);
  }
  return body as Record<string, unknown>;
}

async function createBrokerSession(config: Config): Promise<PendingLogin> {
  const payload = await requestJson("POST", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions`, {
    headers: { [INTEGRATION_HEADER]: config.integrationHeader },
    json: {
      server_url: config.serverUrl,
      auth_base_url: config.authBaseUrl,
      channel: config.channel,
      scope: config.scope,
      client_name: config.clientName,
    },
  });
  return {
    session_id: String(payload.session_id),
    session_secret: String(payload.session_secret),
    login_url: String(payload.login_url),
    status: String(payload.status || "PENDING").toUpperCase(),
    created_at: new Date().toISOString(),
    expires_at: typeof payload.expires_at === "string" ? payload.expires_at : null,
    error_message: null,
    poll_after_ms: Number(payload.poll_after_ms || 0) || null,
  };
}

async function getBrokerStatus(config: Config, pending: PendingLogin) {
  return requestJson("GET", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions/${pending.session_id}`, {
    headers: {
      [SESSION_SECRET_HEADER]: pending.session_secret,
      [INTEGRATION_HEADER]: config.integrationHeader,
    },
  });
}

async function exchangeBrokerSession(config: Config, pending: PendingLogin) {
  return requestJson("POST", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions/${pending.session_id}/exchange`, {
    headers: {
      [SESSION_SECRET_HEADER]: pending.session_secret,
      [INTEGRATION_HEADER]: config.integrationHeader,
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBrokerToken(config: Config): Promise<Record<string, unknown>> {
  const cachePath = tokenCachePath(config);
  const pendingPath = pendingCachePath(config);
  const cached = readJson(cachePath);
  if (tokenIsUsable(cached, config.minTtlSeconds)) {
    emit("auth_status", { status: "cached", server_url: config.serverUrl, expires_at: cached?.expires_at || null });
    return cached as Record<string, unknown>;
  }
  if (cached) {
    emit("auth_status", { status: "expired", server_url: config.serverUrl, expires_at: cached.expires_at || null });
  }

  let pending = normalizePendingLogin(readJson(pendingPath));
  if (!pending || pendingIsExpired(pending)) {
    if (pending) {
      removeFile(pendingPath);
    }
    pending = await createBrokerSession(config);
    writePrivateJson(pendingPath, pending);
    emit("auth_status", {
      status: "login_required",
      pending_status: pending.status,
      login_url: pending.login_url,
      pending_created: true,
    });
  } else {
    emit("auth_status", {
      status: "pending",
      pending_status: pending.status,
      login_url: pending.login_url,
    });
  }

  const deadline = Date.now() + config.pollTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const statusPayload = await getBrokerStatus(config, pending);
    pending = {
      ...pending,
      status: String(statusPayload.status || pending.status || "PENDING").toUpperCase(),
      expires_at: typeof statusPayload.expires_at === "string" ? statusPayload.expires_at : pending.expires_at,
      error_message: typeof statusPayload.error_message === "string" ? statusPayload.error_message : null,
      poll_after_ms: Number(statusPayload.poll_after_ms || 0) || pending.poll_after_ms || null,
    };
    writePrivateJson(pendingPath, pending);
    emit("auth_poll", { pending_status: pending.status });

    if (pending.status === "AUTHORIZED") {
      const exchanged = await exchangeBrokerSession(config, pending);
      writePrivateJson(cachePath, exchanged);
      removeFile(pendingPath);
      emit("auth_status", {
        status: "logged_in",
        server_url: config.serverUrl,
        expires_at: exchanged.expires_at || null,
      });
      return exchanged;
    }
    if (["FAILED", "EXPIRED", "EXCHANGED"].includes(pending.status)) {
      removeFile(pendingPath);
      throw new Error(`Brokered login failed: ${pending.error_message || pending.status}`);
    }

    await sleep(Math.max(1, Math.min(Number(pending.poll_after_ms || 1000), 10000)));
  }

  throw new Error("Timed out waiting for brokered login authorization.");
}

function accessTokenFromDocument(document: Record<string, unknown>) {
  const token = document.token;
  if (!token || typeof token !== "object" || typeof (token as Record<string, unknown>).access_token !== "string") {
    throw new Error("Token cache does not contain an access token.");
  }
  return String((token as Record<string, unknown>).access_token);
}

function summarizeResourceResult(result: Record<string, unknown>) {
  const contents = Array.isArray(result.contents) ? result.contents : [];
  return {
    content_count: contents.length,
    contents: contents.map((content) => {
      if (!content || typeof content !== "object") {
        return { type: typeof content };
      }
      const item = content as Record<string, unknown>;
      const text = typeof item.text === "string" ? item.text : "";
      return {
        uri: typeof item.uri === "string" ? item.uri : undefined,
        mime_type: typeof item.mimeType === "string" ? item.mimeType : undefined,
        text_bytes: Buffer.byteLength(text, "utf8"),
      };
    }),
  };
}

function clearBrokerState(config: Config) {
  removeFile(tokenCachePath(config));
  removeFile(pendingCachePath(config));
}

function jsonRpcPayload(id: string | undefined, method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    ...(id !== undefined ? { id } : {}),
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

async function postJsonRpc(session: McpSession, payload: Record<string, unknown>) {
  const response = await fetch(session.serverUrl, {
    method: "POST",
    headers: session.headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = text.trim() ? JSON.parse(text) : {};
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "auth_required" : "mcp_http_error";
    throw new McpHttpError(`MCP HTTP ${response.status} for ${payload.method}`, response.status, code);
  }
  if (body?.error) {
    throw new McpHttpError(body.error.message || `MCP error for ${payload.method}`);
  }
  return { body, headers: response.headers };
}

async function openMcpSession(config: Config, accessToken: string): Promise<McpSession> {
  const commonHeaders = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    Authorization: `Bearer ${accessToken}`,
    [INTEGRATION_HEADER]: config.integrationHeader,
  };
  const initializeSession = {
    serverUrl: config.serverUrl,
    headers: commonHeaders,
    timeoutMs: Math.max(Math.ceil(config.timeoutSeconds * 1000), 1000),
  };
  const initialize = await postJsonRpc(
    initializeSession,
    jsonRpcPayload("standalone-broker-initialize", "initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "calle-broker-standalone-example",
        version: "0.0.0",
      },
    })
  );
  const sessionId = initialize.headers.get("mcp-session-id") || "";
  const session = {
    ...initializeSession,
    headers: sessionId ? { ...commonHeaders, "mcp-session-id": sessionId } : commonHeaders,
  };
  await postJsonRpc(session, jsonRpcPayload(undefined, "notifications/initialized", {}));
  return session;
}

async function mcpRequest(session: McpSession, method: string, params: Record<string, unknown> = {}) {
  const response = await postJsonRpc(session, jsonRpcPayload(`standalone-broker-${method}`, method, params));
  return response.body?.result || {};
}

async function runMcpFlow(config: Config, tokenDocument: Record<string, unknown>) {
  const session = await openMcpSession(config, accessTokenFromDocument(tokenDocument));
  emit("connected", { server_url: config.serverUrl });

  const tools = await mcpRequest(session, "tools/list");
  const toolList = Array.isArray(tools.tools) ? tools.tools : [];
  emit("tools/list", { count: toolList.length, tools: toolList.map((tool: { name?: string }) => tool.name).filter(Boolean) });

  if (config.toolName) {
    const result = await mcpRequest(session, "tools/call", {
      name: config.toolName,
      arguments: config.toolArgs,
    });
    emit("tools/call", { tool_name: config.toolName, result });
  }

  const resources = await mcpRequest(session, "resources/list").catch((error) => {
    emit("resources/list", { skipped: true, message: error?.message || String(error) });
    return { resources: [] };
  });
  const resourceList = Array.isArray(resources.resources) ? resources.resources : [];
  emit("resources/list", { count: resourceList.length });

  if (resourceList[0]?.uri) {
    const result = await mcpRequest(session, "resources/read", { uri: String(resourceList[0].uri) });
    emit("resources/read", { uri: resourceList[0].uri, result: summarizeResourceResult(result) });
  } else {
    emit("resources/read", { skipped: true, message: "no resources available" });
  }
}

async function runClient(config: Config) {
  let tokenDocument = await ensureBrokerToken(config);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await runMcpFlow(config, tokenDocument);
      return;
    } catch (error) {
      if (attempt === 0 && error instanceof McpHttpError && error.code === "auth_required") {
        clearBrokerState(config);
        emit("auth_status", {
          status: "stale_remote_token",
          server_url: config.serverUrl,
          message: "Cached token was rejected by MCP server; cleared local cache and restarting broker login.",
        });
        tokenDocument = await ensureBrokerToken(config);
        continue;
      }
      throw error;
    }
  }
}

export async function main() {
  await runClient(readConfig());
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  main().catch((error) => {
    const code = error instanceof McpHttpError ? error.code : "broker_client_error";
    emitError({ ok: false, error_code: code, message: error?.message || String(error) });
    process.exitCode = 1;
  });
}
