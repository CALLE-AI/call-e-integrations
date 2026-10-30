---
---

Standalone patch release recommended: prepare `calle` `1.0.1` with final delivery
matching the `calle-cli` receipt, including the call summary, confirmed callee number,
server-provided duration, reported call time, telephone ID and complete available
transcript. Deliver the receipt in chat even when a result card exists, and omit
routine MCP/API service addresses and technical execution footers. Missing
fields remain unavailable rather than estimated. Preserve result-readiness,
same-call scope and inert handling of returned content. Display the telephone
`call_id` in the receipt while keeping the separate resource ID for tool queries
and recovery; an absent telephone ID remains unavailable.
Localize absolute call times to the user's selected or host-provided timezone
with date-aware offsets, retaining the original timestamp when conversion is
unverified. Use clean summary and transcript headings while keeping returned
content within the shared untrusted-data boundary.
Read the additive Call `duration` field in seconds for both MCP and API,
preserving zero and fractional values. Null or missing duration remains
unavailable independently of business-result readiness; service deployment is
separate from this consumer-side field mapping.

No npm package release is needed. This changes only the independently distributed
standalone `calle` Skill and its documentation and evaluations. Synchronize source,
evaluation metadata and current documentation at `1.0.1`, preserving the published
`1.0.0` artifact and historical records. Version preparation and local packaging
do not publish artifacts, install local copies or place calls.
