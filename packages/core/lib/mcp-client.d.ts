import type { JsonObject, TokenDocument } from "./cache.js";

export interface McpClientConfig {
  cacheRoot: string;
  serverUrl: string;
  timeoutSeconds: number;
  minTtlSeconds?: number;
  integrationHeader?: string;
  mcpClientName?: string;
  mcpClientVersion?: string;
  cliVersion?: string;
}

export interface McpHttpErrorOptions {
  statusCode?: number | null;
  responseText?: string;
  payload?: unknown;
  headers?: Record<string, string>;
  code?: string;
  transport?: boolean;
  timedOut?: boolean;
  phase?: "connect" | "body" | null;
  cause?: unknown;
}

export interface McpToolDefinition extends JsonObject {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

export interface McpToolList extends JsonObject {
  tools?: McpToolDefinition[];
}

export interface McpRequestOptions {
  config: McpClientConfig;
  fetchImpl?: typeof globalThis.fetch;
}

export interface CallMcpToolOptions extends McpRequestOptions {
  toolName: string;
  toolArguments?: JsonObject;
  requestMeta?: JsonObject | null;
  timeoutSeconds?: number;
}

export class AuthRequiredError extends Error {
  constructor(message?: string);
}

export class McpHttpError extends Error {
  constructor(message: string, options?: McpHttpErrorOptions);
  statusCode: number | null;
  responseText: string;
  payload: unknown;
  headers: Record<string, string>;
  code: string;
  /** True only when no usable response arrived: timeout, DNS, connection, TLS, or a body
   * stream that failed after the headers. `phase` says which. */
  transport: boolean;
  timedOut: boolean;
  /** "connect" or "body" on a transport failure; null otherwise. */
  phase: "connect" | "body" | null;
  /** "timeout", the system error code behind a rejected fetch (e.g. "ENOTFOUND"), or null. */
  causeCode: string | null;
  /** Sanitized, bounded `{ code?, message? }` from the remote body, or null. Safe to display. */
  remoteError: { code?: string; message?: string } | null;
}

export function isUnauthorizedMcpError(error: unknown): error is McpHttpError;
export function currentTokenDocument(config: McpClientConfig): TokenDocument | null;
export function listMcpTools(options: McpRequestOptions): Promise<McpToolList>;
export function callMcpTool<TResult extends object = JsonObject>(
  options: CallMcpToolOptions,
): Promise<TResult>;
