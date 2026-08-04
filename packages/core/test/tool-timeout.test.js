import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { tokenCachePath, writePrivateJson } from "@call-e/core/cache";
import { McpHttpError, callMcpTool, listMcpTools } from "@call-e/core/mcp-client";

// Every request in an MCP session shared one ceiling, so the only way to give a
// slow tool the time it needs was to give an unresponsive handshake the same time.
// callMcpTool now takes a per-call timeout that covers the tools/call request only.
//
// The transport builds the timeout message from the same value it arms the
// AbortController with, so the reported ceiling is the effective one and these
// tests can read it without waiting for a real timer.

const SERVER_URL = "https://example.test/mcp/openagent_oauth";

function mcpConfig() {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "calle-core-tool-timeout-"));
  writePrivateJson(tokenCachePath(cacheRoot, SERVER_URL), {
    token: { access_token: "token-123" },
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  return {
    cacheRoot,
    serverUrl: SERVER_URL,
    minTtlSeconds: 300,
    timeoutSeconds: 15,
  };
}

function jsonRpcResponse(body, { headers = {} } = {}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(headers),
    async text() {
      return JSON.stringify(body);
    },
  };
}

// Fails the named JSON-RPC method the way fetch does when its signal aborts.
function fetchAbortingOn(method) {
  return async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === method) {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      throw abortError;
    }
    if (payload.method === "initialize") {
      return jsonRpcResponse({ result: {} }, { headers: { "mcp-session-id": "sess-1" } });
    }
    return jsonRpcResponse({ result: {} });
  };
}

async function timeoutMessage(request) {
  try {
    await request();
  } catch (error) {
    assert.ok(error instanceof McpHttpError, `expected McpHttpError, got ${error}`);
    assert.equal(error.code, "http_error");
    return error.message;
  }
  assert.fail("expected the request to time out");
}

test("a tool call can carry a longer ceiling than the session handshake", async () => {
  const config = mcpConfig();

  assert.equal(
    await timeoutMessage(() =>
      callMcpTool({
        config,
        toolName: "plan_call",
        timeoutSeconds: 120,
        fetchImpl: fetchAbortingOn("tools/call"),
      }),
    ),
    "MCP request timed out for tools/call after 120s",
  );

  // The handshake is deliberately left out of the override, so a server that never
  // answers initialize still fails at the shared ceiling rather than two minutes on.
  assert.equal(
    await timeoutMessage(() =>
      callMcpTool({
        config,
        toolName: "plan_call",
        timeoutSeconds: 120,
        fetchImpl: fetchAbortingOn("initialize"),
      }),
    ),
    "MCP request timed out for initialize after 15s",
  );
});

test("a tool call without an override keeps the shared ceiling", async () => {
  const config = mcpConfig();

  assert.equal(
    await timeoutMessage(() =>
      callMcpTool({
        config,
        toolName: "get_call_run",
        fetchImpl: fetchAbortingOn("tools/call"),
      }),
    ),
    "MCP request timed out for tools/call after 15s",
  );

  assert.equal(
    await timeoutMessage(() => listMcpTools({ config, fetchImpl: fetchAbortingOn("tools/list") })),
    "MCP request timed out for tools/list after 15s",
  );
});

test("an unusable per-call timeout falls back to the shared ceiling", async () => {
  // setTimeout(fn, NaN) fires after 1ms, so a junk override must not reach the
  // timer. Zero would mean abort immediately, which is not a ceiling either.
  const config = mcpConfig();

  for (const bad of [Number("120s"), 0, null, undefined]) {
    assert.equal(
      await timeoutMessage(() =>
        callMcpTool({
          config,
          toolName: "plan_call",
          timeoutSeconds: bad,
          fetchImpl: fetchAbortingOn("tools/call"),
        }),
      ),
      "MCP request timed out for tools/call after 15s",
      `timeoutSeconds ${String(bad)} must fall back`,
    );
  }
});
