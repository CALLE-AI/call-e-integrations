export class HttpStatusError extends Error {
  constructor(message, { statusCode, responseText, headers } = {}) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode ?? null;
    this.responseText = responseText ?? "";
    this.headers = headers ?? {};
  }
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 500;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJson(method, url, { headers = {}, json = undefined, timeoutSeconds = 15, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is not available in this Node.js runtime");
  }

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutMs = Math.max(Math.ceil(Number(timeoutSeconds || 15) * 1000), 1000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timeout.unref === "function") {
      timeout.unref();
    }

    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new HttpStatusError(`Client error '${response.status} ${response.statusText}' for url '${url}'`, {
          statusCode: response.status,
          responseText: text,
          headers: Object.fromEntries(response.headers.entries()),
        });
        if (attempt < MAX_RETRY_ATTEMPTS && RETRYABLE_STATUS_CODES.has(response.status)) {
          attempt++;
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delayMs);
          continue;
        }
        throw error;
      }
      if (!text.trim()) {
        return {};
      }
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`Expected JSON object response for ${method} ${url}`);
      }
      return parsed;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Request timed out for ${method} ${url}`);
      }
      if (error instanceof HttpStatusError) {
        throw error;
      }
      // Retry on network-level errors (ECONNRESET, ECONNREFUSED, etc.)
      if (attempt < MAX_RETRY_ATTEMPTS) {
        attempt++;
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delayMs);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
