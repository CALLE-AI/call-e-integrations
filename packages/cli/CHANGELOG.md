# @call-e/cli

## 0.3.4

### Patch Changes

- [#40](https://github.com/CALLE-AI/call-e-integrations/pull/40) [`095f47a`](https://github.com/CALLE-AI/call-e-integrations/commit/095f47a1c83568515e0eb3616b1cc721b94be109) Thanks [@Ray-56](https://github.com/Ray-56)! - Localize call status timestamps in the CLI and let plugin npx fallbacks use the latest CLI release.

## 0.3.3

### Patch Changes

- [#38](https://github.com/CALLE-AI/call-e-integrations/pull/38) [`5e788f8`](https://github.com/CALLE-AI/call-e-integrations/commit/5e788f881e2d855b27d8cd19d4a0c914cda70d58) Thanks [@Ray-56](https://github.com/Ray-56)! - Add `calle call start` so agent-facing skills can plan and run calls without exposing execution confirmation data.

## 0.3.2

### Patch Changes

- [#21](https://github.com/CALLE-AI/call-e-integrations/pull/21) [`bf8b95d`](https://github.com/CALLE-AI/call-e-integrations/commit/bf8b95d0c05addc1301c290aa048836890df8f73) Thanks [@Ray-56](https://github.com/Ray-56)! - Document the current CLI and Codex plugin install paths, link package READMEs to
  the shared install docs, and add MCP client examples.

## 0.3.1

### Patch Changes

- Forward ChatGPT-compatible request metadata for CLI plan_call requests so planner runtime context can infer the caller timezone.

- Updated dependencies []:
  - @call-e/core@0.2.1

## 0.3.0

### Minor Changes

- [#14](https://github.com/CALLE-AI/call-e-integrations/pull/14) [`24c9e0d`](https://github.com/CALLE-AI/call-e-integrations/commit/24c9e0d4a97dfcb35acc866c3ae0b62ced28ef2c) Thanks [@Ray-56](https://github.com/Ray-56)! - Add start-only brokered login output for integrations and update the Codex plugin authorization flow guidance.

## 0.2.1

### Patch Changes

- [#10](https://github.com/CALLE-AI/call-e-integrations/pull/10) [`c231fba`](https://github.com/CALLE-AI/call-e-integrations/commit/c231fbace914f8da94add36db9589ad587ecf6ea) Thanks [@Ray-56](https://github.com/Ray-56)! - Add the shared `@call-e/core` runtime package and have the CLI consume it without changing CLI behavior.

- Updated dependencies [[`c231fba`](https://github.com/CALLE-AI/call-e-integrations/commit/c231fbace914f8da94add36db9589ad587ecf6ea)]:
  - @call-e/core@0.2.0

## 0.2.0

### Minor Changes

- [`c31d99b`](https://github.com/CALLE-AI/call-e-integrations/commit/c31d99b5186077081763210d7bbaf6242ed5e472) Thanks [@Ray-56](https://github.com/Ray-56)! - Add best-effort CLI telemetry and integration attribution for broker and MCP requests.

## 0.1.0

### Minor Changes

- [#3](https://github.com/CALLE-AI/call-e-integrations/pull/3) [`5e23f42`](https://github.com/CALLE-AI/call-e-integrations/commit/5e23f426f5aa714fb0c56d8801274b3b5ac8b50f) Thanks [@Ray-56](https://github.com/Ray-56)! - Add the CLI package that ships the calle CLI for brokered MCP login and config output.
  Add the Codex marketplace entry and plugin bundle for using the calle CLI from Codex.
