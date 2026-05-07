import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  pendingCachePath,
  pendingIsExpired,
  readJson,
  readPendingLogin,
  removeFile,
  tokenCachePath,
  tokenIsUsable,
  writePrivateJson,
} from "@call-e/core/cache";
import {
  DEFAULT_BASE_URL,
  DEFAULT_CHANNEL,
  DEFAULT_CLIENT_NAME,
  DEFAULT_MIN_TTL_SECONDS,
  DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_SECONDS,
} from "@call-e/core/constants";
import {
  ensurePendingLogin,
  exchangeBrokerSession,
  getBrokerSessionStatus,
} from "@call-e/core/broker-client";

import {
  McpHttpError,
  callTool,
  listResources,
  listTools,
  openMcpSession,
  readResource,
} from "./resources.js";

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

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, got: ${value}`);
  }
  return parsed;
}

function parseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  return String(value || "").replace(/\/+$/u, "");
}

function defaultServerUrl(baseUrl: string, channel: string): string {
  const resolvedChannel = channel.trim().toLowerCase() || DEFAULT_CHANNEL;
  return `${normalizeBaseUrl(baseUrl)}/mcp/${resolvedChannel}`;
}

function readConfig(env = process.env): Config {
  const baseUrl = env.MCP_BASE_URL || DEFAULT_BASE_URL;
  const channel = env.MCP_CHANNEL || DEFAULT_CHANNEL;
  const serverUrl = env.MCP_SERVER_URL || defaultServerUrl(baseUrl, channel);
  return {
    baseUrl,
    serverUrl,
    brokerBaseUrl: normalizeBaseUrl(env.MCP_BROKER_BASE_URL || baseUrl),
    authBaseUrl: normalizeBaseUrl(env.MCP_AUTH_BASE_URL || baseUrl),
    channel,
    scope: env.MCP_SCOPE || DEFAULT_SCOPE,
    clientName: env.MCP_CLIENT_NAME || DEFAULT_CLIENT_NAME,
    cacheRoot: expandHomePath(env.MCP_CACHE_ROOT || path.join(os.homedir(), ".calle-mcp", "examples", "broker")),
    timeoutSeconds: parsePositiveNumber(env.MCP_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS),
    minTtlSeconds: parsePositiveNumber(env.MCP_MIN_TTL_SECONDS, DEFAULT_MIN_TTL_SECONDS),
    pollTimeoutSeconds: parsePositiveNumber(env.MCP_POLL_TIMEOUT_SECONDS, 300),
    integrationHeader: env.CALLE_EXAMPLE_INTEGRATION || "examples/mcp-broker-client-ts/0.0.0",
    toolName: env.MCP_TOOL_NAME || null,
    toolArgs: parseJsonObject(env.MCP_TOOL_ARGS_JSON, "MCP_TOOL_ARGS_JSON"),
  };
}

function printEvent(event: string, payload: Record<string, unknown> = {}) {
  const line = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });
  console.log(line);
  writeLogLine(line);
}

function printError(payload: Record<string, unknown>) {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accessTokenFromDocument(tokenDocument: Record<string, unknown>): string {
  const token = tokenDocument.token;
  if (!token || typeof token !== "object" || typeof (token as Record<string, unknown>).access_token !== "string") {
    throw new Error("Token cache does not contain an access token.");
  }
  return (token as Record<string, string>).access_token;
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
  removeFile(tokenCachePath(config.cacheRoot, config.serverUrl));
  removeFile(pendingCachePath(config.cacheRoot, config.serverUrl));
}

async function ensureBrokerToken(config: Config): Promise<Record<string, unknown>> {
  const cachePath = tokenCachePath(config.cacheRoot, config.serverUrl);
  const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
  const cached = readJson(cachePath);
  if (tokenIsUsable(cached, config.minTtlSeconds)) {
    printEvent("auth_status", {
      status: "cached",
      server_url: config.serverUrl,
      expires_at: cached?.expires_at || null,
    });
    return cached;
  }

  if (cached) {
    printEvent("auth_status", {
      status: "expired",
      server_url: config.serverUrl,
      expires_at: cached.expires_at || null,
    });
  }

  let pending = readPendingLogin(pendingPath);
  if (!pending || pendingIsExpired(pending)) {
    if (pending) {
      removeFile(pendingPath);
    }
    const result = await ensurePendingLogin(config);
    pending = result.pending;
    printEvent("auth_status", {
      status: "login_required",
      pending_status: pending.status,
      login_url: pending.login_url,
      pending_created: result.created,
    });
  } else {
    printEvent("auth_status", {
      status: "pending",
      pending_status: pending.status,
      login_url: pending.login_url,
    });
  }

  const deadline = Date.now() + config.pollTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const statusPayload = await getBrokerSessionStatus(config, pending);
    pending = {
      ...pending,
      status: String(statusPayload.status || pending.status || "PENDING").toUpperCase(),
      expires_at: typeof statusPayload.expires_at === "string" ? statusPayload.expires_at : pending.expires_at,
      error_message: typeof statusPayload.error_message === "string" ? statusPayload.error_message : null,
      poll_after_ms: Number(statusPayload.poll_after_ms || 0) || pending.poll_after_ms || null,
    };
    writePrivateJson(pendingPath, pending);
    printEvent("auth_poll", {
      pending_status: pending.status,
    });

    if (pending.status === "AUTHORIZED") {
      const exchanged = await exchangeBrokerSession(config, pending);
      writePrivateJson(cachePath, exchanged);
      removeFile(pendingPath);
      printEvent("auth_status", {
        status: "logged_in",
        server_url: config.serverUrl,
        expires_at: exchanged?.expires_at || null,
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

async function runMcpFlow(config: Config, tokenDocument: Record<string, unknown>) {
  const accessToken = accessTokenFromDocument(tokenDocument);
  const session = await openMcpSession({
    serverUrl: config.serverUrl,
    accessToken,
    timeoutSeconds: config.timeoutSeconds,
    integrationHeader: config.integrationHeader,
  });
  printEvent("connected", {
    server_url: config.serverUrl,
  });

  const tools = await listTools(session);
  const toolNames = Array.isArray(tools.tools) ? tools.tools.map((tool: { name?: string }) => tool.name).filter(Boolean) : [];
  printEvent("tools/list", {
    count: toolNames.length,
    tools: toolNames,
  });

  if (config.toolName) {
    const result = await callTool(session, config.toolName, config.toolArgs);
    printEvent("tools/call", {
      tool_name: config.toolName,
      result,
    });
  }

  const resources = await listResources(session).catch((error) => {
    printEvent("resources/list", {
      skipped: true,
      message: error?.message || String(error),
    });
    return { resources: [] };
  });
  const resourceList = Array.isArray(resources.resources) ? resources.resources : [];
  printEvent("resources/list", {
    count: resourceList.length,
  });

  if (resourceList[0]?.uri) {
    const result = await readResource(session, String(resourceList[0].uri));
    printEvent("resources/read", {
      uri: resourceList[0].uri,
      result: summarizeResourceResult(result),
    });
  } else {
    printEvent("resources/read", {
      skipped: true,
      message: "no resources available",
    });
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
        printEvent("auth_status", {
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
    printError({ ok: false, error_code: code, message: error?.message || String(error) });
    process.exitCode = 1;
  });
}
