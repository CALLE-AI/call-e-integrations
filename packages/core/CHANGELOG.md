# @call-e/core

## 0.2.2

### Patch Changes

- [`6735d8a`](https://github.com/CALLE-AI/call-e-integrations/commit/6735d8a37ac3ca04a89d4ee2bc74afe44ed7a500) - Harden brokered auth cache reconciliation, prefer active pending logins over stale cached tokens, invalidate cached tokens rejected by MCP, and update Codex plugin auth recovery guidance.

## 0.2.1

### Patch Changes

- Forward ChatGPT-compatible request metadata for CLI plan_call requests so planner runtime context can infer the caller timezone.

## 0.2.0

### Minor Changes

- [#10](https://github.com/CALLE-AI/call-e-integrations/pull/10) [`c231fba`](https://github.com/CALLE-AI/call-e-integrations/commit/c231fbace914f8da94add36db9589ad587ecf6ea) Thanks [@Ray-56](https://github.com/Ray-56)! - Add the shared `@call-e/core` runtime package and have the CLI consume it without changing CLI behavior.
