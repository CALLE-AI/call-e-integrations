# @call-e/cursor-plugin

## 0.1.2

### Patch Changes

- [#115](https://github.com/CALLE-AI/call-e-integrations/pull/115) [`826905b`](https://github.com/CALLE-AI/call-e-integrations/commit/826905b7ca4cbf185f08c432eeaa2b1bf69e18cc) Thanks [@JJasonSun](https://github.com/JJasonSun)! - Run agent commands through a bundled launcher that verifies the MCP package and help before passing JSON argument arrays without a shell. Preserve structured login, help, and recovery arguments and integration attribution across Bash, PowerShell, and cmd, including installations with SDK releases that also export `calle`.

- [#114](https://github.com/CALLE-AI/call-e-integrations/pull/114) [`7768c20`](https://github.com/CALLE-AI/call-e-integrations/commit/7768c2030e868192ceb0acc64604a2ccdb4408d0) Thanks [@JJasonSun](https://github.com/JJasonSun)! - Guide agents to recover uncertain call starts with the original recovery ID, avoiding duplicate calls and keeping recovery data private.

## 0.1.1

### Patch Changes

- [#40](https://github.com/CALLE-AI/call-e-integrations/pull/40) [`095f47a`](https://github.com/CALLE-AI/call-e-integrations/commit/095f47a1c83568515e0eb3616b1cc721b94be109) Thanks [@Ray-56](https://github.com/Ray-56)! - Localize call status timestamps in the CLI and let plugin npx fallbacks use the latest CLI release.
