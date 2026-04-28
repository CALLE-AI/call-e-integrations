import crypto from "node:crypto";
import path from "node:path";

import { readJson, writePrivateJson } from "./cache.js";

const TELEMETRY_CACHE_FILE = "telemetry.json";

function telemetryCachePath(config) {
  return path.join(config.cacheRoot, TELEMETRY_CACHE_FILE);
}

function isValidAnonymousId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/iu.test(value);
}

function anonymousId(config) {
  const filePath = telemetryCachePath(config);
  const existing = readJson(filePath);
  if (isValidAnonymousId(existing?.anonymous_id)) {
    return existing.anonymous_id;
  }

  const generated = crypto.randomUUID();
  try {
    writePrivateJson(filePath, {
      anonymous_id: generated,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Telemetry must never break CLI execution.
  }
  return generated;
}

function hashText(value) {
  if (!value) {
    return null;
  }
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function messageId(anonymousIdValue, eventName) {
  return crypto
    .createHash("sha256")
    .update(`${anonymousIdValue}:${eventName}:${Date.now()}:${crypto.randomUUID()}`, "utf8")
    .digest("hex");
}

function urlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function sanitizeTelemetryValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function sanitizeTelemetryKey(key) {
  return /^[A-Za-z0-9_.-]{1,64}$/u.test(key) ? key : null;
}

function sanitizeTelemetryProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [sanitizeTelemetryKey(key), sanitizeTelemetryValue(value)])
      .filter(([key, value]) => key && value !== undefined),
  );
}

export function buildTelemetryPayload(config, eventName, properties = {}) {
  const id = anonymousId(config);
  const integrationContext = config.integrationContext || {
    source: "cli",
    integration: "cli",
    version: config.cliVersion || "unknown",
  };

  return {
    type: "track",
    event: eventName,
    anonymousId: id,
    messageId: messageId(id, eventName),
    timestamp: new Date().toISOString(),
    context: {
      source: integrationContext.source || "cli",
      channel: config.channel,
      surface_name: "cli",
      surface_type: "command",
      integration_context: {
        source: integrationContext.source || "cli",
        integration: integrationContext.integration || "cli",
        version: integrationContext.version || config.cliVersion || "unknown",
      },
    },
    properties: {
      entity_type: "cli_installation",
      entity_id: id,
      cli_version: config.cliVersion,
      channel: config.channel,
      base_url_host: urlHost(config.baseUrl),
      server_host: urlHost(config.serverUrl),
      server_url_hash: hashText(config.serverUrl),
      integration_source: integrationContext.source || "cli",
      integration_name: integrationContext.integration || "cli",
      integration_version: integrationContext.version || config.cliVersion || "unknown",
      ...sanitizeTelemetryProperties(properties),
    },
  };
}

export async function sendTelemetryEvent(config, eventName, properties = {}, { fetchImpl = globalThis.fetch } = {}) {
  if (!config.telemetryEnabled || !config.telemetryUrl || typeof fetchImpl !== "function") {
    return false;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(Math.ceil(Number(config.telemetryTimeoutSeconds || 1.5) * 1000), 250);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  try {
    const response = await fetchImpl(config.telemetryUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTelemetryPayload(config, eventName, properties)),
      signal: controller.signal,
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function createTelemetryClient({ config, fetchImpl = globalThis.fetch } = {}) {
  return {
    capture: (eventName, properties = {}) => sendTelemetryEvent(config, eventName, properties, { fetchImpl }),
  };
}
