#!/usr/bin/env bash

set -euo pipefail

PACKAGE_NAME="@call-e/openagent"
PLUGIN_ID="calle"
OPENCLAW_CONFIG_PATH="${HOME}/.openclaw/openclaw.json"

log() {
  printf '[openclaw-setup] %s\n' "$*"
}

fail() {
  printf '[openclaw-setup] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./openclaw-setup.sh

Installs the published OpenClaw plugin package, enables `calle`, merges the
required OpenClaw config, and optionally restarts the gateway after prompting.
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Required command not found: ${cmd}"
  fi
}

plugin_already_installed() {
  local list_output
  if ! list_output="$(openclaw plugins list 2>/dev/null)"; then
    return 1
  fi

  if printf '%s\n' "$list_output" | grep -Eq '(^|[[:space:][:punct:]])calle([[:space:][:punct:]]|$)|@call-e/openagent'; then
    return 0
  fi

  return 1
}

merge_openclaw_config() {
  mkdir -p "$(dirname "$OPENCLAW_CONFIG_PATH")"

  OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG_PATH" PLUGIN_ID="$PLUGIN_ID" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configPath = process.env.OPENCLAW_CONFIG_PATH;
const pluginId = process.env.PLUGIN_ID;

function fail(message) {
  console.error(`[openclaw-setup] ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

let data = {};

if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, "utf8").trim();
  if (raw.length > 0) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      fail(`Failed to parse ${configPath}: ${error.message}`);
    }
  }
}

if (!isObject(data)) {
  fail(`${configPath} must contain a JSON object at the root.`);
}

const plugins = data.plugins;
if (plugins !== undefined && !isObject(plugins)) {
  fail(`${configPath} field "plugins" must be a JSON object.`);
}

const nextPlugins = isObject(plugins) ? { ...plugins } : {};

const entries = nextPlugins.entries;
if (entries !== undefined && !isObject(entries)) {
  fail(`${configPath} field "plugins.entries" must be a JSON object.`);
}

const nextEntries = isObject(entries) ? { ...entries } : {};
const existingEntry = nextEntries[pluginId];

if (existingEntry !== undefined && !isObject(existingEntry)) {
  fail(`${configPath} field "plugins.entries.${pluginId}" must be a JSON object.`);
}

nextEntries[pluginId] = {
  ...(isObject(existingEntry) ? existingEntry : {}),
  enabled: true,
};

const allow = nextPlugins.allow;
if (allow !== undefined && !Array.isArray(allow)) {
  fail(`${configPath} field "plugins.allow" must be an array.`);
}

const nextAllow = Array.isArray(allow) ? [...allow] : [];
if (!nextAllow.includes(pluginId)) {
  nextAllow.push(pluginId);
}

nextPlugins.entries = nextEntries;
nextPlugins.allow = nextAllow;
data.plugins = nextPlugins;

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
NODE
}

prompt_restart() {
  local prompt_input
  prompt_input="/dev/stdin"

  if [ -r /dev/tty ]; then
    prompt_input="/dev/tty"
  elif [ ! -t 0 ]; then
    log "No interactive terminal detected. Skipped gateway restart."
    log "Run \`openclaw gateway restart\` manually when you are ready."
    return 0
  fi

  local answer
  read -r -p "Restart openclaw gateway now? [y/N] " answer <"$prompt_input" || true

  case "$answer" in
    [Yy]|[Yy][Ee][Ss])
      log "Restarting openclaw gateway"
      openclaw gateway restart
      ;;
    *)
      log "Skipped gateway restart"
      log "Run \`openclaw gateway restart\` manually when you are ready."
      ;;
  esac
}

main() {
  if [ "${1:-}" = "--help" ]; then
    usage
    exit 0
  fi

  if [ "$#" -ne 0 ]; then
    usage >&2
    exit 1
  fi

  require_command openclaw
  require_command node

  if plugin_already_installed; then
    log "${PLUGIN_ID} already appears in \`openclaw plugins list\`; skipping install"
  else
    log "Installing ${PACKAGE_NAME}"
    if ! openclaw plugins install "$PACKAGE_NAME"; then
      cat >&2 <<'EOF'
[openclaw-setup] Install failed.
[openclaw-setup] If the error mentions `429 Rate limit exceeded`, configure
[openclaw-setup] ~/.config/clawhub/config.json with a valid ClawHub access token
[openclaw-setup] and rerun this script.
EOF
      exit 1
    fi
  fi

  log "Enabling ${PLUGIN_ID}"
  openclaw plugins enable "$PLUGIN_ID"

  log "Merging ${OPENCLAW_CONFIG_PATH}"
  merge_openclaw_config

  prompt_restart

  log "Installed plugins"
  openclaw plugins list

  cat <<'EOF'
[openclaw-setup] Next checks:
[openclaw-setup] 1. Open OpenClaw Control UI and inspect `Tools -> Available Right Now`.
[openclaw-setup] 2. Confirm `calle_plan_call`, `calle_run_call`, and `calle_get_call_run` are present.
[openclaw-setup] 3. Trigger one protected tool call to start the browser login flow.
EOF
}

main "$@"
