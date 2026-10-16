---
"@call-e/cli": patch
---

Fix Windows shell injection in browser opener (use rundll32 instead of cmd /c start), remove home-directory paths from public JSON outputs (cache_path, pending_cache_path), omit --cache-root from suggested commands when using the default location, and restore safe URL sanitization in all login-URL output fields.
