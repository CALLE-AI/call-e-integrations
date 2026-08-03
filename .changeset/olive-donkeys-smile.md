---
"@call-e/core": patch
---

Read numeric token expiries, and refresh instead of caching forever when one cannot be read.

A broker that sends the expiry as epoch seconds or milliseconds arrived here as a string such as `"1700000000000"`, which `new Date()` reads as `Invalid Date`. A valid expiry was therefore indistinguishable from no expiry at all, and the token was cached as if it never expired. Numeric expiries are now parsed explicitly, with values below 1e11 taken as seconds and the rest as milliseconds; a negative or non-finite value is rejected rather than being turned into a nonsense date by `new Date("-1")`.

An expiry that still cannot be read no longer means "never expires": the entry is treated as expired so the next call refreshes it.
