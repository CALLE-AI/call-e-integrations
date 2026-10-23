---
---

No npm package release: the standalone `callev2` Skill now supports the current
MCP `start_call` workflow in hosts with or without card UI. Server-owned
clarifications can be answered in chat, while explicit prepare-only and
card-Dial requests retain their execution boundaries. Recovery reuses the
original preparation and Call; legacy tools remain excluded.

Standalone minor release `2.1.0` adds this execution capability and preserves
the native-public-reader update fixes from `2.0.5`. Source/evaluation versions
and current version guidance are aligned for the user-authorized skills.sh
source publication. Do not replace an already published version's contents.
The deferred `calle` cutover and installed copies are outside this release.
The CLI and ecosystem plugin packages are unaffected.
