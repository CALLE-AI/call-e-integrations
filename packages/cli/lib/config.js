import os from "node:os";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com";
export const DEFAULT_CHANNEL = "openagent_oauth";
export const DEFAULT_SCOPE = "openid email profile";
export const DEFAULT_CLIENT_NAME = "calle Login";
export const DEFAULT_SERVER_NAME = "calle";
export const DEFAULT_TIMEOUT_SECONDS = 15;
export const DEFAULT_POLL_TIMEOUT_SECONDS = 300;
export const DEFAULT_TELEMETRY_TIMEOUT_SECONDS = 1.5;
export const DEFAULT_MIN_TTL_SECONDS = 300;
export const DEFAULT_CACHE_ROOT = path.join(os.homedir(), ".calle-mcp", "cli");
export const SESSION_SECRET_HEADER = "X-OpenAgent-Session-Secret";
export const CLI_VERSION = "0.2.0";
export const INTEGRATION_HEADER = "X-Call-E-Integration";

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

function firstOptionValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isDisabledFlag(value) {
  return ["0", "false", "no", "off", "disabled"].includes(String(value || "").trim().toLowerCase());
}

function isEnabledFlag(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
}

function resolveTelemetryEnabled(options = {}, env = {}) {
  if (firstOptionValue(options.noTelemetry) === true) {
    return false;
  }

  const optionValue = firstOptionValue(options.telemetry);
  if (optionValue !== undefined) {
    return optionValue === true || isEnabledFlag(optionValue);
  }

  if (isEnabledFlag(env.DO_NOT_TRACK)) {
    return false;
  }

  const envValue = env.CALLE_TELEMETRY;
  if (envValue !== undefined) {
    return !isDisabledFlag(envValue);
  }

  return true;
}

function resolveTelemetryUrl({ telemetryUrl, baseUrl }, env = {}) {
  const configured = firstOptionValue(telemetryUrl) || env.CALLE_TELEMETRY_URL;
  if (configured) {
    return String(configured);
  }
  return `${normalizeBaseUrl(baseUrl)}/api/ui-telemetry/track`;
}

function normalizeIntegrationSegment(value) {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned || !/^[A-Za-z0-9._+-]+$/u.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function resolveIntegrationContext(env = {}, cliVersion = CLI_VERSION) {
  const source = normalizeIntegrationSegment(env.CALLE_SOURCE);
  const integration = normalizeIntegrationSegment(env.CALLE_INTEGRATION);
  const version = normalizeIntegrationSegment(env.CALLE_INTEGRATION_VERSION);
  const hasUpstreamContext = Boolean(source || integration || version);

  if (hasUpstreamContext) {
    return {
      source: source || "unknown",
      integration: integration || "unknown",
      version: version || "unknown",
    };
  }

  return {
    source: "cli",
    integration: "cli",
    version: normalizeIntegrationSegment(cliVersion) || "unknown",
  };
}

export function formatIntegrationHeader(integrationContext) {
  const source = normalizeIntegrationSegment(integrationContext?.source) || "unknown";
  const integration = normalizeIntegrationSegment(integrationContext?.integration) || "unknown";
  const version = normalizeIntegrationSegment(integrationContext?.version) || "unknown";
  return `${source}/${integration}/${version}`;
}

export function resolveRuntimeConfig(options = {}, env = process.env) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const channel = options.channel || DEFAULT_CHANNEL;
  const serverUrl = resolveServerUrl({ serverUrl: options.serverUrl, baseUrl, channel });
  const integrationContext = resolveIntegrationContext(env, CLI_VERSION);
  return {
    cliVersion: CLI_VERSION,
    integrationContext,
    integrationHeader: formatIntegrationHeader(integrationContext),
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
    telemetryEnabled: resolveTelemetryEnabled(options, env),
    telemetryUrl: resolveTelemetryUrl({ telemetryUrl: options.telemetryUrl, baseUrl }, env),
    telemetryTimeoutSeconds: Number(
      firstOptionValue(options.telemetryTimeoutSeconds) ||
        env.CALLE_TELEMETRY_TIMEOUT_SECONDS ||
        DEFAULT_TELEMETRY_TIMEOUT_SECONDS,
    ),
  };
}
