# @call-e/codex-plugin

## 0.1.8

### Patch Changes

- [#21](https://github.com/CALLE-AI/call-e-integrations/pull/21) [`bf8b95d`](https://github.com/CALLE-AI/call-e-integrations/commit/bf8b95d0c05addc1301c290aa048836890df8f73) Thanks [@Ray-56](https://github.com/Ray-56)! - Document the current CLI and Codex plugin install paths, link package READMEs to
  the shared install docs, and add MCP client examples.

## 0.1.7

### Patch Changes

- [#18](https://github.com/CALLE-AI/call-e-integrations/pull/18) [`de30ea6`](https://github.com/CALLE-AI/call-e-integrations/commit/de30ea6039c415a4c9b6511753a6de57381d041a) Thanks [@Ray-56](https://github.com/Ray-56)! - Document latest Codex marketplace installation through the release-managed
  `@call-e/codex-plugin@latest` Git ref.

## 0.1.6

### Patch Changes

- Forward ChatGPT-compatible request metadata for CLI plan_call requests so planner runtime context can infer the caller timezone.

## 0.1.5

### Patch Changes

- [#16](https://github.com/CALLE-AI/call-e-integrations/pull/16) [`110b9af`](https://github.com/CALLE-AI/call-e-integrations/commit/110b9afa3ee78ec60601d8b2bd41682a64e58ee2) Thanks [@Ray-56](https://github.com/Ray-56)! - Clarify the minimum supported Codex CLI version for marketplace installation and document the manual sparse payload fallback for older Codex releases.

## 0.1.4

### Patch Changes

- [#14](https://github.com/CALLE-AI/call-e-integrations/pull/14) [`24c9e0d`](https://github.com/CALLE-AI/call-e-integrations/commit/24c9e0d4a97dfcb35acc866c3ae0b62ced28ef2c) Thanks [@Ray-56](https://github.com/Ray-56)! - Add start-only brokered login output for integrations and update the Codex plugin authorization flow guidance.

## 0.1.3

### Patch Changes

- [`c31d99b`](https://github.com/CALLE-AI/call-e-integrations/commit/c31d99b5186077081763210d7bbaf6242ed5e472) Thanks [@Ray-56](https://github.com/Ray-56)! - Add best-effort CLI telemetry and integration attribution for broker and MCP requests.

## 0.1.2

### Patch Changes

- [`ec70577`](https://github.com/CALLE-AI/call-e-integrations/commit/ec705777f94adfe1929a12931b49a0a02c805dd9) Thanks [@Ray-56](https://github.com/Ray-56)! - Improve Codex plugin metadata for marketplace discovery and trust scanning.

## 0.1.1

### Patch Changes

- [`23b69e8`](https://github.com/CALLE-AI/call-e-integrations/commit/23b69e8a67c1d5e8376bc81345df4a4f006c57f0) Thanks [@Ray-56](https://github.com/Ray-56)! - Allow the bundled CALL-E skill to fall back to `npx -y @call-e/cli@0.1.0` when no repository-local or global CLI is available.

## 0.1.0

### Minor Changes

- [#3](https://github.com/CALLE-AI/call-e-integrations/pull/3) [`5e23f42`](https://github.com/CALLE-AI/call-e-integrations/commit/5e23f426f5aa714fb0c56d8801274b3b5ac8b50f) Thanks [@Ray-56](https://github.com/Ray-56)! - Add the CLI package that ships the calle CLI for brokered MCP login and config output.
  Add the Codex marketplace entry and plugin bundle for using the calle CLI from Codex.
