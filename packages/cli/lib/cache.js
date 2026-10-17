import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  parseIsoDate,
  readJson,
  serverHash,
  writePrivateJson,
} from "@call-e/core/cache";

export * from "@call-e/core/cache";

const CALL_RECOVERY_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/u;

function callRecoveryCacheDir(cacheRoot, serverUrl) {
  return path.join(cacheRoot, serverHash(serverUrl), "call_recoveries");
}

export function isCallRecoveryId(value) {
  return typeof value === "string" && CALL_RECOVERY_ID_PATTERN.test(value);
}

export function callRecoveryCachePath(cacheRoot, serverUrl, recoveryId) {
  if (!isCallRecoveryId(recoveryId)) {
    throw new TypeError("Invalid call recovery id");
  }
  return path.join(callRecoveryCacheDir(cacheRoot, serverUrl), `${recoveryId}.json`);
}

export function writeCallRecovery(config, recovery) {
  const recoveryId = crypto.randomBytes(18).toString("base64url");
  writePrivateJson(callRecoveryCachePath(config.cacheRoot, config.serverUrl, recoveryId), {
    schema_version: 1,
    created_at: new Date().toISOString(),
    plan_id: recovery.planId,
    confirm_token: recovery.confirmToken,
    timezone: recovery.timezone || null,
  });
  return recoveryId;
}

export function readCallRecovery(config, recoveryId) {
  if (!isCallRecoveryId(recoveryId)) {
    return null;
  }
  const recovery = readJson(callRecoveryCachePath(config.cacheRoot, config.serverUrl, recoveryId));
  if (
    recovery?.schema_version !== 1
    || typeof recovery.plan_id !== "string"
    || !recovery.plan_id
    || typeof recovery.confirm_token !== "string"
    || !recovery.confirm_token
  ) {
    return null;
  }
  return {
    planId: recovery.plan_id,
    confirmToken: recovery.confirm_token,
    timezone: typeof recovery.timezone === "string" && recovery.timezone ? recovery.timezone : null,
  };
}

export function removeCallRecovery(config, recoveryId) {
  if (!isCallRecoveryId(recoveryId)) {
    return;
  }
  try {
    fs.rmSync(callRecoveryCachePath(config.cacheRoot, config.serverUrl, recoveryId), { force: true });
  } catch {
    // Best-effort cleanup after run_call returned a stable run_id.
  }
}

function planConfirmCacheId(planId) {
  return crypto.createHash("sha256").update(String(planId), "utf8").digest("base64url");
}

export function writePlanConfirm(config, { planId, confirmToken, expiresAt = null }) {
  if (typeof planId !== "string" || !planId.trim() || typeof confirmToken !== "string" || !confirmToken.trim()) {
    throw new TypeError("Invalid plan confirmation cache record");
  }
  writePrivateJson(callRecoveryCachePath(config.cacheRoot, config.serverUrl, planConfirmCacheId(planId.trim())), {
    schema_version: 1,
    created_at: new Date().toISOString(),
    plan_id: planId.trim(),
    confirm_token: confirmToken.trim(),
    timezone: null,
    expires_at: typeof expiresAt === "string" && expiresAt.trim() ? expiresAt.trim() : null,
  });
}

export function readPlanConfirm(config, planId) {
  if (typeof planId !== "string" || !planId.trim()) {
    return null;
  }
  const record = readJson(callRecoveryCachePath(config.cacheRoot, config.serverUrl, planConfirmCacheId(planId.trim())));
  if (
    record?.schema_version !== 1
    || record.plan_id !== planId.trim()
    || typeof record.confirm_token !== "string"
    || !record.confirm_token
  ) {
    return null;
  }
  if (record.expires_at !== null && record.expires_at !== undefined && record.expires_at !== "") {
    const expiresAt = parseIsoDate(record.expires_at);
    if (!expiresAt || Date.now() >= expiresAt.getTime()) {
      return null;
    }
  }
  return {
    planId: record.plan_id,
    confirmToken: record.confirm_token,
    expiresAt: typeof record.expires_at === "string" && record.expires_at ? record.expires_at : null,
  };
}

export function removeCallRecoveries(config) {
  const recoveryDir = callRecoveryCacheDir(config.cacheRoot, config.serverUrl);
  const existed = fs.existsSync(recoveryDir);
  try {
    fs.rmSync(recoveryDir, { recursive: true, force: true });
  } catch {
    // Match token cache cleanup: logout remains best effort.
  }
  return existed && !fs.existsSync(recoveryDir);
}
