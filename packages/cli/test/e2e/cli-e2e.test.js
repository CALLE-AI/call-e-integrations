import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { callRecoveryCachePath, pendingCachePath, tokenCachePath, writePrivateJson } from "../../lib/cache.js";
import { CLI_VERSION } from "../../lib/config.js";

const binPath = fileURLToPath(new URL("../../bin/calle.js", import.meta.url));
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const defaultIntegrationHeader = `cli/cli/${CLI_VERSION}`;

const accessToken = "e2e-token";
const sessionSecret = "secret-1";
const mcpSessionId = "mcp-session-1";
const expiresAt = "2030-01-01T00:00:00Z";

function makeTempCacheRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "calle-cli-e2e-"));
}

function serverUrl(baseUrl) {
  return `${baseUrl}/mcp/openagent_oauth`;
}

function writeToken(cacheRoot, baseUrl, token = accessToken) {
  writePrivateJson(tokenCachePath(cacheRoot, serverUrl(baseUrl)), {
    token: { access_token: token },
    expires_at: expiresAt,
  });
}

function runCalle(args, { env = {} } = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [binPath, ...args],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          CALLE_SOURCE: "",
          CALLE_INTEGRATION: "",
          CALLE_INTEGRATION_VERSION: "",
          ...env,
        },
        timeout: 10000,
        maxBuffer: 1024 * 1024,
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

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    assert.fail(`Expected JSON stdout, got:\n${stdout}\nParse error: ${error.message}`);
  }
}

function assertNoLeak(text, secrets) {
  for (const secret of secrets.filter(Boolean)) {
    assert.equal(text.includes(secret), false, `Expected output not to include secret: ${secret}`);
  }
}

async function readRequestJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function writeJson(res, payload, { status = 200, headers = {} } = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(`${JSON.stringify(payload)}\n`);
}

async function startFakeServer({ token = accessToken, unauthorizedMcp = false, droppedRunResponses = 0 } = {}) {
  let baseUrl = "";
  let runAttempts = 0;
  const state = {
    brokerCreates: [],
    brokerStatusCount: 0,
    brokerExchangeCount: 0,
    mcpRequests: [],
    toolCalls: [],
    acceptedRuns: [],
    telemetryEvents: [],
    failures: [],
  };

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      const pathname = requestUrl.pathname;

      if (req.method === "POST" && pathname === "/api/ui-telemetry/track") {
        const body = await readRequestJson(req);
        state.telemetryEvents.push(body);
        assert.equal(body.type, "track");
        assert.equal(typeof body.event, "string");
        assert.equal(typeof body.anonymousId, "string");
        assert.equal(typeof body.messageId, "string");
        writeJson(res, { accepted: true }, { status: 202 });
        return;
      }

      if (req.method === "POST" && pathname === "/api/v1/openagent-auth/sessions") {
        const body = await readRequestJson(req);
        state.brokerCreates.push(body);
        assert.equal(req.headers["x-call-e-integration"], defaultIntegrationHeader);
        assert.equal(body.channel, "openagent_oauth");
        assert.equal(body.server_url, serverUrl(baseUrl));
        assert.equal(body.auth_base_url, baseUrl);
        assert.equal(body.scope, "openid email profile");
        assert.equal(body.client_name, "calle Login");
        writeJson(res, {
          session_id: "session-1",
          session_secret: sessionSecret,
          login_url: `${baseUrl}/openagent-auth/sessions/session-1/start`,
          status: "PENDING",
          poll_after_ms: 1,
          expires_at: expiresAt,
        }, { status: 201 });
        return;
      }

      if (req.method === "GET" && pathname === "/api/v1/openagent-auth/sessions/session-1") {
        state.brokerStatusCount += 1;
        assert.equal(req.headers["x-openagent-session-secret"], sessionSecret);
        assert.equal(req.headers["x-call-e-integration"], defaultIntegrationHeader);
        writeJson(res, { status: "AUTHORIZED", expires_at: expiresAt });
        return;
      }

      if (req.method === "POST" && pathname === "/api/v1/openagent-auth/sessions/session-1/exchange") {
        state.brokerExchangeCount += 1;
        assert.equal(req.headers["x-openagent-session-secret"], sessionSecret);
        assert.equal(req.headers["x-call-e-integration"], defaultIntegrationHeader);
        writeJson(res, {
          token: { access_token: token },
          expires_at: expiresAt,
        });
        return;
      }

      if (pathname === "/mcp/openagent_oauth") {
        assert.equal(req.method, "POST");
        const payload = await readRequestJson(req);
        state.mcpRequests.push({ method: payload.method, payload, headers: req.headers });

        if (unauthorizedMcp) {
          writeJson(res, { error: "unauthorized" }, { status: 401 });
          return;
        }

        assert.equal(req.headers.authorization, `Bearer ${token}`);
        assert.match(req.headers["content-type"] || "", /application\/json/);
        assert.equal(req.headers["mcp-protocol-version"], "2025-11-25");
        assert.equal(req.headers["x-call-e-integration"], defaultIntegrationHeader);

        if (payload.method === "initialize") {
          writeJson(
            res,
            { jsonrpc: "2.0", id: payload.id, result: {} },
            { headers: { "mcp-session-id": mcpSessionId } }
          );
          return;
        }

        assert.equal(req.headers["mcp-session-id"], mcpSessionId);

        if (payload.method === "notifications/initialized") {
          writeJson(res, {});
          return;
        }

        if (payload.method === "tools/list") {
          writeJson(res, {
            jsonrpc: "2.0",
            id: payload.id,
            result: {
              tools: [{ name: "plan_call" }, { name: "run_call" }, { name: "get_call_run" }],
            },
          });
          return;
        }

        if (payload.method === "tools/call") {
          state.toolCalls.push(payload.params);
          const toolName = payload.params?.name;
          const toolArgs = payload.params?.arguments || {};
          if (toolName === "plan_call") {
            writeJson(res, {
              jsonrpc: "2.0",
              id: payload.id,
              result: {
                structuredContent: {
                  plan_id: "plan-1",
                  confirm_token: "confirm-1",
                  ready_to_run: true,
                  arguments: toolArgs,
                },
              },
            });
            return;
          }
          if (toolName === "run_call") {
            let run = state.acceptedRuns.find((accepted) =>
              accepted.plan_id === toolArgs.plan_id && accepted.confirm_token === toolArgs.confirm_token);
            if (!run) {
              run = { ...toolArgs, run_id: `run-${state.acceptedRuns.length + 1}` };
              state.acceptedRuns.push(run);
            }
            runAttempts += 1;
            if (runAttempts <= droppedRunResponses) {
              res.destroy();
              return;
            }
            writeJson(res, {
              jsonrpc: "2.0",
              id: payload.id,
              result: { structuredContent: { run_id: run.run_id, status: "STARTED" } },
            });
            return;
          }
          if (toolName === "get_call_run") {
            writeJson(res, {
              jsonrpc: "2.0",
              id: payload.id,
              result: {
                structuredContent: {
                  run_id: toolArgs.run_id,
                  status: toolArgs.run_id === "run-1" ? "IN_PROGRESS" : "COMPLETED",
                  cursor: toolArgs.cursor ?? null,
                  limit: toolArgs.limit ?? null,
                  activity: [{ ts: "2026-05-20T09:32:10.000Z", message: "Calling" }],
                  result: {
                    extracted: {
                      calling: {
                        started_at: "2026-05-20T09:32:10.000Z",
                        ended_at: "2026-05-20T16:01:02.000Z",
                      },
                    },
                  },
                },
              },
            });
            return;
          }
          writeJson(res, {
            jsonrpc: "2.0",
            id: payload.id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` },
          });
          return;
        }
      }

      writeJson(res, { error: `Unexpected route: ${req.method} ${pathname}` }, { status: 404 });
    } catch (error) {
      state.failures.push(error?.stack || String(error));
      writeJson(res, { error: error?.message || String(error) }, { status: 500 });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    state,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("prints help from the real CLI entrypoint", async () => {
  const result = await runCalle(["--help"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /auth/);
  assert.match(result.stdout, /mcp/);
  assert.match(result.stdout, /call/);
});

test("prints command-specific help from the real CLI entrypoint", async () => {
  const result = await runCalle(["call", "plan", "--help"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: calle call plan --to-phone <phone> --goal <text>/);
  assert.match(result.stdout, /--language <language>/);
  assert.match(result.stdout, /--region <region>/);
  assert.equal(result.stderr, "");
});

test("prints MCP config without contacting the server", async (t) => {
  const fake = await startFakeServer();
  t.after(() => fake.close());

  const result = await runCalle(["mcp", "config", "--base-url", fake.baseUrl]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(payload.mcpServers.calle, {
    type: "http",
    url: serverUrl(fake.baseUrl),
  });
  assert.equal(fake.state.brokerCreates.length, 0);
  assert.equal(fake.state.mcpRequests.length, 0);
  assert.deepEqual(fake.state.telemetryEvents.map((event) => event.event), ["cli_invoked"]);
  assert.deepEqual(fake.state.failures, []);
});

test("starts brokered auth and returns an authorization hint without polling", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));

  const result = await runCalle([
    "auth",
    "login",
    "--start-only",
    "--no-browser-open",
    "--base-url",
    fake.baseUrl,
    "--broker-base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.status, "login_required");
  assert.equal(payload.login_url, `${fake.baseUrl}/openagent-auth/sessions/session-1/start`);
  assert.match(payload.assistant_hint.message, /Before we start, please complete authorization here/);
  assert.equal(fake.state.brokerCreates.length, 1);
  assert.equal(fake.state.brokerStatusCount, 0);
  assert.equal(fake.state.brokerExchangeCount, 0);
  assertNoLeak(`${result.stdout}\n${result.stderr}`, [accessToken, sessionSecret]);
  assert.deepEqual(fake.state.telemetryEvents.map((event) => event.event), [
    "cli_invoked",
    "auth_login_local_started",
  ]);
  assertNoLeak(JSON.stringify(fake.state.telemetryEvents), [accessToken, sessionSecret, payload.login_url]);
  assert.deepEqual(fake.state.failures, []);
});

test("logs in through the fake broker and reports cache status", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));

  const loginResult = await runCalle([
    "auth",
    "login",
    "--base-url",
    fake.baseUrl,
    "--broker-base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
    "--no-browser-open",
  ]);
  const loginPayload = parseJson(loginResult.stdout);

  assert.equal(loginResult.code, 0);
  assert.equal(loginPayload.status, "logged_in");
  assert.equal(loginPayload.server_url, serverUrl(fake.baseUrl));
  assert.equal(fake.state.brokerCreates.length, 1);
  assert.equal(fake.state.brokerStatusCount, 1);
  assert.equal(fake.state.brokerExchangeCount, 1);
  assertNoLeak(`${loginResult.stdout}\n${loginResult.stderr}`, [accessToken, sessionSecret]);

  const tokenPath = tokenCachePath(cacheRoot, serverUrl(fake.baseUrl));
  const pendingPath = pendingCachePath(cacheRoot, serverUrl(fake.baseUrl));
  assert.equal(JSON.parse(fs.readFileSync(tokenPath, "utf8")).token.access_token, accessToken);
  assert.equal(fs.existsSync(pendingPath), false);

  const statusResult = await runCalle([
    "auth",
    "status",
    "--base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const statusPayload = parseJson(statusResult.stdout);

  assert.equal(statusResult.code, 0);
  assert.equal(statusPayload.cache_exists, true);
  assert.equal(statusPayload.usable, true);
  assertNoLeak(`${statusResult.stdout}\n${statusResult.stderr}`, [accessToken, sessionSecret]);
  assert.deepEqual(fake.state.telemetryEvents.map((event) => event.event), [
    "cli_invoked",
    "auth_login_local_started",
    "cli_invoked",
    "auth_status_checked",
  ]);
  assertNoLeak(JSON.stringify(fake.state.telemetryEvents), [accessToken, sessionSecret, `${fake.baseUrl}/openagent-auth/sessions/session-1/start`]);
  assert.deepEqual(fake.state.failures, []);
});

test("lists MCP tools with a cached token", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl);

  const result = await runCalle(["mcp", "tools", "--base-url", fake.baseUrl, "--cache-root", cacheRoot]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.method, "tools/list");
  assert.deepEqual(fake.state.mcpRequests.map((request) => request.method), [
    "initialize",
    "notifications/initialized",
    "tools/list",
  ]);
  assert.deepEqual(payload.result.tools.map((tool) => tool.name), ["plan_call", "run_call", "get_call_run"]);
  assertNoLeak(`${result.stdout}\n${result.stderr}`, [accessToken]);
  assert.deepEqual(fake.state.telemetryEvents.map((event) => event.event), ["cli_invoked", "mcp_tools_checked"]);
  assert.equal(fake.state.telemetryEvents.at(-1).properties.outcome, "success");
  assert.equal(fake.state.telemetryEvents.at(-1).properties.tool_count, 3);
  assert.deepEqual(fake.state.failures, []);
});

test("forwards mcp plan_call arguments and request meta", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl);

  const argsJson = '{"to_phones":["+15551234567"],"goal":"Confirm appointment"}';
  const result = await runCalle([
    "mcp",
    "call",
    "plan_call",
    "--args-json",
    argsJson,
    "--timezone",
    "Asia/Shanghai",
    "--base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.ok, true);
  assert.deepEqual(fake.state.telemetryEvents, []);
  assert.deepEqual(fake.state.toolCalls, [
    {
      name: "plan_call",
      arguments: { to_phones: ["+15551234567"], goal: "Confirm appointment" },
      _meta: {
        "openai/userLocation": { timezone: "Asia/Shanghai" },
        timezone_offset_minutes: -480,
      },
    },
  ]);
  assert.equal(fake.state.toolCalls[0]._meta["openai/subject"], undefined);
  assert.equal(fake.state.toolCalls[0]._meta["openai/session"], undefined);
  assert.equal(fake.state.toolCalls[0]._meta["openai/organization"], undefined);
  assert.deepEqual(fake.state.failures, []);
});

test("maps call plan flags to plan_call arguments", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl);

  const result = await runCalle([
    "call",
    "plan",
    "--to-phone",
    "+15551234567",
    "--to-phone",
    "+15557654321",
    "--goal",
    "Confirm appointment",
    "--language",
    "English",
    "--region",
    "US",
    "--timezone",
    "Asia/Shanghai",
    "--base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.tool_name, "plan_call");
  assert.deepEqual(fake.state.telemetryEvents, []);
  assert.deepEqual(fake.state.toolCalls, [
    {
      name: "plan_call",
      arguments: {
        to_phones: ["+15551234567", "+15557654321"],
        goal: "Confirm appointment",
        language: "English",
        region: "US",
      },
      _meta: {
        "openai/userLocation": { timezone: "Asia/Shanghai" },
        timezone_offset_minutes: -480,
      },
    },
  ]);
  assert.equal(fake.state.toolCalls[0]._meta["openai/subject"], undefined);
  assert.equal(fake.state.toolCalls[0]._meta["openai/session"], undefined);
  assert.equal(fake.state.toolCalls[0]._meta["openai/organization"], undefined);
  assert.deepEqual(fake.state.failures, []);
});

test("runs a planned call and fetches status once", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl);

  const result = await runCalle([
    "call",
    "run",
    "--plan-id",
    "plan-1",
    "--confirm-token",
    "confirm-1",
    "--timezone",
    "America/New_York",
    "--base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.run_result.structuredContent.status, "STARTED");
  assert.equal(payload.status_result.structuredContent.status, "IN_PROGRESS");
  assert.deepEqual(payload.status_result.structuredContent.activity, [
    { ts: "2026-05-20T05:32:10.000-04:00", message: "Calling" },
  ]);
  assert.equal(payload.status_result.structuredContent.result.extracted.calling.started_at, "2026-05-20T05:32:10.000-04:00");
  assert.equal(payload.status_result.structuredContent.result.extracted.calling.ended_at, "2026-05-20T12:01:02.000-04:00");
  assert.match(payload.next_command, /calle call status --run-id run-1/);
  assert.match(payload.next_command, /--timezone America\/New_York/);
  assert.deepEqual(fake.state.telemetryEvents, []);
  assert.deepEqual(fake.state.toolCalls, [
    { name: "run_call", arguments: { plan_id: "plan-1", confirm_token: "confirm-1" } },
    { name: "get_call_run", arguments: { run_id: "run-1" } },
  ]);
  assert.deepEqual(fake.state.failures, []);
});

test("starts a call without exposing plan confirmation data", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl);

  const result = await runCalle([
    "call",
    "start",
    "--to-phone",
    "+15551234567",
    "--goal",
    "Confirm appointment",
    "--timezone",
    "Asia/Shanghai",
    "--base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.run_result, undefined);
  assert.equal(payload.status_result.structuredContent.status, "IN_PROGRESS");
  assert.deepEqual(payload.status_result.structuredContent.activity, [
    { ts: "2026-05-20T17:32:10.000+08:00", message: "Calling" },
  ]);
  assert.equal(payload.status_result.structuredContent.result.extracted.calling.started_at, "2026-05-20T17:32:10.000+08:00");
  assert.equal(payload.status_result.structuredContent.result.extracted.calling.ended_at, "2026-05-21T00:01:02.000+08:00");
  assert.match(payload.next_command, /calle call status --run-id run-1/);
  assert.match(payload.next_command, /--timezone Asia\/Shanghai/);
  assertNoLeak(`${result.stdout}\n${result.stderr}`, ["confirm-1", "plan-1", accessToken]);
  assert.deepEqual(fake.state.telemetryEvents, []);
  assert.deepEqual(fake.state.toolCalls, [
    {
      name: "plan_call",
      arguments: { to_phones: ["+15551234567"], goal: "Confirm appointment" },
      _meta: {
        "openai/userLocation": { timezone: "Asia/Shanghai" },
        timezone_offset_minutes: -480,
      },
    },
    { name: "run_call", arguments: { plan_id: "plan-1", confirm_token: "confirm-1" } },
    { name: "get_call_run", arguments: { run_id: "run-1" } },
  ]);
  assert.deepEqual(fake.state.failures, []);
});

for (const command of ["start", "run"]) {
  test(`recovers call ${command} after accepted HTTP responses are lost without creating a new plan`, async (t) => {
    const fake = await startFakeServer({ droppedRunResponses: 2 });
    const cacheParent = makeTempCacheRoot();
    const cacheRoot = path.join(cacheParent, "recovery cache");
    t.after(() => fake.close());
    t.after(() => fs.rmSync(cacheParent, { recursive: true, force: true }));
    writeToken(cacheRoot, fake.baseUrl);

    const callArgs = command === "start"
      ? ["--to-phone", "+15551234567", "--goal", "Confirm appointment"]
      : ["--plan-id", "plan-1", "--confirm-token", "confirm-1"];
    const first = await runCalle([
      "call", command, ...callArgs,
      "--timezone", "Asia/Shanghai",
      "--base-url", fake.baseUrl,
      "--cache-root", cacheRoot,
    ]);
    const firstPayload = parseJson(first.stdout);

    assert.equal(first.code, 1);
    assert.equal(firstPayload.stage, "run_call");
    assert.equal(firstPayload.call_started, "unknown");
    assert.equal(firstPayload.retry_safe, false);
    assert.match(firstPayload.recovery_id, /^[A-Za-z0-9_-]{20,}$/u);
    assert.match(firstPayload.next_command, new RegExp(`^calle call recover --recovery-id ${firstPayload.recovery_id} `));
    assert.equal(fake.state.toolCalls.filter((call) => call.name === "run_call").length, 1);
    assert.equal(fake.state.acceptedRuns.length, 1);
    const recoveryPath = callRecoveryCachePath(cacheRoot, serverUrl(fake.baseUrl), firstPayload.recovery_id);
    const recoveryRecord = fs.readFileSync(recoveryPath, "utf8");
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(recoveryPath).mode & 0o777, 0o600);
    }

    const recoveryArgs = [
      "call", "recover", "--recovery-id", firstPayload.recovery_id,
      "--timezone", "Asia/Shanghai",
      "--server-url", serverUrl(fake.baseUrl),
      "--cache-root", cacheRoot,
    ];
    const quotedCacheRoot = `'${cacheRoot.replaceAll("'", "'\\''")}'`;
    assert.equal(firstPayload.next_command, ["calle", ...recoveryArgs.slice(0, -1), quotedCacheRoot].join(" "));
    const uncertain = await runCalle(recoveryArgs);
    const uncertainPayload = parseJson(uncertain.stdout);
    assert.equal(uncertain.code, 1);
    assert.equal(uncertainPayload.stage, "run_call");
    assert.equal(uncertainPayload.call_started, "unknown");
    assert.equal(uncertainPayload.retry_safe, false);
    assert.equal(uncertainPayload.recovery_id, firstPayload.recovery_id);
    assert.equal(uncertainPayload.next_command, firstPayload.next_command);
    assert.equal(fs.readFileSync(recoveryPath, "utf8"), recoveryRecord);
    assert.equal(fake.state.acceptedRuns.length, 1);

    const recovered = await runCalle(recoveryArgs);
    const recoveredPayload = parseJson(recovered.stdout);
    assert.equal(recovered.code, 0);
    assert.equal(recoveredPayload.ok, true);
    assert.equal(recoveredPayload.call_started, true);
    assert.equal(recoveredPayload.run_id, fake.state.acceptedRuns[0].run_id);
    assert.equal(recoveredPayload.status_query_succeeded, true);
    assert.equal(fs.existsSync(recoveryPath), false);
    assert.match(recoveredPayload.next_command, /calle call status --run-id run-1/);
    assert.deepEqual(fake.state.toolCalls.map((call) => call.name), [
      ...(command === "start" ? ["plan_call"] : []),
      "run_call", "run_call", "run_call", "get_call_run",
    ]);
    for (const call of fake.state.toolCalls.filter((call) => call.name === "run_call")) {
      assert.deepEqual(call.arguments, { plan_id: "plan-1", confirm_token: "confirm-1" });
    }
    assert.equal(fake.state.acceptedRuns.length, 1);
    for (const result of [first, uncertain, recovered]) {
      assertNoLeak(`${result.stdout}\n${result.stderr}`, ["plan-1", "confirm-1", accessToken]);
    }
    assert.deepEqual(fake.state.failures, []);
  });
}

test("maps call status flags to get_call_run arguments", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl);

  const result = await runCalle([
    "call",
    "status",
    "--run-id",
    "run-2",
    "--cursor",
    "cursor-1",
    "--limit",
    "20",
    "--timezone",
    "Asia/Shanghai",
    "--base-url",
    fake.baseUrl,
    "--cache-root",
    cacheRoot,
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.tool_name, "get_call_run");
  assert.deepEqual(fake.state.toolCalls, [
    { name: "get_call_run", arguments: { run_id: "run-2", cursor: "cursor-1", limit: 20 } },
  ]);
  assert.deepEqual(fake.state.telemetryEvents, []);
  assert.equal(payload.result.structuredContent.status, "COMPLETED");
  assert.deepEqual(payload.result.structuredContent.activity, [
    { ts: "2026-05-20T17:32:10.000+08:00", message: "Calling" },
  ]);
  assert.equal(payload.result.structuredContent.result.extracted.calling.started_at, "2026-05-20T17:32:10.000+08:00");
  assert.equal(payload.result.structuredContent.result.extracted.calling.ended_at, "2026-05-21T00:01:02.000+08:00");
  assert.deepEqual(fake.state.failures, []);
});

test("returns auth_required without contacting MCP when token is missing", async (t) => {
  const fake = await startFakeServer();
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));

  const result = await runCalle(["mcp", "tools", "--base-url", fake.baseUrl, "--cache-root", cacheRoot]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "auth_required");
  assert.match(payload.login_command, /calle auth login/);
  assert.equal(fake.state.mcpRequests.length, 0);
  assert.deepEqual(fake.state.telemetryEvents.map((event) => event.event), [
    "cli_invoked",
    "mcp_tools_checked",
    "auth_required",
  ]);
  assert.deepEqual(fake.state.failures, []);
});

test("returns auth_required for a remote 401 without leaking stale token", async (t) => {
  const staleToken = "stale-token";
  const fake = await startFakeServer({ token: staleToken, unauthorizedMcp: true });
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fake.close());
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  writeToken(cacheRoot, fake.baseUrl, staleToken);

  const result = await runCalle(["mcp", "tools", "--base-url", fake.baseUrl, "--cache-root", cacheRoot]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "auth_required");
  assert.equal(fake.state.mcpRequests.length, 1);
  assertNoLeak(`${result.stdout}\n${result.stderr}`, [staleToken]);
  assert.deepEqual(fake.state.telemetryEvents.map((event) => event.event), [
    "cli_invoked",
    "mcp_tools_checked",
    "auth_required",
  ]);
  assert.deepEqual(fake.state.failures, []);
});

test("returns structured invalid_arguments errors", async (t) => {
  const cacheRoot = makeTempCacheRoot();
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));

  const result = await runCalle([
    "call",
    "plan",
    "--to-phone",
    "+15551234567",
    "--base-url",
    "http://127.0.0.1:9",
    "--cache-root",
    cacheRoot,
    "--no-telemetry",
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_arguments");
  assert.match(payload.error.message, /--goal/);
  assert.equal(payload.help_command, "calle call plan --help");
  assert.match(result.stderr, /Run 'calle call plan --help' for usage\./);
});

test("returns command help for invalid option values", async () => {
  const result = await runCalle([
    "call",
    "plan",
    "--to-phone",
    "+15551234567",
    "--goal",
    "Confirm",
    "--timeout-seconds",
    "nope",
    "--no-telemetry",
  ]);
  const payload = parseJson(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(payload.error.code, "invalid_arguments");
  assert.match(payload.error.message, /--timeout-seconds expects a positive number of seconds/);
  assert.equal(payload.help_command, "calle call plan --help");
  assert.match(result.stderr, /Run 'calle call plan --help' for usage\./);
});
