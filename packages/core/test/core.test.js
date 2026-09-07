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
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-payload" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    if (payload.method === "tools/call") {
      const result = toolResults[toolCallIndex];
      toolCallIndex += 1;
      return jsonResponse({ result });
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
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-9" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonResponse({});
    }
    return jsonResponse({ error: { code: -32000, message: hostileMessage, access_token: "tok_SECRET_VALUE_123456" } });
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

test("sanitize helpers strip terminal controls, redact secrets, and bound length", async () => {
  const { safeRemoteString, safeRemoteCode, redactSecrets, sanitizeRemoteError } = await import("@call-e/core/sanitize");
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const cleaned = safeRemoteString(`a${ESC}[2J${ESC}]8;;http://x${BEL}link${ESC}]8;;${BEL}b\r\nc`);
  assert.equal(cleaned.includes(ESC), false);
  assert.doesNotMatch(cleaned, /[\r\n]/u);
  assert.equal(cleaned, "alinkbc", "controls are removed, not spaced, so nothing can be split");

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

test("numeric remote codes are accepted only as safe integers", async () => {
  const { safeRemoteCode, sanitizeRemoteError, publicRemoteError } = await import("@call-e/core/sanitize");
  assert.equal(safeRemoteCode(-32000), "-32000");
  assert.equal(safeRemoteCode(0), "0");
  assert.equal(safeRemoteCode(1e100), undefined);
  assert.equal(safeRemoteCode(1.5), undefined);
  assert.equal(safeRemoteCode(Number.NaN), undefined);
  assert.equal(safeRemoteCode(Number.MAX_SAFE_INTEGER + 2), undefined);
  assert.equal(safeRemoteCode("-abc"), "-abc");
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
      return jsonResponse({ result: {} }, { headers: { "mcp-session-id": "mcp-session-b" } });
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
