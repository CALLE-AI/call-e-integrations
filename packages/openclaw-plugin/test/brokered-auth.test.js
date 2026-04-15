import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";

import {
  BrokeredTokenManager,
  DEFAULT_CACHE_ROOT,
  tokenCachePath,
  pendingCachePath,
} from "../lib/brokered-auth.js";

function makeTempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

test("startLoginIfNeeded persists and reuses a pending broker session", async () => {
  const tempRoot = makeTempRoot("seleven-plugin-auth");
  let createCalls = 0;
  const manager = new BrokeredTokenManager({
    baseUrl: "https://example.com",
    cacheRoot: tempRoot,
    fetchImpl: async (url, init) => {
      if (String(url).endsWith("/api/v1/openagent-auth/sessions") && init?.method === "POST") {
        createCalls += 1;
        return jsonResponse(
          {
            session_id: "session-1",
            session_secret: "secret-1",
            login_url: "https://example.com/openagent-auth/sessions/session-1/start",
            status: "PENDING",
            expires_at: "2030-01-01T00:00:00Z",
          },
          { status: 201 }
        );
      }
      throw new Error(`unexpected request: ${init?.method} ${url}`);
    },
  });

  const first = await manager.startLoginIfNeeded();
  const second = await manager.startLoginIfNeeded();

  assert.equal(createCalls, 1);
  assert.equal(first.session_id, "session-1");
  assert.equal(second.session_id, "session-1");
  assert.equal(
    pendingCachePath(tempRoot, "https://example.com/mcp/openagent_auth"),
    manager.pendingPath
  );
});

test("reconcilePendingLogin exchanges an authorized session into token.json", async () => {
  const tempRoot = makeTempRoot("seleven-plugin-auth");
  const manager = new BrokeredTokenManager({
    baseUrl: "https://example.com",
    cacheRoot: tempRoot,
    fetchImpl: async (url, init) => {
      if (String(url).includes("/api/v1/openagent-auth/sessions/session-1/exchange")) {
        return jsonResponse({
          token: { access_token: "token-1" },
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      if (String(url).includes("/api/v1/openagent-auth/sessions/session-1")) {
        return jsonResponse({
          session_id: "session-1",
          status: "AUTHORIZED",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      throw new Error(`unexpected request: ${init?.method} ${url}`);
    },
  });

  fs.mkdirSync(path.dirname(manager.pendingPath), { recursive: true });
  fs.writeFileSync(
    manager.pendingPath,
    JSON.stringify(
      {
        session_id: "session-1",
        session_secret: "secret-1",
        login_url: "https://example.com/openagent-auth/sessions/session-1/start",
        status: "PENDING",
        created_at: "2026-01-01T00:00:00Z",
        expires_at: "2030-01-01T00:00:00Z",
        error_message: null,
      },
      null,
      2
    )
  );

  const result = await manager.reconcilePendingLogin();
  assert.equal(result, null);

  const tokenPath = tokenCachePath(tempRoot, "https://example.com/mcp/openagent_auth");
  const tokenPayload = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  assert.equal(tokenPayload.token.access_token, "token-1");
  assert.equal(fs.existsSync(manager.pendingPath), false);
});

test("default cache root stays under the user home directory", () => {
  assert.match(DEFAULT_CACHE_ROOT, /\.calle-mcp[\/\\]openclaw-brokered-auth$/);
});
