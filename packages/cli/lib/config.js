import os from "node:os";
import path from "node:path";

import {
  DEFAULT_BASE_URL,
  DEFAULT_CHANNEL,
  DEFAULT_CLIENT_NAME,
  DEFAULT_MIN_TTL_SECONDS,
  DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_SECONDS,
  INTEGRATION_HEADER,
  SESSION_SECRET_HEADER,
} from "@call-e/core/constants";
import {
  expandHomePath,
  normalizeBaseUrl,
  resolveAuthBaseUrl,
  resolveBrokerBaseUrl,
  resolveServerUrl,
} from "@call-e/core/config";

export {
  DEFAULT_BASE_URL,
  DEFAULT_CHANNEL,
  DEFAULT_CLIENT_NAME,
  DEFAULT_MIN_TTL_SECONDS,
  DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_SECONDS,
  INTEGRATION_HEADER,
  SESSION_SECRET_HEADER,
  expandHomePath,
  normalizeBaseUrl,
  resolveAuthBaseUrl,
  resolveBrokerBaseUrl,
  resolveServerUrl,
};

export const DEFAULT_SERVER_NAME = "calle";
export const DEFAULT_POLL_TIMEOUT_SECONDS = 300;
export const DEFAULT_PLAN_CALL_TIMEOUT_SECONDS = 150;
export const DEFAULT_TELEMETRY_TIMEOUT_SECONDS = 1.5;
export const DEFAULT_CACHE_ROOT = path.join(os.homedir(), ".calle-mcp", "cli");
export const CLI_VERSION = "0.5.1";

function firstOptionValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

// Node turns any setTimeout delay above this into 1ms, which brings back the very
// immediate-abort failure this validator exists to prevent: --timeout-seconds 2147484
// is 2,147,484,000ms, so the request would abort at once instead of waiting.
// https://nodejs.org/api/timers.html#settimeoutcallback-delay-args
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_TIMER_SECONDS = Math.floor(MAX_TIMER_DELAY_MS / 1000);

// Zero is meaningful for --min-ttl-seconds (it disables the minimum remaining-lifetime
// window) and meaningless for a timeout, so the bounds are per option rather than shared.
function secondsOption(value, fallback, flag, { allowZero = false, timerBacked = true } = {}) {
  const provided = firstOptionValue(value);
  // Not `value || fallback`: a numeric 0 is falsy, and for --min-ttl-seconds it is a
  // value the user asked for, not an absent one.
  const raw = provided === undefined || provided === null || provided === "" ? fallback : provided;
  const parsed = Number(raw);
  const wanted = allowZero ? "a non-negative" : "a positive";

  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw new Error(
      `${flag} expects ${wanted} number of seconds, got "${raw}". Use "30", not "30s".`,
    );
  }

  if (timerBacked && parsed > MAX_TIMER_SECONDS) {
    throw new Error(
      `${flag} expects at most ${MAX_TIMER_SECONDS} seconds, got "${raw}". ` +
        `Node collapses a longer timer to 1ms, which would abort immediately.`,
    );
  }

  return parsed;
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
    timeoutSeconds: secondsOption(
      options.timeoutSeconds,
      DEFAULT_TIMEOUT_SECONDS,
      "--timeout-seconds",
    ),
    pollTimeoutSeconds: secondsOption(
      options.pollTimeoutSeconds,
      DEFAULT_POLL_TIMEOUT_SECONDS,
      "--poll-timeout-seconds",
    ),
    // Not timer-backed, and 0 disables the minimum remaining-lifetime window.
    minTtlSeconds: secondsOption(options.minTtlSeconds, DEFAULT_MIN_TTL_SECONDS, "--min-ttl-seconds", {
      allowZero: true,
      timerBacked: false,
    }),
    serverName: options.serverName || DEFAULT_SERVER_NAME,
    telemetryEnabled: resolveTelemetryEnabled(options, env),
    telemetryUrl: resolveTelemetryUrl({ telemetryUrl: options.telemetryUrl, baseUrl }, env),
    telemetryTimeoutSeconds: secondsOption(
      firstOptionValue(options.telemetryTimeoutSeconds) || env.CALLE_TELEMETRY_TIMEOUT_SECONDS,
      DEFAULT_TELEMETRY_TIMEOUT_SECONDS,
      "--telemetry-timeout-seconds",
    ),
  };
}
