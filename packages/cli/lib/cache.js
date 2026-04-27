import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function serverHash(serverUrl) {
  return crypto.createHash("md5").update(serverUrl, "utf8").digest("hex");
}

export function tokenCachePath(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "token.json");
}

export function pendingCachePath(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "pending_login.json");
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
