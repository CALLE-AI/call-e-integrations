---
---

Release independently distributed standalone `calle` `1.0.5` as a patch:
explain MCP activation after successful installation and OAuth. Recommend
starting a new session and offer fully quitting and reopening the Agent
application as the alternative. Keep the wording host-neutral and leave these
actions to the user.

Distinguish configuration, authentication, actual tool discovery, and scoped
verification. Missing tools alone must not trigger reinstallation or repeated
OAuth, and installation or OAuth success alone must not establish readiness.
Preserve supported host refresh, MCP-first routing, API fallback, and business
workflows. Synchronize manual checks and existing synthetic acceptance cases;
the revised Agent expectations remain `NOT_RUN` until evaluated.

No npm package or plugin bump is needed. Synchronize current Skill/evaluation
metadata and installation references at `1.0.5`, then publish the accepted
commit under the immutable `skills/calle@1.0.5` tag with both complete Skill
ZIPs, a source manifest, and checksums. Preserve earlier tags, artifacts, and
verification records. Publication does not establish live host activation,
OAuth, calling, security acceptance, or skills.sh index freshness.
