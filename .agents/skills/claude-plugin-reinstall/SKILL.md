---
name: claude-plugin-reinstall
description: Use this project-local skill when the user asks Codex to reinstall, refresh, update, debug, or locally test the CALL-E Claude Code plugin, especially after editing packages/claude-plugin/plugin or seeing Claude plugin scope/cache errors.
---

# Claude Plugin Reinstall

Use this skill to refresh or reinstall the CALL-E Claude Code plugin during
local development of this repository.

## Key Model

- `.claude-plugin/marketplace.json` is the marketplace catalog.
- `packages/claude-plugin/plugin/` is the plugin source.
- Claude Code 2.x may expose plugin install/update/manage only as interactive
  slash commands (`/plugin ...`) even when the shell command
  `claude plugin validate` exists. Do not assume shell commands such as
  `claude plugin install`, `claude plugin list`, or
  `claude plugin marketplace update` are available.
- Claude loads installed/enabled plugins from Claude settings and known
  marketplaces. If a settings file is invalid, Claude can ignore
  `enabledPlugins`, which makes an installed plugin appear missing.
- A local development install should prefer the current repository as a
  directory marketplace when `.claude-plugin/marketplace.json` and
  `packages/claude-plugin/plugin/.claude-plugin/plugin.json` exist.
- If the local repository source is not available, use the GitHub marketplace
  source from the install docs.
- Because this plugin declares an explicit version in
  `packages/claude-plugin/plugin/.claude-plugin/plugin.json`, Claude Code may
  skip updates when files change but the version stays the same.
- Do not manually rewrite Claude's plugin cache as the normal reinstall path.
  Cache edits are a last-resort debug workaround and must be reported clearly.

## Reinstall Decision Tree

Run from the repository root:

```bash
claude plugin validate .
claude plugin validate packages/claude-plugin/plugin
```

Then inspect the current Claude state:

```bash
claude --version
claude plugin --help
test -f ~/.claude/settings.json && sed -n '1,220p' ~/.claude/settings.json
test -f ~/.claude/plugins/known_marketplaces.json && sed -n '1,220p' ~/.claude/plugins/known_marketplaces.json
test -f ~/.claude/plugins/installed_plugins.json && sed -n '1,220p' ~/.claude/plugins/installed_plugins.json
```

Also run `/doctor` in Claude, or start a short debug Claude session, when the
plugin is missing in the UI. Fix invalid settings before reinstalling. In
Claude Code 2.0.14, for example, `permissions.defaultMode` must be one of
`default`, `acceptEdits`, `bypassPermissions`, or `plan`; an invalid value can
cause `enabledPlugins` to be ignored.

Choose the reinstall path:

- If `calle@call-e-claude` is already enabled and the marketplace source points
  at this repository, validate the local source, fix any invalid settings, then
  restart Claude Code or run `/reload-plugins` when available.
- If `calle@call-e-claude` is not enabled, but this repository has a valid local
  marketplace and plugin source, install from the local directory marketplace
  first:

  ```text
  /plugin marketplace add .
  /plugin install calle@call-e-claude
  ```

- If the local repository source is missing or invalid, install from GitHub:

  ```text
  /plugin marketplace add https://github.com/CALLE-AI/call-e-integrations.git#@call-e/claude-plugin@latest
  /plugin install calle@call-e-claude
  ```

- If shell plugin management commands are available in the installed Claude
  version, the same source priority applies: local directory first, GitHub
  second. Validate command availability with `claude plugin --help` before
  using shell install/update/list commands.
- After install or settings changes, restart Claude Code or run
  `/reload-plugins` when available.

## Fastest Debug Path

For quick iteration on plugin files without marketplace cache/version behavior:

```bash
claude --plugin-dir packages/claude-plugin/plugin
```

Use this to verify skill text, `.mcp.json`, and manifest changes while editing.
Use marketplace install/update only when testing the real user installation
path.

## Verification

After reinstall or reload, verify from this repository in Claude Code:

```text
/doctor
/plugin manage
/calle:phone-call Verify CALL-E setup only; do not place a real phone call.
```

If `/plugin manage` does not show `calle`, inspect:

- invalid settings reported by `/doctor`
- `enabledPlugins.calle@call-e-claude` in `~/.claude/settings.json`
- `call-e-claude` in `~/.claude/plugins/known_marketplaces.json`
- whether the selected marketplace source is local directory or GitHub

Always tell the user what happened after the workflow finishes: whether the
plugin was already installed, whether local or GitHub source was used, what was
changed, what validation passed or failed, and whether Claude Code still needs
a restart or `/reload-plugins`.
