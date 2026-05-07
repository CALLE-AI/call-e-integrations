import { pendingCachePath, readJson, removeFile, tokenCachePath, tokenIsUsable } from "./cache.js";
import { DEFAULT_BASE_URL, DEFAULT_CHANNEL, DEFAULT_CLIENT_NAME, DEFAULT_SCOPE, resolveRuntimeConfig } from "./config.js";
import { ensurePendingLogin, loginWithBroker } from "./broker-client.js";
import {
  AuthRequiredError,
  McpHttpError,
  callMcpTool,
  isUnauthorizedMcpError,
  listMcpTools,
} from "./mcp-client.js";
import { createTelemetryClient } from "./telemetry.js";

class InvalidArgumentsError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidArgumentsError";
  }
}

export function preAuthHelpMessage(loginUrl) {
  return `Hi, I'm CALL-E 👋

I can help you make phone calls, ask for information, and handle phone-related tasks. I'll also keep you updated on the call status, what was discussed, and the key points.
Before we officially begin, I'll send you the call goal for confirmation.

Before we start, please complete authorization here:
${loginUrl}`;
}

export const POST_AUTH_HELP_MESSAGE = `Great, authorization is complete ✨

- If you already shared the call goal, I'll continue as planned.
- If you haven't, that's okay. I can help you place a test call first, or start a real call directly.

You can tell me:
- Your phone number: Used only for this service. We will not disclose it to anyone else, including the callee.
- What you want me to say: For example, "This is a test call from CALL-E. Wishing you a good day, and asking if there's anything you'd like to share."

I'll keep you updated on the phone status, call content, and summary.`;

const POST_AUTH_HELP_HINT_TYPE = "post_auth_help";
const PRE_AUTH_HELP_HINT_TYPE = "pre_auth_help";

function printHelp(stdout) {
  stdout(`Usage: calle <command> [options]

Commands:
  auth login     Start brokered login and cache the token locally
  auth status    Show local token cache status
  auth logout    Remove local token and pending login cache
  mcp config     Print MCP client configuration JSON
  mcp tools      List tools from the configured MCP server
  mcp call       Call an arbitrary MCP tool with --args-json
  call plan      Plan a phone call via plan_call
  call run       Run a planned phone call, then fetch status once
  call status    Query a call run via get_call_run

Common options:
  --base-url <url>             Default: ${DEFAULT_BASE_URL}
  --broker-base-url <url>      Default: --base-url
  --server-url <url>           Default: <base-url>/mcp/<channel>
  --auth-base-url <url>        Default: --base-url
  --channel <name>             Default: ${DEFAULT_CHANNEL}
  --client-name <name>         Default: ${DEFAULT_CLIENT_NAME}
  --scope <scope>              Default: ${DEFAULT_SCOPE}
  --cache-root <path>
  --timeout-seconds <seconds>
  --poll-timeout-seconds <seconds>
  --server-name <name>          Default: calle
  --force-login
  --start-only
  --no-browser-open
  --no-telemetry
  --json

MCP/call options:
  --args-json <json>           Arguments for calle mcp call
  --to-phone <phone>           Repeatable for calle call plan
  --goal <text>
  --language <language>
  --region <region>
  --timezone <iana>            Timezone hint for relative scheduling in call plan
  --plan-id <id>
  --confirm-token <token>
  --run-id <id>
  --cursor <cursor>
  --limit <number>
`);
}

function toCamelCase(optionName) {
  return optionName.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

function parseOptions(argv) {
  const options = {};
  const positional = [];
  const booleanOptions = new Set([
    "force-login",
    "start-only",
    "no-browser-open",
    "no-telemetry",
    "telemetry",
    "json",
    "help",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const eqIndex = withoutPrefix.indexOf("=");
    const optionName = eqIndex >= 0 ? withoutPrefix.slice(0, eqIndex) : withoutPrefix;
    const key = toCamelCase(optionName);
    const setOption = (value) => {
      if (options[key] === undefined) {
        options[key] = value;
      } else if (Array.isArray(options[key])) {
        options[key].push(value);
      } else {
        options[key] = [options[key], value];
      }
    };
    if (booleanOptions.has(optionName)) {
      setOption(eqIndex >= 0 ? withoutPrefix.slice(eqIndex + 1) !== "false" : true);
      continue;
    }
    if (eqIndex >= 0) {
      setOption(withoutPrefix.slice(eqIndex + 1));
      continue;
    }
    index += 1;
    if (index >= argv.length) {
      throw new Error(`Missing value for --${optionName}`);
    }
    setOption(argv[index]);
  }
  return { options, positional };
}

function firstOptionValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function optionValues(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function requireStringOption(options, key, optionName) {
  const value = firstOptionValue(options[key]);
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidArgumentsError(`Missing required ${optionName}`);
  }
  return value.trim();
}

function optionalStringOption(options, key) {
  const value = firstOptionValue(options[key]);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalEnvString(env, key) {
  const value = env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIanaTimezone(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).resolvedOptions().timeZone;
    if (typeof resolved !== "string" || !resolved.includes("/")) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function osTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function resolvePlanTimezone(options, env = process.env) {
  const explicitTimezone = optionalStringOption(options, "timezone");
  if (explicitTimezone) {
    return normalizeIanaTimezone(explicitTimezone);
  }

  const envTimezone = optionalEnvString(env, "CALLE_TIMEZONE");
  if (envTimezone) {
    return normalizeIanaTimezone(envTimezone);
  }

  return normalizeIanaTimezone(osTimezone());
}

function timezoneOffsetMinutes(timezone, instant = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const wallClockAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    const offset = Math.round((instant.getTime() - wallClockAsUtc) / 60000);
    return Number.isInteger(offset) ? offset : null;
  } catch {
    return null;
  }
}

function parsePositiveInteger(value, optionName) {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(firstOptionValue(value));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentsError(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function parseJsonObject(value, optionName) {
  const raw = firstOptionValue(value);
  if (raw === undefined) {
    return {};
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not object");
    }
    return parsed;
  } catch {
    throw new InvalidArgumentsError(`${optionName} must be a JSON object`);
  }
}

function assertNoUnexpectedPositional(positional) {
  if (positional.length > 0) {
    throw new InvalidArgumentsError(`Unexpected arguments: ${positional.join(" ")}`);
  }
}

function postAuthAssistantHint(status) {
  if (status !== "logged_in" && status !== "cached") {
    return null;
  }
  return {
    type: POST_AUTH_HELP_HINT_TYPE,
    message: POST_AUTH_HELP_MESSAGE,
  };
}

function preAuthAssistantHint(loginUrl) {
  if (typeof loginUrl !== "string" || !loginUrl.trim()) {
    return null;
  }
  return {
    type: PRE_AUTH_HELP_HINT_TYPE,
    message: preAuthHelpMessage(loginUrl.trim()),
  };
}

function publicPendingLoginPayload({ config, cachePath, pendingPath, pending, created }) {
  const assistantHint = preAuthAssistantHint(pending.login_url);
  return {
    status: "login_required",
    broker_base_url: config.brokerBaseUrl,
    server_url: config.serverUrl,
    cache_path: cachePath,
    pending_cache_path: pendingPath,
    pending_status: pending.status,
    pending_created: created,
    login_url: pending.login_url,
    ...(assistantHint ? { assistant_hint: assistantHint } : {}),
  };
}

function publicLoginPayload({ config, cachePath, pendingPath, tokenDocument, status }) {
  const assistantHint = postAuthAssistantHint(status);
  return {
    status,
    broker_base_url: config.brokerBaseUrl,
    server_url: config.serverUrl,
    cache_path: cachePath,
    pending_cache_path: pendingPath,
    expires_at: tokenDocument?.expires_at ?? null,
    ...(assistantHint ? { assistant_hint: assistantHint } : {}),
  };
}

function statusPayload(config) {
  const cachePath = tokenCachePath(config.cacheRoot, config.serverUrl);
  const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
  const cacheDocument = readJson(cachePath);
  const pendingDocument = readJson(pendingPath);
  return {
    server_url: config.serverUrl,
    cache_path: cachePath,
    pending_cache_path: pendingPath,
    cache_exists: cacheDocument !== null,
    pending_exists: pendingDocument !== null,
    usable: tokenIsUsable(cacheDocument, config.minTtlSeconds),
    expires_at: cacheDocument?.expires_at ?? null,
    pending_status: pendingDocument?.status ?? null,
    pending_login_url: pendingDocument?.login_url ?? null,
  };
}

function mcpConfigPayload(config) {
  return {
    mcpServers: {
      [config.serverName]: {
        type: "http",
        url: config.serverUrl,
      },
    },
  };
}

function writeJson(stdout, payload) {
  stdout(`${JSON.stringify(payload, null, 2)}\n`);
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) {
    return text;
  }
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function loginCommand(config) {
  return [
    "calle",
    "auth",
    "login",
    "--server-url",
    config.serverUrl,
    "--broker-base-url",
    config.brokerBaseUrl,
    "--auth-base-url",
    config.authBaseUrl,
    "--channel",
    config.channel,
    "--cache-root",
    config.cacheRoot,
  ]
    .map(shellQuote)
    .join(" ");
}

function callStatusCommand(config, runId) {
  return [
    "calle",
    "call",
    "status",
    "--run-id",
    runId,
    "--server-url",
    config.serverUrl,
    "--cache-root",
    config.cacheRoot,
  ]
    .map(shellQuote)
    .join(" ");
}

function authRequiredPayload(config, message = "A usable CALL-E auth token is required.") {
  const pendingDocument = readJson(pendingCachePath(config.cacheRoot, config.serverUrl));
  const loginUrl = typeof pendingDocument?.login_url === "string" ? pendingDocument.login_url : null;
  const assistantHint = preAuthAssistantHint(loginUrl);
  return {
    ok: false,
    server_url: config.serverUrl,
    error: {
      code: "auth_required",
      message,
    },
    login_command: loginCommand(config),
    ...(loginUrl ? { login_url: loginUrl } : {}),
    ...(assistantHint ? { assistant_hint: assistantHint } : {}),
  };
}

function errorPayload(error, config) {
  if (error instanceof InvalidArgumentsError) {
    return {
      exitCode: 2,
      body: {
        ok: false,
        server_url: config?.serverUrl ?? null,
        error: {
          code: "invalid_arguments",
          message: error.message,
        },
      },
    };
  }

  if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
    return {
      exitCode: 1,
      body: authRequiredPayload(config, error.message),
    };
  }

  if (error instanceof McpHttpError) {
    return {
      exitCode: 1,
      body: {
        ok: false,
        server_url: config?.serverUrl ?? null,
        error: {
          code: error.code || "mcp_error",
          message: error.message,
          status_code: error.statusCode,
        },
      },
    };
  }

  return {
    exitCode: 1,
    body: {
      ok: false,
      server_url: config?.serverUrl ?? null,
      error: {
        code: "mcp_error",
        message: error?.message || String(error),
      },
    },
  };
}

function writeCommandError(stdout, stderr, error, config) {
  const formatted = errorPayload(error, config);
  writeJson(stdout, formatted.body);
  stderr(formatted.body.error.message);
  return formatted.exitCode;
}

function commandName(group, command) {
  return [group, command].filter(Boolean).join(" ");
}

function prePlanInvokedCommand(group, command) {
  return (group === "auth" && ["login", "status"].includes(command)) || (group === "mcp" && ["config", "tools"].includes(command));
}

function errorTelemetryCode(error) {
  if (error instanceof InvalidArgumentsError) {
    return "invalid_arguments";
  }
  if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
    return "auth_required";
  }
  if (error instanceof McpHttpError) {
    return error.code || "mcp_error";
  }
  return "local_error";
}

function errorTelemetryProperties(error) {
  return {
    error_code: errorTelemetryCode(error),
    error_name: error?.name || "Error",
  };
}

function toolCount(result) {
  return Array.isArray(result?.tools) ? result.tools.length : null;
}

function createCommandTelemetry({ config, group, command, deps }) {
  const client = createTelemetryClient({
    config,
    fetchImpl: deps.telemetryFetchImpl || globalThis.fetch,
  });
  const baseProperties = {
    command_group: group || null,
    command: command || null,
    command_name: commandName(group, command),
  };

  return async (eventName, properties = {}) => {
    await client.capture(eventName, {
      ...baseProperties,
      ...properties,
    });
  };
}

function mcpSuccessPayload({ config, toolName = null, result, method = null }) {
  return {
    ok: true,
    server_url: config.serverUrl,
    ...(toolName ? { tool_name: toolName } : {}),
    ...(method ? { method } : {}),
    result,
  };
}

function buildPlanArguments(options) {
  const toPhones = optionValues(options.toPhone)
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (toPhones.length === 0) {
    throw new InvalidArgumentsError("Missing required --to-phone");
  }

  const args = {
    to_phones: toPhones,
    goal: requireStringOption(options, "goal", "--goal"),
  };
  const language = optionalStringOption(options, "language");
  const region = optionalStringOption(options, "region");
  if (language) {
    args.language = language;
  }
  if (region) {
    args.region = region;
  }
  return args;
}

function buildPlanRequestMeta(options, env = process.env) {
  const timezone = resolvePlanTimezone(options, env);
  if (!timezone) {
    return null;
  }

  const meta = {
    "openai/userLocation": {
      timezone,
    },
  };
  const offsetMinutes = timezoneOffsetMinutes(timezone);
  if (offsetMinutes !== null) {
    meta.timezone_offset_minutes = offsetMinutes;
  }
  return meta;
}

function buildRunArguments(options) {
  return {
    plan_id: requireStringOption(options, "planId", "--plan-id"),
    confirm_token: requireStringOption(options, "confirmToken", "--confirm-token"),
  };
}

function buildStatusArguments(options) {
  const args = {
    run_id: requireStringOption(options, "runId", "--run-id"),
  };
  const cursor = optionalStringOption(options, "cursor");
  const limit = parsePositiveInteger(options.limit, "--limit");
  if (cursor) {
    args.cursor = cursor;
  }
  if (limit !== null) {
    args.limit = limit;
  }
  return args;
}

function extractRunId(result) {
  const structured = result?.structuredContent || result?.structured_content || result;
  if (typeof structured?.run_id === "string" && structured.run_id.trim()) {
    return structured.run_id.trim();
  }
  const text = Array.isArray(result?.content)
    ? result.content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n")
    : "";
  const match = /\brun_id\b["'\s:=]+([A-Za-z0-9_-]+)/u.exec(text);
  return match?.[1] ?? null;
}

async function handleMcpCommand({ command, positional, options, config, deps, stdout, stderr, captureTelemetry }) {
  try {
    if (command === "tools") {
      assertNoUnexpectedPositional(positional);
      const result = await listMcpTools({ config, fetchImpl: deps.fetchImpl || globalThis.fetch });
      await captureTelemetry("mcp_tools_checked", {
        outcome: "success",
        tool_count: toolCount(result),
      });
      writeJson(stdout, mcpSuccessPayload({ config, method: "tools/list", result }));
      return 0;
    }

    if (command === "call") {
      if (positional.length !== 1) {
        throw new InvalidArgumentsError("Usage: calle mcp call <tool-name> --args-json '<json>'");
      }
      const toolName = positional[0];
      const toolArguments = parseJsonObject(options.argsJson, "--args-json");
      const result = await callMcpTool({
        config,
        toolName,
        toolArguments,
        requestMeta: toolName === "plan_call" ? buildPlanRequestMeta(options, deps.env || process.env) : null,
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    throw new InvalidArgumentsError(`Unknown mcp command: ${command || ""}`.trim());
  } catch (error) {
    if (command === "tools") {
      await captureTelemetry("mcp_tools_checked", {
        outcome: "failure",
        ...errorTelemetryProperties(error),
      });
      if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
        await captureTelemetry("auth_required", errorTelemetryProperties(error));
      } else if (error instanceof InvalidArgumentsError) {
        await captureTelemetry("cli_local_error", errorTelemetryProperties(error));
      }
    }
    return writeCommandError(stdout, stderr, error, config);
  }
}

async function handleCallCommand({ command, positional, options, config, deps, stdout, stderr, captureTelemetry }) {
  try {
    assertNoUnexpectedPositional(positional);

    if (command === "plan") {
      const toolName = "plan_call";
      const result = await callMcpTool({
        config,
        toolName,
        toolArguments: buildPlanArguments(options),
        requestMeta: buildPlanRequestMeta(options, deps.env || process.env),
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    if (command === "run") {
      const runResult = await callMcpTool({
        config,
        toolName: "run_call",
        toolArguments: buildRunArguments(options),
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      const runId = extractRunId(runResult);
      if (!runId) {
        throw new McpHttpError("run_call did not return a run_id", { code: "mcp_error", payload: runResult });
      }
      const statusResult = await callMcpTool({
        config,
        toolName: "get_call_run",
        toolArguments: { run_id: runId },
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      writeJson(stdout, {
        ok: true,
        server_url: config.serverUrl,
        tool_name: "run_call",
        result: statusResult,
        run_id: runId,
        run_result: runResult,
        status_result: statusResult,
        next_command: callStatusCommand(config, runId),
      });
      return 0;
    }

    if (command === "status") {
      const toolName = "get_call_run";
      const result = await callMcpTool({
        config,
        toolName,
        toolArguments: buildStatusArguments(options),
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    throw new InvalidArgumentsError(`Unknown call command: ${command || ""}`.trim());
  } catch (error) {
    if (command === "plan") {
      if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
        await captureTelemetry("auth_required", errorTelemetryProperties(error));
      } else if (error instanceof InvalidArgumentsError) {
        await captureTelemetry("cli_local_error", errorTelemetryProperties(error));
      }
    }
    return writeCommandError(stdout, stderr, error, config);
  }
}

export async function runCli(argv, deps = {}) {
  const stdout = deps.stdout || ((text) => process.stdout.write(text));
  const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));
  const openBrowser = deps.openBrowser || (async (url) => {
    const { spawn } = await import("node:child_process");
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  });

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp(stdout);
    return 0;
  }

  const [group, command, ...rest] = argv;
  const { options, positional } = parseOptions(rest);

  const config = resolveRuntimeConfig(options, deps.env || process.env);
  const captureTelemetry = createCommandTelemetry({ config, group, command, deps });
  if (prePlanInvokedCommand(group, command)) {
    await captureTelemetry("cli_invoked");
  }

  if (group === "auth" && command === "login") {
    assertNoUnexpectedPositional(positional);
    await captureTelemetry("auth_login_local_started", {
      force_login: Boolean(options.forceLogin),
      start_only: Boolean(options.startOnly),
      no_browser_open: Boolean(options.noBrowserOpen),
    });
    const cachePath = tokenCachePath(config.cacheRoot, config.serverUrl);
    const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
    if (options.startOnly) {
      const cached = readJson(cachePath);
      if (!options.forceLogin && tokenIsUsable(cached, config.minTtlSeconds)) {
        writeJson(stdout, publicLoginPayload({
          config,
          cachePath,
          pendingPath,
          tokenDocument: cached,
          status: "cached",
        }));
        return 0;
      }
      let result;
      try {
        result = await ensurePendingLogin(config, {
          fetchImpl: deps.fetchImpl || globalThis.fetch,
          forceLogin: Boolean(options.forceLogin),
        });
      } catch (error) {
        await captureTelemetry("auth_login_local_failed", errorTelemetryProperties(error));
        throw error;
      }
      writeJson(stdout, publicPendingLoginPayload({
        config,
        cachePath,
        pendingPath,
        pending: result.pending,
        created: result.created,
      }));
      return 0;
    }
    let result;
    try {
      result = await loginWithBroker(config, {
        fetchImpl: deps.fetchImpl || globalThis.fetch,
        openBrowser,
        sleepImpl: deps.sleepImpl,
        forceLogin: Boolean(options.forceLogin),
        noBrowserOpen: Boolean(options.noBrowserOpen),
        stderr,
      });
    } catch (error) {
      await captureTelemetry("auth_login_local_failed", errorTelemetryProperties(error));
      throw error;
    }
    writeJson(stdout, publicLoginPayload({ config, ...result }));
    return 0;
  }

  if (group === "auth" && command === "status") {
    assertNoUnexpectedPositional(positional);
    const payload = statusPayload(config);
    writeJson(stdout, payload);
    await captureTelemetry("auth_status_checked", {
      cache_exists: payload.cache_exists,
      pending_exists: payload.pending_exists,
      usable: payload.usable,
    });
    return 0;
  }

  if (group === "auth" && command === "logout") {
    assertNoUnexpectedPositional(positional);
    const cachePath = tokenCachePath(config.cacheRoot, config.serverUrl);
    const pendingPath = pendingCachePath(config.cacheRoot, config.serverUrl);
    const cacheDocument = readJson(cachePath);
    const pendingDocument = readJson(pendingPath);
    removeFile(cachePath);
    removeFile(pendingPath);
    writeJson(stdout, {
      server_url: config.serverUrl,
      cache_path: cachePath,
      pending_cache_path: pendingPath,
      removed_cache: cacheDocument !== null,
      removed_pending: pendingDocument !== null,
    });
    return 0;
  }

  if (group === "mcp" && command === "config") {
    assertNoUnexpectedPositional(positional);
    writeJson(stdout, mcpConfigPayload(config));
    return 0;
  }

  if (group === "mcp") {
    return handleMcpCommand({ command, positional, options, config, deps, stdout, stderr, captureTelemetry });
  }

  if (group === "call") {
    return handleCallCommand({ command, positional, options, config, deps, stdout, stderr, captureTelemetry });
  }

  throw new Error(`Unknown command: ${[group, command].filter(Boolean).join(" ")}`);
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const code = await runCli(argv, deps);
    process.exitCode = code;
  } catch (error) {
    const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));
    stderr(error?.message || String(error));
    process.exitCode = 1;
  }
}
