import { pendingCachePath, pendingIsExpired, readPendingLogin, removeFile, tokenCachePath, tokenIsUsable, writePrivateJson, readJson } from "./cache.js";
import { DEFAULT_BASE_URL, INTEGRATION_HEADER, SESSION_SECRET_HEADER } from "./constants.js";
import { HttpStatusError, requestJson } from "./http.js";

function integrationHeaders(config) {
  return config?.integrationHeader ? { [INTEGRATION_HEADER]: config.integrationHeader } : {};
}

function brokerHeaders(config, sessionSecret) {
  return { ...integrationHeaders(config), [SESSION_SECRET_HEADER]: sessionSecret };
}

function isActivePendingStatus(status) {
  return status === "PENDING" || status === "AUTHORIZED";
}

function hasActivePendingLogin(pending) {
  return Boolean(pending && isActivePendingStatus(pending.status) && !pendingIsExpired(pending));
}

function isExpiredBrokerSessionError(error) {
  return error instanceof HttpStatusError && error.statusCode === 410;
}

function isTerminalBrokerSessionStatus(status) {
  return status === "EXPIRED" || status === "FAILED" || status === "EXCHANGED";
}

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;
const HEADER_VALUE = /^[\x21-\x7E]+$/;
const MAX_LOGIN_URL_LENGTH = 2048;
const MAX_SESSION_ID_LENGTH = 512;
const MAX_SESSION_SECRET_LENGTH = 1024;

function sessionValidationError(message) {
  const error = new Error(message);
  error.code = "INVALID_BROKER_SESSION";
  return error;
}

function requiredSessionString(sessionPayload, field, maxLength) {
  const value = sessionPayload?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw sessionValidationError(`Broker session response is missing required ${field}`);
  }
  if (value.length > maxLength || CONTROL_CHARACTERS.test(value)) {
    throw sessionValidationError(`Broker session response has invalid ${field}`);
  }
  return value;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function trustedLoginOrigins(config) {
  const origins = new Set();
  const configuredOrigins = config === undefined
    ? [DEFAULT_BASE_URL]
    : [config.brokerBaseUrl, config.authBaseUrl];
  for (const value of configuredOrigins) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      throw sessionValidationError("Broker session configuration has an invalid trusted origin");
    }
  }
  if (origins.size === 0) {
    throw sessionValidationError("Broker session configuration has no trusted origin");
  }
  return origins;
}

function validateLoginUrl(config, sessionPayload) {
  const value = requiredSessionString(sessionPayload, "login_url", MAX_LOGIN_URL_LENGTH);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw sessionValidationError("Broker session response has invalid login_url");
  }
  if (parsed.username || parsed.password) {
    throw sessionValidationError("Broker session response has invalid login_url");
  }
  const allowedOrigins = trustedLoginOrigins(config);
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname) && allowedOrigins.has(parsed.origin)) {
    return parsed.toString();
  }
  if (parsed.protocol !== "https:" || !allowedOrigins.has(parsed.origin)) {
    throw sessionValidationError("Broker session response has invalid login_url");
  }
  return parsed.toString();
}

function validatePendingSession(config, sessionPayload) {
  const sessionId = requiredSessionString(sessionPayload, "session_id", MAX_SESSION_ID_LENGTH);
  if (sessionId === "." || sessionId === ".." || !/^[A-Za-z0-9._~:+-]+$/.test(sessionId)) {
    throw sessionValidationError("Broker session response has invalid session_id");
  }
  const sessionSecret = requiredSessionString(sessionPayload, "session_secret", MAX_SESSION_SECRET_LENGTH);
  if (!HEADER_VALUE.test(sessionSecret)) {
    throw sessionValidationError("Broker session response has invalid session_secret");
  }
  return {
    session_id: sessionId,
    session_secret: sessionSecret,
    login_url: validateLoginUrl(config, sessionPayload),
  };
}

function pendingFromBrokerStatus(config, existing, status) {
  return normalizePendingSession({
    ...existing,
    ...status,
    session_id: status.session_id || existing.session_id,
    session_secret: status.session_secret || existing.session_secret,
    login_url: status.login_url || status.auth_url || status.verification_url || existing.login_url,
    expires_at: status.expires_at || existing.expires_at,
  }, config);
}

async function reconcileExistingPending(config, existing, { fetchImpl = globalThis.fetch } = {}) {
  if (!existing?.session_id) {
    return null;
  }
  try {
    const brokerStatus = await getBrokerSessionStatus(config, existing, { fetchImpl });
    const reconciled = pendingFromBrokerStatus(config, existing, brokerStatus);
    if (
      reconciled &&
      isActivePendingStatus(reconciled.status) &&
      !pendingIsExpired(reconciled) &&
      !isTerminalBrokerSessionStatus(reconciled.status)
    ) {
      writePrivateJson(pendingCachePath(config.cacheRoot, config.serverUrl), reconciled);
      return reconciled;
    }
    return null;
  } catch (error) {
    if (isExpiredBrokerSessionError(error)) {
      return null;
    }
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createBrokerSession(config, { fetchImpl = globalThis.fetch } = {}) {
  return requestJson("POST", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions`, {
    fetchImpl,
    timeoutSeconds: config.timeoutSeconds,
    headers: integrationHeaders(config),
    json: {
      server_url: config.serverUrl,
      auth_base_url: config.authBaseUrl,
      channel: config.channel,
      scope: config.scope,
      client_name: config.clientName,
    },
  });
}

export async function getBrokerSessionStatus(config, pending, { fetchImpl = globalThis.fetch } = {}) {
  const safePending = validatePendingSession(config, pending);
  return requestJson("GET", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions/${encodeURIComponent(safePending.session_id)}`, {
    fetchImpl,
    timeoutSeconds: config.timeoutSeconds,
    headers: brokerHeaders(config, safePending.session_secret),
  });
}

export async function exchangeBrokerSession(config, pending, { fetchImpl = globalThis.fetch } = {}) {
  const safePending = validatePendingSession(config, pending);
  return requestJson("POST", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions/${encodeURIComponent(safePending.session_id)}/exchange`, {
    fetchImpl,
    timeoutSeconds: config.timeoutSeconds,
    headers: brokerHeaders(config, safePending.session_secret),
  });
}

export function normalizePendingSession(sessionPayload, config) {
  const safeSession = validatePendingSession(config, sessionPayload);
  return {
    ...safeSession,
    status: String(sessionPayload.status || "PENDING").toUpperCase(),
    created_at: new Date().toISOString(),
    expires_at: sessionPayload.expires_at ? String(sessionPayload.expires_at) : null,
    error_message: null,
    poll_after_ms: Number(sessionPayload.poll_after_ms || 0) || null,
  };
}

export async function ensurePendingLogin(config, { fetchImpl = globalThis.fetch, forceLogin = false } = {}) {
  const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
  let existing = readPendingLogin(pendingPath);
  if (!forceLogin && existing && isActivePendingStatus(existing.status) && !pendingIsExpired(existing)) {
    try {
      const reconciled = await reconcileExistingPending(config, existing, { fetchImpl });
      if (reconciled) {
        return { pending: reconciled, created: false };
      }
    } catch (error) {
      if (error?.code !== "INVALID_BROKER_SESSION") {
        throw error;
      }
      removeFile(pendingPath);
      existing = null;
    }
  }
  if (existing) {
    removeFile(pendingPath);
  }

  const sessionPayload = await createBrokerSession(config, { fetchImpl });
  const pending = normalizePendingSession(sessionPayload, config);
  writePrivateJson(pendingPath, pending);
  return { pending, created: true };
}

export async function loginWithBroker(config, {
  fetchImpl = globalThis.fetch,
  openBrowser = async () => {},
  sleepImpl = sleep,
  forceLogin = false,
  noBrowserOpen = false,
  stderr = () => {},
} = {}) {
  const cachePath = tokenCachePath(config.cacheRoot, config.serverUrl);
  const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
  const cached = readJson(cachePath);
  const existingPending = readPendingLogin(pendingPath);
  if (!forceLogin && tokenIsUsable(cached, config.minTtlSeconds) && !hasActivePendingLogin(existingPending)) {
    return { status: "cached", cachePath, pendingPath, tokenDocument: cached };
  }

  const { pending, created } = await ensurePendingLogin(config, { fetchImpl, forceLogin });
  if (created) {
    stderr("Open the brokered login URL in your browser to continue:");
    stderr(pending.login_url);
    if (!noBrowserOpen) {
      await openBrowser(pending.login_url);
    }
  }

  const deadline = Date.now() + Number(config.pollTimeoutSeconds || 300) * 1000;
  let current = pending;
  while (Date.now() < deadline) {
    const statusPayload = await getBrokerSessionStatus(config, current, { fetchImpl });
    const status = String(statusPayload.status || current.status || "PENDING").toUpperCase();
    current = {
      ...current,
      status,
      expires_at: statusPayload.expires_at ? String(statusPayload.expires_at) : current.expires_at,
      error_message: typeof statusPayload.error_message === "string" ? statusPayload.error_message : null,
      poll_after_ms: Number(statusPayload.poll_after_ms || 0) || current.poll_after_ms || null,
    };
    writePrivateJson(pendingPath, current);

    if (status === "AUTHORIZED") {
      const exchanged = await exchangeBrokerSession(config, current, { fetchImpl });
      writePrivateJson(cachePath, exchanged);
      removeFile(pendingPath);
      return { status: "logged_in", cachePath, pendingPath, tokenDocument: exchanged };
    }
    if (status === "FAILED" || status === "EXPIRED" || status === "EXCHANGED") {
      removeFile(pendingPath);
      throw new Error(`Brokered login failed: ${current.error_message || status}`);
    }

    const delayMs = Math.max(500, Math.min(Number(current.poll_after_ms || 2000), 10000));
    await sleepImpl(delayMs);
  }

  throw new Error("Timed out waiting for brokered login authorization.");
}
