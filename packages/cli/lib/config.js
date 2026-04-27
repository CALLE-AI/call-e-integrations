import os from "node:os";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com";
export const DEFAULT_CHANNEL = "openagent_oauth";
export const DEFAULT_SCOPE = "openid email profile";
export const DEFAULT_CLIENT_NAME = "calle Login";
export const DEFAULT_SERVER_NAME = "calle";
export const DEFAULT_TIMEOUT_SECONDS = 15;
export const DEFAULT_POLL_TIMEOUT_SECONDS = 300;
export const DEFAULT_MIN_TTL_SECONDS = 300;
export const DEFAULT_CACHE_ROOT = path.join(os.homedir(), ".calle-mcp", "cli");
export const SESSION_SECRET_HEADER = "X-OpenAgent-Session-Secret";

export function expandHomePath(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

export function resolveServerUrl({ serverUrl, baseUrl, channel }) {
  if (serverUrl) {
    return serverUrl;
  }
  return `${normalizeBaseUrl(baseUrl)}/mcp/${String(channel || DEFAULT_CHANNEL).trim().toLowerCase() || DEFAULT_CHANNEL}`;
}

export function resolveAuthBaseUrl({ authBaseUrl, baseUrl, serverUrl }) {
  if (authBaseUrl) {
    return normalizeBaseUrl(authBaseUrl);
  }
  if (baseUrl) {
    return normalizeBaseUrl(baseUrl);
  }
  const parsed = new URL(serverUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

export function resolveBrokerBaseUrl({ brokerBaseUrl, baseUrl }) {
  return normalizeBaseUrl(brokerBaseUrl || baseUrl);
}

export function resolveRuntimeConfig(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const channel = options.channel || DEFAULT_CHANNEL;
  const serverUrl = resolveServerUrl({ serverUrl: options.serverUrl, baseUrl, channel });
  return {
    baseUrl,
    brokerBaseUrl: resolveBrokerBaseUrl({ brokerBaseUrl: options.brokerBaseUrl, baseUrl }),
    serverUrl,
    authBaseUrl: resolveAuthBaseUrl({ authBaseUrl: options.authBaseUrl, baseUrl, serverUrl }),
    channel,
    scope: options.scope || DEFAULT_SCOPE,
    clientName: options.clientName || DEFAULT_CLIENT_NAME,
    cacheRoot: expandHomePath(options.cacheRoot || DEFAULT_CACHE_ROOT),
    timeoutSeconds: Number(options.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS),
    pollTimeoutSeconds: Number(options.pollTimeoutSeconds || DEFAULT_POLL_TIMEOUT_SECONDS),
    minTtlSeconds: Number(options.minTtlSeconds || DEFAULT_MIN_TTL_SECONDS),
    serverName: options.serverName || DEFAULT_SERVER_NAME,
  };
}
