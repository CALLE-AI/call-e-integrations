import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  BrokeredTokenManager,
} from "./lib/brokered-auth.js";
import { callRemoteTool, isUnauthorizedMcpError } from "./lib/mcp-http.js";
import { getPluginConfig } from "./lib/plugin-config.js";

const PLUGIN_VERSION = "0.2.1";
const MANAGER_CACHE = new Map();

const PLAN_CALL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    goal: { type: "string" },
    language: { type: "string" },
    plan_id: { type: "string" },
    region: { type: "string" },
    to_phones: {
      type: "array",
      items: { type: "string" },
    },
    user_input: { type: "string" },
  },
};

const RUN_CALL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    confirm_token: { type: "string" },
    plan_id: { type: "string" },
  },
  required: ["confirm_token", "plan_id"],
};

const GET_CALL_RUN_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    cursor: { type: "string" },
    limit: { type: "integer" },
    run_id: { type: "string" },
  },
  required: ["run_id"],
};

function errorResult(text, structuredContent = null) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: true,
  };
}

function getManager(config) {
  const key = JSON.stringify({
    brokerBaseUrl: config.brokerBaseUrl,
    serverUrl: config.serverUrl,
    authBaseUrl: config.authBaseUrl,
    cacheRoot: config.cacheRoot,
    channel: config.channel,
    scope: config.scope,
    clientName: config.clientName,
    timeoutSeconds: config.timeoutSeconds,
    minTtlSeconds: config.minTtlSeconds,
  });
  let manager = MANAGER_CACHE.get(key);
  if (!manager) {
    manager = new BrokeredTokenManager({
      ...config,
      fetchImpl: globalThis.fetch,
    });
    MANAGER_CACHE.set(key, manager);
  }
  return manager;
}

async function executeTool(api, toolName, parameters) {
  let config;
  try {
    config = getPluginConfig(api);
  } catch (error) {
    return errorResult(String(error));
  }

  const manager = getManager(config);
  let tokenDocument = manager.currentTokenDocument();
  if (!tokenDocument) {
    await manager.reconcilePendingLogin();
    tokenDocument = manager.currentTokenDocument();
  }

  if (!tokenDocument) {
    try {
      const pending = await manager.startLoginIfNeeded();
      return errorResult(
        `Authentication is required before calling \`${toolName}\`.\nOpen this link in your browser to continue:\n${pending.login_url}\nCurrent login status: ${pending.status}.\nAfter login completes, retry the same tool call.`,
        {
          auth_required: true,
          tool_name: toolName,
          login_url: pending.login_url,
          status: pending.status,
          expires_at: pending.expires_at,
          server_url: config.serverUrl,
          ...(pending.error_message ? { error_message: pending.error_message } : {}),
        }
      );
    } catch (error) {
      const pending = manager.pendingLogin();
      if (pending) {
        return errorResult(
          `Authentication is required before calling \`${toolName}\`.\nOpen this link in your browser to continue:\n${pending.login_url}\nCurrent login status: ${pending.status}.\nAfter login completes, retry the same tool call.`,
          {
            auth_required: true,
            tool_name: toolName,
            login_url: pending.login_url,
            status: pending.status,
            expires_at: pending.expires_at,
            server_url: config.serverUrl,
            ...(pending.error_message ? { error_message: pending.error_message } : {}),
          }
        );
      }
      return errorResult(String(error));
    }
  }

  try {
    return await callRemoteTool({
      serverUrl: config.serverUrl,
      accessToken: tokenDocument.token.access_token,
      toolName,
      arguments: parameters ?? {},
      timeoutSeconds: config.timeoutSeconds,
      pluginName: "calle",
      pluginVersion: PLUGIN_VERSION,
    });
  } catch (error) {
    if (isUnauthorizedMcpError(error)) {
      manager.invalidateCache();
      const pending = await manager.startLoginIfNeeded();
      return errorResult(
        `Authentication is required before calling \`${toolName}\`.\nOpen this link in your browser to continue:\n${pending.login_url}\nCurrent login status: ${pending.status}.\nAfter login completes, retry the same tool call.`,
        {
          auth_required: true,
          tool_name: toolName,
          login_url: pending.login_url,
          status: pending.status,
          expires_at: pending.expires_at,
          server_url: config.serverUrl,
          ...(pending.error_message ? { error_message: pending.error_message } : {}),
        }
      );
    }
    return errorResult(String(error));
  }
}

export default definePluginEntry({
  id: "calle",
  name: "calle",
  description: "Brokered web-login tools for calling the OpenAgent MCP from OpenClaw chat.",
  register(api) {
    api.registerTool({
      name: "calle_plan_call",
      description: "Plan a phone call via OpenAgent. If login is required, this returns a browser URL instead of executing immediately.",
      parameters: PLAN_CALL_PARAMETERS,
      async execute(_id, params) {
        return executeTool(api, "plan_call", params);
      },
    });

    api.registerTool({
      name: "calle_run_call",
      description: "Run a previously confirmed phone call via OpenAgent.",
      parameters: RUN_CALL_PARAMETERS,
      async execute(_id, params) {
        return executeTool(api, "run_call", params);
      },
    });

    api.registerTool({
      name: "calle_get_call_run",
      description: "Query the status of a previously started phone call via OpenAgent.",
      parameters: GET_CALL_RUN_PARAMETERS,
      async execute(_id, params) {
        return executeTool(api, "get_call_run", params);
      },
    });
  },
});
