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
  cause?: unknown;
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

/** The request never received an HTTP response (DNS, connection, TLS, or timeout). */
export class TransportError extends Error {
  constructor(message: string, options?: TransportErrorOptions);
  url: string | null;
  method: string | null;
  timedOut: boolean;
  /** "timeout", or the Node.js error code of the cause (e.g. "ENOTFOUND"), or null. */
  code: string | null;
}

export function requestJson<T extends object = JsonObject>(
  method: string,
  url: string,
  options?: RequestJsonOptions,
): Promise<T>;
