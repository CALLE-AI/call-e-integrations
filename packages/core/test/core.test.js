import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  INTEGRATION_HEADER,
  MCP_PROTOCOL_VERSION,
  SESSION_SECRET_HEADER,
} from "@call-e/core/constants";
import {
  expandHomePath,
  normalizeBaseUrl,
  resolveAuthBaseUrl,
  resolveBrokerBaseUrl,
  resolveServerUrl,
} from "@call-e/core/config";
import {
  pendingCachePath,
  readJson,
  readPendingLogin,
  tokenCachePath,
  tokenIsUsable,
  writePrivateJson,
} from "@call-e/core/cache";
import {
  createBrokerSession,
  ensurePendingLogin,
  loginWithBroker,
  normalizePendingSession,
} from "@call-e/core/broker-client";
import {
  McpHttpError,
  callMcpTool,
  isUnauthorizedMcpError,
  listMcpTools,
} from "@call-e/core/mcp-client";

function makeTempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function jsonResponse(body, { status = 200, statusText = "OK", headers = {} } = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(headers),
    async text() {
      return text;
    },
  };
}

function mcpConfig(cacheRoot) {
  const serverUrl = "https://example.test/mcp/openagent_oauth";
  writePrivateJson(tokenCachePath(cacheRoot, serverUrl), {
    token: { access_token: "token-123" },
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  return {
    cacheRoot,
    serverUrl,
    minTtlSeconds: 300,
    timeoutSeconds: 15,
    integrationHeader: "cli/cli/9.9.9",
    cliVersion: "9.9.9",
  };
}

test("config helpers normalize CALL-E endpoint URLs", () => {
  assert.equal(normalizeBaseUrl("https://example.test///"), "https://example.test");
  assert.equal(expandHomePath("~"), os.homedir());
  assert.equal(expandHomePath("~/cache"), path.join(os.homedir(), "cache"));
  assert.equal(
    resolveServerUrl({ baseUrl: "https://example.test///", channel: " OpenAgent_OAuth " }),
    "https://example.test/mcp/openagent_oauth",
  );
  assert.equal(
    resolveServerUrl({ serverUrl: "https://override.test/mcp/custom", baseUrl: "https://example.test" }),
    "https://override.test/mcp/custom",
  );
  assert.equal(resolveAuthBaseUrl({ baseUrl: "https://auth.test/" }), "https://auth.test");
  assert.equal(resolveAuthBaseUrl({ serverUrl: "https://mcp.test/mcp/openagent_oauth" }), "https://mcp.test");
  assert.equal(resolveBrokerBaseUrl({ brokerBaseUrl: "https://broker.test/", baseUrl: "https://base.test" }), "https://broker.test");
  assert.equal(resolveBrokerBaseUrl({ baseUrl: "https://base.test/" }), "https://base.test");
});

test("cache helpers persist private token and pending login documents", () => {
  const cacheRoot = makeTempRoot("calle-core-cache");
  const serverUrl = "https://example.test/mcp/openagent_oauth";
  const cachePath = tokenCachePath(cacheRoot, serverUrl);
  const pendingPath = pendingCachePath(cacheRoot, serverUrl);

  writePrivateJson(cachePath, {
    token: { access_token: "token-123" },
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  assert.equal(readJson(cachePath).token.access_token, "token-123");
  assert.equal(tokenIsUsable(readJson(cachePath), 300), true);
  assert.equal(
    tokenIsUsable({
      token: { access_token: "token-123" },
      expires_at: new Date(Date.now() + 1000).toISOString(),
    }, 300),
    false,
  );
  assert.equal(tokenIsUsable({ token: { access_token: "token-123" } }, 300), true);

  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://example.test/login",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    poll_after_ms: 2500,
  });
  assert.deepEqual(readPendingLogin(pendingPath), {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://example.test/login",
    status: "PENDING",
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
    error_message: null,
    poll_after_ms: 2500,
  });
});

test("broker client sends integration headers and normalizes pending sessions", async () => {
  const config = {
    brokerBaseUrl: "https://broker.test",
    serverUrl: "https://broker.test/mcp/openagent_oauth",
    authBaseUrl: "https://broker.test",
    channel: "openagent_oauth",
    scope: "openid email profile",
    clientName: "calle Login",
    timeoutSeconds: 15,
    integrationHeader: "cli/cli/9.9.9",
  };
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://broker.test/api/v1/openagent-auth/sessions");
    assert.equal(init.method, "POST");
    assert.equal(init.headers[INTEGRATION_HEADER], "cli/cli/9.9.9");
    assert.deepEqual(JSON.parse(init.body), {
      server_url: "https://broker.test/mcp/openagent_oauth",
      auth_base_url: "https://broker.test",
      channel: "openagent_oauth",
      scope: "openid email profile",
      client_name: "calle Login",
    });
    return jsonResponse({
      session_id: "session-1",
      session_secret: "secret-1",
      login_url: "https://broker.test/openagent-auth/sessions/session-1/start",
      status: "pending",
      expires_at: "2026-01-01T00:00:00.000Z",
      poll_after_ms: 1500,
    });
  };

  const session = await createBrokerSession(config, { fetchImpl });
  const pending = normalizePendingSession(session);
  assert.equal(pending.session_id, "session-1");
  assert.equal(pending.session_secret, "secret-1");
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.expires_at, "2026-01-01T00:00:00.000Z");
  assert.equal(pending.poll_after_ms, 1500);
  assert.ok(Date.parse(pending.created_at));
});

test("broker client refreshes active pending login against broker before reuse", async () => {
  const cacheRoot = makeTempRoot("calle-core-pending-reuse");
  const config = {
    cacheRoot,
    brokerBaseUrl: "https://broker.test",
    serverUrl: "https://broker.test/mcp/openagent_oauth",
    authBaseUrl: "https://broker.test",
    channel: "openagent_oauth",
    scope: "openid email profile",
    clientName: "calle Login",
    timeoutSeconds: 15,
    integrationHeader: "cli/cli/9.9.9",
  };
  const pendingPath = pendingCachePath(cacheRoot, config.serverUrl);
  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://broker.test/local-start",
    status: "PENDING",
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2030-01-01T00:00:00.000Z",
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init.method} ${url}`);
    assert.equal(init.headers[SESSION_SECRET_HEADER], "secret-1");
    return jsonResponse({
      session_id: "session-1",
      login_url: "https://broker.test/broker-start",
      status: "PENDING",
      expires_at: "2030-01-01T00:00:00.000Z",
      poll_after_ms: 3000,
    });
  };

  const result = await ensurePendingLogin(config, { fetchImpl });
  const cached = readPendingLogin(pendingPath);

  assert.equal(result.created, false);
  assert.equal(result.pending.login_url, "https://broker.test/broker-start");
  assert.equal(result.pending.poll_after_ms, 3000);
  assert.deepEqual(requests, ["GET https://broker.test/api/v1/openagent-auth/sessions/session-1"]);
  assert.equal(cached.login_url, "https://broker.test/broker-start");
});

test("broker client creates fresh pending login when broker rejects cached pending", async () => {
  const cacheRoot = makeTempRoot("calle-core-pending-expired");
  const config = {
    cacheRoot,
    brokerBaseUrl: "https://broker.test",
    serverUrl: "https://broker.test/mcp/openagent_oauth",
    authBaseUrl: "https://broker.test",
    channel: "openagent_oauth",
    scope: "openid email profile",
    clientName: "calle Login",
    timeoutSeconds: 15,
    integrationHeader: "cli/cli/9.9.9",
  };
  const pendingPath = pendingCachePath(cacheRoot, config.serverUrl);
  writePrivateJson(pendingPath, {
    session_id: "session-old",
    session_secret: "secret-old",
    login_url: "https://broker.test/old-start",
    status: "PENDING",
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2030-01-01T00:00:00.000Z",
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init.method} ${url}`);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-old")) {
      return jsonResponse({ status: "EXPIRED" }, { status: 410, statusText: "Gone" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions")) {
      return jsonResponse({
        session_id: "session-new",
        session_secret: "secret-new",
        login_url: "https://broker.test/new-start",
        status: "PENDING",
        expires_at: "2030-01-01T00:00:00.000Z",
      });
    }
    throw new Error(`unexpected request: ${init.method} ${url}`);
  };

  const result = await ensurePendingLogin(config, { fetchImpl });
  const cached = readPendingLogin(pendingPath);

  assert.equal(result.created, true);
  assert.equal(result.pending.session_id, "session-new");
  assert.deepEqual(requests, [
    "GET https://broker.test/api/v1/openagent-auth/sessions/session-old",
    "POST https://broker.test/api/v1/openagent-auth/sessions",
  ]);
  assert.equal(cached.session_id, "session-new");
  assert.equal(cached.login_url, "https://broker.test/new-start");
});

test("broker login exchanges active pending before reusing cached token", async () => {
  const cacheRoot = makeTempRoot("calle-core-pending-before-cached-login");
  const config = {
    cacheRoot,
    brokerBaseUrl: "https://broker.test",
    serverUrl: "https://broker.test/mcp/openagent_oauth",
    authBaseUrl: "https://broker.test",
    channel: "openagent_oauth",
    scope: "openid email profile",
    clientName: "calle Login",
    minTtlSeconds: 300,
    timeoutSeconds: 15,
    pollTimeoutSeconds: 1,
    integrationHeader: "cli/cli/9.9.9",
  };
  const pendingPath = pendingCachePath(cacheRoot, config.serverUrl);
  const tokenPath = tokenCachePath(cacheRoot, config.serverUrl);
  writePrivateJson(tokenPath, {
    token: { access_token: "cached-token" },
    expires_at: "2030-01-01T00:00:00.000Z",
  });
  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://broker.test/start",
    status: "AUTHORIZED",
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2030-01-01T00:00:00.000Z",
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init.method} ${url}`);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1") && init.method === "GET") {
      assert.equal(init.headers[SESSION_SECRET_HEADER], "secret-1");
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00.000Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init.method === "POST") {
      assert.equal(init.headers[SESSION_SECRET_HEADER], "secret-1");
      return jsonResponse({
        token: { access_token: "fresh-token" },
        expires_at: "2030-01-01T00:00:00.000Z",
      });
    }
    throw new Error(`unexpected request: ${init.method} ${url}`);
  };

  const result = await loginWithBroker(config, { fetchImpl, noBrowserOpen: true, sleepImpl: async () => {} });
  const cached = readJson(tokenPath);

  assert.equal(result.status, "logged_in");
  assert.equal(result.tokenDocument.token.access_token, "fresh-token");
  assert.equal(cached.token.access_token, "fresh-token");
  assert.equal(fs.existsSync(pendingPath), false);
  assert.deepEqual(requests, [
    "GET https://broker.test/api/v1/openagent-auth/sessions/session-1",
    "GET https://broker.test/api/v1/openagent-auth/sessions/session-1",
    "POST https://broker.test/api/v1/openagent-auth/sessions/session-1/exchange",
  ]);
});

test("MCP client initializes a session and lists tools", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-tools"));
  const calls = [];
  const fetchImpl = async (url, init) => {
    assert.equal(url, config.serverUrl);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer token-123");
    assert.equal(init.headers[INTEGRATION_HEADER], "cli/cli/9.9.9");
    assert.equal(init.headers["mcp-protocol-version"], MCP_PROTOCOL_VERSION);
    const payload = JSON.parse(init.body);
    calls.push({ headers: init.headers, payload });

    if (payload.method === "initialize") {
      assert.deepEqual(payload.params.clientInfo, { name: "calle", version: "9.9.9" });
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-1" } });
    }
    if (payload.method === "notifications/initialized") {
      assert.equal(init.headers["mcp-session-id"], "mcp-session-1");
      return jsonResponse({});
    }
    if (payload.method === "tools/list") {
      assert.equal(init.headers["mcp-session-id"], "mcp-session-1");
      return jsonResponse({ result: { tools: [{ name: "plan_call" }] } });
    }
    throw new Error(`Unexpected MCP method ${payload.method}`);
  };

  const result = await listMcpTools({ config, fetchImpl });
  assert.deepEqual(result, { tools: [{ name: "plan_call" }] });
  assert.deepEqual(calls.map((call) => call.payload.method), [
    "initialize",
    "notifications/initialized",
    "tools/list",
  ]);
});

test("MCP client calls tools through an initialized session", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-call"));
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-2" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    if (payload.method === "tools/call") {
      assert.deepEqual(payload.params, {
        name: "plan_call",
        arguments: { goal: "Confirm the appointment" },
      });
      return jsonResponse({ result: { content: [{ type: "text", text: "ok" }] } });
    }
    throw new Error(`Unexpected MCP method ${payload.method}`);
  };

  const result = await callMcpTool({
    config,
    toolName: "plan_call",
    toolArguments: { goal: "Confirm the appointment" },
    fetchImpl,
  });
  assert.deepEqual(result, { content: [{ type: "text", text: "ok" }] });
});

test("MCP client forwards request meta on tool calls", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-call-meta"));
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-2" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    if (payload.method === "tools/call") {
      assert.deepEqual(payload.params, {
        name: "plan_call",
        arguments: { goal: "Confirm the appointment" },
        _meta: {
          "openai/userLocation": { timezone: "Asia/Shanghai" },
          timezone_offset_minutes: -480,
        },
      });
      return jsonResponse({ result: { content: [{ type: "text", text: "ok" }] } });
    }
    throw new Error(`Unexpected MCP method ${payload.method}`);
  };

  const result = await callMcpTool({
    config,
    toolName: "plan_call",
    toolArguments: { goal: "Confirm the appointment" },
    requestMeta: {
      "openai/userLocation": { timezone: "Asia/Shanghai" },
      timezone_offset_minutes: -480,
    },
    fetchImpl,
  });
  assert.deepEqual(result, { content: [{ type: "text", text: "ok" }] });
});

test("MCP client classifies unauthorized HTTP responses", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-401"));
  const fetchImpl = async () => jsonResponse({ error: "unauthorized" }, { status: 401, statusText: "Unauthorized" });

  await assert.rejects(
    () => listMcpTools({ config, fetchImpl }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.statusCode, 401);
      assert.equal(isUnauthorizedMcpError(error), true);
      return true;
    },
  );
});

test("MCP client exposes MCP error payloads", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-error"));
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-3" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    return jsonResponse({ error: { code: -32000, message: "remote failure" } });
  };

  await assert.rejects(
    () => callMcpTool({ config, toolName: "plan_call", fetchImpl }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.code, "mcp_error");
      assert.deepEqual(error.payload, { code: -32000, message: "remote failure" });
      return true;
    },
  );
});

test("MCP client reports request timeouts", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-timeout"));
  const abortError = new Error("aborted");
  abortError.name = "AbortError";
  const fetchImpl = async () => {
    throw abortError;
  };

  await assert.rejects(
    () => listMcpTools({ config, fetchImpl }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.code, "http_error");
      assert.match(error.message, /timed out/i);
      return true;
    },
  );
});
