---
"@call-e/core": patch
---

Add exponential backoff retry for transient HTTP errors (429, 5xx) and network failures in `requestJson`. Validate that `login_url` returned by the broker server uses the `https:` scheme before opening it in a browser (loopback addresses are exempt to support local development).
