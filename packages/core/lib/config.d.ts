export interface ResolveServerUrlOptions {
  serverUrl?: string;
  baseUrl?: string;
  channel?: string;
  defaultChannel?: string;
}

export interface ResolveAuthBaseUrlOptions {
  authBaseUrl?: string;
  baseUrl?: string;
  serverUrl?: string;
}

export interface ResolveBrokerBaseUrlOptions {
  brokerBaseUrl?: string;
  baseUrl?: string;
}

export function expandHomePath(value: string): string;
export function normalizeBaseUrl(baseUrl: string): string;
export function resolveServerUrl(options?: ResolveServerUrlOptions): string;
export function resolveAuthBaseUrl(options?: ResolveAuthBaseUrlOptions): string;
export function resolveBrokerBaseUrl(options?: ResolveBrokerBaseUrlOptions): string;
