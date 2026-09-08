import type { JsonObject } from "./cache.js";

export interface HttpStatusErrorOptions {
  statusCode?: number | null;
  responseText?: string;
  headers?: Record<string, string>;
  url?: string | null;
}

export interface TransportErrorOptions {
  url?: string | null;
  method?: string | null;
  timedOut?: boolean;
  /** "connect" when nothing arrived; "body" when the stream failed after headers. */
  phase?: "connect" | "body";
  cause?: unknown;
}

export interface InvalidResponseErrorOptions {
  url?: string | null;
  method?: string | null;
  statusCode?: number | null;
  responseText?: string;
}

export interface RequestJsonOptions {
  headers?: HeadersInit;
  json?: unknown;
  timeoutSeconds?: number;
  fetchImpl?: typeof globalThis.fetch;
}

export class HttpStatusError extends Error {
  constructor(message: string, options?: HttpStatusErrorOptions);
  statusCode: number | null;
  responseText: string;
  headers: Record<string, string>;
  url: string | null;
}

/** The Node.js system error code behind a failed fetch (`ENOTFOUND`, `ECONNREFUSED`, ...), or null. */
export function causeCodeOf(error: unknown): string | null;

/**
 * No usable response: DNS, connection, TLS, a timeout, or a body stream that failed after the
 * headers arrived. `phase` distinguishes the last case from the rest.
 */
export class TransportError extends Error {
  constructor(message: string, options?: TransportErrorOptions);
  url: string | null;
  method: string | null;
  timedOut: boolean;
  phase: "connect" | "body";
  /** "timeout", or the Node.js error code of the cause (e.g. "ENOTFOUND"), or null. */
  code: string | null;
}

/**
 * A 2xx response whose body was not the expected JSON. The raw body lives in `responseText`
 * for sanitizing; `message` never quotes it.
 */
export class InvalidResponseError extends Error {
  constructor(message: string, options?: InvalidResponseErrorOptions);
  url: string | null;
  method: string | null;
  statusCode: number | null;
  responseText: string;
}

export function requestJson<T extends object = JsonObject>(
  method: string,
  url: string,
  options?: RequestJsonOptions,
): Promise<T>;
