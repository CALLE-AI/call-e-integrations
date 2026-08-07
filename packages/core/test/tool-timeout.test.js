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
// tests can read it without waiting for a real timer. The one case that does wait
// is the overflow test at the bottom, because a collapsed delay is a wall clock
// fact rather than a string.

const SERVER_URL = "https://example.test/mcp/openagent_oauth";

// Node keeps a timer delay in a signed 32 bit int, so this is the last whole second
// that can arm one. Computed here rather than imported so the test pins the number
// the transport is supposed to use.
const MAX_TIMEOUT_SECONDS = Math.floor(2_147_483_647 / 1000); // 2147483

function label(value) {
  return typeof value === "string" ? `"${value}"` : String(value);
}

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

// Answers the handshake, then leaves tools/call open, so the only thing that ends the
// request is the transport's own timer. A ref'd interval stands in for the socket a
// real fetch would be holding, because the transport unrefs its timer.
function fetchHangingOnToolCall() {
  return async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (payload.method === "initialize") {
      return jsonRpcResponse({ result: {} }, { headers: { "mcp-session-id": "sess-1" } });
    }
    if (payload.method !== "tools/call") {
      return jsonRpcResponse({ result: {} });
    }
    return new Promise((_resolve, reject) => {
      const keepAlive = setInterval(() => {}, 25);
      init.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });
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
  // setTimeout collapses a delay it cannot store into 1ms, so an unreadable override
  // must never reach the timer: "120s" parses to NaN, Infinity and anything past
  // MAX_TIMEOUT_SECONDS overflow the 32 bit delay. A negative value used to clamp to
  // the one second floor instead of falling back. Zero is not a ceiling either.
  const config = mcpConfig();
  const unusable = [
    "120s",
    "",
    NaN,
    Infinity,
    -Infinity,
    -1,
    -120,
    0,
    MAX_TIMEOUT_SECONDS + 1,
    Number.MAX_SAFE_INTEGER,
    null,
    undefined,
    {},
  ];

  for (const bad of unusable) {
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
      `timeoutSeconds ${label(bad)} must fall back to the shared ceiling`,
    );
  }
});

test("a readable per-call timeout is used as given, up to the timer maximum", async () => {
  // The other half of the validator: the bound is inclusive and a usable value is not
  // swallowed. The one second floor is the transport's, so a sub-second override still
  // leaves the request a whole second.
  const config = mcpConfig();
  const usable = [
    [MAX_TIMEOUT_SECONDS, `${MAX_TIMEOUT_SECONDS}s`],
    [120, "120s"],
    ["45", "45s"],
    [0.25, "1s"],
  ];

  for (const [seconds, expected] of usable) {
    assert.equal(
      await timeoutMessage(() =>
        callMcpTool({
          config,
          toolName: "plan_call",
          timeoutSeconds: seconds,
          fetchImpl: fetchAbortingOn("tools/call"),
        }),
      ),
      `MCP request timed out for tools/call after ${expected}`,
      `timeoutSeconds ${label(seconds)} must arm the timer as given`,
    );
  }
});

test("an overflowing per-call timeout waits the shared ceiling instead of aborting at once", async () => {
  // The message alone cannot show this half of the defect. Each of these armed a 1ms
  // delay (the one second floor for the negative), so the request aborted long before
  // the ceiling it reported. A shared ceiling of 1.5 seconds tells the three outcomes
  // apart, which is why this is the one test that waits for a real timer.
  const config = { ...mcpConfig(), timeoutSeconds: 1.5 };
  const measured = await Promise.all(
    ["120s", -1, Infinity, MAX_TIMEOUT_SECONDS + 1].map(async (bad) => {
      const startedAt = process.hrtime.bigint();
      const message = await timeoutMessage(() =>
        callMcpTool({
          config,
          toolName: "plan_call",
          timeoutSeconds: bad,
          fetchImpl: fetchHangingOnToolCall(),
        }),
      );
      return { bad, message, elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6 };
    }),
  );

  for (const { bad, message, elapsedMs } of measured) {
    assert.equal(
      message,
      "MCP request timed out for tools/call after 1.5s",
      `timeoutSeconds ${label(bad)} must report the shared ceiling`,
    );
    assert.ok(
      elapsedMs > 1200,
      `timeoutSeconds ${label(bad)} aborted after ${elapsedMs.toFixed(0)}ms, so it did not wait the 1500ms shared ceiling`,
    );
  }
});
