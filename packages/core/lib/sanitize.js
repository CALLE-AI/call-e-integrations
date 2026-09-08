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
// 8-bit forms of the same introducers. A terminal accepts these as readily as the ESC-prefixed
// versions, so anything that only understands the 7-bit form can be walked straight past.
const CSI_8BIT = String.fromCharCode(0x9b);
const OSC_8BIT = String.fromCharCode(0x9d);
const ST_8BIT = String.fromCharCode(0x9c);

/*
 * Removal happens by *sequence*, not by character.
 *
 * Deleting a lone introducer leaves its parameters behind as ordinary text, which is a bypass
 * rather than a fix: `access_to<U+009D>8;;x<BEL>ken=secret` becomes `access_to8;;xken=secret`,
 * the key name no longer matches, and the credential survives redaction untouched. So a CSI or
 * OSC introducer — in either its 7-bit or 8-bit form — consumes its whole sequence.
 *
 * Invisible format characters are removed for the same reason. A zero-width space or word
 * joiner splits a token in two without changing a single visible glyph, and half a secret in a
 * log is still a secret.
 */
const LBRACKET = `${BACKSLASH}[`;
const RBRACKET = `${BACKSLASH}]`;
const TERMINAL_CONTROL_RE = new RegExp(
  [
    // CSI: ESC [ ... final, or the 8-bit U+009B introducer.
    `(?:${ESC}${LBRACKET}|${CSI_8BIT})[0-?]*[ -/]*[@-~]`,
    // OSC: ESC ] ... terminated by BEL, ESC \, or the 8-bit ST. Either introducer.
    `(?:${ESC}${RBRACKET}|${OSC_8BIT})[^${BEL}${ESC}${ST_8BIT}]*(?:${BEL}|${ESC}${BACKSLASH}${BACKSLASH}|${ST_8BIT})`,
    // Two-character ESC sequences.
    `${ESC}[@-_]`,
    // Whatever control characters remain, including CR, LF and TAB.
    `[${C0_START}-${C0_END}${DEL}-${C1_END}]`,
    // Invisible format and default-ignorable characters: zero widths, joiners, bidi controls,
    // soft hyphen, BOM.
    `[${BACKSLASH}p{Cf}${BACKSLASH}p{Default_Ignorable_Code_Point}]`,
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

// Every control and invisible character, removed individually without consuming a sequence's
// parameters. This is the *wrong* thing to display, and the right thing to run detection over
// as well — see canonicalForms.
const LONE_CONTROL_RE = new RegExp(
  `[${C0_START}-${C0_END}${DEL}-${C1_END}]|[${BACKSLASH}p{Cf}${BACKSLASH}p{Default_Ignorable_Code_Point}]`,
  "gu",
);

/**
 * The two readings of a hostile string, because they disagree and both matter.
 *
 * Consuming a whole sequence is what a terminal does, and it is what makes output safe to
 * print. But a sequence swallows its final byte, and an attacker can choose a final byte that
 * belongs to the word we are looking for: `Bea<U+009B>rer secret` is a valid CSI sequence
 * ending in `r`, so correct stripping yields `Beaer` and the credential no longer looks like
 * one. Removing controls individually keeps `Bearer` intact but leaves sequence parameters
 * embedded, which is the bypass the other reading catches.
 *
 * Neither reading is sufficient alone, so detection runs over both.
 */
function canonicalForms(value) {
  const text = String(value ?? "");
  return [text.replace(TERMINAL_CONTROL_RE, ""), text.replace(LONE_CONTROL_RE, "")];
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

  const [display, alternate] = canonicalForms(value);
  const redacted = redactSecrets(display);

  // If the other reading of the same bytes contains a credential that this one does not, the
  // string is hiding something in its control characters. There is no reliable way to map that
  // finding back onto the displayed form, so the whole thing goes.
  if (redacted === display && redactSecrets(alternate) !== alternate) {
    return REDACTION;
  }

  const cleaned = redacted.trim();
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
  const trimmed = value.trim();
  // A code carrying control characters is dropped, never repaired. Accepting the remainder
  // would turn `bad<ESC>[31m` into the entirely plausible `bad`, which is precisely the
  // "clean it into something that looks valid" behaviour this function refuses to do.
  if (stripTerminalControls(trimmed) !== trimmed) {
    return undefined;
  }
  return REMOTE_CODE_RE.test(trimmed) ? trimmed : undefined;
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
