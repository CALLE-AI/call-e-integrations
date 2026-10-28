---
---

No npm package release: publish standalone `calle` as `1.0.0` at the user's
explicit request. Preserve the MCP/API workflow and result-handling protections
from `2.0.1`, synchronize current metadata, evaluation versions and install
guidance, and retain earlier `2.0.x` tags and release artifacts unchanged.

Release decision: Needs maintainer decision, resolved by the user's explicit
selection of `1.0.0`. This standalone version reset uses a new immutable
`skills/calle@1.0.0` release; no CLI/plugin package bump is needed. Existing
`2.0.x` installations require explicit complete-directory installation to enter
the `1.x` sequence because numeric downgrade suppression remains unchanged.
Historical fixtures, verification records and security findings retain their
original versions and scope. Publication does not establish a skills.sh refresh
or a new security-audit result.
