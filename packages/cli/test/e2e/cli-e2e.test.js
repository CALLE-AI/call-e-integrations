import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { callRecoveryCachePath, pendingCachePath, tokenCachePath, writeCallRecovery, writePrivateJson } from "../../lib/cache.js";
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

function runCalle(args, { entry = binPath, env = {} } = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [entry, ...args],
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

async function startFakeServer({ token = accessToken, unauthorizedMcp = false, droppedRunResponses = 0, integrationHeader = defaultIntegrationHeader, planId = "plan-1", confirmToken = "confirm-1", runId = null } = {}) {
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
        assert.equal(req.headers["x-call-e-integration"], integrationHeader);
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
        assert.equal(req.headers["x-call-e-integration"], integrationHeader);
        writeJson(res, { status: "AUTHORIZED", expires_at: expiresAt });
        return;
      }

      if (req.method === "POST" && pathname === "/api/v1/openagent-auth/sessions/session-1/exchange") {
        state.brokerExchangeCount += 1;
        assert.equal(req.headers["x-openagent-session-secret"], sessionSecret);
        assert.equal(req.headers["x-call-e-integration"], integrationHeader);
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
        assert.equal(req.headers["x-call-e-integration"], integrationHeader);

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
                  plan_id: planId,
                  confirm_token: confirmToken,
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
              run = { ...toolArgs, run_id: runId ?? `run-${state.acceptedRuns.length + 1}` };
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
  test(`recovers call ${command} through a verified entry despite PATH shadowing and lost HTTP responses`, async (t) => {
    const attribution = ["--source", "test_agent", "--integration", "test_plugin", "--integration-version", "1.0.0"];
    const fake = await startFakeServer({ droppedRunResponses: 2, integrationHeader: "test_agent/test_plugin/1.0.0" });
    const cacheParent = makeTempCacheRoot();
    const cacheRoot = path.join(cacheParent, "recovery cache");
    t.after(() => fake.close());
    t.after(() => fs.rmSync(cacheParent, { recursive: true, force: true }));
    const fakeBin = path.join(cacheParent, "fake-bin");
    const interceptedArgs = path.join(cacheParent, "intercepted-args.jsonl");
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(path.join(fakeBin, "calle"), [
      "#!/usr/bin/env node",
      `require("node:fs").appendFileSync(${JSON.stringify(interceptedArgs)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    ].join("\n"), { mode: 0o755 });

    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.name, "@call-e/cli");
    assert.equal(manifest.bin.calle, "./bin/calle.js");
    const entry = fs.realpathSync(path.resolve(packageRoot, manifest.bin.calle));
    assert.equal(entry, fs.realpathSync(binPath));
    const cliOptions = { entry, env: { PATH: [fakeBin, process.env.PATH].join(path.delimiter) } };
    const help = await runCalle(["--help"], cliOptions);
    assert.equal(help.code, 0);
    for (const commandName of ["auth login", "mcp tools", "call run", "call recover", "--source", "--integration", "--integration-version"]) {
      assert.ok(help.stdout.includes(commandName));
    }

    writeToken(cacheRoot, fake.baseUrl);
    const auth = await runCalle([
      "auth", "status", "--base-url", fake.baseUrl, "--cache-root", cacheRoot, "--no-telemetry",
      ...attribution,
    ], cliOptions);
    assert.equal(auth.code, 0);
    assert.equal(parseJson(auth.stdout).usable, true);

    const callArgs = command === "start"
      ? ["--to-phone", "+15551234567", "--goal", "Confirm appointment"]
      : ["--plan-id", "plan-1", "--confirm-token", "confirm-1"];
    const first = await runCalle([
      "call", command, ...callArgs,
      "--timezone", "Asia/Shanghai",
      "--base-url", fake.baseUrl,
      "--cache-root", cacheRoot,
      ...attribution,
    ], cliOptions);
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
    assert.deepEqual(firstPayload.next_argv, recoveryArgs);
    const uncertain = await runCalle([...firstPayload.next_argv, ...attribution], cliOptions);
    const uncertainPayload = parseJson(uncertain.stdout);
    assert.equal(uncertain.code, 1);
    assert.equal(uncertainPayload.stage, "run_call");
    assert.equal(uncertainPayload.call_started, "unknown");
    assert.equal(uncertainPayload.retry_safe, false);
    assert.equal(uncertainPayload.recovery_id, firstPayload.recovery_id);
    assert.equal(uncertainPayload.next_command, firstPayload.next_command);
    assert.equal(fs.readFileSync(recoveryPath, "utf8"), recoveryRecord);
    assert.equal(fake.state.acceptedRuns.length, 1);

    assert.deepEqual(uncertainPayload.next_argv, recoveryArgs);
    const recovered = await runCalle([...uncertainPayload.next_argv, ...attribution], cliOptions);
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
    for (const result of [auth, first, uncertain, recovered]) {
      assertNoLeak(`${result.stdout}\n${result.stderr}`, ["plan-1", "confirm-1", accessToken]);
    }
    assert.equal(fs.existsSync(interceptedArgs), false, "PATH calle must receive no arguments");
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

const launcherPath = path.join(packageRoot, "scripts", "run-agent-command.mjs");
const repoRoot = path.resolve(packageRoot, "../..");

async function runAgentRequest(request, cwd, { launcher = launcherPath, env = {}, shell = "node", command = "node run-agent-command.mjs request.json" } = {}) {
  fs.copyFileSync(launcher, path.join(cwd, "run-agent-command.mjs"));
  fs.writeFileSync(path.join(cwd, "request.json"), JSON.stringify(request), { mode: 0o600 });
  const invocation = shell === "node" ? [process.execPath, ["run-agent-command.mjs", "request.json"]]
    : shell === "bash" ? ["bash", ["-c", command]]
    : shell === "cmd" ? [process.env.ComSpec, ["/d", "/s", "/c", command]]
    : [shell === "pwsh" ? process.env.CALLE_TEST_PWSH || "pwsh" : shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command + "; exit $LASTEXITCODE"]];
  return new Promise((resolve) => {
    execFile(invocation[0], invocation[1], {
      cwd,
      env: { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].join(path.delimiter), ...env },
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
}

test("agent launcher rejects missing or wrong packages before executing their code", async (t) => {
  const root = makeTempCacheRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidate = path.join(root, "candidate");
  fs.mkdirSync(path.join(candidate, "bin"), { recursive: true });
  const marker = path.join(root, "executed");
  fs.writeFileSync(path.join(candidate, "bin", "calle.js"), "require('node:fs').writeFileSync(" + JSON.stringify(marker) + ", 'executed');");
  const argv = ["call", "run", "--plan-id", "private-plan", "--confirm-token", "private-confirm"];
  for (const manifest of [null, { name: "@call-e/calle", bin: { calle: "./bin/calle.js" } }, { name: "@call-e/cli", bin: { calle: "./dist/cli.js" } }]) {
    if (manifest) fs.writeFileSync(path.join(candidate, "package.json"), JSON.stringify(manifest));
    const result = await runAgentRequest({ package_dir: candidate, argv }, root);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /MCP package identity/);
    assertNoLeak(result.stdout + result.stderr, argv.slice(3));
    assert.equal(fs.existsSync(marker), false);
  }
});

test("agent launcher checks subcommand help without request values or inherited credentials", async (t) => {
  const root = makeTempCacheRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "bin"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@call-e/cli", bin: { calle: "bin/calle.js" } }));
  const captured = path.join(root, "probes.jsonl");
  fs.writeFileSync(path.join(root, "bin", "calle.js"), [
    "const fs = require('node:fs');",
    "fs.appendFileSync(" + JSON.stringify(captured) + ", JSON.stringify({argv:process.argv.slice(2), secret:process.env.CALLE_TEST_SECRET}) + '\\n');",
    "console.log(process.argv.length === 3 ? 'auth login call plan call run call recover next_argv' : 'incompatible auth help');",
  ].join("\n"));
  const request = { package_dir: root, argv: ["call", "run", "--plan-id", "private-plan", "--confirm-token", "private-confirm"] };
  const result = await runAgentRequest(request, root, { env: { CALLE_TEST_SECRET: "inherited-secret" } });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /MCP command help check failed/);
  const probes = fs.readFileSync(captured, "utf8");
  assert.deepEqual(probes.trim().split("\n").map(JSON.parse), [{ argv: ["--help"] }, { argv: ["auth", "login", "--help"] }]);
  assertNoLeak(probes + result.stdout + result.stderr, ["private-plan", "private-confirm", "inherited-secret"]);
});

test("agent launcher rejects invalid request data without echoing it", async (t) => {
  const root = makeTempCacheRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const request of [
    null, [], {}, { package_dir: "relative", argv: ["--help"] },
    { package_dir: packageRoot, argv: "private-request-data" },
    { package_dir: packageRoot, argv: [] },
    { package_dir: packageRoot, argv: ["private-request-data\0"] },
    { package_dir: packageRoot, argv: ["--help"], integration: { source: "private-request-data" } },
  ]) {
    const result = await runAgentRequest(request, root);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Invalid agent request/);
    assertNoLeak(result.stdout + result.stderr, ["private-request-data"]);
  }
});

async function runNpm(args, cwd) {
  const name = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmBin = (process.env.PATH || "").split(path.delimiter).map((dir) => path.join(dir, name)).find((file) => fs.existsSync(file));
  assert.ok(npmBin, "npm must be installed for the mixed-install acceptance test");
  const npmCli = process.platform === "win32" ? path.join(path.dirname(npmBin), "node_modules/npm/bin/npm-cli.js") : fs.realpathSync(npmBin);
  const result = await new Promise((resolve) => {
    execFile(process.execPath, [npmCli, ...args], {
      cwd,
      env: { ...process.env, CALLE_API_KEY: "", DO_NOT_TRACK: "1", CALLE_TELEMETRY: "0" },
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result;
}

test("agent requests preserve opaque values and recover once with the old SDK and a shadowing calle installed", async (t) => {
  const root = makeTempCacheRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installation = path.join(root, "mixed installation");
  fs.mkdirSync(installation);
  fs.writeFileSync(path.join(installation, "package.json"), '{"private":true}\n');
  await runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "@call-e/calle@0.7.0", "@call-e/cli@0.5.0"], installation);
  const sdk = path.join(installation, "node_modules/@call-e/calle");
  const mcp = path.join(installation, "node_modules/@call-e/cli");
  assert.equal(JSON.parse(fs.readFileSync(path.join(sdk, "package.json"))).bin.calle, "./dist/cli.js");
  const sdkLog = path.join(root, "sdk-arguments.jsonl");
  const sdkEntry = path.join(sdk, "dist/cli.js");
  const sdkSource = fs.readFileSync(sdkEntry, "utf8");
  const recording = "import { appendFileSync as recordSdkArgs } from 'node:fs';\n" +
    "recordSdkArgs(" + JSON.stringify(sdkLog) + ", JSON.stringify(process.argv.slice(2)) + '\\n');\n";
  fs.writeFileSync(sdkEntry, sdkSource.replace(/^(#![^\n]*\n)/u, "$1" + recording));
  const collision = await runNpm(["exec", "--yes", "--package", "@call-e/cli@0.5.0", "--", "calle", "--help"], installation);
  assert.match(collision.stdout, /calle calls create/);
  assert.deepEqual(JSON.parse(fs.readFileSync(sdkLog, "utf8").trim()), ["--help"]);
  fs.unlinkSync(sdkLog);
  const wrongPackage = await runAgentRequest({ package_dir: sdk, argv: ["call", "run", "--confirm-token", "private-test-confirm"] }, root);
  assert.equal(wrongPackage.code, 1);
  assert.match(wrongPackage.stderr, /MCP package identity/);
  assert.equal(fs.existsSync(sdkLog), false);

  const oldHelp = await runAgentRequest({ package_dir: mcp, argv: ["auth", "status"] }, root);
  assert.equal(oldHelp.code, 1, "old MCP help must fail the argv-capability check");
  assert.match(oldHelp.stderr, /MCP command help check failed/);
  // ponytail: dependency fixtures are CLI 0.5.0; install a candidate tarball when runtime dependencies change.
  for (const dir of ["bin", "lib", "scripts"]) fs.cpSync(path.join(packageRoot, dir), path.join(mcp, dir), { recursive: true });

  const fakeBin = path.join(root, "fake bin");
  const fakeLog = path.join(root, "shadow-arguments.jsonl");
  fs.mkdirSync(fakeBin);
  const fakeSource = "require('node:fs').appendFileSync(" + JSON.stringify(fakeLog) + ", JSON.stringify(process.argv.slice(2)) + '\\n');";
  fs.writeFileSync(path.join(fakeBin, "calle"), "#!/usr/bin/env node\n" + fakeSource, { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, "capture.cjs"), fakeSource);
  fs.writeFileSync(path.join(fakeBin, "calle.cmd"), '@"' + process.execPath + '" "%~dp0capture.cjs" %*\r\n');
  const env = { PATH: [fakeBin, process.env.PATH].join(path.delimiter) };
  const poison = "O'Hare \" $(touch injected) `touch injected` \\ & echo injected>injected &\n中文";
  const fake = await startFakeServer({ droppedRunResponses: 1, planId: "plan-" + poison, confirmToken: "confirm-" + poison, runId: "run-" + poison });
  t.after(() => fake.close());
  const cacheRoot = path.join(root, "private cache 中文");
  const common = ["--base-url", fake.baseUrl, "--cache-root", cacheRoot, "--no-telemetry"];
  const invoke = (argv) => runAgentRequest({ package_dir: mcp, argv }, root, { env });

  const unauth = parseJson((await invoke(["mcp", "tools", ...common])).stdout);
  assert.equal(unauth.error.code, "auth_required");
  assert.deepEqual(unauth.login_argv, ["auth", "login", "--server-url", serverUrl(fake.baseUrl), "--broker-base-url", fake.baseUrl, "--auth-base-url", fake.baseUrl, "--channel", "openagent_oauth", "--cache-root", cacheRoot]);
  const login = await invoke([...unauth.login_argv, "--no-browser-open", "--no-telemetry"]);
  assert.equal(login.code, 0, login.stderr);
  const invalid = parseJson((await invoke(["call", "plan", ...common])).stdout);
  assert.deepEqual(invalid.help_argv, ["call", "plan", "--help"]);
  assert.equal((await invoke(invalid.help_argv)).code, 0);

  const rawPlan = await invoke(["mcp", "call", "plan_call", "--args-json", JSON.stringify({ user_input: poison }), ...common]);
  assert.equal(rawPlan.code, 0, rawPlan.stderr);
  assert.equal(fake.state.toolCalls.at(-1).arguments.user_input, poison);
  const plan = await invoke(["call", "plan", "--to-phone", "+15551234567", "--goal", poison, ...common]);
  assert.equal(plan.code, 0, plan.stderr);
  const credentials = parseJson(plan.stdout).result.structuredContent;
  const first = await invoke(["call", "run", "--plan-id", credentials.plan_id, "--confirm-token", credentials.confirm_token, "--timezone", "Asia/Shanghai", ...common]);
  assert.equal(first.code, 1);
  const pending = parseJson(first.stdout);
  assert.equal(pending.call_started, "unknown");
  assert.equal(fake.state.toolCalls.findLast((call) => call.name === "plan_call").arguments.goal, poison);
  const recovered = await invoke([...pending.next_argv, "--no-telemetry"]);
  assert.equal(recovered.code, 0, recovered.stderr);
  const completed = parseJson(recovered.stdout);
  assert.equal(completed.run_id, "run-" + poison);
  assert.equal((await invoke([...completed.next_argv, "--no-telemetry"])).code, 0);
  assert.equal(fake.state.toolCalls.at(-1).arguments.run_id, "run-" + poison);
  assert.equal(fake.state.acceptedRuns.length, 1);
  assert.deepEqual(fake.state.toolCalls.filter((call) => call.name === "run_call").map((call) => call.arguments), [
    { plan_id: "plan-" + poison, confirm_token: "confirm-" + poison },
    { plan_id: "plan-" + poison, confirm_token: "confirm-" + poison },
  ]);
  assert.equal(fs.existsSync(path.join(root, "injected")), false);
  assert.equal(fs.existsSync(sdkLog), false, "SDK must receive no auth or confirmation arguments");
  assert.equal(fs.existsSync(fakeLog), false, "PATH shim must receive no auth or confirmation arguments");
  assert.deepEqual(fake.state.failures, []);
});

test("agent launcher accepts JSON on stdin and rejects malformed JSON without exposing it", async (t) => {
  const root = makeTempCacheRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const input of [JSON.stringify({ package_dir: packageRoot, argv: ["auth", "status", "--cache-root", root, "--no-telemetry"] }), '{"private-malformed-input"']) {
    const result = await new Promise((resolve) => {
      const child = execFile(process.execPath, [launcherPath], { cwd: root, timeout: 30000 }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
      child.stdin.end(input);
    });
    if (input.includes("private-malformed-input")) {
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Invalid agent request/);
      assertNoLeak(result.stdout + result.stderr, ["private-malformed-input"]);
    } else {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(parseJson(result.stdout).usable, false);
    }
  }
});

const documentationProfiles = [
  { source: "codex", name: "codex_plugin", package: "codex-plugin", skill: "packages/codex-plugin/plugin/skills/calle", docs: ["docs/install/codex-plugin.md", "packages/codex-plugin/plugin/README.md"] },
  { source: "claude", name: "claude_code_plugin", package: "claude-plugin", skill: "packages/claude-plugin/plugin/skills/calle", docs: ["docs/install/claude-plugin.md"] },
  { source: "cursor", name: "cursor_plugin", package: "cursor-plugin", skill: "packages/cursor-plugin/plugin/skills/calle", docs: ["docs/install/cursor-plugin.md"] },
  { source: "openclaw", name: "openclaw_cli_skill", package: "openclaw-cli-skill", skill: "packages/openclaw-cli-skill/skills/phone-call-calle", docs: ["docs/install/openclaw-cli-skill.md"] },
  { source: "skills_sh", name: "skills_sh_skill", package: "skills-sh-skill", skill: "skills/calle", docs: ["docs/install/skills-sh-skill.md", "docs/install/CALL-E-installation-guide.md"] },
  { source: "cli", name: "cli", package: "cli", docs: ["packages/cli/docs/cli-reference.md", "packages/cli/docs/cli-verification.md", "packages/cli/README.md", "docs/install/cli.md", "docs/install/install-guide.md", "docs/install/troubleshooting.md", "README.md"] },
];
const documentedShells = process.env.CALLE_TEST_SHELL ? [process.env.CALLE_TEST_SHELL]
  : process.platform === "win32" ? ["pwsh", "powershell.exe", "cmd"] : ["bash"];

for (const shell of documentedShells) {
  for (const profile of documentationProfiles) {
    test(`documented agent requests run in ${shell} with ${profile.source} attribution`, async (t) => {
      const root = makeTempCacheRoot();
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", profile.package, "package.json"), "utf8")).version;
      const integration = { source: profile.source, name: profile.name, version };
      const header = [profile.source, profile.name, version].join("/");
      const fake = await startFakeServer({ integrationHeader: header });
      t.after(() => fake.close());
      const reference = profile.skill ? profile.skill + "/references/commands.md" : profile.docs[0];
      const referenceText = fs.readFileSync(path.join(repoRoot, reference), "utf8");
      const command = referenceText.match(/```text\r?\n(node run-agent-command\.mjs request\.json)\r?\n```/u)?.[1];
      assert.ok(command, "reference must document a literal cross-platform launcher command");
      const files = [...(profile.skill ? [profile.skill + "/SKILL.md", reference] : []), ...profile.docs];
      const commands = new Map();
      for (const file of files) {
        const doc = fs.readFileSync(path.join(repoRoot, file), "utf8");
        for (const match of doc.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/gu)) {
          const value = JSON.parse(match[1]);
          if (value?.integration) assert.deepEqual(value.integration, integration, file);
          if (Array.isArray(value) && value.every((arg) => typeof arg === "string")) commands.set(JSON.stringify(value), value);
        }
      }
      assert.ok(commands.size >= 5, "documented command arrays must be exercised");
      const launcher = profile.skill ? path.join(repoRoot, profile.skill, "scripts/run-agent-command.mjs") : launcherPath;
      const cacheRoot = path.join(root, "documented cache 中文");
      for (const template of commands.values()) {
        const values = { "<plan_id>": "plan-1", "<confirm_token>": "confirm-1", "<run_id>": "run-doc" };
        if (template[1] === "recover") {
          values["<recovery_id>"] = writeCallRecovery({ cacheRoot, serverUrl: serverUrl(fake.baseUrl) }, { planId: "plan-1", confirmToken: "confirm-1" });
        }
        const argv = template.map((arg) => values[arg] ?? arg);
        const argsJson = argv.indexOf("--args-json");
        if (argsJson >= 0 && argv[argsJson + 1].includes("<latest user message verbatim>")) {
          argv[argsJson + 1] = JSON.stringify({ user_input: "Call O'Hare: \"hello\", $(), `text`, \\ and\n中文" });
        }
        for (const [flag, value] of [["--base-url", fake.baseUrl], ["--cache-root", cacheRoot]]) {
          const index = argv.indexOf(flag);
          if (index >= 0) argv[index + 1] = value;
          else argv.push(flag, value);
        }
        if (argv[0] === "auth" && argv[1] === "login" && !argv.includes("--no-browser-open")) argv.push("--no-browser-open");
        if (argv[0] !== "auth") writeToken(cacheRoot, fake.baseUrl);
        const before = fake.state.toolCalls.length;
        const result = await runAgentRequest({ package_dir: packageRoot, integration, argv }, root, { shell, launcher, command });
        assert.equal(result.code, 0, JSON.stringify(template) + "\n" + result.stdout + "\n" + result.stderr);
        if (!argv.includes("--help") && !argv.includes("--version")) {
          const payload = parseJson(result.stdout);
          if (payload.next_argv) assert.equal(payload.next_argv[payload.next_argv.indexOf("--cache-root") + 1], cacheRoot);
          if (argsJson >= 0) assert.deepEqual(payload.result.structuredContent.arguments, JSON.parse(argv[argsJson + 1]));
        }
        if (argv.includes("--help") || ["auth", "regions"].includes(argv[0])) {
          assert.ok(fake.state.toolCalls.slice(before).every((call) => !["plan_call", "run_call"].includes(call.name)), "readiness must not plan or submit calls");
        }
        if (argsJson >= 0) assert.deepEqual(fake.state.toolCalls.at(-1).arguments, JSON.parse(argv[argsJson + 1]));
      }
      for (const event of fake.state.telemetryEvents) {
        assert.equal(event.properties.integration_source, profile.source);
        assert.equal(event.properties.integration_name, profile.name);
        assert.equal(event.properties.integration_version, version);
      }
      assert.deepEqual(fake.state.failures, []);
      t.diagnostic(commands.size + " unique documented argv arrays passed; attribution " + header);
    });
  }
}
