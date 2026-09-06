/**
 * One boundary for every remote-supplied string.
 *
 * Anything that arrives from the network — an MCP JSON-RPC error, an upstream HTTP body, a
 * clarifying question inside a tool result — is untrusted. Before it can appear in a JSON
 * envelope, a log line, or a terminal, it passes through here: terminal control sequences are
 * removed, token-like material is redacted, and the length is bounded. Both the core library
 * and the CLI import these helpers so there is exactly one implementation to review.
 */

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const BACKSLASH = String.fromCharCode(0x5c);
const C0_START = String.fromCharCode(0x00);
const C0_END = String.fromCharCode(0x1f);
const DEL = String.fromCharCode(0x7f);
const C1_END = String.fromCharCode(0x9f);

// CSI (colours, cursor movement, erase), OSC (titles, hyperlinks, terminated by BEL or ESC \),
// two-character ESC sequences, and the C0 / DEL / C1 control ranges (covers CR, LF, TAB).
// The regex source is assembled from character codes so the file itself contains no control
// bytes and no escape sequence that a tool or editor could rewrite.
const LBRACKET = `${BACKSLASH}[`;
const RBRACKET = `${BACKSLASH}]`;
const TERMINAL_CONTROL_RE = new RegExp(
  [
    `${ESC}${LBRACKET}[0-?]*[ -/]*[@-~]`,
    `${ESC}${RBRACKET}[^${BEL}${ESC}]*(?:${BEL}|${ESC}${BACKSLASH}${BACKSLASH})`,
    `${ESC}[@-_]`,
    `[${C0_START}-${C0_END}${DEL}-${C1_END}]`,
  ].join("|"),
  "gu",
);

export const REMOTE_MESSAGE_LIMIT = 500;
export const REMOTE_CODE_LIMIT = 64;

const REMOTE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;

const REDACTION = "[redacted]";

// Token-like material that may appear inside an otherwise-allowlisted message string.
// Each pattern is deliberately broad: a false redaction costs a little readability, a missed
// secret ends up in an agent transcript.
const SECRET_PATTERNS = [
  // "Bearer abc..." / "Basic abc..."
  /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  // key=value / key: value / "key": "value" for sensitive key names
  /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|passwd|api[_-]?key|apikey|authorization|cookie|session[_-]?secret|private[_-]?key|client[_-]?secret)\b(\s*["']?\s*[:=]\s*["']?)[^\s"',;)}\]]{4,}/giu,
  // Well-known prefixed credentials
  /\b(?:sk|pk|rk|tok|rt|xox[abpr]|ghp|gho|ghu|ghs|AKIA|iams|calle)[_-][A-Za-z0-9_-]{12,}/gu,
  // Long opaque runs: hex, base64url, uuid-ish
  /\b[A-Fa-f0-9]{32,}\b/gu,
  /\b[A-Za-z0-9_-]{40,}\b/gu,
];

/** Replace terminal control sequences with a single space. Never throws. */
export function stripTerminalControls(value) {
  return String(value ?? "").replace(TERMINAL_CONTROL_RE, " ");
}

/** Redact credential-shaped substrings. Never throws. */
export function redactSecrets(value) {
  let out = String(value ?? "");
  out = out.replace(SECRET_PATTERNS[0], (_m, scheme) => `${scheme} ${REDACTION}`);
  out = out.replace(SECRET_PATTERNS[1], (_m, key, sep) => `${key}${sep}${REDACTION}`);
  for (const pattern of SECRET_PATTERNS.slice(2)) {
    out = out.replace(pattern, REDACTION);
  }
  return out;
}

/**
 * A remote string made safe for display: controls stripped, secrets redacted, whitespace
 * trimmed, length bounded. Returns undefined for non-strings and empty results so callers can
 * omit the field rather than emit an empty one.
 */
export function safeRemoteString(value, maxLength = REMOTE_MESSAGE_LIMIT) {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = redactSecrets(stripTerminalControls(value)).trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, maxLength);
}

/**
 * A remote machine code kept as an opaque token. Anything outside the safe character set is
 * dropped rather than "cleaned" into something that merely looks valid.
 */
export function safeRemoteCode(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = stripTerminalControls(value).trim();
  return REMOTE_CODE_RE.test(cleaned) ? cleaned : undefined;
}

/**
 * Reduce an arbitrary remote error body — a JSON-RPC error object, an HTTP body, a tool
 * result — to at most `{ code, message }`. Reads only `code` (or a string `error`) and
 * `message`, at the top level or nested under `error`; everything else is dropped unread.
 */
export function sanitizeRemoteError(body) {
  let value = body;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    try {
      value = JSON.parse(text);
    } catch {
      const message = safeRemoteString(text);
      return message ? { message } : null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    // JSON scalar or array: keep a bounded excerpt of its serialisation, nothing else.
    const message = safeRemoteString(typeof value === "string" ? value : JSON.stringify(value ?? ""));
    return message ? { message } : null;
  }

  const nested = value.error && typeof value.error === "object" && !Array.isArray(value.error) ? value.error : {};
  const codeValue = nested.code ?? value.code ?? (typeof value.error === "string" ? value.error : undefined);
  const code = typeof codeValue === "number" ? String(codeValue) : safeRemoteCode(codeValue);
  const message = safeRemoteString(nested.message ?? value.message);

  if (code === undefined && message === undefined) {
    return null;
  }
  return {
    ...(code !== undefined ? { code } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}
