---
---

No npm package release: publish standalone `callev2` metadata version `2.0.2`
to make automatic version checks resilient to cached or transient reader
responses. Keep the canonical update source, add a fresh anonymous request nonce,
and allow one bounded retry after a 404, timeout, or server error. Report an
attempted check that remains unknown instead of silently suppressing its result.

Synchronize update guidance and regression fixtures. Preserve user-installed
copies for update acceptance, historical version-comparison fixtures, business
permissions, and independent CLI and plugin package versions.
