# @call-e/claude-plugin

## 0.2.3

### Patch Changes

- [#115](https://github.com/CALLE-AI/call-e-integrations/pull/115) [`826905b`](https://github.com/CALLE-AI/call-e-integrations/commit/826905b7ca4cbf185f08c432eeaa2b1bf69e18cc) Thanks [@JJasonSun](https://github.com/JJasonSun)! - Run agent commands through a bundled launcher that verifies the MCP package and help before passing JSON argument arrays without a shell. Preserve structured login, help, and recovery arguments and integration attribution across Bash, PowerShell, and cmd, including installations with SDK releases that also export `calle`.

- [#114](https://github.com/CALLE-AI/call-e-integrations/pull/114) [`7768c20`](https://github.com/CALLE-AI/call-e-integrations/commit/7768c2030e868192ceb0acc64604a2ccdb4408d0) Thanks [@JJasonSun](https://github.com/JJasonSun)! - Guide agents to recover uncertain call starts with the original recovery ID, avoiding duplicate calls and keeping recovery data private.

## 0.2.2

### Patch Changes

- [#40](https://github.com/CALLE-AI/call-e-integrations/pull/40) [`095f47a`](https://github.com/CALLE-AI/call-e-integrations/commit/095f47a1c83568515e0eb3616b1cc721b94be109) Thanks [@Ray-56](https://github.com/Ray-56)! - Localize call status timestamps in the CLI and let plugin npx fallbacks use the latest CLI release.

## 0.2.1

### Patch Changes

- [`d4e6703`](https://github.com/CALLE-AI/call-e-integrations/commit/d4e6703db69dc5f1f21ee0d5dbb27c891dda0f51) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Document `/reload-plugins` as a Claude Code install step so the installed CALL-E skill is available in the current session.

## 0.2.0

### Minor Changes

- [#25](https://github.com/CALLE-AI/call-e-integrations/pull/25) [`e9fe72b`](https://github.com/CALLE-AI/call-e-integrations/commit/e9fe72be0fde12afb91d1b7a571bbb299f247735) Thanks [@Ray-56](https://github.com/Ray-56)! - Rename the Claude Code skill from `phone-call` to `calle`, changing the invocation from `/calle:phone-call` to `/calle:calle`.

## 0.1.0

### Minor Changes

- [#23](https://github.com/CALLE-AI/call-e-integrations/pull/23) [`4c13b2e`](https://github.com/CALLE-AI/call-e-integrations/commit/4c13b2ec8926abdbe2aa2f4f298a60ceafb42a00) Thanks [@Ray-56](https://github.com/Ray-56)! - Switch the Claude Code plugin to the shared `calle` CLI flow so authentication can be checked and recovered on use instead of requiring manual remote MCP authorization.
