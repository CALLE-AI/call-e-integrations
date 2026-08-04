# @call-e/core

## 0.2.4

### Patch Changes

- [#72](https://github.com/CALLE-AI/call-e-integrations/pull/72) [`566008b`](https://github.com/CALLE-AI/call-e-integrations/commit/566008bab86008bc9019c45478122beeaffa5f60) Thanks [@EazyHood](https://github.com/EazyHood)! - Read numeric token expiries, and refresh instead of caching forever when one cannot be read.

  A broker that sends the expiry as epoch seconds or milliseconds arrived here as a string such as `"1700000000000"`, which `new Date()` reads as `Invalid Date`. A valid expiry was therefore indistinguishable from no expiry at all, and the token was cached as if it never expired. Numeric expiries are now parsed explicitly, with values below 1e11 taken as seconds and the rest as milliseconds; a negative or non-finite value is rejected rather than being turned into a nonsense date by `new Date("-1")`.

  An expiry that still cannot be read no longer means "never expires": the entry is treated as expired so the next call refreshes it.

## 0.2.3

### Patch Changes

- [#66](https://github.com/CALLE-AI/call-e-integrations/pull/66) [`5ffada9`](https://github.com/CALLE-AI/call-e-integrations/commit/5ffada9e6cea6c8d7315fc7c6caa476075e62377) Thanks [@Ray-56](https://github.com/Ray-56)! - Add TypeScript declarations and document the outbound tool, authentication
  preflight, and broker polling contracts.

## 0.2.2

### Patch Changes

- [`6735d8a`](https://github.com/CALLE-AI/call-e-integrations/commit/6735d8a37ac3ca04a89d4ee2bc74afe44ed7a500) - Harden brokered auth cache reconciliation, prefer active pending logins over stale cached tokens, invalidate cached tokens rejected by MCP, and update Codex plugin auth recovery guidance.

## 0.2.1

### Patch Changes

- Forward ChatGPT-compatible request metadata for CLI plan_call requests so planner runtime context can infer the caller timezone.

## 0.2.0

### Minor Changes

- [#10](https://github.com/CALLE-AI/call-e-integrations/pull/10) [`c231fba`](https://github.com/CALLE-AI/call-e-integrations/commit/c231fbace914f8da94add36db9589ad587ecf6ea) Thanks [@Ray-56](https://github.com/Ray-56)! - Add the shared `@call-e/core` runtime package and have the CLI consume it without changing CLI behavior.
