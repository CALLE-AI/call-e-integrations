import { pendingCachePath, pendingIsExpired, readPendingLogin, removeFile, tokenCachePath, tokenIsUsable, writePrivateJson, readJson } from "./cache.js";
import { SESSION_SECRET_HEADER } from "./config.js";
import { requestJson } from "./http.js";

function brokerHeaders(sessionSecret) {
  return { [SESSION_SECRET_HEADER]: sessionSecret };
}

function isActivePendingStatus(status) {
  return status === "PENDING" || status === "AUTHORIZED";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createBrokerSession(config, { fetchImpl = globalThis.fetch } = {}) {
  return requestJson("POST", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions`, {
    fetchImpl,
    timeoutSeconds: config.timeoutSeconds,
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
  return requestJson("GET", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions/${pending.session_id}`, {
    fetchImpl,
    timeoutSeconds: config.timeoutSeconds,
    headers: brokerHeaders(pending.session_secret),
  });
}

export async function exchangeBrokerSession(config, pending, { fetchImpl = globalThis.fetch } = {}) {
  return requestJson("POST", `${config.brokerBaseUrl}/api/v1/openagent-auth/sessions/${pending.session_id}/exchange`, {
    fetchImpl,
    timeoutSeconds: config.timeoutSeconds,
    headers: brokerHeaders(pending.session_secret),
  });
}

export function normalizePendingSession(sessionPayload) {
  return {
    session_id: String(sessionPayload.session_id),
    session_secret: String(sessionPayload.session_secret),
    login_url: String(sessionPayload.login_url),
    status: String(sessionPayload.status || "PENDING").toUpperCase(),
    created_at: new Date().toISOString(),
    expires_at: sessionPayload.expires_at ? String(sessionPayload.expires_at) : null,
    error_message: null,
    poll_after_ms: Number(sessionPayload.poll_after_ms || 0) || null,
  };
}

export async function ensurePendingLogin(config, { fetchImpl = globalThis.fetch, forceLogin = false } = {}) {
  const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
  const existing = readPendingLogin(pendingPath);
  if (!forceLogin && existing && isActivePendingStatus(existing.status) && !pendingIsExpired(existing)) {
    return { pending: existing, created: false };
  }
  if (existing) {
    removeFile(pendingPath);
  }

  const sessionPayload = await createBrokerSession(config, { fetchImpl });
  const pending = normalizePendingSession(sessionPayload);
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
  if (!forceLogin && tokenIsUsable(cached, config.minTtlSeconds)) {
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
