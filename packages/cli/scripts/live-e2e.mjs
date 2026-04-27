#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const binPath = fileURLToPath(new URL("../bin/calle.js", import.meta.url));
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const DEFAULT_BASE_URL = "https://seleven-mcp-sg.airudder.com";
const DEFAULT_GOAL = "Verify the calle CLI live call flow.";
const LIVE_MARKER = `LIVE_E2E ${new Date().toISOString()}`;
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "NO ANSWER",
  "NO_ANSWER",
  "DECLINED",
  "CANCELED",
  "CANCELLED",
  "VOICEMAIL",
  "BUSY",
  "EXPIRED",
]);

const shouldRunCall = process.argv.includes("--call");
const env = process.env;
const baseUrl = env.CALLE_CLI_LIVE_BASE_URL || DEFAULT_BASE_URL;
const cacheRoot = env.CALLE_CLI_LIVE_CACHE_ROOT || path.join(os.tmpdir(), "calle-cli-live-e2e-cache");
const toPhone = env.CALLE_CLI_LIVE_TO_PHONE;
const goal = `${env.CALLE_CLI_LIVE_GOAL || DEFAULT_GOAL} ${LIVE_MARKER}`;
const language = env.CALLE_CLI_LIVE_LANGUAGE || "";
const region = env.CALLE_CLI_LIVE_REGION || "";
const cleanup = env.CALLE_CLI_LIVE_CLEANUP === "1";
const forceLogin = env.CALLE_CLI_LIVE_FORCE_LOGIN === "1";
let pollIntervalSeconds = 5;
let pollTimeoutSeconds = 600;
let acceptedTerminalStatuses = new Set(["COMPLETED"]);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`Live E2E failed: ${message}\n`);
  process.exitCode = 1;
}

function parsePositiveIntegerEnv(name, defaultValue) {
  const raw = env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function runCalle(args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [binPath, ...args],
      {
        cwd: packageRoot,
        env: { ...process.env, FORCE_COLOR: "0" },
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          signal: error?.signal ?? null,
          stdout,
          stderr,
        });
      }
    );
  });
}

function parseJson(stdout, step) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${step} did not print JSON: ${error.message}\nstdout:\n${stdout}`);
  }
}

function assertExitOk(result, step) {
  if (result.code !== 0) {
    throw new Error(`${step} exited ${result.code}${result.signal ? ` (${result.signal})` : ""}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  }
}

function assertNoAccessTokenLeak(result, step) {
  const combined = `${result.stdout}\n${result.stderr}`;
  if (/access_token"\s*:/i.test(combined) || /access_token'\s*:/i.test(combined)) {
    throw new Error(`${step} output includes an access_token field`);
  }
}

async function runJsonStep(step, args, { logCommand = true } = {}) {
  if (logCommand) {
    log(`\n[${step}] calle ${redactArgs(args).join(" ")}`);
  }
  const result = await runCalle(args);
  assertNoAccessTokenLeak(result, step);
  assertExitOk(result, step);
  const payload = parseJson(result.stdout, step);
  return { result, payload };
}

function redactArgs(args) {
  const redacted = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    redacted.push(arg);
    if (arg === "--confirm-token" && index + 1 < args.length) {
      redacted.push("<redacted>");
      index += 1;
    }
  }
  return redacted;
}

function structuredPayload(result) {
  return result?.structuredContent || result?.structured_content || result || {};
}

function normalizeStatus(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function statusVariants(status) {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return [];
  }
  return [
    normalized,
    normalized.replace(/_/g, " "),
    normalized.replace(/ /g, "_"),
  ];
}

function statusMatches(statusSet, status) {
  return statusVariants(status).some((variant) => statusSet.has(variant));
}

function isTerminalStatus(status) {
  return statusMatches(TERMINAL_STATUSES, status);
}

function acceptedStatuses() {
  const raw = env.CALLE_CLI_LIVE_ACCEPT_STATUSES || "COMPLETED";
  const values = raw
    .split(",")
    .map((value) => normalizeStatus(value))
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error("CALLE_CLI_LIVE_ACCEPT_STATUSES must include at least one status");
  }
  return new Set(values);
}

function extractStatus(payload) {
  const candidates = [
    structuredPayload(payload?.result)?.status,
    structuredPayload(payload?.status_result)?.status,
    structuredPayload(payload)?.status,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeStatus(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function extractProgressMessage(payload) {
  const structured = structuredPayload(payload?.result);
  const candidates = [
    structured.message,
    structured.result?.message,
    structured.result?.post_summary,
    structured.result?.summary,
    structuredPayload(payload)?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  const activity = Array.isArray(structured.activity) ? structured.activity : [];
  for (let index = activity.length - 1; index >= 0; index -= 1) {
    const message = activity[index]?.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return "";
}

function getObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function formatDuration(value) {
  if (!Number.isInteger(value) || value < 0) {
    return "";
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}min${String(seconds).padStart(2, "0")}s`;
}

function finalStructuredContent(payload) {
  return getObject(structuredPayload(payload?.result));
}

function formatActivityLine(event) {
  if (!event || typeof event !== "object") {
    return "";
  }
  const ts = firstNonEmptyString(event.ts, event.timestamp, event.created_at, event.createdAt);
  const kind = firstNonEmptyString(event.kind, event.type, event.status);
  const message = firstNonEmptyString(event.message, event.text, event.detail);
  const parts = [];
  if (ts) {
    parts.push(ts);
  }
  if (kind) {
    parts.push(kind);
  }
  if (message) {
    parts.push(message);
  }
  return parts.length > 0 ? `- ${parts.join(" | ")}` : "";
}

function logSection(title, lines) {
  log(`\n[${title}]`);
  const printable = lines.filter(Boolean);
  if (printable.length === 0) {
    log("Not available");
    return;
  }
  for (const line of printable) {
    log(line);
  }
}

function printFinalCallResult(runId, payload) {
  const structured = finalStructuredContent(payload);
  const result = getObject(structured.result);
  const extracted = getObject(result.extracted);
  const calling = getObject(extracted.calling);
  const toPhones = Array.isArray(extracted.to_phones) ? extracted.to_phones : [];
  const activity = Array.isArray(structured.activity) ? structured.activity : [];
  const status = extractStatus(payload) || "UNKNOWN";
  const message = extractProgressMessage(payload);
  const summary = firstNonEmptyString(result.post_summary, result.summary, structured.summary, structured.message, message);
  const transcript = firstNonEmptyString(result.transcript, structured.transcript);
  const callId = firstNonEmptyString(result.call_id, calling.call_id, structured.call_id);
  const callee = firstNonEmptyString(calling.callee, toPhones[0]);
  const duration = formatDuration(calling.duration_seconds) || firstNonEmptyString(calling.duration, result.duration);
  const startedAt = firstNonEmptyString(calling.started_at, result.started_at, structured.started_at);
  const endedAt = firstNonEmptyString(calling.ended_at, result.ended_at, structured.ended_at);

  logSection("call result", [
    `run_id: ${runId}`,
    `status: ${status}`,
    message ? `message: ${message}` : "",
    summary ? `summary: ${summary}` : "",
  ]);
  logSection("call details", [
    callee ? `callee_number: ${callee}` : "",
    duration ? `duration: ${duration}` : "",
    startedAt ? `started_at: ${startedAt}` : "",
    endedAt ? `ended_at: ${endedAt}` : "",
    callId ? `call_id: ${callId}` : "",
  ]);
  logSection("activity", activity.map(formatActivityLine));
  logSection("transcript", transcript ? [transcript] : []);
  logSection("final structured content", [JSON.stringify(structured || {}, null, 2)]);
}

function textContent(result) {
  if (!Array.isArray(result?.content)) {
    return "";
  }
  return result.content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n");
}

function extractField(result, fieldName) {
  const structured = structuredPayload(result);
  if (typeof structured?.[fieldName] === "string" && structured[fieldName].trim()) {
    return structured[fieldName].trim();
  }
  const text = textContent(result);
  const jsonMatch = text.match(/\{[\s\S]*\}/u);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const parsedStructured = structuredPayload(parsed);
      if (typeof parsedStructured?.[fieldName] === "string" && parsedStructured[fieldName].trim()) {
        return parsedStructured[fieldName].trim();
      }
      if (typeof parsed?.[fieldName] === "string" && parsed[fieldName].trim()) {
        return parsed[fieldName].trim();
      }
    } catch {
      // Fall through to loose text matching.
    }
  }
  const loose = new RegExp(`\\b${fieldName}\\b["'\\s:=]+([A-Za-z0-9_-]+)`, "u").exec(text);
  return loose?.[1] ?? null;
}

function requireField(result, fieldName, step) {
  const value = extractField(result, fieldName);
  if (!value) {
    throw new Error(`${step} did not return ${fieldName}`);
  }
  return value;
}

function toolNames(toolsPayload) {
  const tools = toolsPayload?.result?.tools || toolsPayload?.tools || [];
  return tools.map((tool) => tool?.name).filter(Boolean);
}

function requireTools(toolsPayload) {
  const names = toolNames(toolsPayload);
  for (const name of ["plan_call", "run_call", "get_call_run"]) {
    if (!names.includes(name)) {
      throw new Error(`mcp tools did not include ${name}; got ${names.join(", ") || "<none>"}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function manualStatusCommand(runId) {
  return [
    "calle",
    "call",
    "status",
    "--run-id",
    runId,
    "--base-url",
    baseUrl,
    "--cache-root",
    cacheRoot,
  ].join(" ");
}

async function pollCallUntilTerminal(runId, commonArgs) {
  const deadline = Date.now() + pollTimeoutSeconds * 1000;
  const intervalMs = pollIntervalSeconds * 1000;
  let pollCount = 0;
  let lastStatus = "";
  let lastMessage = "";

  log(`\n[call status poll] interval=${pollIntervalSeconds}s timeout=${pollTimeoutSeconds}s accepted=${[...acceptedTerminalStatuses].join(",")}`);

  while (Date.now() <= deadline) {
    pollCount += 1;
    const statusResult = await runJsonStep(
      `call status poll #${pollCount}`,
      [
        "call",
        "status",
        "--run-id",
        runId,
        ...commonArgs,
      ],
      { logCommand: false }
    );
    if (statusResult.payload.ok !== true) {
      throw new Error("call status did not return ok=true");
    }

    const status = extractStatus(statusResult.payload) || "UNKNOWN";
    const message = extractProgressMessage(statusResult.payload);
    if (status !== lastStatus || message !== lastMessage || pollCount === 1) {
      log(`[call status poll #${pollCount}] status=${status}${message ? ` message=${message}` : ""}`);
    }
    lastStatus = status;
    lastMessage = message;

    if (isTerminalStatus(status)) {
      if (statusMatches(acceptedTerminalStatuses, status)) {
        log(`[call status poll] terminal accepted status=${status}`);
        return statusResult.payload;
      }
      throw new Error(`call reached terminal status ${status}, which is not accepted. Manual status command: ${manualStatusCommand(runId)}`);
    }

    if (Date.now() + intervalMs > deadline) {
      break;
    }
    await sleep(intervalMs);
  }

  throw new Error(`timed out waiting for call to finish. run_id=${runId} last_status=${lastStatus || "UNKNOWN"} manual_status_command="${manualStatusCommand(runId)}"`);
}

async function cleanupCache() {
  if (!cleanup) {
    log(`\n[cleanup] Preserving live cache root: ${cacheRoot}`);
    log("Set CALLE_CLI_LIVE_CLEANUP=1 to run auth logout and remove the live cache root.");
    return;
  }

  log("\n[cleanup] Logging out and removing live cache root");
  await runCalle(["auth", "logout", "--base-url", baseUrl, "--cache-root", cacheRoot]);
  fs.rmSync(cacheRoot, { recursive: true, force: true });
}

async function main() {
  if (!toPhone || !toPhone.trim()) {
    throw new Error("CALLE_CLI_LIVE_TO_PHONE is required");
  }
  pollIntervalSeconds = parsePositiveIntegerEnv("CALLE_CLI_LIVE_POLL_INTERVAL_SECONDS", 5);
  pollTimeoutSeconds = parsePositiveIntegerEnv("CALLE_CLI_LIVE_POLL_TIMEOUT_SECONDS", 600);
  acceptedTerminalStatuses = acceptedStatuses();

  log("Starting Calle CLI live E2E.");
  log(`Base URL: ${baseUrl}`);
  log(`Cache root: ${cacheRoot}`);
  log(`Marker: ${LIVE_MARKER}`);
  log(`Poll interval: ${pollIntervalSeconds}s`);
  log(`Poll timeout: ${pollTimeoutSeconds}s`);
  log(`Accepted terminal statuses: ${[...acceptedTerminalStatuses].join(", ")}`);
  log("Remote call plans/runs are not deleted by this script.");

  const commonArgs = ["--base-url", baseUrl, "--cache-root", cacheRoot];

  const loginArgs = ["auth", "login", ...commonArgs];
  if (forceLogin) {
    loginArgs.push("--force-login");
  }
  const login = await runJsonStep("auth login", loginArgs);
  if (!["logged_in", "cached"].includes(login.payload.status)) {
    throw new Error(`auth login returned unexpected status: ${login.payload.status}`);
  }

  const status = await runJsonStep("auth status", ["auth", "status", ...commonArgs]);
  if (!status.payload.cache_exists || !status.payload.usable) {
    throw new Error("auth status did not report a usable token cache");
  }

  const tools = await runJsonStep("mcp tools", ["mcp", "tools", ...commonArgs]);
  if (tools.payload.ok !== true) {
    throw new Error("mcp tools did not return ok=true");
  }
  requireTools(tools.payload);

  const planArgs = [
    "call",
    "plan",
    "--to-phone",
    toPhone,
    "--goal",
    goal,
    ...commonArgs,
  ];
  if (language) {
    planArgs.push("--language", language);
  }
  if (region) {
    planArgs.push("--region", region);
  }
  const plan = await runJsonStep("call plan", planArgs);
  if (plan.payload.ok !== true) {
    throw new Error("call plan did not return ok=true");
  }
  const planId = requireField(plan.payload.result, "plan_id", "call plan");
  const confirmToken = requireField(plan.payload.result, "confirm_token", "call plan");

  log(`\n[call plan] plan_id=${planId}`);
  log("call plan completed.");

  if (!shouldRunCall) {
    log("\nLive E2E completed without running a real call.");
    return;
  }

  log("verify:live:call requested; running the planned call immediately.");

  const run = await runJsonStep("call run", [
    "call",
    "run",
    "--plan-id",
    planId,
    "--confirm-token",
    confirmToken,
    ...commonArgs,
  ]);
  if (run.payload.ok !== true) {
    throw new Error("call run did not return ok=true");
  }
  const runId = run.payload.run_id || requireField(run.payload.run_result, "run_id", "call run");
  log(`\n[call run] run_id=${runId}`);

  const finalStatus = await pollCallUntilTerminal(runId, commonArgs);
  printFinalCallResult(runId, finalStatus);

  log("\nLive E2E completed with a real call run.");
}

try {
  await main();
} catch (error) {
  fail(error?.message || String(error));
} finally {
  try {
    await cleanupCache();
  } catch (error) {
    process.stderr.write(`Live E2E cleanup failed: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}
