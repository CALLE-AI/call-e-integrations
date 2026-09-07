/**
 * One boundary for every remote-supplied string.
 *
 * Anything that arrives from the network — an MCP JSON-RPC error, an upstream HTTP body, a
 * clarifying question inside a tool result — is untrusted. Before it can appear in a JSON
 * envelope, a log line, or a terminal, it passes through here.
 *
 * Order matters. Terminal control sequences are REMOVED first (not replaced with a space),
 * so that `access_token=abcd<ESC>[31m1234` canonicalizes to `access_token=abcd1234` and is
 * redacted as one credential rather than surviving as two innocent-looking halves. Secret
 * detection runs on that canonical text; only then is the result bounded.
 *
 * Both the core library and the CLI import these helpers so there is exactly one
 * implementation to review.
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

// A machine code: optional leading minus (JSON-RPC codes are negative integers), then a
// safe token. Anything else is dropped, never "cleaned" into something plausible.
const REMOTE_CODE_RE = /^-?[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;

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

/** Remove terminal control sequences and control characters entirely. Never throws. */
export function stripTerminalControls(value) {
  return String(value ?? "").replace(TERMINAL_CONTROL_RE, "");
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
 * A remote string made safe for display: controls removed (canonicalized), secrets redacted
 * on the canonical text, whitespace trimmed, length bounded. Returns undefined for
 * non-strings and empty results so callers can omit the field rather than emit an empty one.
 */
export function safeRemoteString(value, maxLength = REMOTE_MESSAGE_LIMIT) {
  if (typeof value !== "string") {
    return undefined;
  }
  const canonical = stripTerminalControls(value);
  const cleaned = redactSecrets(canonical).trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, maxLength);
}

/**
 * A remote machine code kept as an opaque token. Strings are control-stripped and matched
 * against the safe charset; numbers are accepted only as safe integers (so `-32000` is kept
 * and `1e100`, `NaN`, or `1.5` are dropped). Anything else is dropped.
 */
export function safeRemoteCode(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? String(value) : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = stripTerminalControls(value).trim();
  return REMOTE_CODE_RE.test(cleaned) ? cleaned : undefined;
}

/**
 * The only shape remote detail may take in a public envelope: at most `{ code, message }`,
 * each individually validated. Every field in the input other than those two is ignored.
 * Returns null when nothing survives, so callers omit the field.
 */
export function publicRemoteError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const code = safeRemoteCode(value.code);
  const message = safeRemoteString(value.message);
  if (code === undefined && message === undefined) {
    return null;
  }
  return {
    ...(code !== undefined ? { code } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}

/**
 * Reduce an arbitrary remote error body — a JSON-RPC error object, an HTTP body, a tool
 * result — to `publicRemoteError` shape. Reads only `code` (or a string `error`) and
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
      return publicRemoteError({ message: text });
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    // JSON scalar or array: keep a bounded excerpt of its serialisation, nothing else.
    return publicRemoteError({ message: typeof value === "string" ? value : JSON.stringify(value ?? "") });
  }

  const nested = value.error && typeof value.error === "object" && !Array.isArray(value.error) ? value.error : {};
  const code = nested.code ?? value.code ?? (typeof value.error === "string" ? value.error : undefined);
  const message = nested.message ?? value.message;
  return publicRemoteError({ code, message });
}
