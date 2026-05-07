import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { startFakeServer } from "../../../shared/fake-mcp-broker-server.mjs";

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(exampleRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

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

function assertNoSecrets(output: string) {
  assert.equal(output.includes("fake-access-token"), false);
  assert.equal(output.includes("fake-refresh-token"), false);
  assert.equal(output.includes("fake-session-secret"), false);
}

test("OAuth example completes auth, lists tools, calls a tool, and reads a resource", async (t) => {
  const fake = await startFakeServer();
  t.after(() => fake.close());
  const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "calle-oauth-example-ts-")), "client.log");

  const result = await runClient({
    MCP_SERVER_URL: fake.serverUrl,
    MCP_REDIRECT_URI: "http://127.0.0.1:8090/callback",
    MCP_OAUTH_AUTO_AUTHORIZE: "1",
    MCP_TOOL_NAME: "plan_call",
    MCP_TOOL_ARGS_JSON: "{\"user_input\":\"Plan a short test call. Do not start it.\"}",
    MCP_LOG_FILE: logFile,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"event":"tools\/list"/);
  assert.match(result.stdout, /"event":"tools\/call"/);
  assert.match(result.stdout, /"event":"resources\/read"/);
  assertNoSecrets(`${result.stdout}\n${result.stderr}`);
  const log = fs.readFileSync(logFile, "utf8");
  assert.match(log, /"event":"tools\/call"/);
  assert.match(log, /"timestamp":/);
  assertNoSecrets(log);

  const state = await readState(fake.stateUrl);
  assert.equal(state.oauth_registers.length, 1);
  assert.equal(state.oauth_tokens.length, 1);
  assert.deepEqual(
    state.mcp_requests.map((request: { method: string }) => request.method),
    ["initialize", "initialize", "notifications/initialized", "tools/list", "tools/call", "resources/list", "resources/read"]
  );
  assert.equal(state.mcp_requests.slice(1).every((request: { has_bearer_token: boolean }) => request.has_bearer_token), true);
  assert.equal(state.tool_calls[0].name, "plan_call");
  assert.equal(state.resource_reads.length, 1);
});

test("OAuth example treats no resources as a successful skip", async (t) => {
  const fake = await startFakeServer({ noResources: true });
  t.after(() => fake.close());

  const result = await runClient({
    MCP_SERVER_URL: fake.serverUrl,
    MCP_REDIRECT_URI: "http://127.0.0.1:8090/callback",
    MCP_OAUTH_AUTO_AUTHORIZE: "1",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"event":"resources\/read","skipped":true/);
  assertNoSecrets(`${result.stdout}\n${result.stderr}`);

  const state = await readState(fake.stateUrl);
  assert.equal(state.resource_reads.length, 0);
});

test("OAuth example reports repeated MCP 401 without leaking tokens", async (t) => {
  const fake = await startFakeServer({ unauthorizedMcp: true });
  t.after(() => fake.close());

  const result = await runClient({
    MCP_SERVER_URL: fake.serverUrl,
    MCP_REDIRECT_URI: "http://127.0.0.1:8090/callback",
    MCP_OAUTH_AUTO_AUTHORIZE: "1",
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /oauth_client_error/);
  assertNoSecrets(`${result.stdout}\n${result.stderr}`);
});
