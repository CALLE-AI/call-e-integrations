import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { POST_AUTH_HELP_MESSAGE, preAuthHelpMessage, runCli } from "../lib/cli.js";
import {
  callRecoveryCachePath,
  pendingCachePath,
  tokenCachePath,
  writePrivateJson,
} from "../lib/cache.js";
import { CLI_VERSION, resolveRuntimeConfig } from "../lib/config.js";

const defaultIntegrationHeader = `cli/cli/${CLI_VERSION}`;

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

function captureTelemetry(events) {
  return async (url, init) => {
    events.push({
      url: String(url),
      init,
      payload: JSON.parse(init.body),
    });
    return jsonResponse({ accepted: true }, { status: 202 });
  };
}

function maybeMcpToolsListResponse(
  url,
  init,
  { serverUrl, accessToken, methods, sessionId = "sess-verify", integrationHeader = defaultIntegrationHeader }
) {
  if (String(url) !== serverUrl) {
    return null;
  }
  assert.equal(init.headers.Authorization, `Bearer ${accessToken}`);
  assert.equal(init.headers["X-Call-E-Integration"], integrationHeader);
  const payload = JSON.parse(init.body);
  methods.push(payload.method);
  if (payload.method === "initialize") {
    return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} }, { headers: { "mcp-session-id": sessionId } });
  }
  if (payload.method === "notifications/initialized") {
    assert.equal(init.headers["mcp-session-id"], sessionId);
    return jsonRpcResponse({});
  }
  if (payload.method === "tools/list") {
    return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: { tools: [] } });
  }
  throw new Error(`unexpected MCP method: ${payload.method}`);
}

async function run(argv, deps = {}) {
  let stdout = "";
  let stderr = "";
  const { env = {}, ...restDeps } = deps;
  const code = await runCli(argv, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += `${text}\n`;
    },
    openBrowser: async () => {},
    sleepImpl: async () => {},
    env: { CALLE_TELEMETRY: "0", ...env },
    ...restDeps,
  });
  return { code, stdout, stderr };
}

test("prints group and command-specific help without contacting the server", async () => {
  const groupResult = await run(["call", "--help"]);
  const commandResult = await run(["call", "plan", "--help"]);

  assert.equal(groupResult.code, 0);
  assert.match(groupResult.stdout, /Usage: calle call <command>/);
  assert.match(groupResult.stdout, /calle call <command> --help/);
  assert.equal(groupResult.stderr, "");

  assert.equal(commandResult.code, 0);
  assert.match(commandResult.stdout, /Usage: calle call plan --to-phone <phone> --goal <text>/);
  assert.match(commandResult.stdout, /--to-phone <phone>\s+Required/);
  assert.match(commandResult.stdout, /--goal <text>\s+Required/);
  assert.match(commandResult.stdout, /--timeout-seconds <seconds>\s+Default: 15; plan_call: 150/);
  assert.match(commandResult.stdout, /Examples:/);
  assert.equal(commandResult.stderr, "");
});

test("prints command-specific help for every supported subcommand", async () => {
  const commands = [
    ["auth", "login"],
    ["auth", "status"],
    ["auth", "logout"],
    ["mcp", "config"],
    ["mcp", "tools"],
    ["mcp", "call"],
    ["call", "plan"],
    ["call", "start"],
    ["call", "run"],
    ["call", "recover"],
    ["call", "status"],
    ["regions", "list"],
  ];

  for (const command of commands) {
    const result = await run([...command, "--help"]);

    assert.equal(result.code, 0, command.join(" "));
    assert.match(result.stdout, new RegExp(`Usage: calle ${command.join(" ")}`));
    assert.equal(result.stderr, "");
  }
});

test("prints the CLI version with both version flags", async () => {
  for (const flag of ["--version", "-V"]) {
    const result = await run([flag]);

    assert.deepEqual(result, { code: 0, stdout: `${CLI_VERSION}\n`, stderr: "" });
  }
});

test("prints the supported regions and languages documentation URL", async () => {
  const result = await run(["regions", "list"]);

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    supported_regions_and_languages_url: "https://github.com/CALLE-AI/call-e-integrations#supported-regions-and-languages",
  });
  assert.equal(result.stderr, "");
});

test("call plan argument errors recommend its command-specific help", async () => {
  const result = await run(["call", "plan", "--to", "+15551234567", "--goal", "Confirm"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(payload.error.code, "invalid_arguments");
  assert.equal(payload.error.message, "Unknown option: --to");
  assert.equal(payload.help_command, "calle call plan --help");
  assert.match(result.stderr, /Run 'calle call plan --help' for usage\./);
});

test("call plan option value errors recommend its command-specific help", async () => {
  const result = await run([
    "call",
    "plan",
    "--to-phone",
    "+15551234567",
    "--goal",
    "Confirm",
    "--timeout-seconds",
    "nope",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(payload.error.code, "invalid_arguments");
  assert.match(payload.error.message, /--timeout-seconds expects a positive number of seconds/);
  assert.equal(payload.help_command, "calle call plan --help");
  assert.match(result.stderr, /Run 'calle call plan --help' for usage\./);
});

test("rejects options that belong to another call subcommand", async () => {
  const result = await run(["call", "plan", "--run-id", "run_123"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.match(payload.error.message, /--run-id is not supported by calle call plan/);
  assert.equal(payload.help_command, "calle call plan --help");
});

test("auth login defaults broker payload to openagent_oauth and hides token from stdout", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const requests = [];
  const mcpMethods = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      assert.equal(init.headers["X-Call-E-Integration"], defaultIntegrationHeader);
      const payload = JSON.parse(init.body);
      assert.equal(payload.channel, "openagent_oauth");
      assert.equal(payload.server_url, serverUrl);
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
      assert.equal(init.headers["X-Call-E-Integration"], defaultIntegrationHeader);
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init?.method === "POST") {
      assert.equal(init.headers["X-Call-E-Integration"], defaultIntegrationHeader);
      return jsonResponse({
        token: { access_token: "secret-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    const mcpResponse = maybeMcpToolsListResponse(url, init, {
      serverUrl,
      accessToken: "secret-token",
      methods: mcpMethods,
    });
    if (mcpResponse) {
      return mcpResponse;
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.equal(requests.length, 6);
  assert.deepEqual(mcpMethods, ["initialize", "notifications/initialized", "tools/list"]);
  assert.doesNotMatch(result.stdout, /secret-token/);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "logged_in");
  assert.equal(payload.server_url, serverUrl);
  assert.deepEqual(payload.assistant_hint, {
    type: "post_auth_help",
    message: POST_AUTH_HELP_MESSAGE,
  });
  assert.match(payload.assistant_hint.message, /Great, authorization is complete/);
  const tokenPayload = JSON.parse(fs.readFileSync(tokenCachePath(cacheRoot, payload.server_url), "utf8"));
  assert.equal(tokenPayload.token.access_token, "secret-token");
  assert.equal(fs.existsSync(pendingCachePath(cacheRoot, payload.server_url)), false);
});

test("auth login removes exchanged token and returns auth_required when MCP rejects verification", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-verify-401");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const tokenPath = tokenCachePath(cacheRoot, serverUrl);
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
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
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init?.method === "POST") {
      return jsonResponse({
        token: { access_token: "rejected-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    if (String(url) === serverUrl && init?.method === "POST") {
      assert.equal(init.headers.Authorization, "Bearer rejected-token");
      return jsonRpcResponse({ error: "unauthorized" }, { status: 401 });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "auth_required");
  assert.equal(fs.existsSync(tokenPath), false);
  assert.deepEqual(requests, [
    "POST https://mcp.example/api/v1/openagent-auth/sessions",
    "GET https://mcp.example/api/v1/openagent-auth/sessions/session-1",
    "POST https://mcp.example/api/v1/openagent-auth/sessions/session-1/exchange",
    `POST ${serverUrl}`,
  ]);
  assert.doesNotMatch(result.stdout, /rejected-token/);
});

test("auth login start-only returns authorization hint without polling", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-start-only");
  const loginUrl = "https://mcp.example/openagent-auth/sessions/session-1/start";
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      return jsonResponse(
        {
          session_id: "session-1",
          session_secret: "secret-1",
          login_url: loginUrl,
          status: "PENDING",
          poll_after_ms: 1,
          expires_at: "2030-01-01T00:00:00Z",
        },
        { status: 201 }
      );
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    [
      "auth",
      "login",
      "--start-only",
      "--no-browser-open",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(requests, ["POST https://mcp.example/api/v1/openagent-auth/sessions"]);
  assert.equal(payload.status, "login_required");
  assert.equal(payload.login_url, loginUrl);
  assert.deepEqual(payload.assistant_hint, {
    type: "pre_auth_help",
    message: preAuthHelpMessage(loginUrl),
  });
  assert.match(payload.assistant_hint.message, /Before we start, please complete authorization here/);
  assert.doesNotMatch(result.stdout, /secret-1/);
});

test("auth login surfaces the upstream error body when brokered login registration fails", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-broker-5xx");
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          error: "oauth_register_failed",
          message: "Failed to register an OAuth client. err_type=HTTPStatusError",
        }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    [
      "auth",
      "login",
      "--start-only",
      "--no-browser-open",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.status_code, 502);
  assert.equal(payload.error.code, "broker_unavailable", "top-level code stays CLI-owned");
  assert.deepEqual(payload.error.remote_error, {
    code: "oauth_register_failed",
    message: "Failed to register an OAuth client. err_type=HTTPStatusError",
  });
  // The upstream wording is available, but only under remote_error. The summary and stderr
  // are authored by the CLI.
  assert.match(payload.error.remote_error.message, /Failed to register an OAuth client/);
  assert.doesNotMatch(payload.error.message, /Failed to register an OAuth client/);
  assert.match(payload.error.message, /^HTTP 502 from https:\/\/mcp\.example\/api\/v1\/openagent-auth\/sessions\./);
  assert.match(payload.error.message, /login service is unavailable/);
  assert.match(payload.error.message, /dashboard API key/);
  assert.doesNotMatch(result.stderr, /Failed to register an OAuth client/);
  assert.match(result.stderr, /login service is unavailable/);
});

test("auth login keeps a non-JSON upstream error body readable and bounded", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-broker-html");
  const body = `<html><body>${"gateway ".repeat(200)}</body></html>`;
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      return new Response(body, { status: 503, headers: { "content-type": "text/html" } });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    [
      "auth",
      "login",
      "--start-only",
      "--no-browser-open",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.status_code, 503);
  assert.equal(payload.error.code, "broker_unavailable");
  assert.ok(payload.error.remote_error.message.length <= 500);
  assert.equal(payload.error.remote_error.code, undefined);
});

function brokerFailure(status, body, contentType = "application/json") {
  return async (url, init) => {
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      return new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": contentType },
      });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };
}

const LOGIN_ARGS = [
  "auth",
  "login",
  "--start-only",
  "--no-browser-open",
  "--base-url",
  "https://mcp.example",
];

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

test("auth login never lets an upstream body impersonate a local error code", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-forged-code");
  const result = await run(
    [...LOGIN_ARGS, "--cache-root", cacheRoot],
    { fetchImpl: brokerFailure(502, { error: "auth_required", message: "please log in again" }) }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "broker_unavailable");
  assert.equal(payload.status, undefined, "must not look like a login_required response");
  assert.equal(payload.assistant_hint, undefined);
  assert.equal(payload.login_url, undefined);
  assert.equal(payload.error.remote_error.code, "auth_required");
  assert.equal(payload.error.remote_error.message, "please log in again");
});

test("auth login bounds and sanitizes hostile upstream JSON", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-hostile");
  const longMessage = "x".repeat(20_000);
  const hostile = {
    error: {
      code: "bad code\u001b[31m",
      message: `line one\r\ninjected line\u001b[2J\u001b[H${longMessage}`,
      access_token: "sk_live_SUPERSECRET_DO_NOT_PRINT",
    },
    token: "tok_ALSO_SECRET",
    refresh_token: "rt_SECRET_TOO",
  };
  const result = await run(
    [...LOGIN_ARGS, "--cache-root", cacheRoot],
    { fetchImpl: brokerFailure(502, hostile) }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "broker_unavailable");
  assert.equal(payload.error.remote_error.code, undefined, "unsafe code is dropped, not sanitized into something plausible");
  assert.ok(payload.error.remote_error.message.length <= 500);
  assert.ok(payload.error.message.length < 1200);
  assert.doesNotMatch(payload.error.remote_error.message, CONTROL_CHARS);
  assert.doesNotMatch(payload.error.message, CONTROL_CHARS);
  assert.doesNotMatch(result.stderr, /\u001b|\r/u);
  for (const secret of ["SUPERSECRET", "tok_ALSO_SECRET", "rt_SECRET_TOO", "access_token", "refresh_token"]) {
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    assert.doesNotMatch(result.stderr, new RegExp(secret));
  }
});

test("auth login reads a nested upstream error object and drops everything else", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-nested");
  const result = await run(
    [...LOGIN_ARGS, "--cache-root", cacheRoot],
    {
      fetchImpl: brokerFailure(500, {
        error: { code: "nested.code-1", message: "nested message", details: { internal: "trace-abc" } },
        request_id: "req_123",
      }),
    }
  );
  const payload = JSON.parse(result.stdout);

  assert.deepEqual(payload.error.remote_error, { code: "nested.code-1", message: "nested message" });
  assert.doesNotMatch(result.stdout, /trace-abc|req_123|details|request_id/u);
});

test("auth login returns a transport_error envelope when fetch rejects", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-fetch-rejected");
  const fetchImpl = async () => {
    const error = new TypeError("fetch failed");
    error.cause = { code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "mcp.example" };
    throw error;
  };
  const result = await run([...LOGIN_ARGS, "--cache-root", cacheRoot], { fetchImpl });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "transport_error");
  assert.equal(payload.error.transport, true);
  assert.equal(payload.error.cause_code, "ENOTFOUND");
  assert.equal(payload.help_command, undefined);
  // Locally authored: names our request and the system error code, never the runtime's text.
  assert.equal(payload.error.phase, "connect", "nothing arrived at all");
  assert.match(
    payload.error.message,
    /^Request failed before a response was received from https:\/\/mcp\.example\/api\/v1\/openagent-auth\/sessions\. \(ENOTFOUND\)$/u
  );
  assert.ok(result.stderr.length < 500);
  // The test harness terminates each stderr write with a newline; everything else must be clean.
  assert.doesNotMatch(result.stderr.trimEnd(), CONTROL_CHARS);
});

test("auth login classifies a request timeout as a transport_error", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-timeout");
  const fetchImpl = async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    throw aborted;
  };
  const result = await run([...LOGIN_ARGS, "--cache-root", cacheRoot], { fetchImpl });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "transport_error");
  assert.equal(payload.error.transport, true);
  assert.equal(payload.error.cause_code, "timeout");
  assert.match(payload.error.message, /^Request timed out waiting for https:\/\/mcp\.example\/api\/v1\/openagent-auth\/sessions\./u);
});

test("an unrelated local TypeError is internal_error, never transport_error", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-local-typeerror");
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
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
      return jsonResponse({ status: "PENDING", expires_at: "2030-01-01T00:00:00Z" });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };
  // A bug inside the CLI's own polling loop, not a network condition.
  const sleepImpl = async () => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  };

  const result = await run(
    ["auth", "login", "--no-browser-open", "--base-url", "https://mcp.example", "--cache-root", cacheRoot],
    { fetchImpl, sleepImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "internal_error");
  assert.equal(payload.error.transport, undefined);
  assert.equal(payload.error.cause_code, undefined);
  assert.match(payload.error.message, /Cannot read properties/u);
});

function mcpFixture({ serverUrl, onToolsList, onToolsCall }) {
  return async (url, init) => {
    assert.equal(String(url), serverUrl);
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} }, { headers: { "mcp-session-id": "sess-h" } });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/list" && onToolsList) {
      return onToolsList(payload);
    }
    if (payload.method === "tools/call" && onToolsCall) {
      return onToolsCall(payload);
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };
}

const ESC_CHAR = String.fromCharCode(27);
const HOSTILE_REMOTE_TEXT =
  `line one\r\ninjected${ESC_CHAR}[2J${ESC_CHAR}[H bearer abcdefghijklmnopqrstuvwxyz0123 ` +
  `access_token=sk_live_ABCDEFGHIJKLMNOPQRST ${"z".repeat(20_000)}`;

test("mcp tools keeps a hostile JSON-RPC error out of the summary and bounds it under remote_error", async () => {
  const cacheRoot = makeTempRoot("calle-cli-mcp-tools-hostile");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "tool-token");
  const fetchImpl = mcpFixture({
    serverUrl,
    onToolsList: (payload) => jsonRpcResponse({
      jsonrpc: "2.0",
      id: payload.id,
      error: { code: -32000, message: HOSTILE_REMOTE_TEXT, data: { refresh_token: "rt_SECRET_ABCDEFGH" } },
    }),
  });

  const result = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], { fetchImpl });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "mcp_error");
  assert.equal(payload.error.message, "Remote MCP error for tools/list");
  assert.ok(payload.error.remote_error.message.length <= 500);
  assert.equal(payload.error.remote_error.code, "-32000");
  assert.doesNotMatch(payload.error.remote_error.message, CONTROL_CHARS);
  for (const secret of ["sk_live_", "abcdefghijklmnopqrstuvwxyz0123", "rt_SECRET", "refresh_token"]) {
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    assert.doesNotMatch(result.stderr, new RegExp(secret));
  }
  assert.doesNotMatch(result.stderr.trimEnd(), CONTROL_CHARS);
  assert.ok(result.stderr.length < 300);
});

test("mcp call applies the same boundary to a tool-call error", async () => {
  const cacheRoot = makeTempRoot("calle-cli-mcp-call-hostile");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "tool-token");
  const fetchImpl = mcpFixture({
    serverUrl,
    onToolsCall: (payload) => jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, error: { code: -32601, message: HOSTILE_REMOTE_TEXT } }),
  });

  const result = await run(
    ["mcp", "call", "get_call_run", "--args-json", '{"run_id":"run_1"}', "--base-url", "https://mcp.example", "--cache-root", cacheRoot],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "mcp_error");
  assert.equal(payload.error.message, "Remote MCP error for tools/call");
  assert.ok(payload.error.remote_error.message.length <= 500);
  assert.doesNotMatch(result.stdout, /sk_live_|abcdefghijklmnopqrstuvwxyz0123/u);
  assert.doesNotMatch(result.stderr, /sk_live_|abcdefghijklmnopqrstuvwxyz0123/u);
  assert.doesNotMatch(result.stderr.trimEnd(), CONTROL_CHARS);
});

test("call start keeps a hostile clarifying question out of the plan_not_ready summary", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start-hostile-question");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "tool-token");
  const fetchImpl = mcpFixture({
    serverUrl,
    onToolsCall: (payload) => jsonRpcResponse({
      jsonrpc: "2.0",
      id: payload.id,
      result: { structuredContent: { ready_to_run: false, clarifying_questions: [HOSTILE_REMOTE_TEXT] } },
    }),
  });

  const result = await run(
    ["call", "start", "--to-phone", "+15551234567", "--goal", "Confirm appointment", "--base-url", "https://mcp.example", "--cache-root", cacheRoot],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.stage, "plan_call");
  assert.equal(payload.error.code, "plan_not_ready");
  assert.match(payload.error.message, /^Call plan needs more information before it can run\./u);
  assert.doesNotMatch(payload.error.message, /injected|zzzz/u);
  assert.ok(payload.error.remote_error.message.length <= 500);
  // The question carries both control sequences and credentials, so the readings disagree and
  // the whole string is withheld rather than partially shown.
  assert.equal(payload.error.remote_error.message, "[redacted]");
  assert.doesNotMatch(payload.error.remote_error.message, CONTROL_CHARS);
  assert.doesNotMatch(result.stdout, /sk_live_|abcdefghijklmnopqrstuvwxyz0123/u);
  assert.doesNotMatch(result.stderr, /injected|sk_live_/u);
});

test("telemetry reports the same error code as the envelope for broker and transport failures", async () => {
  const brokerRoot = makeTempRoot("calle-cli-telemetry-broker");
  const brokerEvents = [];
  await run(
    [...LOGIN_ARGS, "--cache-root", brokerRoot],
    {
      fetchImpl: brokerFailure(502, { error: "oauth_register_failed", message: "x" }),
      env: { CALLE_TELEMETRY: "1" },
      telemetryFetchImpl: captureTelemetry(brokerEvents),
    }
  );
  const brokerFailed = brokerEvents.find((event) => event.payload.event === "auth_login_local_failed");
  assert.ok(brokerFailed, "auth_login_local_failed telemetry was emitted");
  assert.equal(brokerFailed.payload.properties.error_code, "broker_unavailable");

  const mcpRoot = makeTempRoot("calle-cli-telemetry-transport");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(mcpRoot, serverUrl, "tool-token");
  const mcpEvents = [];
  const dns = new TypeError("fetch failed");
  dns.cause = { code: "ECONNREFUSED" };
  const result = await run(
    ["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", mcpRoot],
    { fetchImpl: async () => { throw dns; }, env: { CALLE_TELEMETRY: "1" }, telemetryFetchImpl: captureTelemetry(mcpEvents) }
  );
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, "transport_error");
  assert.equal(payload.error.cause_code, "ECONNREFUSED");
  const checked = mcpEvents.find((event) => event.payload.event === "mcp_tools_checked" && event.payload.properties.outcome === "failure");
  assert.ok(checked, "mcp_tools_checked failure telemetry was emitted");
  assert.equal(checked.payload.properties.error_code, "transport_error");
});

test("every error code the CLI can emit is documented, and nothing undocumented is emitted", async () => {
  const { ERROR_CODES } = await import("../lib/cli.js");
  const reference = fs.readFileSync(new URL("../docs/cli-reference.md", import.meta.url), "utf8");
  const section = reference.split("## Error Envelopes")[1]?.split(/\n## /u)[0] ?? "";
  const documented = new Set([...section.matchAll(/^\| `([a-z_]+)` \| \d /gmu)].map((m) => m[1]));
  const emitted = new Set(Object.keys(ERROR_CODES));

  assert.deepEqual([...documented].sort(), [...emitted].sort());
  for (const [code, meta] of Object.entries(ERROR_CODES)) {
    assert.match(section, new RegExp(`^\\| \`${code}\` \\| ${meta.exitCode} `, "mu"), `exit code documented for ${code}`);
  }
});

test("the error-envelope docs never tell an agent to execute a command string", () => {
  const reference = fs.readFileSync(new URL("../docs/cli-reference.md", import.meta.url), "utf8");
  const section = reference.split("## Error Envelopes")[1]?.split(/\n## /u)[0] ?? "";
  assert.ok(section.length > 0, "the Error Envelopes section exists");

  // The canonical page states that only the *_argv arrays are executable and the paired
  // *_command strings are display-only. This section must not contradict it.
  assert.match(section, /`login_argv`, `help_argv` and `next_argv` are the only\nexecutable forms/u);
  assert.match(section, /`next_argv` array as the next request's `argv`/u);
  assert.match(section, /`help_argv` \| `invalid_arguments` only/u);

  for (const line of section.split("\n")) {
    if (!/`(next|help|login)_command`/u.test(line)) continue;
    assert.match(
      line,
      /display-only|never be executed/u,
      `a *_command mention must mark it display-only: ${line.trim().slice(0, 120)}`,
    );
    assert.doesNotMatch(
      line,
      /\b(run|execute|invoke) the returned `\w+_command`|directly runnable/u,
      `the docs must not instruct executing a command string: ${line.trim().slice(0, 120)}`,
    );
  }
});

function bodyFailingResponse(error) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "mcp-session-id": "sess-body" }),
    async text() {
      throw error;
    },
  };
}

test("a body read that fails during a call stage is a typed transport outcome with stage context", async () => {
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const startArgs = ["call", "start", "--to-phone", "+15551234567", "--goal", "Confirm appointment", "--base-url", "https://mcp.example"];

  const abortRoot = makeTempRoot("calle-cli-stage-body-abort");
  writeToken(abortRoot, serverUrl, "tool-token");
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const abortResult = await run([...startArgs, "--cache-root", abortRoot], {
    fetchImpl: mcpFixture({ serverUrl, onToolsCall: () => bodyFailingResponse(aborted) }),
  });
  const abortPayload = JSON.parse(abortResult.stdout);
  assert.equal(abortResult.code, 1);
  assert.equal(abortPayload.stage, "plan_call");
  assert.equal(abortPayload.retry_safe, true);
  assert.equal(abortPayload.error.code, "plan_call_timeout");
  assert.equal(abortPayload.error.transport, true);
  assert.equal(abortPayload.error.cause_code, "timeout");
  assert.equal(abortPayload.error.phase, "body");
  assert.match(
    abortPayload.error.message,
    /^plan_call timed out while the response was being read; the request had already been accepted\.$/u
  );

  const resetRoot = makeTempRoot("calle-cli-stage-body-reset");
  writeToken(resetRoot, serverUrl, "tool-token");
  const reset = new Error("socket hang up");
  reset.code = "ECONNRESET";
  const resetResult = await run([...startArgs, "--cache-root", resetRoot], {
    fetchImpl: mcpFixture({ serverUrl, onToolsCall: () => bodyFailingResponse(reset) }),
  });
  const resetPayload = JSON.parse(resetResult.stdout);
  assert.equal(resetResult.code, 1);
  assert.equal(resetPayload.stage, "plan_call");
  assert.equal(resetPayload.call_started, false);
  assert.equal(resetPayload.retry_safe, true);
  assert.equal(resetPayload.error.code, "transport_error", "a rejected transport at a stage is transport_error, not <stage>_error");
  assert.equal(resetPayload.error.transport, true);
  assert.equal(resetPayload.error.cause_code, "ECONNRESET");
  assert.equal(resetPayload.error.phase, "body");
  assert.match(
    resetPayload.error.message,
    /^plan_call failed while the response was being read; the request had already been accepted\.$/u
  );
});

test("a call-stage body failure keeps its phase and does not claim nothing was received", async () => {
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const startArgs = ["call", "start", "--to-phone", "+15551234567", "--goal", "g", "--base-url", "https://mcp.example"];

  const bodyFailures = [
    {
      name: "timeout while reading the body",
      error: Object.assign(new Error("aborted"), { name: "AbortError" }),
      code: "plan_call_timeout",
      causeCode: "timeout",
      summary: /^plan_call timed out while the response was being read; the request had already been accepted\.$/u,
    },
    {
      name: "reset while reading the body",
      error: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
      code: "transport_error",
      causeCode: "ECONNRESET",
      summary: /^plan_call failed while the response was being read; the request had already been accepted\.$/u,
    },
  ];

  for (const failure of bodyFailures) {
    const cacheRoot = makeTempRoot("calle-cli-stage-phase");
    writeToken(cacheRoot, serverUrl, "tool-token");
    const result = await run([...startArgs, "--cache-root", cacheRoot], {
      fetchImpl: mcpFixture({ serverUrl, onToolsCall: () => bodyFailingResponse(failure.error) }),
    });
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.error.code, failure.code, failure.name);
    assert.equal(payload.error.transport, true, failure.name);
    assert.equal(payload.error.phase, "body", `${failure.name}: the phase must survive the stage wrapper`);
    assert.equal(payload.error.cause_code, failure.causeCode, failure.name);
    assert.match(payload.error.message, failure.summary, failure.name);
    assert.doesNotMatch(payload.error.message, /before a response was received/u, failure.name);
    assert.equal(payload.stage, "plan_call");
  }

  // A connect-phase failure at the same stage must still say the request never landed.
  const cacheRoot = makeTempRoot("calle-cli-stage-phase-connect");
  writeToken(cacheRoot, serverUrl, "tool-token");
  const dns = new TypeError("fetch failed");
  dns.cause = { code: "ENOTFOUND" };
  const connect = await run([...startArgs, "--cache-root", cacheRoot], { fetchImpl: async () => { throw dns; } });
  const connectPayload = JSON.parse(connect.stdout);
  assert.equal(connectPayload.error.phase, "connect");
  assert.match(connectPayload.error.message, /^plan_call failed before a response was received\.$/u);
});

test("a credential split by a control sequence inside a remote body is still fully redacted", async () => {
  const cacheRoot = makeTempRoot("calle-cli-split-credential");
  const ESC = String.fromCharCode(27);
  const body = {
    error: "oauth_register_failed",
    message:
      `access_token=abcd${ESC}[31m1234efgh5678 and sk_live_ABCDEFGHIJ${ESC}[0mKLMNOPQRSTUV plus ` +
      `Bearer abcdefghijkl${ESC}]8;;x${String.fromCharCode(7)}mnopqrstuvwxyz012345`,
  };
  const result = await run([...LOGIN_ARGS, "--cache-root", cacheRoot], { fetchImpl: brokerFailure(502, body) });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.error.code, "broker_unavailable");
  for (const fragment of ["abcd1234", "1234efgh", "efgh5678", "ABCDEFGHIJ", "KLMNOPQRSTUV", "abcdefghijkl", "mnopqrstuvwxyz012345"]) {
    assert.doesNotMatch(result.stdout, new RegExp(fragment), `fragment ${fragment} leaked to stdout`);
    assert.doesNotMatch(result.stderr, new RegExp(fragment), `fragment ${fragment} leaked to stderr`);
  }
  assert.match(payload.error.remote_error.message, /\[redacted\]/u);
  assert.doesNotMatch(payload.error.remote_error.message, CONTROL_CHARS);
});

test("every envelope agrees with the contract: transport flag, remote_error shape, local summary", async () => {
  const { ERROR_CODES } = await import("../lib/cli.js");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const REMOTE_MARK = "REMOTE-TEXT-MARKER";
  const dns = new TypeError("fetch failed");
  dns.cause = { code: "ENOTFOUND" };
  const aborted = new Error("aborted");
  aborted.name = "AbortError";

  const scenarios = [
    { name: "invalid arguments", args: ["call", "plan", "--to"], deps: {} },
    { name: "broker 5xx", args: [...LOGIN_ARGS], deps: { fetchImpl: brokerFailure(502, { error: "x", message: REMOTE_MARK }) } },
    { name: "broker 4xx", args: [...LOGIN_ARGS], deps: { fetchImpl: brokerFailure(400, { error: "x", message: REMOTE_MARK }) } },
    { name: "broker fetch rejected", args: [...LOGIN_ARGS], deps: { fetchImpl: async () => { throw dns; } } },
    { name: "broker timeout", args: [...LOGIN_ARGS], deps: { fetchImpl: async () => { throw aborted; } } },
    {
      name: "mcp json-rpc error", args: ["mcp", "tools", "--base-url", "https://mcp.example"], token: true,
      deps: { fetchImpl: mcpFixture({ serverUrl, onToolsList: (p) => jsonRpcResponse({ jsonrpc: "2.0", id: p.id, error: { code: -32000, message: REMOTE_MARK } }) }) },
    },
    { name: "mcp fetch rejected", args: ["mcp", "tools", "--base-url", "https://mcp.example"], token: true, deps: { fetchImpl: async () => { throw dns; } } },
    {
      name: "plan not ready", args: ["call", "start", "--to-phone", "+15551234567", "--goal", "g", "--base-url", "https://mcp.example"], token: true,
      deps: { fetchImpl: mcpFixture({ serverUrl, onToolsCall: (p) => jsonRpcResponse({ jsonrpc: "2.0", id: p.id, result: { structuredContent: { ready_to_run: false, clarifying_questions: [REMOTE_MARK] } } }) }) },
    },
    {
      name: "stage isError", args: ["call", "start", "--to-phone", "+15551234567", "--goal", "g", "--base-url", "https://mcp.example"], token: true,
      deps: { fetchImpl: mcpFixture({ serverUrl, onToolsCall: (p) => jsonRpcResponse({ jsonrpc: "2.0", id: p.id, result: { isError: true, structuredContent: { error_code: "REMOTE_CODE", message: REMOTE_MARK } } }) }) },
    },
    {
      name: "stage body reset", args: ["call", "start", "--to-phone", "+15551234567", "--goal", "g", "--base-url", "https://mcp.example"], token: true,
      deps: { fetchImpl: mcpFixture({ serverUrl, onToolsCall: () => bodyFailingResponse(Object.assign(new Error("reset"), { code: "ECONNRESET" })) }) },
    },
  ];

  for (const scenario of scenarios) {
    const cacheRoot = makeTempRoot("calle-cli-parity");
    if (scenario.token) writeToken(cacheRoot, serverUrl, "tool-token");
    const result = await run([...scenario.args, "--cache-root", cacheRoot], scenario.deps);
    const payload = JSON.parse(result.stdout);
    const label = `[${scenario.name}] code=${payload.error?.code}`;

    assert.notEqual(result.code, 0, label);
    assert.equal(payload.ok, false, label);
    assert.ok(Object.hasOwn(ERROR_CODES, payload.error.code), `${label}: code is in the contract`);
    assert.equal(result.code, ERROR_CODES[payload.error.code].exitCode, `${label}: exit code matches the contract`);
    assert.equal(Boolean(payload.error.transport), ERROR_CODES[payload.error.code].transport, `${label}: transport flag matches the contract`);
    assert.doesNotMatch(payload.error.message, new RegExp(REMOTE_MARK), `${label}: summary is locally authored`);
    assert.doesNotMatch(result.stderr, new RegExp(REMOTE_MARK), `${label}: stderr is locally authored`);
    if (payload.error.remote_error !== undefined) {
      const keys = Object.keys(payload.error.remote_error);
      assert.ok(keys.length > 0 && keys.every((k) => k === "code" || k === "message"), `${label}: remote_error is only {code, message}`);
      if (payload.error.remote_error.code !== undefined) {
        assert.match(payload.error.remote_error.code, /^-?[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u, `${label}: remote code charset`);
      }
    }
  }
});

test("a successful response with a non-JSON body does not publish the body as the summary", async () => {
  const cacheRoot = makeTempRoot("calle-cli-invalid-json");
  const marker = "REMOTE-TEXT-MARKER access_token=sk_live_ABCDEFGHIJKLMNOP";
  const result = await run(
    [...LOGIN_ARGS, "--cache-root", cacheRoot],
    {
      fetchImpl: async (url, init) => {
        if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
          return new Response(marker, { status: 200, headers: { "content-type": "text/plain" } });
        }
        throw new Error(`unexpected request: ${init?.method} ${url}`);
      },
    }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.error.code, "invalid_response");
  assert.equal(payload.error.status_code, 200);
  assert.equal(payload.error.transport, undefined, "a bad body is not a network condition");
  assert.match(payload.error.message, /whose body was not the expected JSON/u);
  // Node's own SyntaxError would have quoted the body here.
  assert.doesNotMatch(payload.error.message, /REMOTE-TEXT-MARKER/u);
  assert.doesNotMatch(result.stderr, /REMOTE-TEXT-MARKER/u);
  assert.doesNotMatch(result.stdout, /sk_live_/u);
  assert.doesNotMatch(result.stderr, /sk_live_/u);
});

test("a remote error_code is validated exactly like any other machine code", async () => {
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const cases = [
    { code: "EXECUTION_ACK_LOST", kept: "EXECUTION_ACK_LOST" },
    { code: -32000, kept: "-32000" },
    { code: 1e100, kept: undefined },
    { code: 1.5, kept: undefined },
    { code: "x".repeat(80), kept: undefined },
    { code: "  spaced code  ", kept: undefined },
    { code: `bad${String.fromCharCode(27)}[31m`, kept: undefined },
    { code: "has spaces", kept: undefined },
  ];

  for (const { code, kept } of cases) {
    const cacheRoot = makeTempRoot("calle-cli-errorcode");
    writeToken(cacheRoot, serverUrl, "tool-token");
    const result = await run(
      ["call", "start", "--to-phone", "+15551234567", "--goal", "g", "--base-url", "https://mcp.example", "--cache-root", cacheRoot],
      {
        fetchImpl: mcpFixture({
          serverUrl,
          onToolsCall: (p) => jsonRpcResponse({
            jsonrpc: "2.0",
            id: p.id,
            result: { isError: true, structuredContent: { error_code: code, message: "stage failed" } },
          }),
        }),
      }
    );
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.error.error_code, kept, `for input ${JSON.stringify(code)}`);
    if (payload.error.error_code !== undefined) {
      assert.match(payload.error.error_code, /^-?[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u);
    }
  }
});

test("a hostile plan_call result that omits plan_id cannot leak through the invalid-response path", async () => {
  // extractRequiredStructuredString throws with the entire tool result as `payload`. That
  // result is server-controlled: its text content, its structuredContent, and any extra
  // fields. None of it may reach the summary, stderr, or an unvalidated remote_error.
  const cacheRoot = makeTempRoot("calle-cli-plan-invalid-hostile");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "tool-token");
  const ESC = String.fromCharCode(27);
  const hostileText =
    `${ESC}[2J${ESC}[H` +
    `{"confirm_token":"confirm-secret-DO-NOT-PRINT","access_token":"sk_live_ABCDEFGHIJKLMNOPQRST"}` +
    `\r\nplan-secret ${"y".repeat(20_000)}`;
  const fetchImpl = mcpFixture({
    serverUrl,
    onToolsCall: (payload) => jsonRpcResponse({
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        content: [{ type: "text", text: hostileText }],
        // ready_to_run is true but plan_id is absent, so the CLI must reject the plan.
        structuredContent: {
          ready_to_run: true,
          confirm_token: "confirm-secret-DO-NOT-PRINT",
          message: `remote message ${ESC}[31m tok_SECRET_VALUE_1234567890`,
          refresh_token: "rt_SECRET_ABCDEFGHIJ",
        },
      },
    }),
  });

  const result = await run(
    ["call", "start", "--to-phone", "+15551234567", "--goal", "Confirm appointment", "--base-url", "https://mcp.example", "--cache-root", cacheRoot],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.stage, "plan_call");
  assert.equal(payload.call_started, false);
  assert.equal(payload.retry_safe, true);
  assert.equal(payload.error.code, "plan_call_invalid_response");
  assert.equal(payload.error.message, "plan_call did not return plan_id");
  assert.equal(payload.error.transport, undefined);
  assert.ok(result.stdout.length < 2000, "no amplification of the 20 KB body");
  for (const secret of ["confirm-secret", "DO-NOT-PRINT", "sk_live_", "plan-secret", "tok_SECRET", "rt_SECRET", "refresh_token", "yyyyyyyy"]) {
    assert.doesNotMatch(result.stdout, new RegExp(secret), `${secret} leaked to stdout`);
    assert.doesNotMatch(result.stderr, new RegExp(secret), `${secret} leaked to stderr`);
  }
  assert.doesNotMatch(result.stderr.trimEnd(), CONTROL_CHARS);
  if (payload.error.remote_error !== undefined) {
    assert.ok(Object.keys(payload.error.remote_error).every((k) => k === "code" || k === "message"));
    assert.doesNotMatch(JSON.stringify(payload.error.remote_error), CONTROL_CHARS);
  }
});

test("auth login start-only replaces locally active pending cache when broker reports it expired", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-start-only-expired-broker");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const oldLoginUrl = "https://mcp.example/openagent-auth/sessions/session-old/start";
  const newLoginUrl = "https://mcp.example/openagent-auth/sessions/session-new/start";
  const pendingPath = pendingCachePath(cacheRoot, serverUrl);
  writePrivateJson(pendingPath, {
    session_id: "session-old",
    session_secret: "secret-old",
    login_url: oldLoginUrl,
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
    expires_at: "2030-01-01T00:00:00Z",
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-old") && init?.method === "GET") {
      return jsonResponse({ status: "EXPIRED" }, { status: 410 });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
      return jsonResponse(
        {
          session_id: "session-new",
          session_secret: "secret-new",
          login_url: newLoginUrl,
          status: "PENDING",
          poll_after_ms: 1,
          expires_at: "2030-01-01T00:00:00Z",
        },
        { status: 201 }
      );
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    [
      "auth",
      "login",
      "--start-only",
      "--no-browser-open",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);
  const pendingPayload = JSON.parse(fs.readFileSync(pendingPath, "utf8"));

  assert.equal(result.code, 0);
  assert.deepEqual(requests, [
    "GET https://mcp.example/api/v1/openagent-auth/sessions/session-old",
    "POST https://mcp.example/api/v1/openagent-auth/sessions",
  ]);
  assert.equal(payload.login_url, newLoginUrl);
  assert.equal(payload.pending_created, true);
  assert.equal(pendingPayload.session_id, "session-new");
  assert.equal(pendingPayload.login_url, newLoginUrl);
  assert.doesNotMatch(result.stdout, /secret-new|secret-old/);
});

test("auth login start-only reuses pending cache only after broker confirms it is active", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-start-only-reconciled");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const oldLoginUrl = "https://mcp.example/openagent-auth/sessions/session-1/local-start";
  const brokerLoginUrl = "https://mcp.example/openagent-auth/sessions/session-1/broker-start";
  const pendingPath = pendingCachePath(cacheRoot, serverUrl);
  writeToken(cacheRoot, serverUrl, "cached-token");
  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: oldLoginUrl,
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
    expires_at: "2030-01-01T00:00:00Z",
    poll_after_ms: 1,
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    assert.notEqual(String(url), "https://mcp.example/api/v1/openagent-auth/sessions");
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1") && init?.method === "GET") {
      assert.equal(init.headers["X-OpenAgent-Session-Secret"], "secret-1");
      return jsonResponse({
        session_id: "session-1",
        login_url: brokerLoginUrl,
        status: "PENDING",
        poll_after_ms: 7,
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    [
      "auth",
      "login",
      "--start-only",
      "--no-browser-open",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);
  const pendingPayload = JSON.parse(fs.readFileSync(pendingPath, "utf8"));

  assert.equal(result.code, 0);
  assert.deepEqual(requests, ["GET https://mcp.example/api/v1/openagent-auth/sessions/session-1"]);
  assert.equal(payload.login_url, brokerLoginUrl);
  assert.equal(payload.pending_created, false);
  assert.equal(payload.pending_status, "PENDING");
  assert.equal(pendingPayload.login_url, brokerLoginUrl);
  assert.equal(pendingPayload.poll_after_ms, 7);
  assert.doesNotMatch(result.stdout, /secret-1/);
});

test("auth login start-only creates a new session when broker reports a terminal pending status", async () => {
  for (const terminalStatus of ["EXPIRED", "FAILED", "EXCHANGED"]) {
    const cacheRoot = makeTempRoot(`calle-cli-login-start-only-terminal-${terminalStatus.toLowerCase()}`);
    const serverUrl = "https://mcp.example/mcp/openagent_oauth";
    const pendingPath = pendingCachePath(cacheRoot, serverUrl);
    writePrivateJson(pendingPath, {
      session_id: `session-old-${terminalStatus.toLowerCase()}`,
      session_secret: "secret-old",
      login_url: `https://mcp.example/openagent-auth/sessions/${terminalStatus}/start`,
      status: "PENDING",
      created_at: "2026-04-23T00:00:00Z",
      expires_at: "2030-01-01T00:00:00Z",
    });
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push(`${init?.method} ${url}`);
      if (String(url).includes(`/sessions/session-old-${terminalStatus.toLowerCase()}`) && init?.method === "GET") {
        return jsonResponse({
          session_id: `session-old-${terminalStatus.toLowerCase()}`,
          status: terminalStatus,
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
        return jsonResponse(
          {
            session_id: `session-new-${terminalStatus.toLowerCase()}`,
            session_secret: "secret-new",
            login_url: `https://mcp.example/openagent-auth/sessions/new-${terminalStatus}/start`,
            status: "PENDING",
            poll_after_ms: 1,
            expires_at: "2030-01-01T00:00:00Z",
          },
          { status: 201 }
        );
      }
      throw new Error(`unexpected request: ${init?.method} ${url}`);
    };

    const result = await run(
      [
        "auth",
        "login",
        "--start-only",
        "--no-browser-open",
        "--base-url",
        "https://mcp.example",
        "--cache-root",
        cacheRoot,
      ],
      { fetchImpl }
    );
    const payload = JSON.parse(result.stdout);
    const pendingPayload = JSON.parse(fs.readFileSync(pendingPath, "utf8"));

    assert.equal(result.code, 0);
    assert.equal(requests.length, 2);
    assert.equal(requests[1], "POST https://mcp.example/api/v1/openagent-auth/sessions");
    assert.equal(payload.pending_created, true);
    assert.equal(pendingPayload.session_id, `session-new-${terminalStatus.toLowerCase()}`);
  }
});

test("auth login returns post-auth assistant hint for cached login", async () => {
  const cacheRoot = makeTempRoot("calle-cli-cached-login");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "cached-login-token");

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot],
    {
      fetchImpl: async () => {
        throw new Error("auth login should not contact broker with a usable cached token");
      },
    }
  );

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /cached-login-token/);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "cached");
  assert.deepEqual(payload.assistant_hint, {
    type: "post_auth_help",
    message: POST_AUTH_HELP_MESSAGE,
  });
});

test("auth login exchanges active pending login before returning cached token", async () => {
  const cacheRoot = makeTempRoot("calle-cli-pending-before-cached-login");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const tokenPath = tokenCachePath(cacheRoot, serverUrl);
  const pendingPath = pendingCachePath(cacheRoot, serverUrl);
  writeToken(cacheRoot, serverUrl, "stale-cached-token");
  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://mcp.example/openagent-auth/sessions/session-1/start",
    status: "AUTHORIZED",
    created_at: "2026-04-23T00:00:00Z",
    expires_at: "2030-01-01T00:00:00Z",
    poll_after_ms: 1,
  });

  const seenMethods = [];
  const mcpMethods = [];
  const fetchImpl = async (url, init) => {
    seenMethods.push(`${init?.method} ${url}`);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1") && init?.method === "GET") {
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init?.method === "POST") {
      return jsonResponse({
        token: { access_token: "fresh-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    const mcpResponse = maybeMcpToolsListResponse(url, init, {
      serverUrl,
      accessToken: "fresh-token",
      methods: mcpMethods,
    });
    if (mcpResponse) {
      return mcpResponse;
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);
  const tokenPayload = JSON.parse(fs.readFileSync(tokenPath, "utf8"));

  assert.equal(result.code, 0);
  assert.equal(payload.status, "logged_in");
  assert.deepEqual(seenMethods.map((entry) => entry.split(" ")[0]), ["GET", "GET", "POST", "POST", "POST", "POST"]);
  assert.deepEqual(mcpMethods, ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(tokenPayload.token.access_token, "fresh-token");
  assert.equal(fs.existsSync(pendingPath), false);
  assert.doesNotMatch(result.stdout, /stale-cached-token|fresh-token|secret-1/);
});

test("auth login forwards upstream integration context from environment", async () => {
  const cacheRoot = makeTempRoot("calle-cli-login-integration");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const seenHeaders = [];
  const mcpMethods = [];
  const fetchImpl = async (url, init) => {
    seenHeaders.push(init.headers["X-Call-E-Integration"]);
    if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
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
      return jsonResponse({ status: "AUTHORIZED", expires_at: "2030-01-01T00:00:00Z" });
    }
    if (String(url).endsWith("/api/v1/openagent-auth/sessions/session-1/exchange") && init?.method === "POST") {
      return jsonResponse({
        token: { access_token: "secret-token" },
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    const mcpResponse = maybeMcpToolsListResponse(url, init, {
      serverUrl,
      accessToken: "secret-token",
      methods: mcpMethods,
      integrationHeader: "codex/codex_plugin/0.1.2",
    });
    if (mcpResponse) {
      return mcpResponse;
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    {
      fetchImpl,
      env: {
        CALLE_SOURCE: "codex",
        CALLE_INTEGRATION: "codex_plugin",
        CALLE_INTEGRATION_VERSION: "0.1.2",
      },
    }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(seenHeaders, [
    "codex/codex_plugin/0.1.2",
    "codex/codex_plugin/0.1.2",
    "codex/codex_plugin/0.1.2",
    "codex/codex_plugin/0.1.2",
    "codex/codex_plugin/0.1.2",
    "codex/codex_plugin/0.1.2",
  ]);
  assert.deepEqual(mcpMethods, ["initialize", "notifications/initialized", "tools/list"]);
});

test("attribution options override environment values without changing the environment", async (t) => {
  const cacheRoot = makeTempRoot("calle-cli-attribution-options");
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  const env = { CALLE_SOURCE: "old", CALLE_INTEGRATION: "legacy", CALLE_INTEGRATION_VERSION: "0.1.0" };
  const events = [];
  const result = await run([
    "auth", "status", "--cache-root", cacheRoot,
    "--source", "codex", "--integration=codex_plugin", "--integration-version", "1.2.3-beta.1+test",
  ], { env: { ...env, CALLE_TELEMETRY: "1" }, telemetryFetchImpl: captureTelemetry(events) });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(events[0].payload.context.integration_context, {
    source: "codex", integration: "codex_plugin", version: "1.2.3-beta.1+test",
  });
  assert.equal(resolveRuntimeConfig({ source: "codex" }, env).integrationHeader, "codex/legacy/0.1.0");
  assert.deepEqual(env, { CALLE_SOURCE: "old", CALLE_INTEGRATION: "legacy", CALLE_INTEGRATION_VERSION: "0.1.0" });
  assert.equal(resolveRuntimeConfig({}, {}).integrationHeader, defaultIntegrationHeader);
  assert.equal(resolveRuntimeConfig({ source: "codex" }, {}).integrationHeader, "codex/unknown/unknown");

  for (const flag of ["--source", "--integration", "--integration-version"]) {
    for (const value of ["", "bad/value", "bad value", "bad\r\nheader"]) {
      const invalid = await run(["auth", "status", flag, value], {
        fetchImpl: () => assert.fail("invalid attribution must not reach the server"),
      });
      assert.equal(invalid.code, 2);
      const payload = JSON.parse(invalid.stdout);
      assert.equal(payload.error.code, "invalid_arguments");
      assert.ok(payload.error.message.includes(`${flag} expects`), payload.error.message);
    }
    const missing = await run(["auth", "status", flag]);
    assert.equal(missing.code, 2);
    assert.ok(JSON.parse(missing.stdout).error.message.includes(`Missing value for ${flag}`));
  }
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
  const mcpMethods = [];
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
    const mcpResponse = maybeMcpToolsListResponse(url, init, {
      serverUrl,
      accessToken: "resumed-token",
      methods: mcpMethods,
    });
    if (mcpResponse) {
      return mcpResponse;
    }
    throw new Error(`unexpected request: ${init?.method} ${url}`);
  };

  const result = await run(
    ["auth", "login", "--base-url", "https://mcp.example", "--cache-root", cacheRoot, "--no-browser-open"],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(seenMethods.map((entry) => entry.split(" ")[0]), ["GET", "GET", "POST", "POST", "POST", "POST"]);
  assert.deepEqual(mcpMethods, ["initialize", "notifications/initialized", "tools/list"]);
  assert.doesNotMatch(result.stdout, /resumed-token/);
});

test("auth login honors broker base url and channel overrides", async () => {
  const cacheRoot = makeTempRoot("calle-cli-overrides");
  const serverUrl = "https://mcp.example/mcp/custom_oauth";
  const requests = [];
  const mcpMethods = [];
  const fetchImpl = async (url, init) => {
    requests.push(String(url));
    if (String(url) === "https://broker.example/api/v1/openagent-auth/sessions" && init?.method === "POST") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.channel, "custom_oauth");
      assert.equal(payload.server_url, serverUrl);
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
    const mcpResponse = maybeMcpToolsListResponse(url, init, {
      serverUrl,
      accessToken: "override-token",
      methods: mcpMethods,
    });
    if (mcpResponse) {
      return mcpResponse;
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
    serverUrl,
    serverUrl,
    serverUrl,
  ]);
  assert.deepEqual(mcpMethods, ["initialize", "notifications/initialized", "tools/list"]);
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

  writePrivateJson(pendingCachePath(cacheRoot, serverUrl), {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://mcp.example/openagent-auth/sessions/session-1/start",
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
  });
  result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot]);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.pending_exists, true);
  assert.equal(payload.pending_status, "PENDING");
  assert.equal(payload.pending_login_url, "https://mcp.example/openagent-auth/sessions/session-1/start");
  assert.doesNotMatch(result.stdout, /secret-1/);
});

test("auth logout removes token and pending cache", async () => {
  const cacheRoot = makeTempRoot("calle-cli-logout");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const tokenPath = tokenCachePath(cacheRoot, serverUrl);
  const pendingPath = pendingCachePath(cacheRoot, serverUrl);
  const recoveryPath = callRecoveryCachePath(cacheRoot, serverUrl, "logoutRecoveryRecord123");
  writePrivateJson(tokenPath, { token: { access_token: "token" } });
  writePrivateJson(pendingPath, {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://mcp.example/login",
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
  });
  writePrivateJson(recoveryPath, {
    schema_version: 1,
    plan_id: "plan-secret",
    confirm_token: "confirm-secret",
  });

  const result = await run(["auth", "logout", "--base-url", "https://mcp.example", "--cache-root", cacheRoot]);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.removed_cache, true);
  assert.equal(payload.removed_pending, true);
  assert.equal(payload.removed_call_recoveries, true);
  assert.equal(fs.existsSync(tokenPath), false);
  assert.equal(fs.existsSync(pendingPath), false);
  assert.equal(fs.existsSync(recoveryPath), false);
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
    assert.equal(init.headers["X-Call-E-Integration"], defaultIntegrationHeader);
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

test("mcp call forwards plan_call arguments and request meta", async () => {
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
        result: {
          content: [{ type: "text", text: '{"plan_id":"plan-1"}' }],
        },
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
      "--timezone",
      "Asia/Shanghai",
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
      _meta: {
        "openai/userLocation": { timezone: "Asia/Shanghai" },
        timezone_offset_minutes: -480,
      },
    },
  ]);
  assert.equal(calls[0]._meta["openai/subject"], undefined);
  assert.equal(calls[0]._meta["openai/session"], undefined);
  assert.equal(calls[0]._meta["openai/organization"], undefined);
  assert.equal(payload.ok, true);
  assert.equal(payload.tool_name, "plan_call");
  assert.deepEqual(payload.result.structuredContent, { plan_id: "plan-1" });
});

test("mcp call gives plan_call an extended default timeout and honors an explicit override", async () => {
  const cacheRoot = makeTempRoot("calle-cli-mcp-plan-timeout");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "call-token");
  const requestTimeouts = [];
  let scheduledTimeoutMs = null;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    scheduledTimeoutMs = Number(delay);
    return originalSetTimeout(callback, delay, ...args);
  };

  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    requestTimeouts.push({ method: payload.method, timeoutMs: scheduledTimeoutMs });
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { structuredContent: { plan_id: "plan-1" } },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  let defaultResult;
  let explicitResult;
  let defaultRequestTimeouts;
  let explicitRequestTimeouts;
  try {
    defaultResult = await run(
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
      { fetchImpl },
    );
    defaultRequestTimeouts = [...requestTimeouts];
    requestTimeouts.length = 0;
    explicitResult = await run(
      [
        "mcp",
        "call",
        "plan_call",
        "--args-json",
        '{"to_phones":["+15551234567"],"goal":"Confirm appointment"}',
        "--timeout-seconds",
        "30",
        "--base-url",
        "https://mcp.example",
        "--cache-root",
        cacheRoot,
      ],
      { fetchImpl },
    );
    explicitRequestTimeouts = [...requestTimeouts];
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.equal(defaultResult.code, 0);
  assert.deepEqual(defaultRequestTimeouts, [
    { method: "initialize", timeoutMs: 15_000 },
    { method: "notifications/initialized", timeoutMs: 15_000 },
    { method: "tools/call", timeoutMs: 150_000 },
  ]);
  assert.equal(explicitResult.code, 0);
  assert.deepEqual(explicitRequestTimeouts, [
    { method: "initialize", timeoutMs: 30_000 },
    { method: "notifications/initialized", timeoutMs: 30_000 },
    { method: "tools/call", timeoutMs: 30_000 },
  ]);
});

test("mcp call leaves non-plan tools without request meta or timestamp localization", async () => {
  const cacheRoot = makeTempRoot("calle-cli-mcp-call-non-plan");
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
        result: {
          structuredContent: {
            run_id: "run-1",
            activity: [{ ts: "2026-05-20T09:32:10.000Z", message: "Calling" }],
          },
        },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "mcp",
      "call",
      "get_call_run",
      "--args-json",
      '{"run_id":"run-1"}',
      "--timezone",
      "Asia/Shanghai",
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
      name: "get_call_run",
      arguments: { run_id: "run-1" },
    },
  ]);
  assert.equal(payload.ok, true);
  assert.equal(payload.tool_name, "get_call_run");
  assert.deepEqual(payload.result.structuredContent.activity, [
    { ts: "2026-05-20T09:32:10.000Z", message: "Calling" },
  ]);
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
      "--timezone",
      "Asia/Shanghai",
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
    _meta: {
      "openai/userLocation": { timezone: "Asia/Shanghai" },
      timezone_offset_minutes: -480,
    },
  });
  assert.equal(toolCall._meta["openai/subject"], undefined);
  assert.equal(toolCall._meta["openai/session"], undefined);
  assert.equal(toolCall._meta["openai/organization"], undefined);
  assert.equal(JSON.parse(result.stdout).tool_name, "plan_call");
});

test("call plan injects timezone meta from CALLE_TIMEZONE", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-plan-env-timezone");
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
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { env: { CALLE_TIMEZONE: "America/New_York" }, fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.equal(toolCall._meta["openai/userLocation"].timezone, "America/New_York");
  assert.equal(Number.isInteger(toolCall._meta.timezone_offset_minutes), true);
});

test("call plan skips timezone meta when explicit timezone is invalid", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-plan-invalid-timezone");
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
      "--goal",
      "Confirm appointment",
      "--timezone",
      "Mars/Base",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );

  assert.equal(result.code, 0);
  assert.equal(toolCall._meta, undefined);
});

test("call start plans and runs without printing confirmation data", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "start-token");
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
      if (payload.params.name === "plan_call") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: '{"plan_id":"plan-1","confirm_token":"confirm-1","ready_to_run":true}',
              },
            ],
          },
        });
      }
      if (payload.params.name === "run_call") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [{ type: "text", text: '{"run_id":"run-1","status":"STARTED"}' }],
          },
        });
      }
      if (payload.params.name === "get_call_run") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [{ type: "text", text: '{"run_id":"run-1","status":"IN_PROGRESS"}' }],
          },
        });
      }
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--timezone",
      "Asia/Shanghai",
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
  assert.equal(payload.ok, true);
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.status_result.structuredContent.status, "IN_PROGRESS");
  assert.equal(payload.run_result, undefined);
  assert.match(payload.next_command, /--timezone Asia\/Shanghai/);
  assert.doesNotMatch(result.stdout, /confirm-1|plan-1|start-token/);
});

test("call start reports plan clarification and skips run_call when planning is not ready", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start-plan-not-ready");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
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
      if (payload.params.name === "plan_call") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: '{"plan_id":"plan-1","ready_to_run":false,"confirm_token":null}',
              },
            ],
            structuredContent: {
              plan_id: "plan-1",
              ready_to_run: false,
              clarifying_questions: ["What should the agent ask or say on the call?"],
              confirm_summary: "A call purpose is required.",
              confirm_token: null,
            },
          },
        });
      }
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "See what they say",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.deepEqual(toolCalls.map((call) => call.name), ["plan_call"]);
  assert.equal(payload.error.code, "plan_not_ready");
  assert.equal(
    payload.error.message,
    "Call plan needs more information before it can run. See error.remote_error.message for the question the service asked."
  );
  assert.equal(payload.error.remote_error.message, "What should the agent ask or say on the call?");
});

test("call start rejects a null structured confirm token without calling run_call", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start-null-confirm-token");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
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
      if (payload.params.name === "plan_call") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: '{"plan_id":"plan-1","confirm_token":null}',
              },
            ],
            structuredContent: {
              plan_id: "plan-1",
              confirm_token: null,
            },
          },
        });
      }
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.deepEqual(toolCalls.map((call) => call.name), ["plan_call"]);
  assert.equal(payload.stage, "plan_call");
  assert.equal(payload.call_started, false);
  assert.equal(payload.retry_safe, true);
  assert.equal(payload.error.code, "plan_call_invalid_response");
  assert.equal(payload.error.message, "plan_call did not return confirm_token");
});

test("call start labels a plan_call timeout as safe to retry", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start-plan-timeout");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call" && payload.params.name === "plan_call") {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.stage, "plan_call");
  assert.equal(payload.call_started, false);
  assert.equal(payload.retry_safe, true);
  assert.equal(payload.error.code, "plan_call_timeout");
  assert.match(payload.error.message, /plan_call timed out/);
});

test("call start preserves safe run_call error fields and an opaque recovery id", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start-run-error");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call" && payload.params.name === "plan_call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { structuredContent: { plan_id: "plan-secret", confirm_token: "confirm-secret" } },
      });
    }
    if (payload.method === "tools/call" && payload.params.name === "run_call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "unsafe-content service-secret" }],
          structuredContent: {
            error_code: "EXECUTION_ACK_LOST",
            status: "UNKNOWN",
            message: "Execution acknowledgement was lost.",
            retry_safe: false,
            call_started: "unknown",
            internal_secret: "do-not-print",
          },
        },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.stage, "run_call");
  assert.equal(payload.call_started, "unknown");
  assert.equal(payload.retry_safe, false);
  assert.equal(payload.error.code, "run_call_error");
  assert.equal(payload.error.error_code, "EXECUTION_ACK_LOST");
  assert.equal(payload.error.status, "UNKNOWN");
  assert.equal(payload.error.message, "run_call returned an error.");
  assert.equal(payload.error.remote_error.message, "Execution acknowledgement was lost.");
  assert.deepEqual(Object.keys(payload.error.remote_error).sort(), ["code", "message"]);
  assert.match(payload.recovery_id, /^[A-Za-z0-9_-]{20,}$/u);
  assert.match(payload.next_command, new RegExp(`calle call recover --recovery-id ${payload.recovery_id}`));
  assert.doesNotMatch(result.stdout, /plan-secret|confirm-secret|service-secret|do-not-print/);
});

test("call run preserves safe error fields when run_call omits run_id", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-run-missing-id");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call" && payload.params.name === "run_call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          structuredContent: {
            error_code: "DESTINATION_REJECTED",
            status: "FAILED",
            message: "The destination was rejected.",
            retry_safe: true,
            call_started: false,
            internal_secret: "do-not-print",
          },
        },
      });
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "run",
      "--plan-id",
      "plan-secret",
      "--confirm-token",
      "confirm-secret",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.stage, "run_call");
  assert.equal(payload.call_started, false);
  assert.equal(payload.retry_safe, true);
  assert.equal(payload.error.code, "run_call_missing_run_id");
  assert.equal(payload.error.error_code, "DESTINATION_REJECTED");
  assert.equal(payload.error.status, "FAILED");
  assert.equal(payload.error.message, "run_call did not return a run_id.");
  assert.equal(payload.error.remote_error.message, "The destination was rejected.");
  assert.doesNotMatch(result.stdout, /plan-secret|confirm-secret|do-not-print/);
});

test("call recover reuses the original confirmation after a run_call timeout", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-recover");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const toolCalls = [];
  let runAttempts = 0;
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
      if (payload.params.name === "plan_call") {
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: { structuredContent: { plan_id: "plan-secret", confirm_token: "confirm-secret" } },
        });
      }
      if (payload.params.name === "run_call") {
        runAttempts += 1;
        if (runAttempts === 1) {
          throw new DOMException("The operation was aborted", "AbortError");
        }
        return jsonRpcResponse({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            structuredContent: {
              run_id: "run-1",
              status: "STARTED",
              confirm_token: "confirm-secret",
              internal_secret: "do-not-print",
            },
          },
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

  const firstResult = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const firstPayload = JSON.parse(firstResult.stdout);

  assert.equal(firstResult.code, 1);
  assert.equal(firstPayload.error.code, "run_call_timeout");
  assert.equal(firstPayload.call_started, "unknown");
  assert.equal(firstPayload.retry_safe, false);
  assert.doesNotMatch(firstResult.stdout, /plan-secret|confirm-secret/);
  const recoveryPath = callRecoveryCachePath(cacheRoot, serverUrl, firstPayload.recovery_id);
  assert.equal(fs.existsSync(recoveryPath), true);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(recoveryPath).mode & 0o777, 0o600);
  }

  const recoveredResult = await run(
    [
      "call",
      "recover",
      "--recovery-id",
      firstPayload.recovery_id,
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const recoveredPayload = JSON.parse(recoveredResult.stdout);

  assert.equal(recoveredResult.code, 0);
  assert.equal(recoveredPayload.ok, true);
  assert.equal(recoveredPayload.run_id, "run-1");
  assert.deepEqual(toolCalls.map((call) => call.name), ["plan_call", "run_call", "run_call", "get_call_run"]);
  assert.deepEqual(toolCalls[1].arguments, { plan_id: "plan-secret", confirm_token: "confirm-secret" });
  assert.deepEqual(toolCalls[2].arguments, toolCalls[1].arguments);
  assert.doesNotMatch(recoveredResult.stdout, /plan-secret|confirm-secret|do-not-print/);

  const repeatedRecovery = await run(
    [
      "call",
      "recover",
      "--recovery-id",
      firstPayload.recovery_id,
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl: async () => { throw new Error("recovery should not contact MCP"); } }
  );
  assert.equal(repeatedRecovery.code, 1);
  assert.equal(JSON.parse(repeatedRecovery.stdout).error.code, "recovery_not_found");
});

test("call start returns an accepted run_id when get_call_run times out", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-start-status-timeout");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call" && payload.params.name === "plan_call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: { structuredContent: { plan_id: "plan-secret", confirm_token: "confirm-secret" } },
      });
    }
    if (payload.method === "tools/call" && payload.params.name === "run_call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          structuredContent: {
            run_id: "run-1",
            status: "STARTED",
            confirm_token: "confirm-secret",
            internal_secret: "do-not-print",
          },
        },
      });
    }
    if (payload.method === "tools/call" && payload.params.name === "get_call_run") {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "start",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.call_started, true);
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.status_query_succeeded, false);
  assert.equal(payload.status_result, null);
  assert.equal(payload.status_error.stage, "get_call_run");
  assert.equal(payload.status_error.code, "get_call_run_timeout");
  assert.match(payload.next_command, /calle call status --run-id run-1/);
  assert.doesNotMatch(result.stdout, /plan-secret|confirm-secret|do-not-print/);
});

test("call run filters the run_call response when get_call_run times out", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-run-status-timeout");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call" && payload.params.name === "run_call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          structuredContent: {
            run_id: "run-1",
            status: "STARTED",
            confirm_token: "confirm-secret",
            internal_secret: "do-not-print",
          },
        },
      });
    }
    if (payload.method === "tools/call" && payload.params.name === "get_call_run") {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    throw new Error(`unexpected method: ${payload.method}`);
  };

  const result = await run(
    [
      "call",
      "run",
      "--plan-id",
      "plan-secret",
      "--confirm-token",
      "confirm-secret",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.result.structuredContent.run_id, "run-1");
  assert.equal(payload.result.structuredContent.status, "STARTED");
  assert.equal(payload.run_result, undefined);
  assert.equal(payload.status_query_succeeded, false);
  assert.equal(payload.status_error.code, "get_call_run_timeout");
  assert.doesNotMatch(result.stdout, /plan-secret|confirm-secret|do-not-print/);
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
          result: {
            structuredContent: {
              run_id: "run-1",
              status: "IN_PROGRESS",
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
      "--timezone",
      "America/New_York",
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
  assert.deepEqual(payload.status_result.structuredContent.activity, [
    { ts: "2026-05-20T05:32:10.000-04:00", message: "Calling" },
  ]);
  assert.equal(payload.status_result.structuredContent.result.extracted.calling.started_at, "2026-05-20T05:32:10.000-04:00");
  assert.equal(payload.status_result.structuredContent.result.extracted.calling.ended_at, "2026-05-20T12:01:02.000-04:00");
  assert.match(payload.next_command, /calle call status --run-id run-1/);
  assert.match(payload.next_command, /--timezone America\/New_York/);
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
        result: {
          structuredContent: {
            run_id: "run-1",
            status: "COMPLETED",
            activity: [
              { ts: "2026-05-20T09:32:10.123Z", message: "Calling" },
              { ts: "not-a-timestamp", message: "Still waiting" },
              { message: "No timestamp" },
            ],
            result: {
              extracted: {
                calling: {
                  started_at: "2026-05-20T09:32:10.123Z",
                  ended_at: "2026-05-20T16:01:02Z",
                },
              },
            },
          },
        },
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
      "--timezone",
      "Asia/Shanghai",
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
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.tool_name, "get_call_run");
  assert.deepEqual(payload.result.structuredContent.activity, [
    { ts: "2026-05-20T17:32:10.123+08:00", message: "Calling" },
    { ts: "not-a-timestamp", message: "Still waiting" },
    { message: "No timestamp" },
  ]);
  assert.equal(payload.result.structuredContent.result.extracted.calling.started_at, "2026-05-20T17:32:10.123+08:00");
  assert.equal(payload.result.structuredContent.result.extracted.calling.ended_at, "2026-05-21T00:01:02.000+08:00");
});

test("call status localizes timestamps from CALLE_TIMEZONE", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-status-env-timezone");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          structuredContent: {
            run_id: "run-1",
            status: "IN_PROGRESS",
            activity: [{ ts: "2026-01-01T05:06:07Z", message: "Connected" }],
          },
        },
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
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { env: { CALLE_TIMEZONE: "America/New_York" }, fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.deepEqual(payload.result.structuredContent.activity, [
    { ts: "2026-01-01T00:06:07.000-05:00", message: "Connected" },
  ]);
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

  writePrivateJson(pendingCachePath(cacheRoot, serverUrl), {
    session_id: "session-1",
    session_secret: "secret-1",
    login_url: "https://mcp.example/openagent-auth/sessions/session-1/start",
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
  });
  const pendingResult = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });
  const pendingPayload = JSON.parse(pendingResult.stdout);
  assert.equal(pendingPayload.error.code, "auth_required");
  assert.equal(pendingPayload.login_url, "https://mcp.example/openagent-auth/sessions/session-1/start");
  assert.match(pendingPayload.assistant_hint.message, /Before we start, please complete authorization here/);
  assert.doesNotMatch(pendingResult.stdout, /secret-1/);

  writePrivateJson(pendingCachePath(cacheRoot, serverUrl), {
    session_id: "session-expired",
    session_secret: "secret-expired",
    login_url: "https://mcp.example/openagent-auth/sessions/session-expired/start",
    status: "PENDING",
    created_at: "2026-04-23T00:00:00Z",
    expires_at: "2000-01-01T00:00:00Z",
  });
  const expiredPendingResult = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });
  const expiredPendingPayload = JSON.parse(expiredPendingResult.stdout);
  assert.equal(expiredPendingPayload.error.code, "auth_required");
  assert.equal(expiredPendingPayload.login_url, undefined);
  assert.equal(expiredPendingPayload.assistant_hint, undefined);
  assert.doesNotMatch(expiredPendingResult.stdout, /session-expired|secret-expired/);

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
  const tokenPath = tokenCachePath(cacheRoot, serverUrl);
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
  assert.equal(fs.existsSync(tokenPath), false);
  assert.doesNotMatch(result.stdout, /stale-token/);
});

test("call plan removes cached token when MCP rejects it", async () => {
  const cacheRoot = makeTempRoot("calle-cli-call-plan-auth-401");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  const tokenPath = tokenCachePath(cacheRoot, serverUrl);
  writeToken(cacheRoot, serverUrl, "stale-call-token");
  const fetchImpl = async (_url, init) => {
    assert.equal(init.headers.Authorization, "Bearer stale-call-token");
    return jsonRpcResponse({ error: "unauthorized" }, { status: 401 });
  };

  const result = await run(
    [
      "call",
      "plan",
      "--to-phone",
      "+15551234567",
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    { fetchImpl }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "auth_required");
  assert.equal(fs.existsSync(tokenPath), false);
  assert.doesNotMatch(result.stdout, /stale-call-token/);
});

test("auth status emits server-compatible telemetry without sensitive fields", async () => {
  const cacheRoot = makeTempRoot("calle-cli-telemetry-status");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl, "usable-token");
  const telemetryEvents = [];

  const result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    env: { CALLE_TELEMETRY: "1" },
    telemetryFetchImpl: captureTelemetry(telemetryEvents),
  });

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).usable, true);
  assert.deepEqual(telemetryEvents.map((event) => event.payload.event), ["cli_invoked", "auth_status_checked"]);
  assert.equal(telemetryEvents[0].url, "https://mcp.example/api/ui-telemetry/track");
  assert.equal(telemetryEvents[0].payload.type, "track");
  assert.match(telemetryEvents[0].payload.anonymousId, /^[0-9a-f-]{36}$/u);
  assert.match(telemetryEvents[0].payload.messageId, /^[0-9a-f]{64}$/u);
  assert.equal(telemetryEvents[0].payload.context.source, "cli");
  assert.equal(telemetryEvents[0].payload.context.surface_name, "cli");
  assert.equal(telemetryEvents[1].payload.properties.usable, true);
  assert.equal(telemetryEvents[1].payload.properties.cache_exists, true);
  const serialized = JSON.stringify(telemetryEvents.map((event) => event.payload));
  assert.doesNotMatch(serialized, /usable-token/);
  assert.doesNotMatch(serialized, /access_token/);
});

test("codex environment is reflected in telemetry integration context", async () => {
  const cacheRoot = makeTempRoot("calle-cli-telemetry-codex");
  const telemetryEvents = [];

  const result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    env: {
      CALLE_TELEMETRY: "1",
      CALLE_SOURCE: "codex",
      CALLE_INTEGRATION: "codex_plugin",
      CALLE_INTEGRATION_VERSION: "0.1.2",
    },
    telemetryFetchImpl: captureTelemetry(telemetryEvents),
  });

  assert.equal(result.code, 0);
  const payload = telemetryEvents[0].payload;
  assert.equal(payload.context.source, "codex");
  assert.deepEqual(payload.context.integration_context, {
    source: "codex",
    integration: "codex_plugin",
    version: "0.1.2",
  });
  assert.equal(payload.properties.integration_source, "codex");
  assert.equal(payload.properties.integration_name, "codex_plugin");
  assert.equal(payload.properties.integration_version, "0.1.2");
});

test("mcp tools telemetry records auth_required before contacting MCP", async () => {
  const cacheRoot = makeTempRoot("calle-cli-telemetry-auth-required");
  const telemetryEvents = [];
  let fetchCalled = false;

  const result = await run(["mcp", "tools", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    env: { CALLE_TELEMETRY: "1" },
    telemetryFetchImpl: captureTelemetry(telemetryEvents),
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(result.code, 1);
  assert.equal(fetchCalled, false);
  assert.deepEqual(telemetryEvents.map((event) => event.payload.event), [
    "cli_invoked",
    "mcp_tools_checked",
    "auth_required",
  ]);
  assert.equal(telemetryEvents[1].payload.properties.outcome, "failure");
  assert.equal(telemetryEvents[1].payload.properties.error_code, "auth_required");
  const serialized = JSON.stringify(telemetryEvents.map((event) => event.payload));
  assert.doesNotMatch(serialized, /login_command/);
  assert.doesNotMatch(serialized, /access_token/);
});

test("call plan success does not emit CLI call telemetry", async () => {
  const cacheRoot = makeTempRoot("calle-cli-telemetry-call-plan");
  const serverUrl = "https://mcp.example/mcp/openagent_oauth";
  writeToken(cacheRoot, serverUrl);
  const telemetryEvents = [];
  const fetchImpl = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ jsonrpc: "2.0", id: payload.id, result: {} });
    }
    if (payload.method === "notifications/initialized") {
      return jsonRpcResponse({});
    }
    if (payload.method === "tools/call") {
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
      "--goal",
      "Confirm appointment",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    {
      env: { CALLE_TELEMETRY: "1" },
      fetchImpl,
      telemetryFetchImpl: captureTelemetry(telemetryEvents),
    }
  );

  assert.equal(result.code, 0);
  assert.deepEqual(telemetryEvents, []);
});

test("call plan local validation errors emit cli_local_error without call details", async () => {
  const cacheRoot = makeTempRoot("calle-cli-telemetry-call-plan-error");
  const telemetryEvents = [];

  const result = await run(
    [
      "call",
      "plan",
      "--to-phone",
      "+15551234567",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
    ],
    {
      env: { CALLE_TELEMETRY: "1" },
      telemetryFetchImpl: captureTelemetry(telemetryEvents),
    }
  );

  assert.equal(result.code, 2);
  assert.deepEqual(telemetryEvents.map((event) => event.payload.event), ["cli_local_error"]);
  assert.equal(telemetryEvents[0].payload.properties.error_code, "invalid_arguments");
  const serialized = JSON.stringify(telemetryEvents.map((event) => event.payload));
  assert.doesNotMatch(serialized, /\+15551234567/);
  assert.doesNotMatch(serialized, /to_phones/);
});

test("telemetry opt-out flags and failures do not affect command output", async () => {
  const cacheRoot = makeTempRoot("calle-cli-telemetry-opt-out");
  const telemetryEvents = [];

  let result = await run(
    [
      "auth",
      "status",
      "--base-url",
      "https://mcp.example",
      "--cache-root",
      cacheRoot,
      "--no-telemetry",
    ],
    {
      env: { CALLE_TELEMETRY: "1" },
      telemetryFetchImpl: captureTelemetry(telemetryEvents),
    }
  );
  assert.equal(result.code, 0);
  assert.deepEqual(telemetryEvents, []);

  result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    env: { CALLE_TELEMETRY: "0" },
    telemetryFetchImpl: captureTelemetry(telemetryEvents),
  });
  assert.equal(result.code, 0);
  assert.deepEqual(telemetryEvents, []);

  result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    env: { CALLE_TELEMETRY: "1", DO_NOT_TRACK: "1" },
    telemetryFetchImpl: captureTelemetry(telemetryEvents),
  });
  assert.equal(result.code, 0);
  assert.deepEqual(telemetryEvents, []);

  result = await run(["auth", "status", "--base-url", "https://mcp.example", "--cache-root", cacheRoot], {
    env: { CALLE_TELEMETRY: "1" },
    telemetryFetchImpl: async () => {
      throw new Error("telemetry unavailable");
    },
  });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).usable, false);
});

test("resolveRuntimeConfig rejects durations that are not plain numbers", () => {
  // "30s" and "1m" are how people write durations, and Number() turns both into
  // NaN. Previously that NaN reached mcp-client's timeout arithmetic, where
  // Math.max(NaN, 1000) stays NaN and setTimeout substitutes 1ms, so every MCP
  // call aborted before it left. Fail at the edge instead, with the flag named.
  for (const bad of ["30s", "1m", "abc", "-5", "0"]) {
    assert.throws(
      () => resolveRuntimeConfig({ timeoutSeconds: bad }),
      /--timeout-seconds expects a positive number of seconds/,
      `expected "${bad}" to be rejected`,
    );
  }

  assert.throws(
    () => resolveRuntimeConfig({ pollTimeoutSeconds: "5m" }),
    /--poll-timeout-seconds expects a positive number of seconds/,
  );
  assert.throws(
    () => resolveRuntimeConfig({ minTtlSeconds: "60s" }),
    /--min-ttl-seconds expects a non-negative number of seconds/,
  );
  assert.throws(
    () => resolveRuntimeConfig({ telemetryTimeoutSeconds: "1.5s" }, {}),
    /--telemetry-timeout-seconds expects a positive number of seconds/,
  );
});

test("resolveRuntimeConfig keeps --min-ttl-seconds 0 working", () => {
  // Zero disables the minimum remaining-lifetime window, which is a documented
  // way to use the flag. The duration validator is strictly positive, so sharing
  // it across every setting would have taken that away.
  assert.equal(resolveRuntimeConfig({ minTtlSeconds: "0" }).minTtlSeconds, 0);
  assert.equal(resolveRuntimeConfig({ minTtlSeconds: 0 }).minTtlSeconds, 0);

  // Still not a free pass: a negative minimum is meaningless.
  assert.throws(
    () => resolveRuntimeConfig({ minTtlSeconds: "-1" }),
    /--min-ttl-seconds expects a non-negative number of seconds/,
  );

  // And zero stays rejected where it would mean "abort immediately".
  assert.throws(
    () => resolveRuntimeConfig({ timeoutSeconds: "0" }),
    /--timeout-seconds expects a positive number of seconds/,
  );
});

test("resolveRuntimeConfig rejects timer values Node would collapse to 1ms", () => {
  // setTimeout stores its delay in a signed 32-bit int. Anything over
  // 2,147,483,647ms is silently replaced by 1ms, so a very large --timeout-seconds
  // recreated the same immediate-abort bug the validator was added to stop.
  const maxSeconds = Math.floor(2_147_483_647 / 1000); // 2147483

  assert.equal(resolveRuntimeConfig({ timeoutSeconds: String(maxSeconds) }).timeoutSeconds, maxSeconds);

  for (const flag of ["timeoutSeconds", "pollTimeoutSeconds"]) {
    assert.throws(
      () => resolveRuntimeConfig({ [flag]: String(maxSeconds + 1) }),
      /expects at most 2147483 seconds/,
      `expected ${flag} to reject ${maxSeconds + 1}`,
    );
  }

  assert.throws(
    () => resolveRuntimeConfig({ telemetryTimeoutSeconds: String(maxSeconds + 1) }, {}),
    /expects at most 2147483 seconds/,
  );

  // --min-ttl-seconds never reaches setTimeout, so it is not bounded by it.
  assert.equal(
    resolveRuntimeConfig({ minTtlSeconds: String(maxSeconds + 1) }).minTtlSeconds,
    maxSeconds + 1,
  );
});

test("resolveRuntimeConfig keeps accepting valid values and defaults", () => {
  const explicit = resolveRuntimeConfig({ timeoutSeconds: "30" });
  assert.equal(explicit.timeoutSeconds, 30);

  const defaults = resolveRuntimeConfig({}, {});
  assert.equal(Number.isFinite(defaults.timeoutSeconds), true);
  assert.equal(Number.isFinite(defaults.pollTimeoutSeconds), true);
  assert.equal(Number.isFinite(defaults.minTtlSeconds), true);
  assert.equal(Number.isFinite(defaults.telemetryTimeoutSeconds), true);

  // Falsy values still fall back to the default, as before.
  assert.equal(resolveRuntimeConfig({ timeoutSeconds: "" }).timeoutSeconds, defaults.timeoutSeconds);
  assert.equal(
    resolveRuntimeConfig({ timeoutSeconds: undefined }).timeoutSeconds,
    defaults.timeoutSeconds,
  );
});
