import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { startFakeServer } from "../../../shared/fake-mcp-broker-server.mjs";

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(exampleRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

function cacheDir(cacheRoot: string, serverUrl: string) {
  const hash = crypto.createHash("md5").update(serverUrl, "utf8").digest("hex");
  return path.join(cacheRoot, hash);
}

function writeCacheFile(cacheRoot: string, serverUrl: string, name: string, payload: unknown) {
  const dir = cacheDir(cacheRoot, serverUrl);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function writeToken(
  cacheRoot: string,
  serverUrl: string,
  expiresAt = "2030-01-01T00:00:00Z",
  accessToken = "fake-access-token"
) {
  writeCacheFile(cacheRoot, serverUrl, "token.json", {
    token: {
      access_token: accessToken,
      refresh_token: "fake-refresh-token",
    },
    expires_at: expiresAt,
  });
}

function writePending(cacheRoot: string, serverUrl: string, baseUrl: string) {
  writeCacheFile(cacheRoot, serverUrl, "pending_login.json", {
    session_id: "fake-broker-session",
    session_secret: "fake-session-secret",
    login_url: `${baseUrl}/openagent-auth/sessions/fake-broker-session/start`,
    status: "PENDING",
    created_at: "2026-01-01T00:00:00Z",
    expires_at: "2030-01-01T00:00:00Z",
    poll_after_ms: 1,
  });
}

function runClient(env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      tsxBin,
      ["src/client.ts"],
      {
        cwd: exampleRoot,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          ...env,
        },
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout,
          stderr,
        });
      }
    );
  });
}

async function readState(stateUrl: string) {
  return fetch(stateUrl).then((response) => response.json());
}

async function resetState(resetUrl: string) {
  await fetch(resetUrl, { method: "POST" });
}

function assertNoSecrets(output: string) {
  assert.equal(output.includes("fake-access-token"), false);
  assert.equal(output.includes("fake-refresh-token"), false);
  assert.equal(output.includes("fake-session-secret"), false);
  assert.equal(output.includes("stale-access-token"), false);
}

function tempCacheRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "calle-broker-standalone-ts-"));
}

test("standalone broker example logs in, calls tool, reads resource, then reuses cache", async (t) => {
  const fake = await startFakeServer({ brokerPendingFirst: true });
  t.after(() => fake.close());
  const cacheRoot = tempCacheRoot();

  const env = {
    MCP_BASE_URL: fake.baseUrl,
    MCP_SERVER_URL: fake.serverUrl,
    MCP_CACHE_ROOT: cacheRoot,
    MCP_POLL_TIMEOUT_SECONDS: "5",
    MCP_TOOL_NAME: "plan_call",
    MCP_TOOL_ARGS_JSON: "{\"user_input\":\"Plan a short test call. Do not start it.\"}",
    MCP_LOG_FILE: path.join(cacheRoot, "client.log"),
  };
  const first = await runClient(env);

  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /"status":"login_required"/);
  assert.match(first.stdout, /"status":"logged_in"/);
  assert.match(first.stdout, /"event":"tools\/call"/);
  assert.match(first.stdout, /"event":"resources\/read"/);
  assertNoSecrets(`${first.stdout}\n${first.stderr}`);
  const log = fs.readFileSync(env.MCP_LOG_FILE, "utf8");
  assert.match(log, /"event":"tools\/call"/);
  assert.match(log, /"timestamp":/);
  assertNoSecrets(log);

  let state = await readState(fake.stateUrl);
  assert.equal(state.broker_creates.length, 1);
  assert.equal(state.broker_exchange_count, 1);
  assert.equal(state.tool_calls[0].name, "plan_call");
  assert.equal(state.resource_reads.length, 1);
  assert.equal(state.mcp_requests.every((request: { has_bearer_token: boolean }) => request.has_bearer_token), true);

  await resetState(fake.resetUrl);
  const second = await runClient(env);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /"status":"cached"/);
  assertNoSecrets(`${second.stdout}\n${second.stderr}`);
  state = await readState(fake.stateUrl);
  assert.equal(state.broker_creates.length, 0);
  assert.equal(state.broker_exchange_count, 0);
});

test("standalone broker example resumes pending login and handles no resources", async (t) => {
  const fake = await startFakeServer({ noResources: true });
  t.after(() => fake.close());
  const cacheRoot = tempCacheRoot();
  writePending(cacheRoot, fake.serverUrl, fake.baseUrl);

  const result = await runClient({
    MCP_BASE_URL: fake.baseUrl,
    MCP_SERVER_URL: fake.serverUrl,
    MCP_CACHE_ROOT: cacheRoot,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"status":"pending"/);
  assert.match(result.stdout, /"event":"resources\/read","skipped":true/);
  assertNoSecrets(`${result.stdout}\n${result.stderr}`);

  const state = await readState(fake.stateUrl);
  assert.equal(state.broker_creates.length, 0);
  assert.equal(state.broker_exchange_count, 1);
  assert.equal(state.resource_reads.length, 0);
});

test("standalone broker example refreshes expired cache and reports remote 401", async (t) => {
  const fake = await startFakeServer();
  t.after(() => fake.close());
  const cacheRoot = tempCacheRoot();
  writeToken(cacheRoot, fake.serverUrl, "2000-01-01T00:00:00Z");

  const expired = await runClient({
    MCP_BASE_URL: fake.baseUrl,
    MCP_SERVER_URL: fake.serverUrl,
    MCP_CACHE_ROOT: cacheRoot,
  });
  assert.equal(expired.code, 0, expired.stderr);
  assert.match(expired.stdout, /"status":"expired"/);
  assert.match(expired.stdout, /"status":"logged_in"/);
  assertNoSecrets(`${expired.stdout}\n${expired.stderr}`);

  const unauthorizedFake = await startFakeServer({ unauthorizedMcp: true });
  t.after(() => unauthorizedFake.close());
  const unauthorizedCacheRoot = tempCacheRoot();
  writeToken(unauthorizedCacheRoot, unauthorizedFake.serverUrl);
  const unauthorized = await runClient({
    MCP_BASE_URL: unauthorizedFake.baseUrl,
    MCP_SERVER_URL: unauthorizedFake.serverUrl,
    MCP_CACHE_ROOT: unauthorizedCacheRoot,
  });
  assert.notEqual(unauthorized.code, 0);
  assert.match(unauthorized.stderr, /"error_code":"auth_required"/);
  assertNoSecrets(`${unauthorized.stdout}\n${unauthorized.stderr}`);
});

test("standalone broker example clears stale cached token rejected by MCP server", async (t) => {
  const fake = await startFakeServer();
  t.after(() => fake.close());
  const cacheRoot = tempCacheRoot();
  writeToken(cacheRoot, fake.serverUrl, "2030-01-01T00:00:00Z", "stale-access-token");

  const result = await runClient({
    MCP_BASE_URL: fake.baseUrl,
    MCP_SERVER_URL: fake.serverUrl,
    MCP_CACHE_ROOT: cacheRoot,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"status":"cached"/);
  assert.match(result.stdout, /"status":"stale_remote_token"/);
  assert.match(result.stdout, /"status":"login_required"/);
  assert.match(result.stdout, /"status":"logged_in"/);
  assertNoSecrets(`${result.stdout}\n${result.stderr}`);

  const state = await readState(fake.stateUrl);
  assert.equal(state.broker_creates.length, 1);
  assert.equal(state.broker_exchange_count, 1);
  assert.equal(state.mcp_requests.some((request: { has_bearer_token: boolean }) => !request.has_bearer_token), true);
  assert.equal(state.mcp_requests.some((request: { has_bearer_token: boolean }) => request.has_bearer_token), true);
});
