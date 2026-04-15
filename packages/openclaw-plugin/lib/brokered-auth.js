import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_CHANNEL = "openagent_auth";
export const DEFAULT_SCOPE = "openid email profile";
export const DEFAULT_CLIENT_NAME = "calle Login";
export const DEFAULT_TIMEOUT_SECONDS = 15;
export const DEFAULT_MIN_TTL_SECONDS = 300;
export const DEFAULT_CACHE_ROOT = path.join(os.homedir(), ".calle-mcp", "openclaw-brokered-auth");
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
  return `${normalizeBaseUrl(baseUrl)}/mcp/${channel}`;
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

export function serverHash(serverUrl) {
  return crypto.createHash("md5").update(serverUrl, "utf8").digest("hex");
}

export function tokenCachePath(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "token.json");
}

export function pendingCachePath(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "pending_login.json");
}

export function utcNow() {
  return new Date();
}

export function parseIsoDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function tokenIsUsable(cacheDocument, minTtlSeconds) {
  if (!cacheDocument || typeof cacheDocument !== "object") {
    return false;
  }
  const token = cacheDocument.token;
  if (!token || typeof token !== "object" || typeof token.access_token !== "string" || !token.access_token) {
    return false;
  }
  const expiresAt = parseIsoDate(cacheDocument.expires_at);
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() - utcNow().getTime() > minTtlSeconds * 1000;
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    // Best effort only.
  }
}

export function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writePrivateJson(filePath, payload) {
  ensurePrivateDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort only.
  }
}

class HttpStatusError extends Error {
  constructor(message, { statusCode, responseText, headers } = {}) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode ?? null;
    this.responseText = responseText ?? "";
    this.headers = headers ?? {};
  }
}

function isActivePendingStatus(status) {
  return status === "PENDING" || status === "AUTHORIZED";
}

export class BrokeredTokenManager {
  constructor({
    baseUrl,
    brokerBaseUrl,
    serverUrl,
    authBaseUrl,
    cacheRoot = DEFAULT_CACHE_ROOT,
    channel = DEFAULT_CHANNEL,
    scope = DEFAULT_SCOPE,
    clientName = DEFAULT_CLIENT_NAME,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
    minTtlSeconds = DEFAULT_MIN_TTL_SECONDS,
    fetchImpl = globalThis.fetch,
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.brokerBaseUrl = normalizeBaseUrl(brokerBaseUrl || this.baseUrl);
    this.serverUrl = resolveServerUrl({ serverUrl, baseUrl: this.baseUrl, channel });
    this.authBaseUrl = resolveAuthBaseUrl({ authBaseUrl, baseUrl: this.baseUrl, serverUrl: this.serverUrl });
    this.cacheRoot = expandHomePath(cacheRoot || DEFAULT_CACHE_ROOT);
    this.channel = channel;
    this.scope = scope;
    this.clientName = clientName;
    this.timeoutSeconds = Number(timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
    this.minTtlSeconds = Number(minTtlSeconds || DEFAULT_MIN_TTL_SECONDS);
    this.fetchImpl = fetchImpl;
    this._pendingLogin = null;
    this._activePolls = new Map();
    this._createPromise = null;
  }

  get cachePath() {
    return tokenCachePath(this.cacheRoot, this.serverUrl);
  }

  get pendingPath() {
    return pendingCachePath(this.cacheRoot, this.serverUrl);
  }

  currentTokenDocument() {
    const cacheDocument = readJson(this.cachePath);
    if (tokenIsUsable(cacheDocument, this.minTtlSeconds)) {
      return cacheDocument;
    }
    return null;
  }

  invalidateCache() {
    try {
      fs.rmSync(this.cachePath, { force: true });
    } catch {
      // Ignore cache cleanup failures.
    }
  }

  pendingLogin() {
    if (this._pendingLogin) {
      this._ensurePollLoop(this._pendingLogin);
      return { ...this._pendingLogin };
    }
    const pending = this._loadPendingFromDisk();
    if (!pending) {
      return null;
    }
    this._pendingLogin = pending;
    this._ensurePollLoop(pending);
    return { ...pending };
  }

  async startLoginIfNeeded() {
    if (this.currentTokenDocument()) {
      throw new Error("Token is already available");
    }

    const existing = this.pendingLogin();
    if (existing && isActivePendingStatus(existing.status) && !this._isExpired(existing.expires_at)) {
      return existing;
    }
    if (existing && !isActivePendingStatus(existing.status)) {
      this._clearPendingIfMatches(existing.session_id);
    }

    if (this._createPromise) {
      return this._createPromise;
    }

    this._createPromise = (async () => {
      const sessionPayload = await this._requestJson("POST", `${this.brokerBaseUrl}/api/v1/openagent-auth/sessions`, {
        json: {
          server_url: this.serverUrl,
          auth_base_url: this.authBaseUrl,
          channel: this.channel,
          scope: this.scope,
          client_name: this.clientName,
        },
      });

      const pending = {
        session_id: String(sessionPayload.session_id),
        session_secret: String(sessionPayload.session_secret),
        login_url: String(sessionPayload.login_url),
        status: String(sessionPayload.status || "PENDING").toUpperCase(),
        created_at: utcNow().toISOString(),
        expires_at: sessionPayload.expires_at ? String(sessionPayload.expires_at) : null,
        error_message: null,
        poll_after_ms: Number(sessionPayload.poll_after_ms || 0) || null,
      };
      this._pendingLogin = pending;
      this._persistPending(pending);
      this._ensurePollLoop(pending);
      return { ...pending };
    })();

    try {
      return await this._createPromise;
    } finally {
      this._createPromise = null;
    }
  }

  async reconcilePendingLogin() {
    const pending = this.pendingLogin();
    if (!pending) {
      return null;
    }
    if (this._isExpired(pending.expires_at)) {
      this._clearPendingIfMatches(pending.session_id);
      return null;
    }

    try {
      const statusPayload = await this._requestJson(
        "GET",
        `${this.brokerBaseUrl}/api/v1/openagent-auth/sessions/${pending.session_id}`,
        {
          headers: {
            [SESSION_SECRET_HEADER]: pending.session_secret,
          },
        }
      );
      const status = String(statusPayload.status || pending.status || "PENDING").toUpperCase();
      const updated = {
        ...pending,
        status,
        expires_at: statusPayload.expires_at ? String(statusPayload.expires_at) : pending.expires_at,
        error_message: typeof statusPayload.error_message === "string" ? statusPayload.error_message : null,
        poll_after_ms: Number(statusPayload.poll_after_ms || 0) || pending.poll_after_ms || null,
      };
      this._pendingLogin = updated;
      this._persistPending(updated);

      if (status === "AUTHORIZED") {
        const exchanged = await this._requestJson(
          "POST",
          `${this.brokerBaseUrl}/api/v1/openagent-auth/sessions/${pending.session_id}/exchange`,
          {
            headers: {
              [SESSION_SECRET_HEADER]: pending.session_secret,
            },
          }
        );
        writePrivateJson(this.cachePath, exchanged);
        this._clearPendingIfMatches(pending.session_id);
        return null;
      }

      if (status === "FAILED" || status === "EXPIRED" || status === "EXCHANGED") {
        this._clearPendingIfMatches(pending.session_id);
        return null;
      }

      return { ...updated };
    } catch (error) {
      const failed = {
        ...pending,
        status: "FAILED",
        error_message: `${error?.name || "Error"}: ${error?.message || String(error)}`,
      };
      this._pendingLogin = failed;
      this._persistPending(failed);
      return { ...failed };
    }
  }

  _loadPendingFromDisk() {
    const payload = readJson(this.pendingPath);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const fields = ["session_id", "session_secret", "login_url", "status", "created_at"];
    for (const field of fields) {
      if (typeof payload[field] !== "string" || !payload[field]) {
        return null;
      }
    }
    return {
      session_id: payload.session_id,
      session_secret: payload.session_secret,
      login_url: payload.login_url,
      status: String(payload.status).toUpperCase(),
      created_at: payload.created_at,
      expires_at: typeof payload.expires_at === "string" ? payload.expires_at : null,
      error_message: typeof payload.error_message === "string" ? payload.error_message : null,
      poll_after_ms: Number(payload.poll_after_ms || 0) || null,
    };
  }

  _persistPending(pending) {
    writePrivateJson(this.pendingPath, pending);
  }

  _clearPendingIfMatches(sessionId) {
    if (this._pendingLogin && this._pendingLogin.session_id === sessionId) {
      this._pendingLogin = null;
    }
    try {
      fs.rmSync(this.pendingPath, { force: true });
    } catch {
      // Ignore pending cache cleanup failures.
    }
    const timer = this._activePolls.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this._activePolls.delete(sessionId);
    }
  }

  _ensurePollLoop(pending) {
    if (!isActivePendingStatus(pending.status) || this._isExpired(pending.expires_at)) {
      return;
    }
    if (this._activePolls.has(pending.session_id)) {
      return;
    }
    const poll = async () => {
      try {
        const current = this.pendingLogin();
        if (!current || current.session_id !== pending.session_id) {
          this._activePolls.delete(pending.session_id);
          return;
        }
        const resolved = await this.reconcilePendingLogin();
        const stillPending = resolved && resolved.session_id === pending.session_id && isActivePendingStatus(resolved.status);
        if (!stillPending) {
          this._activePolls.delete(pending.session_id);
          return;
        }
        const delayMs = this._pollDelayMs(resolved);
        this._schedulePoll(pending.session_id, poll, delayMs);
      } catch {
        this._activePolls.delete(pending.session_id);
      }
    };
    this._schedulePoll(pending.session_id, poll, this._pollDelayMs(pending));
  }

  _schedulePoll(sessionId, pollFn, delayMs) {
    const timer = setTimeout(() => {
      this._activePolls.delete(sessionId);
      void pollFn();
    }, delayMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
    this._activePolls.set(sessionId, timer);
  }

  _pollDelayMs(pending) {
    const pollAfterMs = Number(pending?.poll_after_ms || 0);
    if (Number.isFinite(pollAfterMs) && pollAfterMs > 0) {
      return Math.max(500, Math.min(pollAfterMs, 10000));
    }
    return 2000;
  }

  _isExpired(expiresAt) {
    const expires = parseIsoDate(expiresAt);
    return Boolean(expires && utcNow().getTime() >= expires.getTime());
  }

  async _requestJson(method, url, { headers = {}, json = undefined } = {}) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("global fetch is not available in this OpenClaw runtime");
    }

    const controller = new AbortController();
    const timeoutMs = Math.max(Math.ceil(this.timeoutSeconds * 1000), 1000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timeout.unref === "function") {
      timeout.unref();
    }

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new HttpStatusError(`Client error '${response.status} ${response.statusText}' for url '${url}'`, {
          statusCode: response.status,
          responseText: text,
          headers: Object.fromEntries(response.headers.entries()),
        });
      }
      if (!text.trim()) {
        return {};
      }
      return JSON.parse(text);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Request timed out for ${method} ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
