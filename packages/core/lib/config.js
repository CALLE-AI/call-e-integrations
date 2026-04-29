import os from "node:os";
import path from "node:path";

import {
  DEFAULT_CHANNEL,
} from "./constants.js";

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

export function resolveServerUrl({ serverUrl, baseUrl, channel, defaultChannel = DEFAULT_CHANNEL } = {}) {
  if (serverUrl) {
    return serverUrl;
  }
  const resolvedChannel = String(channel || defaultChannel).trim().toLowerCase() || defaultChannel;
  return `${normalizeBaseUrl(baseUrl)}/mcp/${resolvedChannel}`;
}

export function resolveAuthBaseUrl({ authBaseUrl, baseUrl, serverUrl } = {}) {
  if (authBaseUrl) {
    return normalizeBaseUrl(authBaseUrl);
  }
  if (baseUrl) {
    return normalizeBaseUrl(baseUrl);
  }
  const parsed = new URL(serverUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

export function resolveBrokerBaseUrl({ brokerBaseUrl, baseUrl } = {}) {
  return normalizeBaseUrl(brokerBaseUrl || baseUrl);
}
