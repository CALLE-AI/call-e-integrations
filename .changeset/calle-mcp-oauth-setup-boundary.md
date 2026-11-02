---
---

Release independently distributed standalone `calle` `1.0.4` as a patch:
keep MCP connection setup separate from API Key acquisition and storage.
Prefer host-managed OAuth discovery without a preliminary website visit or
manual metadata fetch. Derive any host-required OAuth fields or allowed hosts
from actual server metadata and the host schema; a separately hosted OAuth
authorization server remains part of the MCP route.

Preserve MCP-first routing, existing connection reuse, explicit interface
choices, API fallback conditions, and authentication failure boundaries.
Add synthetic acceptance variants and manual checks without claiming Muse
connection success or a confirmed cause for the connector error.

No npm package or plugin bump is needed. Synchronize current Skill/evaluation
metadata and installation guidance at `1.0.4`, and publish the accepted commit
under the new immutable `skills/calle@1.0.4` tag with the complete ZIPs, source
manifest, and checksums. Preserve earlier published artifacts. The new Agent
variants remain `NOT_RUN` until executed; observations from the pre-versioning
Muse candidate do not establish completed live-call acceptance for this release.
