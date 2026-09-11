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
  BrokerLoginError,
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

function jsonRpcResponse(request, outcome, options = {}) {
  return jsonResponse({ jsonrpc: "2.0", id: request.id, ...outcome }, options);
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

test("broker terminal detail is typed and sanitized instead of entering Error.message", async () => {
  const cacheRoot = makeTempRoot("calle-core-broker-terminal-error");
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
  };
  const marker = "REMOTE-TEXT-MARKER access_token=abcd1234efgh5678";
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init.method === "POST") {
      return jsonResponse({
        session_id: "session-failed",
        session_secret: "secret-failed",
        login_url: "https://broker.test/start",
        status: "PENDING",
        poll_after_ms: 1,
      });
    }
    return jsonResponse({ status: "FAILED", error_message: marker });
  };

  await assert.rejects(
    () => loginWithBroker(config, { fetchImpl, noBrowserOpen: true, sleepImpl: async () => {} }),
    (error) => {
      assert.ok(error instanceof BrokerLoginError);
      assert.equal(error.code, "broker_login_failed");
      assert.equal(error.message, "Brokered login failed.");
      assert.deepEqual(error.remoteError, { code: "FAILED", message: "REMOTE-TEXT-MARKER access_token=[redacted]" });
      assert.doesNotMatch(error.message, /REMOTE-TEXT-MARKER|abcd1234|efgh5678/u);
      return true;
    },
  );
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
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-1" } });
    }
    if (payload.method === "notifications/initialized") {
      assert.equal(init.headers["mcp-session-id"], "mcp-session-1");
      return jsonResponse(undefined);
    }
    if (payload.method === "tools/list") {
      assert.equal(init.headers["mcp-session-id"], "mcp-session-1");
      return jsonRpcResponse(payload, { result: { tools: [{ name: "plan_call" }] } });
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
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-2" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    if (payload.method === "tools/call") {
      assert.deepEqual(payload.params, {
        name: "plan_call",
        arguments: { goal: "Confirm the appointment" },
      });
      return jsonRpcResponse(payload, { result: { content: [{ type: "text", text: "ok" }] } });
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

test("MCP client normalizes tool payloads without discarding the raw envelope", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-tool-payload"));
  const toolResults = [
    {
      content: [{ type: "text", text: '{"plan_id":"plan-text","ready_to_run":true}' }],
      isError: false,
      _meta: { trace_id: "trace-1" },
    },
    {
      content: [{ type: "text", text: '{"plan_id":"plan-text"}' }],
      structuredContent: { plan_id: "plan-camel" },
      structured_content: { plan_id: "plan-snake" },
    },
    {
      content: [{ type: "text", text: '{"plan_id":"plan-text"}' }],
      structured_content: { plan_id: "plan-snake" },
    },
    {
      content: [
        { type: "text", text: "not json" },
        { type: "text", text: '["not","an","object"]' },
        { type: "image", data: "ignored", mimeType: "image/png" },
        { type: "text", text: '{"run_id":"run-text"}' },
      ],
    },
    {
      content: [
        { type: "text", text: "not json" },
        { type: "text", text: "42" },
      ],
    },
  ];
  let toolCallIndex = 0;
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-payload" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    if (payload.method === "tools/call") {
      const result = toolResults[toolCallIndex];
      toolCallIndex += 1;
      return jsonRpcResponse(payload, { result });
    }
    throw new Error(`Unexpected MCP method ${payload.method}`);
  };

  const results = [];
  for (let index = 0; index < toolResults.length; index += 1) {
    results.push(await callMcpTool({ config, toolName: "plan_call", fetchImpl }));
  }

  assert.deepEqual(results[0].structuredContent, { plan_id: "plan-text", ready_to_run: true });
  assert.deepEqual(results[0].content, toolResults[0].content);
  assert.equal(results[0].isError, false);
  assert.deepEqual(results[0]._meta, { trace_id: "trace-1" });
  assert.deepEqual(results[1].structuredContent, { plan_id: "plan-camel" });
  assert.deepEqual(results[2].structuredContent, { plan_id: "plan-snake" });
  assert.deepEqual(results[2].structured_content, { plan_id: "plan-snake" });
  assert.deepEqual(results[3].structuredContent, { run_id: "run-text" });
  assert.deepEqual(results[4], toolResults[4]);
});

test("MCP client forwards request meta on tool calls", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-call-meta"));
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-2" } });
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
      return jsonRpcResponse(payload, { result: { content: [{ type: "text", text: "ok" }] } });
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
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-3" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    return jsonRpcResponse(payload, { error: { code: -32000, message: "remote failure" } });
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
      assert.equal(error.code, "transport_error");
      assert.equal(error.transport, true);
      assert.equal(error.timedOut, true);
      assert.match(error.message, /timed out/i);
      return true;
    },
  );
});

test("MCP client classifies a rejected fetch as transport, and keeps the server message out of Error.message", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-rejected"));
  const dns = new TypeError("fetch failed");
  dns.cause = { code: "ENOTFOUND" };
  await assert.rejects(
    () => listMcpTools({ config, fetchImpl: async () => { throw dns; } }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.code, "transport_error");
      assert.equal(error.transport, true);
      assert.equal(error.timedOut, false);
      assert.equal(error.causeCode, "ENOTFOUND");
      return true;
    },
  );

  const hostileConfig = mcpConfig(makeTempRoot("calle-core-mcp-hostile"));
  const ESC = String.fromCharCode(27);
  const hostileMessage = `${"x".repeat(2000)}${ESC}[31m secret=sk_live_ABCDEFGHIJKLMNOPQRSTUV`;
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-9" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    return jsonRpcResponse(payload, { error: { code: -32000, message: hostileMessage, access_token: "tok_SECRET_VALUE_123456" } });
  };
  await assert.rejects(
    () => callMcpTool({ config: hostileConfig, toolName: "plan_call", fetchImpl }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.code, "mcp_error");
      assert.equal(error.message, "Remote MCP error for tools/call", "Error.message is authored locally");
      assert.ok(error.remoteError.message.length <= 500);
      assert.doesNotMatch(error.remoteError.message, /sk_live_|tok_SECRET/u);
      assert.equal(error.remoteError.message.includes(ESC), false);
      assert.equal(error.remoteError.code, "-32000");
      return true;
    },
  );
});

test("successful MCP statuses with invalid JSON-RPC bodies are typed invalid responses", async () => {
  const marker = "REMOTE-TEXT-MARKER access_token=abcd1234efgh5678";
  const bodies = [
    marker,
    JSON.stringify([marker]),
    JSON.stringify(null),
    JSON.stringify({}),
    JSON.stringify({ error: null }),
    JSON.stringify({ error: "not-an-error-object" }),
    "",
  ];

  for (const responseText of bodies) {
    const config = mcpConfig(makeTempRoot("calle-core-mcp-invalid-response"));
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      async text() { return responseText; },
    });

    await assert.rejects(
      () => listMcpTools({ config, fetchImpl }),
      (error) => {
        assert.ok(error instanceof McpHttpError);
        assert.equal(error.code, "invalid_response");
        assert.equal(error.statusCode, 200);
        assert.equal(error.message, "MCP response was invalid for initialize");
        assert.doesNotMatch(error.message, /REMOTE-TEXT-MARKER|abcd1234|efgh5678/u);
        if (error.remoteError?.message) {
          assert.doesNotMatch(error.remoteError.message, /abcd1234|efgh5678/u);
        }
        return true;
      },
    );
  }
});

test("MCP responses require version 2.0, the request id, and exactly one valid outcome", async () => {
  const invalidResponses = [
    { name: "wrong protocol version", body: { jsonrpc: "1.0", id: "calle-initialize", result: {} } },
    { name: "stale request id", body: { jsonrpc: "2.0", id: "stale-request", result: {} } },
    { name: "missing request id", body: { jsonrpc: "2.0", result: {} } },
    {
      name: "both result and error",
      body: {
        jsonrpc: "2.0",
        id: "calle-initialize",
        result: {},
        error: { code: -32000, message: "must not coexist" },
      },
    },
    {
      name: "error without an integer code",
      body: { jsonrpc: "2.0", id: "calle-initialize", error: { code: "-32000", message: "bad" } },
    },
    {
      name: "error without a message",
      body: { jsonrpc: "2.0", id: "calle-initialize", error: { code: -32000 } },
    },
  ];

  for (const fixture of invalidResponses) {
    const config = mcpConfig(makeTempRoot("calle-core-mcp-invalid-envelope"));
    await assert.rejects(
      () => listMcpTools({ config, fetchImpl: async () => jsonResponse(fixture.body) }),
      (error) => {
        assert.ok(error instanceof McpHttpError, fixture.name);
        assert.equal(error.code, "invalid_response", fixture.name);
        assert.equal(error.message, "MCP response was invalid for initialize", fixture.name);
        return true;
      },
    );
  }
});

test("MCP notifications accept empty acknowledgements but reject response envelopes", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-notification-ack"));
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    if (request.method === "initialize") {
      return jsonRpcResponse(request, { result: {} }, { headers: { "mcp-session-id": "s" } });
    }
    return jsonResponse({ jsonrpc: "2.0", id: "stale-request", result: {} });
  };

  await assert.rejects(
    () => listMcpTools({ config, fetchImpl }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.code, "invalid_response");
      assert.equal(error.message, "MCP response was invalid for notifications/initialized");
      return true;
    },
  );
});

test("HTTP status reason text and body never reach the core error message", async () => {
  const { requestJson, HttpStatusError } = await import("@call-e/core/http");
  const marker = "REMOTE-TEXT-MARKER access_token=abcd1234efgh5678";

  await assert.rejects(
    () => requestJson("POST", "https://example.test/thing", {
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        statusText: marker,
        headers: new Headers(),
        async text() { return marker; },
      }),
    }),
    (error) => {
      assert.ok(error instanceof HttpStatusError);
      assert.equal(error.message, "HTTP 502 for POST https://example.test/thing");
      assert.doesNotMatch(error.message, /REMOTE-TEXT-MARKER|abcd1234|efgh5678/u);
      assert.equal(error.responseText, marker, "raw detail remains available for sanitizing");
      return true;
    },
  );
});

test("sanitize helpers strip terminal controls, redact secrets, and bound length", async () => {
  const { safeRemoteString, safeRemoteCode, stripTerminalControls, redactSecrets, sanitizeRemoteError } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const controlled = `a${ESC}[2J${ESC}]8;;http://x${BEL}link${ESC}]8;;${BEL}b\r\nc`;
  const cleaned = safeRemoteString(controlled);
  assert.equal(cleaned.includes(ESC), false);
  assert.doesNotMatch(cleaned, /[\r\n]/u);
  assert.equal(stripTerminalControls(controlled), "alinkbc", "controls are removed, not spaced");
  assert.equal(cleaned, "[redacted]", "ambiguous controlled text is withheld from display");

  // A bound on ordinary prose. (An unbroken 10,000-character run is redacted as an opaque
  // token instead, which is the intended behaviour and is asserted below.)
  assert.equal(safeRemoteString("word ".repeat(3000)).length, 500);
  assert.equal(safeRemoteString("x".repeat(10_000)), "[redacted]");
  assert.equal(safeRemoteString("   "), undefined);
  assert.equal(safeRemoteString(42), undefined);

  const bearer = redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz");
  assert.doesNotMatch(bearer, /abcdefghijklmnopqrstuvwxyz/u);
  assert.match(bearer, /^Authorization: .*\[redacted\]/u);
  assert.match(redactSecrets("Bearer abcdefghijklmnopqrstuvwxyz"), /^Bearer \[redacted\]$/u);
  assert.match(redactSecrets("access_token=abcd1234efgh"), /access_token=\[redacted\]/u);
  assert.match(redactSecrets("key sk_live_ABCDEFGHIJKLMNOP1234 here"), /key \[redacted\] here/u);
  assert.match(redactSecrets("hash 0123456789abcdef0123456789abcdef0123"), /hash \[redacted\]/u);
  assert.equal(redactSecrets("Failed to register an OAuth client. err_type=HTTPStatusError"), "Failed to register an OAuth client. err_type=HTTPStatusError");

  assert.equal(safeRemoteCode("oauth_register_failed"), "oauth_register_failed");
  assert.equal(safeRemoteCode("nested.code-1"), "nested.code-1");
  assert.equal(safeRemoteCode(" oauth_register_failed "), undefined);
  assert.equal(safeRemoteCode(`bad code${ESC}[31m`), undefined);
  assert.equal(safeRemoteCode("x".repeat(65)), undefined);

  assert.deepEqual(sanitizeRemoteError({ error: "auth_required", message: "please" }), { code: "auth_required", message: "please" });
  assert.deepEqual(sanitizeRemoteError({ error: { code: "n.1", message: "m", details: { internal: "t" } }, request_id: "r" }), { code: "n.1", message: "m" });
  assert.deepEqual(sanitizeRemoteError("<html>gateway</html>"), { message: "<html>gateway</html>" });
  assert.equal(sanitizeRemoteError(""), null);
  assert.equal(sanitizeRemoteError({ unrelated: true }), null);
});

test("a control sequence inserted inside a credential cannot split it past the redactor", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const NUL = String.fromCharCode(0);
  const inserts = [
    `${ESC}[31m`,                       // CSI colour
    `${ESC}[2J${ESC}[H`,                // CSI erase + home
    `${ESC}]8;;http://x${BEL}`,         // OSC hyperlink
    `${ESC}M`,                          // two-character ESC sequence
    NUL,                                // C0
    "\r\n",                             // CR LF
    String.fromCharCode(0x9b),          // C1
  ];
  const secrets = [
    { text: "Bearer abcdefghijklmnopqrstuvwxyz012345", halves: ["abcdefghijkl", "mnopqrstuvwxyz012345"] },
    { text: "Basic YWxhZGRpbjpvcGVuc2VzYW1l", halves: ["YWxhZGRp", "bjpvcGVuc2VzYW1l"] },
    { text: "access_token=abcd1234efgh5678", halves: ["abcd1234", "efgh5678"] },
    { text: 'api_key: "QWERTYUIOP12345678"', halves: ["QWERTYUI", "OP12345678"] },
    { text: "sk_live_ABCDEFGHIJKLMNOPQRSTUV", halves: ["ABCDEFGHIJ", "KLMNOPQRSTUV"] },
    { text: "ghp_abcdefghijklmnopqrstuvwxyz0123456789", halves: ["abcdefghijklmnop", "qrstuvwxyz0123456789"] },
    { text: "0123456789abcdef0123456789abcdef01234567", halves: ["0123456789abcdef", "0123456789abcdef01234567"] },
  ];
  for (const secret of secrets) {
    for (const insert of inserts) {
      // Insert the control sequence at several points, including inside the key name and
      // right after the separator, not only in the middle of the value.
      const points = [Math.floor(secret.text.length / 2), secret.text.indexOf("=") + 1, secret.text.indexOf(" ") + 1, 3];
      for (const at of points) {
        if (at <= 0) continue;
        const hostile = `${secret.text.slice(0, at)}${insert}${secret.text.slice(at)}`;
        const out = safeRemoteString(`context ${hostile} more`);
        assert.equal(out.includes(ESC), false);
        for (const half of secret.halves) {
          assert.equal(out.includes(half), false, `fragment ${JSON.stringify(half)} survived in ${JSON.stringify(out)} for ${JSON.stringify(hostile)}`);
        }
      }
    }
  }
});

test("8-bit C1 introducers and invisible format characters cannot smuggle a credential", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const CSI8 = String.fromCharCode(0x9b);
  const OSC8 = String.fromCharCode(0x9d);
  const ST8 = String.fromCharCode(0x9c);

  // Every one of these is invisible or terminal-consumed, and each splits a token in a way a
  // character-at-a-time strip would preserve.
  const inserts = [
    CSI8 + "31m",                       // 8-bit CSI
    OSC8 + "8;;http://x" + BEL,         // 8-bit OSC, BEL-terminated
    OSC8 + "0;title" + ST8,             // 8-bit OSC, ST-terminated
    ESC + "[2J",                        // 7-bit CSI
    "​",                           // zero width space
    "⁠",                           // word joiner
    "‍",                           // zero width joiner
    "‮",                           // right-to-left override
    "⁦",                           // left-to-right isolate
    "­",                           // soft hyphen
    "﻿",                           // BOM
    "\r\n",
  ];

  const secrets = [
    { text: "Bearer abcdefghijklmnopqrstuvwxyz012345", fragments: ["abcdefghijkl", "qrstuvwxyz012345"] },
    { text: "access_token=abcd1234efgh5678", fragments: ["abcd1234", "efgh5678"] },
    { text: "sk_live_ABCDEFGHIJKLMNOPQRSTUV", fragments: ["ABCDEFGHIJ", "KLMNOPQRSTUV"] },
    { text: "ghp_abcdefghijklmnopqrstuvwxyz0123456789", fragments: ["abcdefghijklmnop", "qrstuvwxyz0123456789"] },
    { text: "A".repeat(20) + "B".repeat(20), fragments: ["A".repeat(20), "B".repeat(20)] },
  ];

  for (const secret of secrets) {
    for (const insert of inserts) {
      for (let at = 1; at < secret.text.length; at += 3) {
        const hostile = `context ${secret.text.slice(0, at)}${insert}${secret.text.slice(at)} more`;
        const out = safeRemoteString(hostile);
        for (const fragment of secret.fragments) {
          assert.equal(
            out.includes(fragment),
            false,
            `fragment ${JSON.stringify(fragment)} survived as ${JSON.stringify(out)} for insert ${JSON.stringify(insert)} at ${at}`,
          );
        }
      }
    }
  }
});

test("every terminal string-control family is consumed with its payload", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const BACKSLASH = String.fromCharCode(0x5c);
  const CSI8 = String.fromCharCode(0x9b);
  const ST8 = String.fromCharCode(0x9c);
  const OSC8 = String.fromCharCode(0x9d);
  const DCS8 = String.fromCharCode(0x90);
  const SOS8 = String.fromCharCode(0x98);
  const PM8 = String.fromCharCode(0x9e);
  const APC8 = String.fromCharCode(0x9f);

  // Introducers in both forms. Stripping only the introducer leaves the payload as ordinary
  // text, which is what breaks a key name apart and lets the credential through.
  const introducers = [
    ["OSC 7-bit", `${ESC}]`], ["OSC 8-bit", OSC8],
    ["DCS 7-bit", `${ESC}P`], ["DCS 8-bit", DCS8],
    ["SOS 7-bit", `${ESC}X`], ["SOS 8-bit", SOS8],
    ["PM 7-bit", `${ESC}^`], ["PM 8-bit", PM8],
    ["APC 7-bit", `${ESC}_`], ["APC 8-bit", APC8],
  ];
  const terminators = [["BEL", BEL], ["ESC backslash", `${ESC}${BACKSLASH}`], ["ST 8-bit", ST8], ["unterminated", ""]];

  const secrets = [
    { text: "access_token=abcd1234efgh5678", fragments: ["abcd1234", "efgh5678"] },
    { text: "Bearer abcdefghijklmnopqrstuvwxyz012345", fragments: ["abcdefghijkl", "qrstuvwxyz012345"] },
    { text: "sk_live_ABCDEFGHIJKLMNOPQRSTUV", fragments: ["ABCDEFGHIJ", "KLMNOPQRSTUV"] },
  ];

  for (const [introName, intro] of introducers) {
    for (const [termName, term] of terminators) {
      for (const secret of secrets) {
        for (let at = 1; at < secret.text.length; at += 4) {
          const hostile = `${secret.text.slice(0, at)}${intro}junk${term}${secret.text.slice(at)}`;
          const out = safeRemoteString(`context ${hostile} more`);
          const visible = out.replace(/\[redacted\]/gu, "");
          for (const fragment of secret.fragments) {
            assert.equal(
              visible.includes(fragment),
              false,
              `${introName} + ${termName} at ${at}: ${JSON.stringify(fragment)} survived as ${JSON.stringify(out)}`,
            );
          }
        }
      }
    }
  }

  // An unterminated CSI must not leave its parameters behind either.
  const csi = safeRemoteString(`access_to${CSI8}12345 token=abcd1234efgh5678`);
  assert.doesNotMatch(csi.replace(/\[redacted\]/gu, ""), /abcd1234|efgh5678/u);
});

test("embedded ESC payloads and Unicode line separators cannot split credentials", async () => {
  const { safeRemoteString, stripTerminalControls } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const ST8 = String.fromCharCode(0x9c);
  const introducers = [
    `${ESC}]`, String.fromCharCode(0x9d),
    `${ESC}P`, String.fromCharCode(0x90),
    `${ESC}X`, String.fromCharCode(0x98),
    `${ESC}^`, String.fromCharCode(0x9e),
    `${ESC}_`, String.fromCharCode(0x9f),
  ];

  // An ESC sequence inside the payload used to make the outer string-control regex give up.
  // Its `junk...more` payload then survived and split the sensitive key name in both readings.
  for (const [index, intro] of introducers.entries()) {
    const terminators = index < 2 ? [BEL, `${ESC}\\`, ST8] : [`${ESC}\\`, ST8];
    for (const terminator of terminators) {
      const hostile = `access_to${intro}junk${ESC}[31mmore${terminator}ken=abcd1234efgh5678`;
      const stripped = stripTerminalControls(hostile);
      const out = safeRemoteString(hostile);
      assert.equal(stripped, "access_token=abcd1234efgh5678");
      assert.doesNotMatch(out.replace(/\[redacted\]/gu, ""), /abcd1234|efgh5678/u);
    }
  }

  // BEL terminates OSC only. For the other four string families it is payload, so stripping
  // must continue through the later ST instead of stranding the text between BEL and ST.
  for (const intro of introducers.slice(2)) {
    for (const terminator of [`${ESC}\\`, ST8]) {
      const hostile = `access_to${intro}junk${BEL}more${terminator}ken=abcd1234efgh5678`;
      assert.equal(stripTerminalControls(hostile), "access_token=abcd1234efgh5678");
      assert.doesNotMatch(safeRemoteString(hostile).replace(/\[redacted\]/gu, ""), /abcd1234|efgh5678/u);
    }
  }

  // These are line controls even though they sit outside the C0/C1 ranges. Keeping either
  // one lets the key/value pattern redact only the first half and publish the tail on a new
  // visual line.
  for (const separator of ["\u2028", "\u2029"]) {
    const hostile = `access_token=abcd1234${separator}efgh5678`;
    assert.equal(stripTerminalControls(hostile), "access_token=abcd1234efgh5678");
    assert.equal(safeRemoteString(hostile), "access_token=[redacted]");
  }

  // ECMA-35 has private/standardized and multi-byte escape forms outside ESC @ through
  // ESC _. A CSI parser also remains active across embedded C0 controls.
  const NUL = String.fromCharCode(0x00);
  const CSI8 = String.fromCharCode(0x9b);
  for (const sequence of [`${ESC}7`, `${ESC}=`, `${ESC}c`, `${ESC}(B`, `${ESC}[1${NUL}2m`, `${CSI8}1${NUL}2m`]) {
    const hostile = `access_to${sequence}ken=abcd1234efgh5678`;
    assert.equal(stripTerminalControls(hostile), "access_token=abcd1234efgh5678");
    assert.doesNotMatch(safeRemoteString(hostile).replace(/\[redacted\]/gu, ""), /abcd1234|efgh5678/u);
  }
});

test("identical credentials crossed between the readings cannot compare equal", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const CSI8 = String.fromCharCode(0x9b);
  const OSC8 = String.fromCharCode(0x9d);
  const ST8 = String.fromCharCode(0x9c);
  const bearer = "Bearer abcdefghijklmnopqrstuvwxyz012345";

  // Two *identical* credentials. The OSC copy is only recognisable once the sequence has been
  // consumed; the CSI copy only survives the character-only reading, because consuming the
  // sequence eats the "r" of "Bearer". Findings therefore compare equal string-for-string.
  const seenByDisplay = `Bea${OSC8}x${ST8}rer abcdefghijklmnopqrstuvwxyz012345`;
  const seenByAlternate = `Bea${CSI8}rer abcdefghijklmnopqrstuvwxyz012345`;

  for (const text of [
    `${seenByDisplay} and ${seenByAlternate}`,
    `${seenByAlternate} and ${seenByDisplay}`,
    `${seenByDisplay} and ${seenByAlternate} and ${bearer}`,
  ]) {
    const out = safeRemoteString(text);
    assert.equal(out, "[redacted]", "disagreeing readings cost the whole string");
    assert.doesNotMatch(out.replace(/\[redacted\]/gu, ""), /abcdefghijkl/u);
  }
});

test("mixed terminal sequences cannot evade both global canonical readings", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(0x1b);
  const CSI8 = String.fromCharCode(0x9b);
  const ST8 = String.fromCharCode(0x9c);
  const OSC8 = String.fromCharCode(0x9d);
  const DCS8 = String.fromCharCode(0x90);
  const secret = "abcd1234efgh5678";
  const mixed = [
    `access_to${OSC8}junk${ST8}k${CSI8}en=${secret}`,
    `access_to${DCS8}junk${ST8}k${CSI8}en=${secret}`,
    `access_to${ESC}]junk${ESC}\\k${ESC}[en=${secret}`,
    `access_to${ESC}Pjunk${ESC}\\k${ESC}[en=${secret}`,
  ];

  for (const hostile of mixed) {
    const out = safeRemoteString(hostile);
    assert.equal(out, "[redacted]", `ambiguous controlled text was shown: ${JSON.stringify(out)}`);
    assert.doesNotMatch(out, /abcd1234|efgh5678/u);
  }
});

test("credentials crossed between the two readings cannot ride out on an equal count", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const CSI8 = String.fromCharCode(0x9b);
  const OSC8 = String.fromCharCode(0x9d);

  // One credential each reading can see, so both find exactly one and the counts tie.
  // Keeping the displayed form on that tie publishes the one only the other reading saw.
  const seenInDisplay = `access_to${OSC8}8;;x${BEL}ken=abcd1234efgh5678`;
  const seenInAlternate = `Bea${CSI8}rer abcdefghijklmnopqrstuvwxyz012345`;

  for (const [first, second] of [[seenInDisplay, seenInAlternate], [seenInAlternate, seenInDisplay]]) {
    const out = safeRemoteString(`${first} and ${second}`);
    assert.equal(out, "[redacted]", "disagreeing readings cost the whole string");
    for (const fragment of ["abcdefghijkl", "qrstuvwxyz012345", "abcd1234", "efgh5678"]) {
      assert.equal(out.includes(fragment), false, `fragment ${fragment} survived`);
    }
  }

  // Three secrets, two readings, still no partial publication.
  const triple = `${seenInDisplay} then ${seenInAlternate} then sk_live_ABCDEFGHIJ${ESC}[0mKLMNOPQRSTUV`;
  const out = safeRemoteString(triple);
  assert.doesNotMatch(out, /abcdefghijkl|abcd1234|KLMNOPQRSTUV/u);
});

test("a second credential visible only in the alternate reading is not published", async () => {
  const { safeRemoteString } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(0x1b);
  const CSI8 = String.fromCharCode(0x9b);

  // The first credential is caught in the displayed reading, so a test of "did we redact
  // anything" passes on its strength alone. The second is only recognisable in the
  // character-only reading, and would ride out on the back of the first.
  const caughtInDisplay = `access_token=abcd1234efgh${ESC}[31m5678`;
  const caughtOnlyInAlternate = `Bea${CSI8}rer abcdefghijklmnopqrstuvwxyz012345`;
  const out = safeRemoteString(`${caughtInDisplay} and ${caughtOnlyInAlternate}`);

  assert.doesNotMatch(out, /abcdefghijkl/u, "the bearer token must not survive");
  assert.doesNotMatch(out, /abcd1234|efgh5678/u);
  assert.equal(out, "[redacted]", "when the readings disagree in count, the whole string goes");

  // The ordinary case must not be over-redacted into uselessness.
  assert.equal(safeRemoteString("Claim 4471 was paid on August 12."), "Claim 4471 was paid on August 12.");
  assert.equal(
    safeRemoteString("Failed to register an OAuth client. err_type=HTTPStatusError"),
    "Failed to register an OAuth client. err_type=HTTPStatusError",
  );
});

test("an MCP transport failure names its phase, as the published contract promises", async () => {
  const config = mcpConfig(makeTempRoot("calle-core-mcp-phase"));

  const dns = new TypeError("fetch failed");
  dns.cause = { code: "ENOTFOUND" };
  await assert.rejects(
    () => listMcpTools({ config, fetchImpl: async () => { throw dns; } }),
    (error) => {
      assert.equal(error.transport, true);
      assert.equal(error.phase, "connect", "nothing arrived");
      return true;
    },
  );

  const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  const afterHeaders = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "s" } });
    }
    if (payload.method === "notifications/initialized") return jsonResponse({});
    return {
      ok: true, status: 200, statusText: "OK", headers: new Headers(),
      async text() { throw reset; },
    };
  };
  await assert.rejects(
    () => callMcpTool({ config: mcpConfig(makeTempRoot("calle-core-mcp-phase-body")), toolName: "plan_call", fetchImpl: afterHeaders }),
    (error) => {
      assert.equal(error.transport, true);
      assert.equal(error.phase, "body", "headers arrived, the stream did not finish");
      return true;
    },
  );

  // A non-transport error must not claim a phase at all.
  const rpcError = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "s" } });
    if (payload.method === "notifications/initialized") return jsonResponse({});
    return jsonRpcResponse(payload, { error: { code: -32000, message: "nope" } });
  };
  await assert.rejects(
    () => callMcpTool({ config: mcpConfig(makeTempRoot("calle-core-mcp-phase-none")), toolName: "plan_call", fetchImpl: rpcError }),
    (error) => {
      assert.equal(error.transport, false);
      assert.equal(error.phase, null);
      return true;
    },
  );
});

test("a body that is not JSON never reaches Error.message", async () => {
  const { requestJson, InvalidResponseError } = await import("@call-e/core/http");
  const marker = "REMOTE-TEXT-MARKER sk_live_ABCDEFGHIJKLMNOP";

  for (const body of [marker, `"${marker}"`, "[1,2,3]", "null"]) {
    await assert.rejects(
      () => requestJson("GET", "https://example.test/thing", {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          async text() { return body; },
        }),
      }),
      (error) => {
        assert.ok(error instanceof InvalidResponseError, `body ${JSON.stringify(body)}`);
        // JSON.parse quotes its input; this message must not.
        assert.doesNotMatch(error.message, /REMOTE-TEXT-MARKER|sk_live_/u);
        assert.match(error.message, /^Response body was not (valid JSON|a JSON object) for GET https:\/\/example\.test\/thing$/u);
        assert.equal(error.statusCode, 200);
        assert.equal(error.responseText, body, "the raw body is retained for sanitizing");
        return true;
      },
    );
  }
});

test("a body stream that fails after headers is transport, and says which phase", async () => {
  const { requestJson, TransportError } = await import("@call-e/core/http");
  const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });

  await assert.rejects(
    () => requestJson("GET", "https://example.test/x", {
      fetchImpl: async () => ({
        ok: true, status: 200, statusText: "OK", headers: new Headers(),
        async text() { throw reset; },
      }),
    }),
    (error) => {
      assert.ok(error instanceof TransportError);
      assert.equal(error.phase, "body");
      assert.equal(error.code, "ECONNRESET");
      return true;
    },
  );

  const dns = new TypeError("fetch failed");
  dns.cause = { code: "ENOTFOUND" };
  await assert.rejects(
    () => requestJson("GET", "https://example.test/y", { fetchImpl: async () => { throw dns; } }),
    (error) => {
      assert.equal(error.phase, "connect", "nothing arrived, so the phase is connect");
      return true;
    },
  );
});

test("numeric remote codes are accepted only as safe integers", async () => {
  const { safeRemoteCode, sanitizeRemoteError, publicRemoteError } = await import("@call-e/core/sanitize");
  assert.equal(safeRemoteCode(-32000), "-32000");
  assert.equal(safeRemoteCode(0), "0");
  assert.equal(safeRemoteCode(1e100), undefined);
  assert.equal(safeRemoteCode(1.5), undefined);
  assert.equal(safeRemoteCode(Number.NaN), undefined);
  assert.equal(safeRemoteCode(Number.MAX_SAFE_INTEGER + 2), undefined);
  assert.equal(safeRemoteCode("-abc"), "-abc");
  assert.equal(safeRemoteCode(" -abc "), undefined);
  assert.equal(safeRemoteCode("1e+100"), undefined);
  assert.deepEqual(sanitizeRemoteError({ error: { code: 1e100, message: "m" } }), { message: "m" });
  assert.deepEqual(publicRemoteError({ code: -32601, message: "x", extra: "dropped" }), { code: "-32601", message: "x" });
  assert.equal(publicRemoteError({ extra: "only" }), null);
});

function bodyFailingResponse(error, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers(headers),
    async text() {
      throw error;
    },
  };
}

test("a body read that aborts or resets after headers is a typed transport failure", async () => {
  const { requestJson, TransportError } = await import("@call-e/core/http");
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  await assert.rejects(
    () => requestJson("GET", "https://example.test/slow", { fetchImpl: async () => bodyFailingResponse(aborted) }),
    (error) => {
      assert.ok(error instanceof TransportError);
      assert.equal(error.timedOut, true);
      assert.equal(error.code, "timeout");
      return true;
    },
  );

  const reset = new Error("socket hang up");
  reset.code = "ECONNRESET";
  await assert.rejects(
    () => requestJson("GET", "https://example.test/reset", { fetchImpl: async () => bodyFailingResponse(reset) }),
    (error) => {
      assert.ok(error instanceof TransportError);
      assert.equal(error.timedOut, false);
      assert.equal(error.code, "ECONNRESET");
      assert.match(error.message, /Response body could not be read for GET https:\/\/example\.test\/reset/u);
      return true;
    },
  );

  // Same through the MCP client, on the tools/call leg after a healthy initialize.
  const config = mcpConfig(makeTempRoot("calle-core-mcp-body-reset"));
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse(payload, { result: {} }, { headers: { "mcp-session-id": "mcp-session-b" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    return bodyFailingResponse(reset);
  };
  await assert.rejects(
    () => callMcpTool({ config, toolName: "plan_call", fetchImpl }),
    (error) => {
      assert.ok(error instanceof McpHttpError);
      assert.equal(error.code, "transport_error");
      assert.equal(error.transport, true);
      assert.equal(error.timedOut, false);
      assert.equal(error.causeCode, "ECONNRESET");
      return true;
    },
  );
});
