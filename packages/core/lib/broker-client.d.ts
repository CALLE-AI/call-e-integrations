/**
 * Returns true if rawUrl is a safe URL that can be opened in a browser:
 * - any https: URL, or
 * - an http: URL whose hostname is a loopback address (localhost, 127.0.0.1, ::1).
 */
export function isSafeBrokerLoginUrl(rawUrl: unknown): boolean;

/**
 * Returns the canonicalised href of rawUrl when isSafeBrokerLoginUrl returns
 * true, or null otherwise.  Use this instead of rawUrl wherever the URL will
 * be displayed or opened to ensure only safe URLs reach the caller.
 */
export function sanitizeBrokerLoginUrl(rawUrl: unknown): string | null;

export interface BrokerSessionPayload {
  session_id: string;
  session_secret: string;
  login_url: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  error_message: string | null;
  poll_after_ms: number | null;
}

export interface BrokerLoginResult {
  status: "cached" | "logged_in";
  cachePath: string;
  pendingPath: string;
  tokenDocument: Record<string, unknown>;
}

export function createBrokerSession(
  config: Record<string, unknown>,
  options?: { fetchImpl?: typeof fetch }
): Promise<Record<string, unknown>>;

export function getBrokerSessionStatus(
  config: Record<string, unknown>,
  pending: BrokerSessionPayload,
  options?: { fetchImpl?: typeof fetch }
): Promise<Record<string, unknown>>;

export function exchangeBrokerSession(
  config: Record<string, unknown>,
  pending: BrokerSessionPayload,
  options?: { fetchImpl?: typeof fetch }
): Promise<Record<string, unknown>>;

export function normalizePendingSession(sessionPayload: Record<string, unknown>): BrokerSessionPayload;

export function ensurePendingLogin(
  config: Record<string, unknown>,
  options?: { fetchImpl?: typeof fetch; forceLogin?: boolean }
): Promise<{ pending: BrokerSessionPayload; created: boolean }>;

export function loginWithBroker(
  config: Record<string, unknown>,
  options?: {
    fetchImpl?: typeof fetch;
    openBrowser?: (url: string) => Promise<void>;
    sleepImpl?: (ms: number) => Promise<void>;
    forceLogin?: boolean;
    noBrowserOpen?: boolean;
    stderr?: (msg: string) => void;
  }
): Promise<BrokerLoginResult>;
