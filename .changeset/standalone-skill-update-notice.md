---
---

No npm package release: retain use-time version checks and user-approved download
guidance in the unified calle-connect Skill. Both MCP and API use one version
and official GitHub source. Public checks are anonymous and remote content stays
data; downloads use a fixed commit, remain inside the selected Skill directory,
and are inspected before installation. All update steps use non-CLI host
facilities; the separate MCP connection-management exception does not apply.

The standalone source is independently versioned at 0.2.0 and remains outside
existing npm and plugin payloads. Publication, host acceptance and the migration
of previously installed calle-api-key or calle-mcp-oauth copies are separate
rollout work; a same-name updater cannot perform that migration automatically.
