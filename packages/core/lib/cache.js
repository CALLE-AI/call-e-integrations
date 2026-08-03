import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function serverHash(serverUrl) {
  return crypto.createHash("sha256").update(serverUrl, "utf8").digest("hex");
}

/**
 * Legacy hash used before the cache directory was renamed to sha256.
 * Kept for migration: if a token exists under the legacy path but not the
 * current path, migrateTokenCache() moves it automatically.
 */
export function legacyServerHash(serverUrl) {
  return crypto.createHash("md5").update(serverUrl, "utf8").digest("hex");
}

export function tokenCachePath(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "token.json");
}

export function pendingCachePath(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "pending_login.json");
}

/**
 * Migrate token and pending-login files from the legacy (md5) cache directory
 * to the current (sha256) cache directory when they differ.  No-op when the
 * two hashes produce the same directory name (i.e. before the sha256 switch).
 */
export function migrateTokenCache(cacheRoot, serverUrl) {
  const legacyDir = path.join(cacheRoot, legacyServerHash(serverUrl));
  const currentTokenPath = tokenCachePath(cacheRoot, serverUrl);
  const currentPendingPath = pendingCachePath(cacheRoot, serverUrl);

  // If the current paths already exist, or the legacy dir is identical to the
  // current dir (no migration needed), bail out.
  const currentDir = path.dirname(currentTokenPath);
  if (legacyDir === currentDir) {
    return;
  }

  const legacyTokenPath = path.join(legacyDir, "token.json");
  const legacyPendingPath = path.join(legacyDir, "pending_login.json");

  try {
    if (!fs.existsSync(currentTokenPath) && fs.existsSync(legacyTokenPath)) {
      ensurePrivateDir(path.dirname(currentTokenPath));
      fs.renameSync(legacyTokenPath, currentTokenPath);
    }
    if (!fs.existsSync(currentPendingPath) && fs.existsSync(legacyPendingPath)) {
      ensurePrivateDir(path.dirname(currentPendingPath));
      fs.renameSync(legacyPendingPath, currentPendingPath);
    }
    // Remove legacy directory if now empty
    try {
      const remaining = fs.readdirSync(legacyDir);
      if (remaining.length === 0) {
        fs.rmdirSync(legacyDir);
      }
    } catch {
      // Best effort only.
    }
  } catch {
    // Migration failures are non-fatal; the caller will proceed with the
    // current path, and users can re-authenticate if needed.
  }
}

export function ensurePrivateDir(dirPath) {
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
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
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

export function removeFile(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Ignore cleanup failures.
  }
}

export function removeTokenCache(config) {
  removeFile(tokenCachePath(config.cacheRoot, config.serverUrl));
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
  return expiresAt.getTime() - Date.now() > Number(minTtlSeconds || 0) * 1000;
}

export function readPendingLogin(filePath) {
  const payload = readJson(filePath);
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const required = ["session_id", "session_secret", "login_url", "status", "created_at"];
  for (const field of required) {
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

export function pendingIsExpired(pending) {
  const expiresAt = parseIsoDate(pending?.expires_at);
  return Boolean(expiresAt && Date.now() >= expiresAt.getTime());
}
