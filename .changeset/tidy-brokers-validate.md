---
"@call-e/core": patch
"@call-e/cli": patch
---

Validate broker session IDs, secrets, and login URLs for their cache, request,
header, and browser-opening sinks before persisting pending authentication state.
Preserve one-argument normalization for custom broker origins and safely encode
opaque session IDs, with an optional focused origin policy for callers handling
their own cache or display.
Suppress untrusted cached login URLs in CLI status and authorization guidance.
