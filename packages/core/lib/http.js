export class HttpStatusError extends Error {
  constructor(message, { statusCode, responseText, headers, url } = {}) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode ?? null;
    this.responseText = responseText ?? "";
    this.headers = headers ?? {};
    this.url = url ?? null;
  }
}

/**
 * The Node.js system error code behind a failed fetch, if any. `fetch` rejects with
 * `TypeError: fetch failed` whose `cause` is the system error (`ENOTFOUND`, `ECONNREFUSED`,
 * `CERT_HAS_EXPIRED`, ...), so the code may sit one or two levels down.
 */
export function causeCodeOf(error) {
  for (let cursor = error, depth = 0; cursor && depth < 4; cursor = cursor.cause, depth++) {
    if (typeof cursor.code === "string" && cursor.code) {
      return cursor.code;
    }
  }
  return null;
}

/**
 * No usable response: DNS failure, connection refused, TLS error, the client-side timeout, or
 * a body stream that failed after the headers arrived. `phase` distinguishes the last case
 * (`body`) from the rest (`connect`). This is the only condition that may be described to a
 * caller as a network problem; an unrelated local exception must not be classified as one.
 */
export class TransportError extends Error {
  constructor(message, { url, method, timedOut = false, phase = "connect", cause } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "TransportError";
    this.url = url ?? null;
    this.method = method ?? null;
    this.timedOut = Boolean(timedOut);
    /** "connect" when nothing arrived, "body" when the stream failed after headers. */
    this.phase = phase;
    this.code = timedOut ? "timeout" : causeCodeOf(cause);
  }
}

/**
 * A 2xx response whose body is not the JSON the caller needs.
 *
 * This exists because `JSON.parse` puts the offending input into its own message — Node emits
 * `Unexpected token R, "REMOTE-TEXT-MARKER" is not valid JSON` — so letting a native
 * SyntaxError escape would publish remote text as the CLI's locally-authored summary. The raw
 * body is kept here for sanitizing, and never in `message`.
 */
export class InvalidResponseError extends Error {
  constructor(message, { url, method, statusCode = null, responseText = "" } = {}) {
    super(message);
    this.name = "InvalidResponseError";
    this.url = url ?? null;
    this.method = method ?? null;
    this.statusCode = statusCode;
    this.responseText = responseText;
  }
}

export async function requestJson(method, url, { headers = {}, json = undefined, timeoutSeconds = 15, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is not available in this Node.js runtime");
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(Math.ceil(Number(timeoutSeconds || 15) * 1000), 1000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      throw new TransportError(`Request timed out for ${method} ${url}`, { url, method, timedOut: true });
    }
    throw new TransportError(`Request failed before a response was received for ${method} ${url}`, {
      url,
      method,
      cause: error,
    });
  }

  // Headers arrived; the body can still fail (timeout mid-stream, socket reset). That is a
  // transport failure too, and must not escape as a raw AbortError.
  let text;
  try {
    text = await response.text();
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      throw new TransportError(`Request timed out for ${method} ${url}`, {
        url,
        method,
        timedOut: true,
        phase: "body",
      });
    }
    throw new TransportError(`Response body could not be read for ${method} ${url}`, {
      url,
      method,
      phase: "body",
      cause: error,
    });
  }

  try {
    if (!response.ok) {
      // `statusText` is supplied by the server. Keep Error.message locally authored so core
      // consumers can print it without repeating the CLI's remote-text boundary themselves.
      throw new HttpStatusError(`HTTP ${response.status} for ${method} ${url}`, {
        statusCode: response.status,
        responseText: text,
        headers: Object.fromEntries(response.headers.entries()),
        url,
      });
    }
    if (!text.trim()) {
      return {};
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Deliberately not rethrowing the SyntaxError: its message quotes the response body.
      throw new InvalidResponseError(`Response body was not valid JSON for ${method} ${url}`, {
        url,
        method,
        statusCode: response.status,
        responseText: text,
      });
    }
    // Arrays are objects to `typeof`, but not what any caller of this helper wants.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidResponseError(`Response body was not a JSON object for ${method} ${url}`, {
        url,
        method,
        statusCode: response.status,
        responseText: text,
      });
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
