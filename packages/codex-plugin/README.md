# @call-e/codex-plugin

Codex plugin bundle for using CALL-E through the shared `calle` CLI.

The plugin provides the `$calle` skill for setup checks, authentication
recovery, phone call planning, planned call execution, and call status checks.
The CLI remains responsible for authentication, token caching, JSON output, and
MCP error handling.

For user installation steps, see
[docs/install/codex-plugin.md](../../docs/install/codex-plugin.md).

## Package Layout

```text
plugin/
  .codex-plugin/plugin.json
  README.md
  SECURITY.md
  skills/
    calle/
      SKILL.md
      agents/openai.yaml
      references/commands.md
```

The repo-local marketplace lives at `.agents/plugins/marketplace.json` and
points to `./packages/codex-plugin/plugin`.

## Local Validation

From the repository root:

```bash
pnpm --filter @call-e/codex-plugin check
pnpm --filter @call-e/codex-plugin test
pnpm --filter @call-e/codex-plugin pack:dry-run
```

For local development from a clone, restart Codex from this repository, open
`/plugins`, choose the `CALL-E` marketplace, and install `CALL-E`.

## Telemetry / Usage Data

When Codex runs the bundled CALL-E skill, the skill invokes the shared `calle`
CLI with source attribution environment variables so local telemetry and
service-side call data can be grouped as `codex/codex_plugin/<version>`.

CLI telemetry is best-effort and is used to diagnose installation,
authentication, MCP tool availability, and drop-off before a first `plan_call`
reaches the server. It does not include phone numbers, call goals, OAuth
tokens, broker login URLs, full argument JSON, transcripts, or contact data.

Disable CLI telemetry with `DO_NOT_TRACK=1`, `CALLE_TELEMETRY=0`, or by adding
`--no-telemetry` to a direct `calle` command. Broker and MCP requests still
create service-side security, audit, and business operation logs needed to
authenticate users and run calls.

## Marketplace Boundary

Keep the Codex marketplace entry at the repository root. This lets the monorepo
expose one Codex marketplace while the plugin implementation stays scoped to
this package. Future ecosystem integrations should use their own
ecosystem-specific entry points.
