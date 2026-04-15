import {
  DEFAULT_CACHE_ROOT,
  DEFAULT_CHANNEL,
  DEFAULT_CLIENT_NAME,
  DEFAULT_MIN_TTL_SECONDS,
  DEFAULT_SCOPE,
  DEFAULT_TIMEOUT_SECONDS,
  expandHomePath,
  normalizeBaseUrl,
} from "./brokered-auth.js";

export const DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com";

export function getPluginConfig(api) {
  const config = api.pluginConfig ?? {};
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  const channel = config.channel || DEFAULT_CHANNEL;

  return {
    baseUrl,
    brokerBaseUrl: normalizeBaseUrl(config.brokerBaseUrl || baseUrl),
    serverUrl: config.serverUrl || `${baseUrl}/mcp/${channel}`,
    authBaseUrl: normalizeBaseUrl(config.authBaseUrl || baseUrl),
    channel,
    cacheRoot: expandHomePath(config.cacheRoot || DEFAULT_CACHE_ROOT),
    scope: config.scope || DEFAULT_SCOPE,
    clientName: config.clientName || DEFAULT_CLIENT_NAME,
    timeoutSeconds: Number(config.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS),
    minTtlSeconds: Number(config.minTtlSeconds || DEFAULT_MIN_TTL_SECONDS),
  };
}
