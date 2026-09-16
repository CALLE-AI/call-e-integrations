/**
 * Returns true if rawUrl is a safe URL that can be opened in a browser:
 * - any https: URL, or
 * - an http: URL whose hostname is a loopback address (localhost, 127.0.0.1, ::1).
 */
export function isSafeBrokerLoginUrl(rawUrl: unknown): boolean;

/**
 * Returns the canonicalised href of rawUrl when isSafeBrokerLoginUrl returns
 * true, or null otherwise.
 */
export function sanitizeBrokerLoginUrl(rawUrl: unknown): string | null;

import type { JsonObject, PendingLoginDocument, TokenDocument } from "./cache.js";

export interface BrokerRequestConfig {
  brokerBaseUrl: string;
  timeoutSeconds: number;
  integrationHeader?: string;
}

export interface CreateBrokerSessionConfig extends BrokerRequestConfig {
  serverUrl: string;
  authBaseUrl: string;
  channel: string;
  scope: string;
  clientName: string;
}

export interface BrokerLoginConfig extends CreateBrokerSessionConfig {
  cacheRoot: string;
  minTtlSeconds?: number;
  pollTimeoutSeconds?: number;
}

export interface BrokerSessionPayload extends JsonObject {
  session_id: string;
  session_secret: string;
  login_url: string;
  status?: string;
  expires_at?: string | null;
  poll_after_ms?: number | null;
}

export interface BrokerStatusPayload extends JsonObject {
  session_id?: string;
  session_secret?: string;
  login_url?: string;
  auth_url?: string;
  verification_url?: string;
  status?: string;
  expires_at?: string | null;
  error_message?: string | null;
  poll_after_ms?: number | null;
}

export interface BrokerRequestOptions {
  fetchImpl?: typeof globalThis.fetch;
}

export interface EnsurePendingLoginOptions extends BrokerRequestOptions {
  forceLogin?: boolean;
}

export interface LoginWithBrokerOptions extends EnsurePendingLoginOptions {
  openBrowser?: (loginUrl: string) => void | Promise<void>;
  sleepImpl?: (milliseconds: number) => void | Promise<void>;
  noBrowserOpen?: boolean;
  stderr?: (message: string) => void;
}

export interface PendingLoginResult {
  pending: PendingLoginDocument;
  created: boolean;
}

export interface BrokerLoginResult {
  status: "cached" | "logged_in";
  cachePath: string;
  pendingPath: string;
  tokenDocument: TokenDocument;
}

export function createBrokerSession(
  config: CreateBrokerSessionConfig,
  options?: BrokerRequestOptions,
): Promise<BrokerSessionPayload>;

export function getBrokerSessionStatus(
  config: BrokerRequestConfig,
  pending: PendingLoginDocument,
  options?: BrokerRequestOptions,
): Promise<BrokerStatusPayload>;

export function exchangeBrokerSession(
  config: BrokerRequestConfig,
  pending: PendingLoginDocument,
  options?: BrokerRequestOptions,
): Promise<TokenDocument>;

export function normalizePendingSession(sessionPayload: BrokerSessionPayload): PendingLoginDocument;

export function ensurePendingLogin(
  config: BrokerLoginConfig,
  options?: EnsurePendingLoginOptions,
): Promise<PendingLoginResult>;

export function loginWithBroker(
  config: BrokerLoginConfig,
  options?: LoginWithBrokerOptions,
): Promise<BrokerLoginResult>;
