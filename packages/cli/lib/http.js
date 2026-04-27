export class HttpStatusError extends Error {
  constructor(message, { statusCode, responseText, headers } = {}) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode ?? null;
    this.responseText = responseText ?? "";
    this.headers = headers ?? {};
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
      throw new HttpStatusError(`Client error '${response.status} ${response.statusText}' for url '${url}'`, {
        statusCode: response.status,
        responseText: text,
        headers: Object.fromEntries(response.headers.entries()),
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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out for ${method} ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
