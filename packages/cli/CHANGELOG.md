# @call-e/cli

## 0.3.9

### Patch Changes

- [#73](https://github.com/CALLE-AI/call-e-integrations/pull/73) [`89a5237`](https://github.com/CALLE-AI/call-e-integrations/commit/89a5237f9b0a8d82a79752c4f09dde2a8c9f9ba9) Thanks [@EazyHood](https://github.com/EazyHood)! - Reject duration flags that are not plain numbers, and bound the ones backed by a timer.

  `--timeout-seconds 30s` used to resolve to `NaN`, which reached the MCP timeout arithmetic where `Math.max(NaN, 1000)` stays `NaN` and `setTimeout` substitutes 1ms, so every call aborted before it left. Durations are now validated where they are read, with the offending flag named in the error.

  The constraints are per option rather than shared: `--min-ttl-seconds 0` keeps working, since zero disables the minimum remaining-lifetime window, while the timeout flags stay strictly positive. Timer-backed values are also capped at 2147483 seconds, because `setTimeout` collapses any longer delay to 1ms and would reproduce the same immediate abort.

- Updated dependencies [[`89a5237`](https://github.com/CALLE-AI/call-e-integrations/commit/89a5237f9b0a8d82a79752c4f09dde2a8c9f9ba9)]:
  - @call-e/core@0.2.5

## 0.3.8

### Patch Changes

- [#71](https://github.com/CALLE-AI/call-e-integrations/pull/71) [`bc70f48`](https://github.com/CALLE-AI/call-e-integrations/commit/bc70f486e996b7aff845c11242838d4e11e5e079) Thanks [@EazyHood](https://github.com/EazyHood)! - Open the browser without cmd.exe on Windows during `auth login`.

  `cmd /c start "" <url>` let cmd parse the OAuth URL, and `&` is a command separator there, so the URL was truncated at the first `&` (losing `redirect_uri`, `state` and `scope`) and the rest of the query string was run as shell commands. The opener is now `rundll32`, which takes the URL as a single argument, named by its fully qualified `%SystemRoot%\System32` path so the executable is not resolved through the current working directory.

- Updated dependencies [[`566008b`](https://github.com/CALLE-AI/call-e-integrations/commit/566008bab86008bc9019c45478122beeaffa5f60)]:
  - @call-e/core@0.2.4

## 0.3.7

### Patch Changes

- [#58](https://github.com/CALLE-AI/call-e-integrations/pull/58) [`14ba3d3`](https://github.com/CALLE-AI/call-e-integrations/commit/14ba3d3ffa7e33f3064e00fbe3376a1d5429dbba) Thanks [@Ray-56](https://github.com/Ray-56)! - Stop `calle call start` before execution when call planning requires clarification.

## 0.3.6

### Patch Changes

- [`6735d8a`](https://github.com/CALLE-AI/call-e-integrations/commit/6735d8a37ac3ca04a89d4ee2bc74afe44ed7a500) - Harden brokered auth cache reconciliation, prefer active pending logins over stale cached tokens, invalidate cached tokens rejected by MCP, and update Codex plugin auth recovery guidance.

- Updated dependencies [[`6735d8a`](https://github.com/CALLE-AI/call-e-integrations/commit/6735d8a37ac3ca04a89d4ee2bc74afe44ed7a500)]:
  - @call-e/core@0.2.2

## 0.3.5

### Patch Changes

- [#45](https://github.com/CALLE-AI/call-e-integrations/pull/45) [`ce345c3`](https://github.com/CALLE-AI/call-e-integrations/commit/ce345c3a6d447a7a533301254b69436ae110d76c) Thanks [@Ray-56](https://github.com/Ray-56)! - Document the complete `calle` CLI command and option reference.

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
