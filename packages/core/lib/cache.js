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

export function removeTokenCache(config) {
  removeFile(tokenCachePath(config.cacheRoot, config.serverUrl));
}

// Epoch seconds and milliseconds below this are indistinguishable from each
// other only for dates before 1973; anything a token expiry could plausibly
// carry is far above it in ms and far below it in seconds.
const EPOCH_MILLISECONDS_THRESHOLD = 1e11;

export function parseIsoDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // A numeric expiry is a standard representation, and broker-client stringifies
  // whatever the broker sends — so an epoch arrives here as "1700000000000",
  // which `new Date()` reads as Invalid Date. Without this branch a perfectly
  // valid expiry is indistinguishable from no expiry at all.
  // The sign is matched so a negative value lands in the numeric branch and is
  // rejected below. Left to `new Date()` it does not fail — V8 reads "-1" as a
  // date and yields 2001-01-01, which is a nonsense expiry rather than an error.
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (/^-?\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    const milliseconds = numeric < EPOCH_MILLISECONDS_THRESHOLD ? numeric * 1000 : numeric;
    const parsedEpoch = new Date(milliseconds);
    return Number.isNaN(parsedEpoch.getTime()) ? null : parsedEpoch;
  }

  const parsed = new Date(raw);
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
  const rawExpiry = cacheDocument.expires_at;
  const expiryWasProvided = rawExpiry !== null && rawExpiry !== undefined && rawExpiry !== "";
  const expiresAt = parseIsoDate(rawExpiry);
  if (!expiresAt) {
    // No expiry at all: the broker never committed to one, so keep using the
    // token — that is the existing behaviour and it is reasonable.
    //
    // An expiry that is present but unreadable is a different situation, and
    // reading it as "never expires" is the worst of the available choices: the
    // token is then cached forever and never refreshed, and the failure only
    // surfaces much later as auth errors with no re-login. Force a refresh
    // instead; the cost of one extra login is far below the cost of a client
    // that is certain about a token it cannot actually reason about.
    return !expiryWasProvided;
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
