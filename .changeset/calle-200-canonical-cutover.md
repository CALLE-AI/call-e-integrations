---
---

No npm package release: publish the canonical standalone `calle` Skill as
`2.0.0`, adopting the complete published `callev2` `2.1.1` implementation.
This is a major standalone workflow and identity transition. Synchronize the
Skill metadata, source and update URLs, evaluation inputs, packaging, CI and
default installation guidance. Retain `calle-cli` for legacy compatibility and
retire the installable `callev2` testing entry; migration of installed testing
copies is outside this release scope.

Preserve historical acceptance records and independent CLI/plugin versions.
Codex MCP is the initial live acceptance baseline; unexecuted live checks must
remain explicit for that baseline, API and other clients. Source publication,
installation, host activation and skills.sh indexing are separate observations.
