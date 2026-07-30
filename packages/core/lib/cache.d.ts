export type JsonObject = Record<string, unknown>;

export interface AccessToken extends JsonObject {
  access_token: string;
}

export interface TokenDocument extends JsonObject {
  token: AccessToken;
  expires_at?: string | null;
}

export interface PendingLoginDocument extends JsonObject {
  session_id: string;
  session_secret: string;
  login_url: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  error_message: string | null;
  poll_after_ms: number | null;
}

export interface TokenCacheConfig {
  cacheRoot: string;
  serverUrl: string;
}

export function serverHash(serverUrl: string): string;
export function tokenCachePath(cacheRoot: string, serverUrl: string): string;
export function pendingCachePath(cacheRoot: string, serverUrl: string): string;
export function ensurePrivateDir(dirPath: string): void;
export function readJson<T extends object = JsonObject>(filePath: string): T | null;
export function writePrivateJson(filePath: string, payload: unknown): void;
export function removeFile(filePath: string): void;
export function removeTokenCache(config: TokenCacheConfig): void;
export function parseIsoDate(value: unknown): Date | null;
export function tokenIsUsable(cacheDocument: unknown, minTtlSeconds?: number): cacheDocument is TokenDocument;
export function readPendingLogin(filePath: string): PendingLoginDocument | null;
export function pendingIsExpired(pending: Pick<PendingLoginDocument, "expires_at"> | null | undefined): boolean;
