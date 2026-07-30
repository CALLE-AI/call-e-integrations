import type { JsonObject } from "./cache.js";

export interface HttpStatusErrorOptions {
  statusCode?: number | null;
  responseText?: string;
  headers?: Record<string, string>;
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
}

export function requestJson<T extends object = JsonObject>(
  method: string,
  url: string,
  options?: RequestJsonOptions,
): Promise<T>;
