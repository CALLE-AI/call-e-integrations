import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../lib/cli.js";
import { pendingCachePath, tokenCachePath, writePrivateJson } from "../lib/cache.js";

function makeTempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function jsonResponse(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonRpcResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function writeToken(cacheRoot, serverUrl, accessToken = "cached-token") {
  writePrivateJson(tokenCachePath(cacheRoot, serverUrl), {
    token: { access_token: accessToken },
    expires_at: "2030-01-01T00:00:00Z",
  });
}

async function run(argv, deps = {}) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += `${text}\n`;
    },
    openBrowser: async () => {},
    sleepImpl: async () => {},
    ...deps,
  });
  return { code, stdout, stderr };
}

test("auth login defaults broker payload to openagent_oauth and hides token from stdout", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login");
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.channel, "openagent_oauth");
      assert.equal(payload.server_url, "https://mcp.example/mcp/openagent_oauth");
      assert.equal(payload.auth_base_url, "https://mcp.example");
      return jsonResponse(
        {
          session_id: "session-1",
          session_secret: "secret-1",
          login_url: "https://mcp.example/openagent-auth/sessions/session-1/start",
          status: "PENDING",
          poll_after_ms: 1,
          expires_at: "2030-01-01T00:00:00Z",
        },
        { status: 201 }
      );
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1") && init?.method === "GET") {
      assert.equal(init.headers["X-OpenAgent-Session-Secret"], "secret-1");
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init?.method === "POST") {
      return jsonResponse({
        token: { access_token: "secret-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.equal(requests.length, 3);
  assert.doesNotMatch(result.stdout, /secret-token/);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "logged_in");
  assert.equal(payload.server_url, "https://mcp.example/mcp/openagent_oauth");
  const tokenPayload = JSON.parse(fs.readFileSync(tokenCachePath(cacheRoot, payload.server_url), "utf8"));
  assert.equal(tokenPayload.token.access_token, "secret-token");
  assert.equal(fs.existsSync(pendingCachePath(cacheRoot, payload.server_url)), false);
});

test("auth login resumes a pending login without creating a new session", async () => {
  const cacheRoot = makeTempRoot("calle-cli-pending");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writePrivateJson(pendingCachePath(cacheRoot, serverUrl), {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://mcp.example/openagent-auth/sessions/session-1/start",
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
    expires_at: "2030-01-01T00:00:00Z",
    poll_after_ms: 1,
  });

  const seenMethods = [];
  const fetchImpl = async (url, init) => {
    seenMethods.push(`${init?.method} ${url}`);
    assert.notEqual(String(url), "https://mcp.example/api/v1/openagent-auth/sessions");
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1") && init?.method === "GET") {
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init?.method === "POST") {
      return jsonResponse({
        token: { access_token: "resumed-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(seenMethods.map((entry) => entry.split(" ")[0]), ["GET", "POST"]);
  assert.doesNotMatch(result.stdout, /resumed-token/);
});

test("auth login honors broker base url and channel overrides", async () => {
  const cacheRoot = makeTempRoot("calle-cli-overrides");
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(String(url));
    if (String(url) === "https://broker.example/api/v1/openagent-auth/sessions" && init?.method === "POST") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.channel, "custom_oauth");
      assert.equal(payload.server_url, "https://mcp.example/mcp/custom_oauth");
      assert.equal(payload.auth_base_url, "https://mcp.example");
      return jsonResponse({
        session_id: "session-2",
        session_secret: "secret-2",
        login_url: "https://broker.example/openagent-auth/sessions/session-2/start",
        status: "PENDING",
        poll_after_ms: 1,
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    if (String(url) === "https://broker.example/api/v1/openagent-auth/sessions/session-2" && init?.method === "GET") {
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url) === "https://broker.example/api/v1/openagent-auth/sessions/session-2/exchange" && init?.method === "POST") {
      return jsonResponse({
        token: { access_token: "override-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    [
      "auth",
      "login",
      "--base-url",
      "https://mcp.example",
      "--broker-base-url",
      "https://broker.example",
      "--channel",
      "custom_oauth",
      "--cache-root",
      cacheRoot,
      "--no-browser-open",
    ],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(requests, [
    "https://broker.example/api/v1/openagent-auth/sessions",
    "https://broker.example/api/v1/openagent-auth/sessions/session-2",
    "https://broker.example/api/v1/openagent-auth/sessions/session-2/exchange",
  ]);
  assert.doesNotMatch(result.stdout, /override-token/);
});

test("auth status reports missing, usable, and expired cache states", async () => {
  const cacheRoot = makeTempRoot("calle-cli-status");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";

  let result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot]);
  let payload = JSON.parse(result.stdout);
  assert.equal(payload.cache_exists, false);
  assert.equal(payload.usable, false);

  writePrivateJson(tokenCachePath(cacheRoot, serverUrl), {
    token: { access_token: "usable-token" },
    expires_at: "2030-01-01T00:00:00Z",
  });
  result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot]);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.cache_exists, true);
  assert.equal(payload.usable, true);
  assert.doesNotMatch(result.stdout, /usable-token/);

  writePrivateJson(tokenCachePath(cacheRoot, serverUrl), {
    token: { access_token: "expired-token" },
    expires_at: "2000-01-01T00:00:00Z",
  });
  result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot]);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.cache_exists, true);
  assert.equal(payload.usable, false);
});

test("auth logout removes token and pending cache", async () => {
  const cacheRoot = makeTempRoot("calle-cli-logout");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const tokenPath = tokenCachePath(cacheRoot, serverUrl);
  const pendingPath = pendingCachePath(cacheRoot, serverUrl);
  writePrivateJson(tokenPath, { token: { access_token: "token" } });
  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://mcp.example/login",
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
  });

  const result = await run(["auth", "logout", "--base-url", "https://mcp.example", "--cache-root", cacheRoot]);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.removed_cache, true);
  assert.equal(payload.removed_pending, true);
  assert.equal(fs.existsSync(tokenPath), false);
  assert.equal(fs.existsSync(pendingPath), false);
});

test("mcp config defaults to openagent_oauth and supports overrides", async () => {
  let result = await run(["mcp", "config", "--base-url", "https://mcp.example"]);
  let payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.mcpServers.calle, {
    type: "http",
    url: "https://mcp.example/mcp/openagent_oauth",
  });

  result = await run([
    "mcp",
    "config",
    "--base-url",
    "https://mcp.example",
    "--channel",
    "custom",
    "--server-url",
    "https://custom.example/mcp/custom",
    "--server-name",
    "custom_name",
  ]);
  payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.mcpServers.custom_name, {
    type: "http",
    url: "https://custom.example/mcp/custom",
  });
});

test("mcp tools uses cached token and lists remote tools", async () => {
  const cacheRoot = makeTempRoot("calle-cli-mcp-tools");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "tool-token");
  const methods = [];
  const fetchImpl = async (url, init) => {
    assert.equal(String(url), serverUrl);
    assert.equal(init.headers.Authorization, "Bearer tool-token");
    const payload = JSON.parse(init.body);
    methods.push(payload.method);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} }, { headers: { "mcp-session-id": "sess-1" } });
    }
    if (payload.method === "notifications/initialized") {
      assert.equal(init.headers["mcp-session-id"], "sess-1");
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/list") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { tools: [{ name: "plan_call" }, { name: "run_call" }, { name: "get_call_run" }] },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], { fetchImpl });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(payload.ok, true);
  assert.equal(payload.method, "tools/list");
  assert.equal(payload.result.tools.length, 3);
  assert.doesNotMatch(result.stdout, /tool-token/);
});

test("mcp call forwards arbitrary tool arguments", async () => {
  const cacheRoot = makeTempRoot("calle-cli-mcp-call");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "call-token");
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} }, { headers: { "mcp-session-id": "sess-1" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
      calls.push(payload.params);
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { structuredContent: { plan_id: "plan-1" } },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "mcp",
      "call",
      "plan_call",
      "--args-json",
      '{"to_phones":["+15551234567"],"goal":"Confirm appointment"}',
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(calls, [
    {
      name: "plan_call",
      arguments: { to_phones: ["+15551234567"], goal: "Confirm appointment" },
    },
  ]);
  assert.equal(payload.ok, true);
  assert.equal(payload.tool_name, "plan_call");
});

test("call plan maps flags to plan_call arguments", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-plan");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  let toolCall = null;
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
      toolCall = payload.params;
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { structuredContent: { plan_id: "plan-1", confirm_token: "confirm-1" } },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
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
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(toolCall, {
    name: "plan_call",
    arguments: {
      to_phones: ["+15551234567", "+15557654321"],
      goal: "Confirm appointment",
      language: "English",
      region: "US",
    },
  });
  assert.equal(JSON.parse(result.stdout).tool_name, "plan_call");
});

test("call run invokes run_call then get_call_run once", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-run");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "run-token");
  const toolCalls = [];
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
      toolCalls.push(payload.params);
      if (payload.params.name === "run_call") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: { structuredContent: { run_id: "run-1", status: "STARTED" } },
        });
      }
      if (payload.params.name === "get_call_run") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: { structuredContent: { run_id: "run-1", status: "IN_PROGRESS" } },
        });
      }
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "run",
      "--plan-id",
      "plan-1",
      "--confirm-token",
      "confirm-1",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(toolCalls, [
    { name: "run_call", arguments: { plan_id: "plan-1", confirm_token: "confirm-1" } },
    { name: "get_call_run", arguments: { run_id: "run-1" } },
  ]);
  assert.equal(payload.ok, true);
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.run_result.structuredContent.status, "STARTED");
  assert.equal(payload.status_result.structuredContent.status, "IN_PROGRESS");
  assert.match(payload.next_command, /calle call status --run-id run-1/);
  assert.doesNotMatch(result.stdout, /run-token/);
});

test("call status maps flags to get_call_run arguments", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-status");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  let toolCall = null;
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
      toolCall = payload.params;
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { structuredContent: { run_id: "run-1", status: "COMPLETED" } },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "status",
      "--run-id",
      "run-1",
      "--cursor",
      "cursor-1",
      "--limit",
      "20",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(toolCall, {
    name: "get_call_run",
    arguments: { run_id: "run-1", cursor: "cursor-1", limit: 20 },
  });
  assert.equal(JSON.parse(result.stdout).tool_name, "get_call_run");
});

test("mcp commands return auth_required for missing or expired tokens", async () => {
  const cacheRoot = makeTempRoot("calle-cli-auth-required");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  let fetchCalled = false;
  const result = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(fetchCalled, false);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "auth_required");
  assert.match(payload.login_command, /calle auth login/);
  assert.doesNotMatch(result.stdout, /access_token/);

  writePrivateJson(tokenCachePath(cacheRoot, serverUrl), {
    token: { access_token: "expired-token" },
    expires_at: "2000-01-01T00:00:00Z",
  });
  fetchCalled = false;
  const expiredResult = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    },
  });
  const expiredPayload = JSON.parse(expiredResult.stdout);
  assert.equal(expiredResult.code, 1);
  assert.equal(fetchCalled, false);
  assert.equal(expiredPayload.error.code, "auth_required");
  assert.doesNotMatch(expiredResult.stdout, /expired-token/);
});

test("mcp 401 responses return auth_required without leaking cached token", async () => {
  const cacheRoot = makeTempRoot("calle-cli-auth-401");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "stale-token");
  const fetchImpl = async (_url, init) => {
    assert.equal(init.headers.Authorization, "Bearer stale-token");
    return jsonRpcResponse({ error: "unauthorized" }, { status: 401 });
  };

  const result = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], { fetchImpl });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "auth_required");
  assert.doesNotMatch(result.stdout, /stale-token/);
});
