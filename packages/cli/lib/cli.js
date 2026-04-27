import { pendingCachePath, readJson, removeFile, tokenCachePath, tokenIsUsable } from "./cache.js";
import { DEFAULT_BASE_URL, DEFAULT_CHANNEL, DEFAULT_CLIENT_NAME, DEFAULT_SCOPE, resolveRuntimeConfig } from "./config.js";
import { loginWithBroker } from "./broker-client.js";
import {
  AuthRequiredError,
  McpHttpError,
  callMcpTool,
  isUnauthorizedMcpError,
  listMcpTools,
} from "./mcp-client.js";

class InvalidArgumentsError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidArgumentsError";
  }
}

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
  --no-browser-open
  --json

MCP/call options:
  --args-json <json>           Arguments for calle mcp call
  --to-phone <phone>           Repeatable for calle call plan
  --goal <text>
  --language <language>
  --region <region>
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
  const booleanOptions = new Set(["force-login", "no-browser-open", "json", "help"]);
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

function publicLoginPayload({ config, cachePath, pendingPath, tokenDocument, status }) {
  return {
    status,
    broker_base_url: config.brokerBaseUrl,
    server_url: config.serverUrl,
    cache_path: cachePath,
    pending_cache_path: pendingPath,
    expires_at: tokenDocument?.expires_at ?? null,
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

function authRequiredPayload(config, message = "A usable Calle auth token is required.") {
  return {
    ok: false,
    server_url: config.serverUrl,
    error: {
      code: "auth_required",
      message,
    },
    login_command: loginCommand(config),
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

async function handleMcpCommand({ command, positional, options, config, deps, stdout, stderr }) {
  try {
    if (command === "tools") {
      assertNoUnexpectedPositional(positional);
      const result = await listMcpTools({ config, fetchImpl: deps.fetchImpl || globalThis.fetch });
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
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    throw new InvalidArgumentsError(`Unknown mcp command: ${command || ""}`.trim());
  } catch (error) {
    return writeCommandError(stdout, stderr, error, config);
  }
}

async function handleCallCommand({ command, positional, options, config, deps, stdout, stderr }) {
  try {
    assertNoUnexpectedPositional(positional);

    if (command === "plan") {
      const toolName = "plan_call";
      const result = await callMcpTool({
        config,
        toolName,
        toolArguments: buildPlanArguments(options),
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

  const config = resolveRuntimeConfig(options);
  if (group === "auth" && command === "login") {
    assertNoUnexpectedPositional(positional);
    const result = await loginWithBroker(config, {
      fetchImpl: deps.fetchImpl || globalThis.fetch,
      openBrowser,
      sleepImpl: deps.sleepImpl,
      forceLogin: Boolean(options.forceLogin),
      noBrowserOpen: Boolean(options.noBrowserOpen),
      stderr,
    });
    writeJson(stdout, publicLoginPayload({ config, ...result }));
    return 0;
  }

  if (group === "auth" && command === "status") {
    assertNoUnexpectedPositional(positional);
    writeJson(stdout, statusPayload(config));
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
    return handleMcpCommand({ command, positional, options, config, deps, stdout, stderr });
  }

  if (group === "call") {
    return handleCallCommand({ command, positional, options, config, deps, stdout, stderr });
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
