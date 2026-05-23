import http from "node:http";
import { pathToFileURL } from "node:url";

const ACCESS_TOKEN = "fake-access-token";
const REFRESH_TOKEN = "fake-refresh-token";
const SESSION_SECRET = "fake-session-secret";
const MCP_SESSION_ID = "fake-mcp-session";
const BROKER_SESSION_ID = "fake-broker-session";
const EXPIRES_AT = "2030-01-01T00:00:00Z";
const PROTOCOL_VERSION = "2025-11-25";

function jsonResponse(res, payload, { status = 200, headers = {} } = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function textResponse(res, text, { status = 200, headers = {} } = {}) {
  res.writeHead(status, {
    "content-type": "text/plain",
    "content-length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
}

async function readJson(req) {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

function readForm(body) {
  return Object.fromEntries(new URLSearchParams(body));
}

function redactMcpRequest(req, payload, expectedToken) {
  const authorization = req.headers.authorization || "";
  return {
    method: payload.method || null,
    has_bearer_token: authorization === `Bearer ${expectedToken}`,
    protocol_version: req.headers["mcp-protocol-version"] || req.headers["mcp-protocol-version".toLowerCase()] || null,
    session_id: req.headers["mcp-session-id"] || null,
  };
}

function unauthorized(res, baseUrl, scope = "openid email profile") {
  jsonResponse(
    res,
    {
      error: "unauthorized",
    },
    {
      status: 401,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp/openagent_oauth", scope="${scope}"`,
      },
    }
  );
}

function normalizeOptions(options = {}) {
  return {
    noResources: Boolean(options.noResources),
    unauthorizedMcp: Boolean(options.unauthorizedMcp),
    brokerPendingFirst: Boolean(options.brokerPendingFirst),
  };
}

export async function startFakeServer(options = {}) {
  const opts = normalizeOptions(options);
  let baseUrl = "";
  let brokerStatusCount = 0;
  const state = {
    broker_creates: [],
    broker_status_count: 0,
    broker_exchange_count: 0,
    oauth_registers: [],
    oauth_authorizes: [],
    oauth_tokens: [],
    mcp_requests: [],
    tool_calls: [],
    get_call_run_counts: {},
    resource_reads: [],
    failures: [],
  };

  function resetState() {
    brokerStatusCount = 0;
    state.broker_creates = [];
    state.broker_status_count = 0;
    state.broker_exchange_count = 0;
    state.oauth_registers = [];
    state.oauth_authorizes = [];
    state.oauth_tokens = [];
    state.mcp_requests = [];
    state.tool_calls = [];
    state.get_call_run_counts = {};
    state.resource_reads = [];
    state.failures = [];
  }

  function serverUrl() {
    return `${baseUrl}/mcp/openagent_oauth`;
  }

  function resources() {
    if (opts.noResources) {
      return [];
    }
    return [
      {
        uri: `${baseUrl}/resources/example`,
        name: "Example resource",
        mimeType: "text/plain",
      },
    ];
  }

  async function handleMcp(req, res) {
    if (req.method === "DELETE") {
      res.writeHead(405);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      textResponse(res, "method not allowed", { status: 405 });
      return;
    }

    const payload = await readJson(req);
    state.mcp_requests.push(redactMcpRequest(req, payload, ACCESS_TOKEN));

    if (opts.unauthorizedMcp || req.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
      unauthorized(res, baseUrl);
      return;
    }

    if (payload.method === "initialize") {
      jsonResponse(
        res,
        {
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            protocolVersion: payload.params?.protocolVersion || PROTOCOL_VERSION,
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "fake-calle-mcp",
              version: "0.0.0",
            },
          },
        },
        {
          headers: {
            "mcp-session-id": MCP_SESSION_ID,
          },
        }
      );
      return;
    }

    if (payload.method === "notifications/initialized") {
      res.writeHead(202);
      res.end();
      return;
    }

    if (req.headers["mcp-session-id"] !== MCP_SESSION_ID) {
      jsonResponse(
        res,
        {
          jsonrpc: "2.0",
          id: payload.id,
          error: {
            code: -32000,
            message: "missing MCP session id",
          },
        },
        { status: 400 }
      );
      return;
    }

    if (payload.method === "tools/list") {
      jsonResponse(res, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          tools: [
            {
              name: "plan_call",
              description: "Plan a CALL-E phone call from natural-language user input.",
              inputSchema: {
                type: "object",
                properties: {
                  user_input: {
                    type: "string",
                  },
                },
                required: ["user_input"],
              },
            },
            {
              name: "run_call",
              description: "Run a planned CALL-E phone call.",
              inputSchema: {
                type: "object",
                properties: {
                  plan_id: {
                    type: "string",
                  },
                  confirm_token: {
                    type: "string",
                  },
                },
                required: ["plan_id", "confirm_token"],
              },
            },
            {
              name: "get_call_run",
              description: "Get CALL-E phone call run status.",
              inputSchema: {
                type: "object",
                properties: {
                  run_id: {
                    type: "string",
                  },
                },
                required: ["run_id"],
              },
            },
            {
              name: "echo",
              description: "Echo the provided arguments.",
              inputSchema: {
                type: "object",
              },
            },
          ],
        },
      });
      return;
    }

    if (payload.method === "tools/call") {
      const toolName = payload.params?.name || null;
      const toolArgs = payload.params?.arguments || {};
      state.tool_calls.push({
        name: toolName,
        arguments: toolArgs,
        request_meta: payload.params?._meta || null,
      });
      if (toolName === "plan_call") {
        const readyToRun =
          typeof toolArgs.user_input === "string" && toolArgs.user_input.includes("ready_to_run");
        jsonResponse(res, {
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: "Plan created by fake server. No call was started.",
              },
            ],
            structuredContent: {
              plan_id: "fake-plan-1",
              confirm_token: readyToRun ? "fake-confirm-token" : undefined,
              ready_to_run: readyToRun,
              arguments: toolArgs,
            },
          },
        });
        return;
      }
      if (toolName === "run_call") {
        jsonResponse(res, {
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: "Fake call run started.",
              },
            ],
            structuredContent: {
              run_id: "fake-run-1",
              status: "QUEUED",
              arguments: toolArgs,
            },
          },
        });
        return;
      }
      if (toolName === "get_call_run") {
        const runId = String(toolArgs.run_id || "fake-run-1");
        const count = (state.get_call_run_counts[runId] || 0) + 1;
        state.get_call_run_counts[runId] = count;
        const status = count >= 2 ? "COMPLETED" : "IN_PROGRESS";
        const completed = count >= 2;
        jsonResponse(res, {
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: `Fake call run status: ${status}.`,
              },
            ],
            structuredContent: {
              run_id: runId,
              status,
              duration_seconds: completed ? 12.34 : undefined,
              post_summary: completed ? "Fake call completed successfully." : undefined,
              transcript: completed
                ? "[00:00:00] BOT: Hello from CALL-E. [00:00:04] USER: Received. Goodbye."
                : undefined,
              activity: [
                {
                  message: completed ? "Fake call completed." : "Fake call is in progress.",
                  ts: new Date().toISOString(),
                },
              ],
            },
          },
        });
        return;
      }
      jsonResponse(res, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          content: [
            {
              type: "text",
              text: `echo:${JSON.stringify(toolArgs)}`,
            },
          ],
          structuredContent: {
            name: toolName,
            arguments: toolArgs,
          },
        },
      });
      return;
    }

    if (payload.method === "resources/list") {
      jsonResponse(res, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          resources: resources(),
        },
      });
      return;
    }

    if (payload.method === "resources/read") {
      const uri = String(payload.params?.uri || "");
      state.resource_reads.push({ uri });
      jsonResponse(res, {
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: "fake resource body",
            },
          ],
        },
      });
      return;
    }

    jsonResponse(res, {
      jsonrpc: "2.0",
      id: payload.id,
      error: {
        code: -32601,
        message: `Unknown method: ${payload.method}`,
      },
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = requestUrl.pathname;

      if (req.method === "GET" && pathname === "/healthz") {
        jsonResponse(res, { ok: true });
        return;
      }

      if (req.method === "GET" && pathname === "/__state") {
        jsonResponse(res, {
          ...state,
          server_url: serverUrl(),
        });
        return;
      }

      if (req.method === "POST" && pathname === "/__reset") {
        resetState();
        jsonResponse(res, { ok: true });
        return;
      }

      if (req.method === "POST" && pathname === "/api/v1/openagent-auth/sessions") {
        const body = await readJson(req);
        state.broker_creates.push({
          server_url: body.server_url,
          auth_base_url: body.auth_base_url,
          channel: body.channel,
          scope: body.scope,
          client_name: body.client_name,
          has_integration_header: Boolean(req.headers["x-call-e-integration"]),
        });
        jsonResponse(
          res,
          {
            session_id: BROKER_SESSION_ID,
            session_secret: SESSION_SECRET,
            login_url: `${baseUrl}/openagent-auth/sessions/${BROKER_SESSION_ID}/start`,
            status: "PENDING",
            poll_after_ms: 1,
            expires_at: EXPIRES_AT,
          },
          { status: 201 }
        );
        return;
      }

      if (req.method === "GET" && pathname === `/api/v1/openagent-auth/sessions/${BROKER_SESSION_ID}`) {
        state.broker_status_count += 1;
        brokerStatusCount += 1;
        if (req.headers["x-openagent-session-secret"] !== SESSION_SECRET) {
          jsonResponse(res, { error: "invalid session secret" }, { status: 403 });
          return;
        }
        const status = opts.brokerPendingFirst && brokerStatusCount === 1 ? "PENDING" : "AUTHORIZED";
        jsonResponse(res, {
          status,
          poll_after_ms: 1,
          expires_at: EXPIRES_AT,
        });
        return;
      }

      if (req.method === "POST" && pathname === `/api/v1/openagent-auth/sessions/${BROKER_SESSION_ID}/exchange`) {
        state.broker_exchange_count += 1;
        if (req.headers["x-openagent-session-secret"] !== SESSION_SECRET) {
          jsonResponse(res, { error: "invalid session secret" }, { status: 403 });
          return;
        }
        jsonResponse(res, {
          token: {
            access_token: ACCESS_TOKEN,
            refresh_token: REFRESH_TOKEN,
          },
          expires_at: EXPIRES_AT,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/.well-known/oauth-protected-resource/mcp/openagent_oauth") {
        jsonResponse(res, {
          resource: serverUrl(),
          authorization_servers: [baseUrl],
          scopes_supported: ["openid", "email", "profile"],
        });
        return;
      }

      if (req.method === "GET" && pathname === "/.well-known/oauth-protected-resource") {
        jsonResponse(res, {
          resource: serverUrl(),
          authorization_servers: [baseUrl],
          scopes_supported: ["openid", "email", "profile"],
        });
        return;
      }

      if (req.method === "GET" && pathname === "/.well-known/oauth-authorization-server") {
        jsonResponse(res, {
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          registration_endpoint: `${baseUrl}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
        });
        return;
      }

      if (req.method === "POST" && pathname === "/register") {
        const body = await readJson(req);
        state.oauth_registers.push({
          redirect_uris: body.redirect_uris,
          scope: body.scope,
          client_name: body.client_name,
        });
        jsonResponse(
          res,
          {
            ...body,
            client_id: "fake-client-id",
            token_endpoint_auth_method: body.token_endpoint_auth_method || "none",
          },
          { status: 201 }
        );
        return;
      }

      if (req.method === "GET" && pathname === "/authorize") {
        const redirectUri = requestUrl.searchParams.get("redirect_uri");
        if (!redirectUri) {
          textResponse(res, "missing redirect_uri", { status: 400 });
          return;
        }
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set("code", "fake-auth-code");
        const stateParam = requestUrl.searchParams.get("state");
        if (stateParam) {
          callbackUrl.searchParams.set("state", stateParam);
        }
        state.oauth_authorizes.push({
          client_id: requestUrl.searchParams.get("client_id"),
          scope: requestUrl.searchParams.get("scope"),
          has_code_challenge: Boolean(requestUrl.searchParams.get("code_challenge")),
          redirect_uri: redirectUri,
        });
        res.writeHead(302, { location: callbackUrl.toString() });
        res.end();
        return;
      }

      if (req.method === "POST" && pathname === "/token") {
        const form = readForm(await readBody(req));
        state.oauth_tokens.push({
          grant_type: form.grant_type,
          client_id: form.client_id || null,
          has_code: Boolean(form.code),
          has_code_verifier: Boolean(form.code_verifier),
        });
        jsonResponse(res, {
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
          token_type: "Bearer",
          expires_in: 3600,
          scope: form.scope || "openid email profile",
        });
        return;
      }

      if (pathname === "/mcp/openagent_oauth") {
        await handleMcp(req, res);
        return;
      }

      jsonResponse(res, { error: `Unexpected route: ${req.method} ${pathname}` }, { status: 404 });
    } catch (error) {
      state.failures.push(error?.stack || String(error));
      jsonResponse(res, { error: error?.message || String(error) }, { status: 500 });
    }
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    serverUrl: serverUrl(),
    stateUrl: `${baseUrl}/__state`,
    resetUrl: `${baseUrl}/__reset`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function runCli() {
  const fake = await startFakeServer({
    noResources: process.env.FAKE_NO_RESOURCES === "1",
    unauthorizedMcp: process.env.FAKE_UNAUTHORIZED_MCP === "1",
    brokerPendingFirst: process.env.FAKE_BROKER_PENDING_FIRST === "1",
  });
  process.stdout.write(
    `${JSON.stringify({
      base_url: fake.baseUrl,
      server_url: fake.serverUrl,
      state_url: fake.stateUrl,
      reset_url: fake.resetUrl,
    })}\n`
  );
  const close = async () => {
    await fake.close();
    process.exit(0);
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
