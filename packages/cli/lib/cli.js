import {
  isCallRecoveryId,
  pendingCachePath,
  pendingIsExpired,
  readCallRecovery,
  readJson,
  readPendingLogin,
  removeCallRecoveries,
  removeCallRecovery,
  removeFile,
  removeTokenCache,
  tokenCachePath,
  tokenIsUsable,
  writeCallRecovery,
} from "./cache.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_CHANNEL,
  DEFAULT_CLIENT_NAME,
  DEFAULT_PLAN_CALL_TIMEOUT_SECONDS,
  DEFAULT_SCOPE,
  CLI_VERSION,
  resolveRuntimeConfig,
} from "./config.js";
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

function resolveCliRuntimeConfig(options, env) {
  try {
    return resolveRuntimeConfig(options, env);
  } catch (error) {
    throw new InvalidArgumentsError(error?.message || String(error));
  }
}

class CallStageError extends McpHttpError {
  constructor(message, {
    stage,
    code,
    statusCode = null,
    callStarted,
    retrySafe,
    recoveryId = null,
    nextCommand = null,
    remoteError = null,
  }) {
    super(message, { code, statusCode });
    this.name = "CallStageError";
    this.stage = stage;
    this.callStarted = callStarted;
    this.retrySafe = retrySafe;
    this.recoveryId = recoveryId;
    this.nextCommand = nextCommand;
    this.remoteError = remoteError;
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
const SUPPORTED_REGIONS_AND_LANGUAGES_URL = "https://github.com/CALLE-AI/call-e-integrations#supported-regions-and-languages";

const COMMAND_GROUPS = {
  auth: {
    summary: "Manage brokered login and the local token cache",
    commands: {
      login: {
        summary: "Start brokered login and cache the token locally",
        usage: "calle auth login [options]",
        options: [
          "  --force-login                 Start a new login even when cached state exists",
          "  --start-only                  Return the login URL without polling",
          "  --no-browser-open             Do not open the login URL in a browser",
        ],
        examples: ["calle auth login", "calle auth login --start-only --no-browser-open"],
      },
      status: {
        summary: "Show local token cache status",
        usage: "calle auth status [options]",
        examples: ["calle auth status"],
      },
      logout: {
        summary: "Remove local token, login, and call recovery cache",
        usage: "calle auth logout [options]",
        examples: ["calle auth logout"],
      },
    },
  },
  mcp: {
    summary: "Configure and call the CALL-E MCP server",
    commands: {
      config: {
        summary: "Print MCP client configuration JSON",
        usage: "calle mcp config [options]",
        examples: ["calle mcp config"],
      },
      tools: {
        summary: "List tools from the configured MCP server",
        usage: "calle mcp tools [options]",
        examples: ["calle mcp tools"],
      },
      call: {
        summary: "Call an arbitrary MCP tool",
        usage: "calle mcp call <tool-name> [options]",
        options: [
          "  --args-json <json>            JSON object passed as tool arguments",
          "  --timezone <iana>             Planning timezone metadata for plan_call",
        ],
        examples: [
          `calle mcp call plan_call --args-json '{"user_input":"Call Alex"}'`,
        ],
      },
    },
  },
  call: {
    summary: "Plan, start, run, and inspect phone calls",
    commands: {
      plan: {
        summary: "Plan a phone call via plan_call",
        usage: "calle call plan --to-phone <phone> --goal <text> [options]",
        options: [
          "  --to-phone <phone>            Required; repeat once per destination phone number",
          "  --goal <text>                 Required; call goal or instruction",
          "  --language <language>         Optional language hint",
          "  --region <region>             Optional region hint",
          "  --timezone <iana>             Optional planning timezone metadata",
        ],
        examples: [
          `calle call plan --to-phone +15551234567 --goal "Confirm the appointment"`,
        ],
      },
      start: {
        summary: "Plan and run a phone call without printing confirmation data",
        usage: "calle call start --to-phone <phone> --goal <text> [options]",
        options: [
          "  --to-phone <phone>            Required; repeat once per destination phone number",
          "  --goal <text>                 Required; call goal or instruction",
          "  --language <language>         Optional language hint",
          "  --region <region>             Optional region hint",
          "  --timezone <iana>             Optional planning timezone metadata",
        ],
        examples: [
          `calle call start --to-phone +15551234567 --goal "Confirm the appointment"`,
        ],
      },
      run: {
        summary: "Run a planned phone call, then fetch status once",
        usage: "calle call run --plan-id <id> --confirm-token <token> [options]",
        options: [
          "  --plan-id <id>                Required; plan ID returned by plan_call",
          "  --confirm-token <token>       Required; confirmation token returned by plan_call",
          "  --timezone <iana>             Local timezone for returned call timestamps",
        ],
        examples: ["calle call run --plan-id plan_123 --confirm-token token_123"],
      },
      recover: {
        summary: "Safely recover an uncertain run_call submission",
        usage: "calle call recover --recovery-id <id> [options]",
        options: [
          "  --recovery-id <id>            Required; opaque recovery ID returned by call start/run",
          "  --timezone <iana>             Local timezone for returned call timestamps",
        ],
        examples: ["calle call recover --recovery-id <recovery_id>"],
      },
      status: {
        summary: "Query a call run via get_call_run",
        usage: "calle call status --run-id <id> [options]",
        options: [
          "  --run-id <id>                 Required; call run ID",
          "  --cursor <cursor>             Optional activity pagination cursor",
          "  --limit <number>              Optional positive activity page size",
          "  --timezone <iana>             Local timezone for returned call timestamps",
        ],
        examples: ["calle call status --run-id run_123"],
      },
    },
  },
  regions: {
    summary: "Find supported CALL-E regions and languages",
    commands: {
      list: {
        summary: "Print the supported regions and languages documentation URL",
        usage: "calle regions list [options]",
        examples: ["calle regions list"],
      },
    },
  },
};

const COMMON_OPTION_NAMES = new Set([
  "base-url",
  "broker-base-url",
  "server-url",
  "auth-base-url",
  "channel",
  "client-name",
  "scope",
  "cache-root",
  "min-ttl-seconds",
  "timeout-seconds",
  "poll-timeout-seconds",
  "server-name",
  "json",
  "no-telemetry",
  "telemetry",
  "telemetry-url",
  "telemetry-timeout-seconds",
]);

const COMMAND_OPTION_NAMES = {
  "auth login": new Set(["force-login", "start-only", "no-browser-open"]),
  "auth status": new Set(),
  "auth logout": new Set(),
  "mcp config": new Set(),
  "mcp tools": new Set(),
  "mcp call": new Set(["args-json", "timezone"]),
  "call plan": new Set(["to-phone", "goal", "language", "region", "timezone"]),
  "call start": new Set(["to-phone", "goal", "language", "region", "timezone"]),
  "call run": new Set(["plan-id", "confirm-token", "timezone"]),
  "call recover": new Set(["recovery-id", "timezone"]),
  "call status": new Set(["run-id", "cursor", "limit", "timezone"]),
  "regions list": new Set(),
};

const KNOWN_OPTION_NAMES = new Set([
  ...COMMON_OPTION_NAMES,
  ...Object.values(COMMAND_OPTION_NAMES).flatMap((names) => [...names]),
  "help",
]);

const COMMON_HELP = `Global options (accepted by every command):
  --base-url <url>             Default: ${DEFAULT_BASE_URL}
  --broker-base-url <url>      Default: --base-url
  --server-url <url>           Default: <base-url>/mcp/<channel>
  --auth-base-url <url>        Default: --base-url
  --channel <name>             Default: ${DEFAULT_CHANNEL}
  --client-name <name>         Default: ${DEFAULT_CLIENT_NAME}
  --scope <scope>              Default: ${DEFAULT_SCOPE}
  --cache-root <path>
  --min-ttl-seconds <seconds>
  --timeout-seconds <seconds>  Default: 15; plan_call: 150
  --poll-timeout-seconds <seconds>
  --server-name <name>         Default: calle
  --json
  --no-telemetry
  --telemetry[=true|false]
  --telemetry-url <url>
  --telemetry-timeout-seconds <seconds>
  --help, -h                   Show help for the current command
  --version, -V                Show the CLI version`;

function helpCommandFor(group, command) {
  if (COMMAND_GROUPS[group]?.commands?.[command]) {
    return `calle ${group} ${command} --help`;
  }
  if (COMMAND_GROUPS[group]) {
    return `calle ${group} --help`;
  }
  return "calle --help";
}

function printRootHelp(stdout) {
  const commands = Object.entries(COMMAND_GROUPS)
    .flatMap(([group, details]) => Object.entries(details.commands)
      .map(([command, commandDetails]) => [
        `${group} ${command}`,
        commandDetails.summary,
      ]))
    .map(([name, summary]) => `  ${name.padEnd(13)} ${summary}`)
    .join("\n");
  stdout(`Usage: calle <command> [options]

Commands:
${commands}

Run 'calle <command> --help' to list a group's subcommands.
Run 'calle <command> <subcommand> --help' to view all supported parameters.
Example: calle call plan --help

${COMMON_HELP}
`);
}

function printGroupHelp(stdout, group) {
  const details = COMMAND_GROUPS[group];
  const commands = Object.entries(details.commands)
    .map(([name, command]) => `  ${name.padEnd(8)} ${command.summary}`)
    .join("\n");
  stdout(`Usage: calle ${group} <command> [options]

${details.summary}.

Commands:
${commands}

Run 'calle ${group} <command> --help' to view all supported parameters.
`);
}

function printCommandHelp(stdout, group, command) {
  const details = COMMAND_GROUPS[group].commands[command];
  const commandOptions = details.options?.length
    ? `\nCommand options:\n${details.options.join("\n")}\n`
    : "";
  const examples = details.examples.map((example) => `  ${example}`).join("\n");
  stdout(`Usage: ${details.usage}

${details.summary}.
${commandOptions}
${COMMON_HELP}

Examples:
${examples}
`);
}

function printHelp(stdout, argv = []) {
  const [group, command] = argv;
  if (COMMAND_GROUPS[group]?.commands?.[command]) {
    printCommandHelp(stdout, group, command);
    return;
  }
  if (COMMAND_GROUPS[group]) {
    printGroupHelp(stdout, group);
    return;
  }
  printRootHelp(stdout);
}

function toCamelCase(optionName) {
  return optionName.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

function parseOptions(argv) {
  const options = {};
  const positional = [];
  const optionNames = [];
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
    if (!KNOWN_OPTION_NAMES.has(optionName)) {
      throw new InvalidArgumentsError(`Unknown option: --${optionName}`);
    }
    optionNames.push(optionName);
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
      throw new InvalidArgumentsError(`Missing value for --${optionName}`);
    }
    setOption(argv[index]);
  }
  return { options, positional, optionNames };
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
    if (typeof resolved !== "string" || (resolved !== "UTC" && !resolved.includes("/"))) {
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

const ISO_TIMESTAMP_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/iu;

function recordObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function zonedDateTimeParts(timezone, instant) {
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
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatIsoTimestampInTimezone(value, timezone) {
  if (typeof value !== "string" || !timezone) {
    return value;
  }
  const timestamp = value.trim();
  if (!ISO_TIMESTAMP_WITH_TIMEZONE.test(timestamp)) {
    return value;
  }
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) {
    return value;
  }

  try {
    const parts = zonedDateTimeParts(timezone, instant);
    const offsetMinutes = timezoneOffsetMinutes(timezone, instant);
    if (offsetMinutes === null) {
      return value;
    }
    const localOffsetMinutes = -offsetMinutes;
    const sign = localOffsetMinutes >= 0 ? "+" : "-";
    const absoluteOffsetMinutes = Math.abs(localOffsetMinutes);
    const offsetHours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, "0");
    const offsetRemainderMinutes = String(absoluteOffsetMinutes % 60).padStart(2, "0");
    const milliseconds = String(instant.getUTCMilliseconds()).padStart(3, "0");
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`;
  } catch {
    return value;
  }
}

function localizeCallStatusResultTimestamps(result, options, env = process.env) {
  const timezone = resolvePlanTimezone(options, env);
  if (!timezone) {
    return result;
  }

  const structured = recordObject(structuredPayload(result));
  if (!structured) {
    return result;
  }

  if (Array.isArray(structured.activity)) {
    for (const item of structured.activity) {
      const event = recordObject(item);
      if (event && Object.hasOwn(event, "ts")) {
        event.ts = formatIsoTimestampInTimezone(event.ts, timezone);
      }
    }
  }

  const resultObject = recordObject(structured.result);
  const extracted = recordObject(resultObject?.extracted);
  const calling = recordObject(extracted?.calling);
  if (calling) {
    if (Object.hasOwn(calling, "started_at")) {
      calling.started_at = formatIsoTimestampInTimezone(calling.started_at, timezone);
    }
    if (Object.hasOwn(calling, "ended_at")) {
      calling.ended_at = formatIsoTimestampInTimezone(calling.ended_at, timezone);
    }
  }

  return result;
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

function assertSupportedOptions(group, command, optionNames) {
  const commandOptions = COMMAND_OPTION_NAMES[commandName(group, command)];
  if (!commandOptions) {
    return;
  }
  const unsupported = optionNames.find(
    (optionName) => !COMMON_OPTION_NAMES.has(optionName) && !commandOptions.has(optionName),
  );
  if (unsupported) {
    throw new InvalidArgumentsError(
      `Option --${unsupported} is not supported by calle ${group} ${command}`,
    );
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

function callStatusCommand(config, runId, timezone = null) {
  return [
    "calle",
    "call",
    "status",
    "--run-id",
    runId,
    ...(timezone ? ["--timezone", timezone] : []),
    "--server-url",
    config.serverUrl,
    "--cache-root",
    config.cacheRoot,
  ]
    .map(shellQuote)
    .join(" ");
}

function callRecoveryCommand(config, recoveryId, timezone = null) {
  return [
    "calle",
    "call",
    "recover",
    "--recovery-id",
    recoveryId,
    ...(timezone ? ["--timezone", timezone] : []),
    "--server-url",
    config.serverUrl,
    "--cache-root",
    config.cacheRoot,
  ]
    .map(shellQuote)
    .join(" ");
}

function isActivePendingLogin(pending) {
  return Boolean(pending && (pending.status === "PENDING" || pending.status === "AUTHORIZED") && !pendingIsExpired(pending));
}

function authRequiredPayload(config, message = "A usable CALL-E auth token is required.") {
  const pendingDocument = readPendingLogin(pendingCachePath(config.cacheRoot, config.serverUrl));
  const loginUrl = isActivePendingLogin(pendingDocument) ? pendingDocument.login_url : null;
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

function invalidateTokenIfMcpRejected(error, config) {
  if (isUnauthorizedMcpError(error)) {
    removeTokenCache(config);
    return true;
  }
  return false;
}

async function verifyCachedTokenWithMcp({ config, fetchImpl }) {
  await listMcpTools({ config, fetchImpl });
}

function errorPayload(error, config, helpCommand = null) {
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
        ...(helpCommand ? { help_command: helpCommand } : {}),
      },
    };
  }

  if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
    const stageContext = error?.stage ? {
      stage: error.stage,
      call_started: error.callStarted,
      retry_safe: error.retrySafe,
      ...(error.recoveryId ? { recovery_id: error.recoveryId } : {}),
      ...(error.nextCommand ? { next_command: error.nextCommand } : {}),
    } : {};
    return {
      exitCode: 1,
      body: {
        ...authRequiredPayload(config, error.message),
        ...stageContext,
      },
    };
  }

  if (error instanceof McpHttpError) {
    const remoteError = error instanceof CallStageError && error.remoteError
      ? error.remoteError
      : null;
    return {
      exitCode: 1,
      body: {
        ok: false,
        server_url: config?.serverUrl ?? null,
        ...(error instanceof CallStageError ? {
          stage: error.stage,
          call_started: error.callStarted,
          retry_safe: error.retrySafe,
          ...(error.recoveryId ? { recovery_id: error.recoveryId } : {}),
          ...(error.nextCommand ? { next_command: error.nextCommand } : {}),
        } : {}),
        error: {
          code: error.code || "mcp_error",
          message: error.message,
          status_code: error.statusCode,
          ...(remoteError?.error_code !== undefined ? { error_code: remoteError.error_code } : {}),
          ...(remoteError?.status !== undefined ? { status: remoteError.status } : {}),
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

function writeCommandError(stdout, stderr, error, config, helpCommand = null) {
  const formatted = errorPayload(error, config, helpCommand);
  writeJson(stdout, formatted.body);
  stderr([
    formatted.body.error.message,
    ...(formatted.body.help_command ? [`Run '${formatted.body.help_command}' for usage.`] : []),
  ].join("\n"));
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

function structuredPayload(result) {
  return result?.structuredContent || result?.structured_content || result || {};
}

function safeRemoteString(value, maxLength = 1000) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim().slice(0, maxLength);
}

function safeRemoteCallError(result) {
  const structured = recordObject(structuredPayload(result)) || {};
  const nestedError = recordObject(structured.error) || {};
  const field = (name) => nestedError[name] ?? structured[name];
  const errorCodeValue = field("error_code") ?? field("code");
  const errorCode = typeof errorCodeValue === "number"
    ? errorCodeValue
    : safeRemoteString(errorCodeValue, 200);
  const statusValue = field("status");
  const status = typeof statusValue === "number"
    ? statusValue
    : safeRemoteString(statusValue, 200);
  const message = safeRemoteString(field("message"));
  const retrySafe = typeof field("retry_safe") === "boolean" ? field("retry_safe") : undefined;
  const callStartedValue = field("call_started");
  const callStarted = typeof callStartedValue === "boolean" || callStartedValue === "unknown"
    ? callStartedValue
    : undefined;
  return {
    ...(errorCode !== undefined ? { error_code: errorCode } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(retrySafe !== undefined ? { retry_safe: retrySafe } : {}),
    ...(callStarted !== undefined ? { call_started: callStarted } : {}),
  };
}

function callStageErrorFrom(error, {
  stage,
  callStarted,
  retrySafe,
  recoveryId = null,
  nextCommand = null,
}) {
  if (error instanceof CallStageError) {
    return error;
  }
  const timedOut = error instanceof McpHttpError && /timed out/iu.test(error.message);
  const remoteError = error instanceof McpHttpError && error.payload
    ? safeRemoteCallError(error.payload)
    : null;
  return new CallStageError(
    timedOut
      ? `${stage} timed out before the CLI received a response.`
      : remoteError?.message || `${stage} failed: ${error?.message || String(error)}`,
    {
      stage,
      code: timedOut ? `${stage}_timeout` : `${stage}_error`,
      statusCode: error instanceof McpHttpError ? error.statusCode : null,
      callStarted: remoteError?.call_started ?? callStarted,
      retrySafe: remoteError?.retry_safe ?? retrySafe,
      recoveryId,
      nextCommand,
      remoteError,
    }
  );
}

async function callCallStage({
  config,
  deps,
  stage,
  toolArguments,
  requestMeta = null,
  timeoutSeconds = null,
  callStarted,
  retrySafe,
  recoveryId = null,
  nextCommand = null,
}) {
  try {
    const result = await callMcpTool({
      config,
      toolName: stage,
      toolArguments,
      requestMeta,
      timeoutSeconds,
      fetchImpl: deps.fetchImpl || globalThis.fetch,
    });
    if (result?.isError === true) {
      const remoteError = safeRemoteCallError(result);
      throw new CallStageError(remoteError.message || `${stage} returned an error.`, {
        stage,
        code: `${stage}_error`,
        callStarted: remoteError.call_started ?? callStarted,
        retrySafe: remoteError.retry_safe ?? retrySafe,
        recoveryId,
        nextCommand,
        remoteError,
      });
    }
    return result;
  } catch (error) {
    if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
      error.stage = stage;
      error.callStarted = callStarted;
      error.retrySafe = retrySafe;
      error.recoveryId = recoveryId;
      error.nextCommand = nextCommand;
      throw error;
    }
    throw callStageErrorFrom(error, {
      stage,
      callStarted,
      retrySafe,
      recoveryId,
      nextCommand,
    });
  }
}

function extractRequiredStructuredString(result, fieldName, context) {
  const structured = structuredPayload(result);
  const value = structured?.[fieldName];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Object.hasOwn(structured, fieldName)) {
    throw new McpHttpError(`${context} did not return ${fieldName}`, { code: "mcp_error", payload: result });
  }
  const text = Array.isArray(result?.content)
    ? result.content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n")
    : "";
  const match = new RegExp(`\\b${fieldName}\\b["'\\s:=]+([A-Za-z0-9_-]+)`, "u").exec(text);
  if (match?.[1]) {
    return match[1];
  }
  throw new McpHttpError(`${context} did not return ${fieldName}`, { code: "mcp_error", payload: result });
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
  const structured = structuredPayload(result);
  if (typeof structured?.run_id === "string" && structured.run_id.trim()) {
    return structured.run_id.trim();
  }
  const text = Array.isArray(result?.content)
    ? result.content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n")
    : "";
  const match = /\brun_id\b["'\s:=]+([A-Za-z0-9_-]+)/u.exec(text);
  return match?.[1] ?? null;
}

function mcpToolTimeoutSeconds({ config, options, toolName }) {
  if (toolName === "plan_call" && options.timeoutSeconds === undefined) {
    return DEFAULT_PLAN_CALL_TIMEOUT_SECONDS;
  }
  return config.timeoutSeconds;
}

async function runPlannedCall({ config, deps, planId, confirmToken, timezone = null, recoveryId = null }) {
  let activeRecoveryId = recoveryId;
  if (!activeRecoveryId) {
    try {
      activeRecoveryId = writeCallRecovery(config, { planId, confirmToken, timezone });
    } catch {
      throw new CallStageError("Could not save a private recovery record; run_call was not submitted.", {
        stage: "run_call",
        code: "recovery_storage_error",
        callStarted: false,
        retrySafe: true,
      });
    }
  }
  const nextCommand = callRecoveryCommand(config, activeRecoveryId, timezone);
  const runResult = await callCallStage({
    config,
    deps,
    stage: "run_call",
    toolArguments: { plan_id: planId, confirm_token: confirmToken },
    callStarted: "unknown",
    retrySafe: false,
    recoveryId: activeRecoveryId,
    nextCommand,
  });
  const runId = extractRunId(runResult);
  if (!runId) {
    const remoteError = safeRemoteCallError(runResult);
    throw new CallStageError(remoteError.message || "run_call did not return a run_id.", {
      stage: "run_call",
      code: "run_call_missing_run_id",
      callStarted: remoteError.call_started ?? "unknown",
      retrySafe: remoteError.retry_safe ?? false,
      recoveryId: activeRecoveryId,
      nextCommand,
      remoteError,
    });
  }
  removeCallRecovery(config, activeRecoveryId);
  return { runResult, runId };
}

async function fetchCallStatus({ config, deps, runId }) {
  return callCallStage({
    config,
    deps,
    stage: "get_call_run",
    toolArguments: { run_id: runId },
    callStarted: true,
    retrySafe: true,
  });
}

async function fetchCallStatusBestEffort({ config, deps, runId }) {
  try {
    return {
      statusResult: await fetchCallStatus({ config, deps, runId }),
      statusError: null,
    };
  } catch (error) {
    invalidateTokenIfMcpRejected(error, config);
    const formatted = errorPayload(error, config).body;
    return {
      statusResult: null,
      statusError: {
        stage: error instanceof CallStageError ? error.stage : "get_call_run",
        ...formatted.error,
        retry_safe: error instanceof CallStageError ? error.retrySafe : true,
      },
    };
  }
}

function safeRunAcknowledgement(runResult, runId) {
  const structured = recordObject(structuredPayload(runResult)) || {};
  const status = typeof structured.status === "number"
    ? structured.status
    : safeRemoteString(structured.status, 200);
  const message = safeRemoteString(structured.message);
  return {
    structuredContent: {
      run_id: runId,
      ...(status !== undefined ? { status } : {}),
      ...(message !== undefined ? { message } : {}),
    },
  };
}

async function writeRunCallSuccess({
  config,
  deps,
  stdout,
  options,
  runResult,
  runId,
  statusTimezone,
  includeRunResult,
}) {
  const { statusResult, statusError } = await fetchCallStatusBestEffort({ config, deps, runId });
  if (statusResult) {
    localizeCallStatusResultTimestamps(statusResult, options, deps.env || process.env);
  }
  const exposeRunResult = includeRunResult && statusError === null;
  const publicRunResult = exposeRunResult ? runResult : safeRunAcknowledgement(runResult, runId);
  writeJson(stdout, {
    ok: true,
    server_url: config.serverUrl,
    tool_name: "run_call",
    call_started: true,
    result: statusResult || publicRunResult,
    run_id: runId,
    ...(exposeRunResult ? { run_result: runResult } : {}),
    status_query_succeeded: statusError === null,
    status_result: statusResult,
    ...(statusError ? { status_error: statusError } : {}),
    next_command: callStatusCommand(config, runId, statusTimezone),
  });
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
        timeoutSeconds: mcpToolTimeoutSeconds({ config, options, toolName }),
        fetchImpl: deps.fetchImpl || globalThis.fetch,
      });
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    throw new InvalidArgumentsError(`Unknown mcp command: ${command || ""}`.trim());
  } catch (error) {
    invalidateTokenIfMcpRejected(error, config);
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
    return writeCommandError(stdout, stderr, error, config, helpCommandFor("mcp", command));
  }
}

async function handleCallCommand({ command, positional, options, config, deps, stdout, stderr, captureTelemetry }) {
  try {
    assertNoUnexpectedPositional(positional);

    if (command === "plan") {
      const toolName = "plan_call";
      const result = await callCallStage({
        config,
        deps,
        stage: toolName,
        toolArguments: buildPlanArguments(options),
        requestMeta: buildPlanRequestMeta(options, deps.env || process.env),
        timeoutSeconds: mcpToolTimeoutSeconds({ config, options, toolName }),
        callStarted: false,
        retrySafe: true,
      });
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    if (command === "start") {
      const statusTimezone = resolvePlanTimezone(options, deps.env || process.env);
      const planResult = await callCallStage({
        config,
        deps,
        stage: "plan_call",
        toolArguments: buildPlanArguments(options),
        requestMeta: buildPlanRequestMeta(options, deps.env || process.env),
        timeoutSeconds: mcpToolTimeoutSeconds({ config, options, toolName: "plan_call" }),
        callStarted: false,
        retrySafe: true,
      });
      const structuredPlan = structuredPayload(planResult);
      if (structuredPlan.ready_to_run === false) {
        const question = Array.isArray(structuredPlan.clarifying_questions)
          ? structuredPlan.clarifying_questions.find((item) => typeof item === "string" && item.trim())?.trim()
          : null;
        throw new CallStageError(
          `Call plan needs more information before it can run${question ? `: ${question}` : "."}`,
          {
            stage: "plan_call",
            code: "plan_not_ready",
            callStarted: false,
            retrySafe: true,
          }
        );
      }
      let planId;
      let confirmToken;
      try {
        planId = extractRequiredStructuredString(planResult, "plan_id", "plan_call");
        confirmToken = extractRequiredStructuredString(planResult, "confirm_token", "plan_call");
      } catch (error) {
        throw new CallStageError(error.message, {
          stage: "plan_call",
          code: "plan_call_invalid_response",
          callStarted: false,
          retrySafe: true,
        });
      }
      const { runResult, runId } = await runPlannedCall({
        config,
        deps,
        planId,
        confirmToken,
        timezone: statusTimezone,
      });
      await writeRunCallSuccess({
        config,
        deps,
        stdout,
        options,
        runResult,
        runId,
        statusTimezone,
        includeRunResult: false,
      });
      return 0;
    }

    if (command === "run") {
      const statusTimezone = resolvePlanTimezone(options, deps.env || process.env);
      const runArguments = buildRunArguments(options);
      const { runResult, runId } = await runPlannedCall({
        config,
        deps,
        planId: runArguments.plan_id,
        confirmToken: runArguments.confirm_token,
        timezone: statusTimezone,
      });
      await writeRunCallSuccess({
        config,
        deps,
        stdout,
        options,
        runResult,
        runId,
        statusTimezone,
        includeRunResult: true,
      });
      return 0;
    }

    if (command === "recover") {
      const recoveryId = requireStringOption(options, "recoveryId", "--recovery-id");
      if (!isCallRecoveryId(recoveryId)) {
        throw new InvalidArgumentsError("--recovery-id is invalid");
      }
      const recovery = readCallRecovery(config, recoveryId);
      if (!recovery) {
        throw new McpHttpError("No private recovery record exists for this recovery ID.", {
          code: "recovery_not_found",
        });
      }
      const recoveryOptions = optionalStringOption(options, "timezone") || !recovery.timezone
        ? options
        : { ...options, timezone: recovery.timezone };
      const statusTimezone = resolvePlanTimezone(recoveryOptions, deps.env || process.env);
      const { runResult, runId } = await runPlannedCall({
        config,
        deps,
        planId: recovery.planId,
        confirmToken: recovery.confirmToken,
        timezone: statusTimezone,
        recoveryId,
      });
      await writeRunCallSuccess({
        config,
        deps,
        stdout,
        options: recoveryOptions,
        runResult,
        runId,
        statusTimezone,
        includeRunResult: false,
      });
      return 0;
    }

    if (command === "status") {
      const toolName = "get_call_run";
      const result = await callCallStage({
        config,
        deps,
        stage: toolName,
        toolArguments: buildStatusArguments(options),
        callStarted: true,
        retrySafe: true,
      });
      localizeCallStatusResultTimestamps(result, options, deps.env || process.env);
      writeJson(stdout, mcpSuccessPayload({ config, toolName, result }));
      return 0;
    }

    throw new InvalidArgumentsError(`Unknown call command: ${command || ""}`.trim());
  } catch (error) {
    invalidateTokenIfMcpRejected(error, config);
    if (command === "plan") {
      if (error instanceof AuthRequiredError || isUnauthorizedMcpError(error)) {
        await captureTelemetry("auth_required", errorTelemetryProperties(error));
      } else if (error instanceof InvalidArgumentsError) {
        await captureTelemetry("cli_local_error", errorTelemetryProperties(error));
      }
    }
    return writeCommandError(stdout, stderr, error, config, helpCommandFor("call", command));
  }
}

// Picks the program that opens a URL in the user's browser.
//
// Windows is handled without cmd.exe on purpose. `cmd /c start "" <url>` lets cmd
// parse the URL, and `&` is a command separator there -- an OAuth URL is truncated
// at the first `&` (losing redirect_uri, state and scope) and the remaining query
// fragments are run as shell commands. rundll32 takes the URL as a single argument
// and never parses it.
//
// The Windows opener is named by its fully qualified path. An unqualified
// "rundll32" would be looked up with the CreateProcess search order, which checks
// the current directory before System32, so running `calle auth login` from an
// untrusted checkout holding a planted rundll32.exe would execute it.
// https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessa
//
// Exported so the tests can assert the exact executable and argv the CLI uses.
export function browserOpenCommand(url, platform = process.platform, env = process.env) {
  if (platform === "darwin") return ["open", [url]];
  if (platform !== "win32") return ["xdg-open", [url]];

  const systemRoot = env.SystemRoot || env.SYSTEMROOT || env.windir || "C:\\Windows";
  const rundll32 = `${systemRoot.replace(/[\\/]+$/, "")}\\System32\\rundll32.exe`;
  return [rundll32, ["url.dll,FileProtocolHandler", url]];
}

async function runCliCommand(argv, deps = {}) {
  const stdout = deps.stdout || ((text) => process.stdout.write(text));
  const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));
  const openBrowser = deps.openBrowser || (async (url) => {
    const { spawn } = await import("node:child_process");
    const [command, args] = browserOpenCommand(url, process.platform, process.env);
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    // Without a listener an 'error' event (a missing opener, say) becomes an
    // uncaught exception. Failing to open a browser should not take the CLI
    // down -- the URL is printed for the user either way.
    child.on("error", () => {});
    child.unref();
  });

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp(stdout, argv);
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-V")) {
    stdout(`${CLI_VERSION}\n`);
    return 0;
  }

  const [group, command, ...rest] = argv;
  const { options, positional, optionNames } = parseOptions(rest);
  assertSupportedOptions(group, command, optionNames);

  const config = resolveCliRuntimeConfig(options, deps.env || process.env);
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
      const pending = readPendingLogin(pendingPath);
      if (!options.forceLogin && tokenIsUsable(cached, config.minTtlSeconds) && !isActivePendingLogin(pending)) {
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
    if (result.status === "logged_in") {
      try {
        await verifyCachedTokenWithMcp({
          config,
          fetchImpl: deps.fetchImpl || globalThis.fetch,
        });
      } catch (error) {
        if (invalidateTokenIfMcpRejected(error, config)) {
          await captureTelemetry("auth_login_local_failed", errorTelemetryProperties(error));
          return writeCommandError(stdout, stderr, error, config);
        }
        throw error;
      }
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
    const removedRecoveries = removeCallRecoveries(config);
    writeJson(stdout, {
      server_url: config.serverUrl,
      cache_path: cachePath,
      pending_cache_path: pendingPath,
      removed_cache: cacheDocument !== null,
      removed_pending: pendingDocument !== null,
      removed_call_recoveries: removedRecoveries,
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

  if (group === "regions" && command === "list") {
    assertNoUnexpectedPositional(positional);
    writeJson(stdout, {
      supported_regions_and_languages_url: SUPPORTED_REGIONS_AND_LANGUAGES_URL,
    });
    return 0;
  }

  throw new InvalidArgumentsError(`Unknown command: ${[group, command].filter(Boolean).join(" ")}`);
}

export async function runCli(argv, deps = {}) {
  try {
    return await runCliCommand(argv, deps);
  } catch (error) {
    if (!(error instanceof InvalidArgumentsError)) {
      throw error;
    }

    const stdout = deps.stdout || ((text) => process.stdout.write(text));
    const stderr = deps.stderr || ((text) => process.stderr.write(`${text}\n`));
    const [group, command, ...rest] = argv;
    let config = null;
    try {
      const { options } = parseOptions(rest);
      config = resolveRuntimeConfig(options, deps.env || process.env);
    } catch {
      // Invalid option syntax may prevent runtime configuration from being resolved.
    }
    return writeCommandError(stdout, stderr, error, config, helpCommandFor(group, command));
  }
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
