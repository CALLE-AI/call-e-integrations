export const DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com";
export const DEFAULT_CHANNEL = "openagent_oauth";
export const DEFAULT_SCOPE = "openid email profile";
export const DEFAULT_CLIENT_NAME = "calle Login";
export const DEFAULT_TIMEOUT_SECONDS = 15;
export const DEFAULT_MIN_TTL_SECONDS = 300;
export const DEFAULT_MCP_CLIENT_NAME = "calle";
export const DEFAULT_MCP_CLIENT_VERSION = "unknown";
export const MCP_PROTOCOL_VERSION = "2025-11-25";
// Node keeps a setTimeout delay in a signed 32 bit int and turns anything it cannot
// store into a 1ms delay, so a request armed with a longer ceiling aborts at once
// instead of waiting. Every timer-backed duration in this repo is bounded by this,
// which is why the value is shared rather than declared per package.
// https://nodejs.org/api/timers.html#settimeoutcallback-delay-args
export const MAX_TIMER_DELAY_MS = 2_147_483_647;
export const MAX_TIMER_SECONDS = Math.floor(MAX_TIMER_DELAY_MS / 1000);
export const SESSION_SECRET_HEADER = "X-OpenAgent-Session-Secret";
export const INTEGRATION_HEADER = "X-Call-E-Integration";
