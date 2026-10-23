---
---

No npm package release: the standalone `callev2` Skill now supports the current
MCP `start_call` workflow in hosts with or without card UI. Server-owned
clarifications can be answered in chat, while explicit prepare-only and
card-Dial requests retain their execution boundaries. Recovery reuses the
original preparation and Call; legacy tools remain excluded.

Minor release recommended for the standalone Skill because this adds a supported
execution capability. Publish under a new standalone version (suggested `2.1.0`)
after aligning source/evaluation versions and completing acceptance; do not
replace an already published version's contents. This record does not bump
versions, publish, replace installed Skills, or perform the deferred `calle`
cutover. The CLI and ecosystem plugin packages are unaffected.
