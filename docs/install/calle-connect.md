# Earlier calle-connect Installation Guide

The standalone MCP/API implementation is now staged as
[`callev2` 2.0.1 for personal testing](callev2.md). Follow that guide for current
source installation, capability requirements, packaging and update-origin status.
The eventual official `calle` takeover remains subject to the
[migration gates](../calle-skill-migration-plan.md).

Existing `calle-connect` installations require an explicit installation of
`callev2`; same-name update checks cannot rename the Skill or change publishers.
Preserve user edits, credentials, configuration references, call records and
idempotency keys. Disable only the intended old standalone copy after verifying
the replacement in the selected host; do not replay calls.

The [Connect 0.2.0 record](../verification/calle-connect-0.2.0.md) and
[dated readiness record](../verification/calle-connect-release-readiness-2026-10-21.md)
remain historical evidence for their recorded inputs, not acceptance of the new
name or publication origin. This page remains as a pointer for existing links.
