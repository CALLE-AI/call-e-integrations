export const REMOTE_MESSAGE_LIMIT: number;
export const REMOTE_CODE_LIMIT: number;

export interface SanitizedRemoteError {
  code?: string;
  message?: string;
}

export function stripTerminalControls(value: unknown): string;
export function redactSecrets(value: unknown): string;
export function safeRemoteString(value: unknown, maxLength?: number): string | undefined;
export function safeRemoteCode(value: unknown): string | undefined;
/** The only shape remote detail may take in a public envelope. */
export function publicRemoteError(value: unknown): SanitizedRemoteError | null;
export function sanitizeRemoteError(body: unknown): SanitizedRemoteError | null;
