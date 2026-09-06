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
 * The request never received an HTTP response: DNS failure, connection refused, TLS error,
 * or the client-side timeout. This is the only condition that may be described to a caller as
 * a network problem. An unrelated local exception must not be classified as transport.
 */
export class TransportError extends Error {
  constructor(message, { url, method, timedOut = false, cause } = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "TransportError";
    this.url = url ?? null;
    this.method = method ?? null;
    this.timedOut = Boolean(timedOut);
    this.code = timedOut ? "timeout" : causeCodeOf(cause);
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

  try {
    const text = await response.text();
    if (!response.ok) {
      throw new HttpStatusError(`Client error '${response.status} ${response.statusText}' for url '${url}'`, {
        statusCode: response.status,
        responseText: text,
        headers: Object.fromEntries(response.headers.entries()),
        url,
      });
    }
    if (!text.trim()) {
      return {};
    }
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Expected JSON object response for ${method} ${url}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
