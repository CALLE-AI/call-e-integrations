# Earlier Standalone CALL-E Skills

The `calle-api-key` and `calle-mcp-oauth` implementations were merged into
`calle-connect`. The current personal testing candidate is
[`callev2` 2.1.0](callev2.md); the official `calle` cutover is a later step.

Install the chosen replacement explicitly. Same-name update checks do not infer
a renamed successor or authorize a change of publisher. Preserve credentials,
configuration references, call records, idempotency keys and local edits; disable
only the intended old entries and verify the loaded identity after host reload.
Migration never authorizes replaying a call or switching its recovery interface.

The [0.1.2 verification record](../verification/dual-skills-0.1.2.md) remains a
historical snapshot. This page is retained so earlier links still resolve.
