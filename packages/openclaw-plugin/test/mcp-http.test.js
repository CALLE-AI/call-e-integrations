import test from "node:test";
import assert from "node:assert/strict";

import { callRemoteTool, McpHttpError, isUnauthorizedMcpError } from "../lib/mcp-http.js";

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

test("callRemoteTool performs initialize, initialized notification, and tools/call", async () => {
  const seen = [];
  const result = await callRemoteTool({
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      seen.push({ url, headers: init.headers, body });
      if (body.method === "initialize") {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              serverInfo: { name: "remote" },
            },
          },
          { headers: { "mcp-session-id": "sess-1" } }
        );
      }
      if (body.method === "notifications/initialized") {
        return jsonResponse({});
      }
      if (body.method === "tools/call") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "ok" }],
            structured_content: { value: 1 },
            is_error: false,
          },
        });
      }
      throw new Error(`unexpected method ${body.method}`);
    },
    serverUrl: "https://example.com/mcp/openagent_auth",
    accessToken: "token-1",
    toolName: "plan_call",
    arguments: { user_input: "hello" },
  });

  assert.equal(seen.length, 3);
  assert.equal(seen[0].body.method, "initialize");
  assert.equal(seen[1].body.method, "notifications/initialized");
  assert.equal(seen[2].body.method, "tools/call");
  assert.equal(seen[2].headers["mcp-session-id"], "sess-1");
  assert.equal(result.content[0].text, "ok");
  assert.deepEqual(result.structuredContent, { value: 1 });
  assert.equal(result.isError, false);
});

test("callRemoteTool surfaces unauthorized HTTP responses", async () => {
  await assert.rejects(
    () =>
      callRemoteTool({
        fetchImpl: async () => jsonResponse({ error: "unauthorized" }, { status: 401 }),
        serverUrl: "https://example.com/mcp/openagent_auth",
        accessToken: "bad-token",
        toolName: "plan_call",
      }),
    (error) => {
      assert.equal(error instanceof McpHttpError, true);
      assert.equal(isUnauthorizedMcpError(error), true);
      return true;
    }
  );
});
