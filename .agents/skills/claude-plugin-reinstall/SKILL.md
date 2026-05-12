---
name: claude-plugin-reinstall
description: Use this project-local skill when the user asks Codex to reinstall, refresh, update, debug, remove, delete, uninstall, or locally test the CALL-E Claude Code plugin, especially after editing packages/claude-plugin/plugin, renaming the Claude skill, or seeing Claude plugin scope/cache errors.
---

# Claude Plugin Reinstall

Use this skill to refresh or reinstall the CALL-E Claude Code plugin during
local development of this repository.

If the user asks to delete, remove, uninstall, or clean local CALL-E Claude
plugin state, follow the clean removal workflow below instead of the reinstall
workflow.

## Key Model

- `.claude-plugin/marketplace.json` is the marketplace catalog.
- `packages/claude-plugin/plugin/` is the plugin source.
- The current Claude skill lives in
  `packages/claude-plugin/plugin/skills/calle/` and is invoked as
  `/calle:calle`. Do not verify with the pre-rename `phone-call` entrypoint.
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
- Clean removal means removing Claude's local state for the CALL-E plugin. Do
  not delete repository source such as `packages/claude-plugin/plugin/`,
  `.claude-plugin/marketplace.json`, or `.agents/skills/...` unless the user
  explicitly asks to delete source files.

## Clean Removal Workflow

Use this branch when the user asks to delete, remove, uninstall, or clean local
CALL-E Claude plugin state.

First inspect active Claude processes and all known state sources. A running
Claude session can keep `/plugin` populated from memory and can rewrite
`known_marketplaces.json` after it was cleaned:

```bash
ps -axo pid,ppid,pgid,stat,etime,command | rg '(^|/| )claude( |$)|Claude.app|claude-code|call-e|calle' || true
node -e 'const fs=require("fs"); for (const f of [`${process.env.HOME}/.claude.json`,`${process.env.HOME}/.claude/settings.json`,`${process.env.HOME}/.claude/settings.local.json`,`${process.env.HOME}/.claude/plugins/known_marketplaces.json`,`${process.env.HOME}/.claude/plugins/installed_plugins.json`,`${process.cwd()}/.claude/settings.local.json`]) { console.log("FILE", f); if (!fs.existsSync(f)) { console.log("missing"); continue; } console.log(JSON.stringify(JSON.parse(fs.readFileSync(f,"utf8")), null, 2)); }'
rg -n -i --hidden --glob '!**/node_modules/**' --glob '!**/.git/**' --glob '!**/logs/**' --glob '!**/*.log' '\bcalle\b|calle_|call-e|phone-call|call_e|plugin_calle' ~/.claude.json ~/.claude .claude "$HOME/Library/Application Support/Claude" 2>/dev/null || true
find ~/.claude .claude "$HOME/Library/Application Support/Claude" -maxdepth 12 \( -iname '*call-e*' -o -iname '*phone-call*' -o -iname '*calle*' \) -print 2>/dev/null | sort
```

If a user-owned `claude` process is active and the user wants `/plugin` to stop
showing `calle` immediately, stop that process before cleaning. Otherwise tell
the user to exit/restart Claude Code after cleanup.

Remove all CALL-E/CALLE plugin state from these locations:

- `~/.claude/settings.json`
  - `enabledPlugins["calle@call-e-claude"]`
  - `extraKnownMarketplaces["call-e-claude"]`
- `~/.claude/plugins/known_marketplaces.json`
  - `call-e-claude`
- `~/.claude/plugins/installed_plugins.json`
  - `plugins["calle@call-e-claude"]`
- `~/.claude/settings.local.json`
  - permission entries matching CALL-E/CALLE plugin commands
- project `.claude/settings.local.json`
  - `extraKnownMarketplaces["call-e-claude"]`
  - permission entries matching `mcp__plugin_calle_calle`, `CALLE_`, `call-e`,
    `phone-call`, or `calle`
- `~/.claude.json`
  - `skillUsage` keys such as `calle:calle` and `calle:phone-call`
  - `githubRepoPaths` keys such as `calle-ai/call-e-integrations`
  - project entries whose path is CALL-E/CALLE-specific if the user asked for
    all CALL-E/CALLE traces
- directories:
  - `~/.claude/plugins/marketplaces/call-e-claude`
  - `~/.claude/plugins/cache/call-e-claude`

For aggressive "all CALL-E/CALLE traces" cleanup, also remove or filter local
history/cache files containing direct CALL-E/CALLE terms under:

- `~/.claude/backups`
- `~/.claude/debug`
- `~/.claude/history.jsonl`
- `~/.claude/projects`
- `~/.claude/sessions`
- `~/.claude/file-history`
- `~/.claude/ide`
- `$HOME/Library/Application Support/Claude`

Use structured JSON parsing for JSON files and guard every filesystem deletion
so it stays under `~/.claude`, project `.claude`, or
`$HOME/Library/Application Support/Claude`. Use a case-insensitive cleanup
pattern that includes `calle`, `CALLE_`, `call-e`, `phone-call`, `call_e`, and
`plugin_calle`.

After cleanup, verify with all of the following. The grep/find commands should
produce no CALL-E/CALLE output, and `known_marketplaces.json` should only show
non-CALL-E marketplaces:

```bash
node -e 'const fs=require("fs"); for (const f of [`${process.env.HOME}/.claude.json`,`${process.env.HOME}/.claude/settings.json`,`${process.env.HOME}/.claude/settings.local.json`,`${process.env.HOME}/.claude/plugins/known_marketplaces.json`,`${process.env.HOME}/.claude/plugins/installed_plugins.json`,`${process.cwd()}/.claude/settings.local.json`]) { console.log("FILE", f); if (!fs.existsSync(f)) { console.log("missing"); continue; } const data=JSON.parse(fs.readFileSync(f,"utf8")); console.log(/\bcalle\b|calle_|call-e|phone-call|call_e|plugin_calle/i.test(JSON.stringify(data)) ? "HAS_MATCH" : "clean"); }'
rg -n -i --hidden --glob '!**/node_modules/**' --glob '!**/.git/**' --glob '!**/logs/**' --glob '!**/*.log' '\bcalle\b|calle_|call-e|phone-call|call_e|plugin_calle' ~/.claude.json ~/.claude .claude "$HOME/Library/Application Support/Claude" 2>/dev/null || true
find ~/.claude .claude "$HOME/Library/Application Support/Claude" -maxdepth 12 \( -iname '*call-e*' -o -iname '*phone-call*' -o -iname '*calle*' \) -print 2>/dev/null | sort
ps -axo pid,ppid,pgid,stat,etime,command | rg '(^|/| )claude( |$)|Claude.app|claude-code' || true
```

Report whether an active Claude process had to be stopped, which state sources
were cleaned, whether repository source was left untouched, and whether Claude
Code still needs to be restarted.

## Reinstall Decision Tree

Run from the repository root:

```bash
claude plugin validate .
claude plugin validate packages/claude-plugin/plugin
test -f packages/claude-plugin/plugin/skills/calle/SKILL.md
test -f packages/claude-plugin/plugin/skills/calle/references/commands.md
```

Then inspect the current Claude state. Prefer focused summaries over dumping
full settings files:

```bash
claude --version
claude plugin --help
node -e 'const fs=require("fs"); const home=process.env.HOME; for (const file of ["settings.json","plugins/known_marketplaces.json","plugins/installed_plugins.json"]) { const p=`${home}/.claude/${file}`; console.log(`FILE ${p}`); if (!fs.existsSync(p)) { console.log("missing"); continue; } const data=JSON.parse(fs.readFileSync(p,"utf8")); if (file==="settings.json") console.log(JSON.stringify({permissionsDefaultMode:data.permissions?.defaultMode, enabledPlugins:data.enabledPlugins}, null, 2)); else console.log(JSON.stringify(data, null, 2)); }'
find ~/.claude/plugins/cache -maxdepth 5 -type f 2>/dev/null | sort
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
- If `installed_plugins.json` points at a cache path that does not exist, report
  that Claude's install record is stale and reinstall through the interactive
  slash commands below.
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

For quick iteration on plugin files without marketplace cache/version behavior,
first check whether the installed shell CLI exposes `--plugin-dir`:

```bash
claude --plugin-dir packages/claude-plugin/plugin --help
claude --plugin-dir packages/claude-plugin/plugin
```

Use this to verify skill text, `.mcp.json`, and manifest changes while editing
only when the option is accepted. Some Claude Code 2.x shell builds reject
`--plugin-dir`; in that case, rely on `claude plugin validate`, then reload or
reinstall through the interactive `/plugin ...` slash commands. Use marketplace
install/update only when testing the real user installation path.

## Verification

After reinstall or reload, verify from this repository in Claude Code:

```text
/doctor
/plugin manage
/calle:calle Verify CALL-E setup only; do not place a real phone call.
```

If `/plugin manage` does not show `calle`, inspect:

- invalid settings reported by `/doctor`
- `enabledPlugins.calle@call-e-claude` in `~/.claude/settings.json`
- `call-e-claude` in `~/.claude/plugins/known_marketplaces.json`
- stale or missing install cache paths in
  `~/.claude/plugins/installed_plugins.json`
- whether the selected marketplace source is local directory or GitHub

Always tell the user what happened after the workflow finishes: whether the
plugin was already installed, whether local or GitHub source was used, what was
changed, what validation passed or failed, and whether Claude Code still needs
a restart or `/reload-plugins`.
