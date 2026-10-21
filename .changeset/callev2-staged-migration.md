---
---

No npm package release: stage the standalone MCP/API Skill as `callev2` with
metadata version `2.0.0`, and rename the original standalone CLI Skill from
`calle` to `calle-cli`. The standalone identifier and installation path change
requires a major compatibility boundary; the later official `calle` takeover
and publication remain separate user actions.

Bind the test candidate's source and same-name update metadata to
`CALLE-AI/call-e-integrations/skills/callev2`. Synchronize UI metadata,
installation guidance, evaluation identity, packaging commands and CI. Keep
existing MCP connection names, private configuration references and historical
verification evidence intact. Existing installed copies need an explicit
migration; preserve credentials and recovery records.

Keep the `calle` executable, plugin payloads and package versions unchanged.
Private `@call-e/skills-sh-skill` remains at `0.1.0` and continues to own legacy
CLI validation and attribution. This empty changeset records the standalone
distribution change; Changesets does not publish root Skill ZIPs.
