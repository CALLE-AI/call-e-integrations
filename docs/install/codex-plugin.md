# Install The CALL-E Codex Plugin

The Codex plugin provides the `$calle` skill. It uses the shared `calle` CLI
instead of configuring Codex to connect directly to the remote MCP server.

## Prerequisites

The official marketplace install command requires `codex-cli >= 0.122.0`.
Check your version with:

```bash
codex --version
```

You do not need to install the shared CLI globally before installing the plugin.
The plugin uses the repository-local CLI when available, then a global `calle`
command when available, then falls back to `npx -y @call-e/cli@0.3.1`.

To authenticate before installing or using the plugin:

```bash
npx -y @call-e/cli@0.3.1 auth login
```

## Install

Add the latest released Codex marketplace from this repository:

```bash
codex plugin marketplace add CALLE-AI/call-e-integrations \
  --ref '@call-e/codex-plugin@latest' \
  --sparse .agents/plugins \
  --sparse packages/codex-plugin/plugin
```

`@call-e/codex-plugin@latest` is a Git tag updated by the release workflow after
`@call-e/codex-plugin` publishes. For a reproducible install, replace it with a
package-level release tag such as `@call-e/codex-plugin@<version>`.

Open Codex, run `/plugins`, choose the `CALL-E` marketplace, and install
`CALL-E`.

If you are pinned to a Codex CLI older than `0.122.0` and cannot use
`codex plugin marketplace add`, upgrade Codex when possible. As a manual
fallback, add the equivalent sparse payload from the same Git ref to your
workspace root:

```text
.agents/plugins/marketplace.json
packages/codex-plugin/plugin/
```

Keep those paths exactly as shown so the marketplace entry can resolve
`./packages/codex-plugin/plugin`.

## Use

After installing the plugin, invoke:

```text
$calle
```

Codex will use CALL-E for setup checks, authentication recovery, call planning,
planned call execution, and call status checks.

## More

See [packages/codex-plugin/README.md](../../packages/codex-plugin/README.md) for
package layout and local validation.
