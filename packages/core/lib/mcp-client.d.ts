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
  /** Ceiling for the tools/call request only. Defaults to config.timeoutSeconds. */
  timeoutSeconds?: number | null;
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
}

export function isUnauthorizedMcpError(error: unknown): error is McpHttpError;
export function currentTokenDocument(config: McpClientConfig): TokenDocument | null;
export function listMcpTools(options: McpRequestOptions): Promise<McpToolList>;
export function callMcpTool<TResult extends object = JsonObject>(
  options: CallMcpToolOptions,
): Promise<TResult>;
