import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_BASE_URL, getPluginConfig } from "../lib/plugin-config.js";

test("getPluginConfig falls back to the default base URL when plugin config is empty", () => {
  const config = getPluginConfig({ pluginConfig: {} });

  assert.equal(config.baseUrl, DEFAULT_BASE_URL);
  assert.equal(config.brokerBaseUrl, DEFAULT_BASE_URL);
  assert.equal(config.authBaseUrl, DEFAULT_BASE_URL);
  assert.equal(config.serverUrl, `${DEFAULT_BASE_URL}/mcp/openagent_auth`);
  assert.equal(config.channel, "openagent_auth");
});
