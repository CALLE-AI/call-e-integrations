---
---

Release independently distributed standalone `calle` `1.0.3` as a patch:
default new tasks to MCP in supporting hosts, including authorized setup
and OAuth when the CALL-E connection is missing. Inspect native connection or
custom-connector management before declaring MCP unsupported. When the Agent
cannot complete a setup step, provide the remaining user step without switching
to API Key setup.

Preserve explicit interface choices, existing-call recovery and pre-write API
fallback for an explicitly unsupported host or a required capability confirmed
missing by complete discovery. Add synthetic routing cases for missing connectors
with native or user-managed setup and synchronize current documentation.

No npm package or plugin version bump is needed. Synchronize current Skill and
evaluation metadata and installation guidance at `1.0.3`, and publish the
complete source and ZIP under the immutable `skills/calle@1.0.3` tag. Offline
checks and publication do not establish Muse activation or live acceptance.
