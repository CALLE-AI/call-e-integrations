import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  BrokeredTokenManager,
} from "./lib/brokered-auth.js";
import { callRemoteTool, isUnauthorizedMcpError } from "./lib/mcp-http.js";
import { getPluginConfig } from "./lib/plugin-config.js";
import { OPENCLAW_CALL_PROGRESS_GUIDANCE } from "./lib/prompt-guidance.js";
import {
  extractReplyTextFromInstructionText,
  extractReplyTextFromToolResult,
  extractRunIdFromPollInstruction,
  extractTextFromContent,
  formatToolResultForDisplay,
} from "./lib/tool-result-text.js";

const PLUGIN_VERSION = "0.2.3";
const MANAGER_CACHE = new Map();
const LATEST_CALL_TOOL_STATE = new Map();

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

function authRequiredResult({ toolName, pending, serverUrl }) {
  return errorResult(
    `Hi, I'm CALL-E 👋\n\nI can help place calls, gather information, handle call-related tasks, and keep you updated with call status, summaries, and key takeaways.\n\nBefore I can continue, please complete authorization here:\n${pending.login_url}\n\nOnce you're done, come back to this chat and reply "OK" or "done".`,
    {
      auth_required: true,
      tool_name: toolName,
      login_url: pending.login_url,
      status: pending.status,
      expires_at: pending.expires_at,
      server_url: serverUrl,
      ...(pending.error_message ? { error_message: pending.error_message } : {}),
    }
  );
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
      return authRequiredResult({ toolName, pending, serverUrl: config.serverUrl });
    } catch (error) {
      const pending = manager.pendingLogin();
      if (pending) {
        return authRequiredResult({ toolName, pending, serverUrl: config.serverUrl });
      }
      return errorResult(String(error));
    }
  }

  try {
    const result = await callRemoteTool({
      serverUrl: config.serverUrl,
      accessToken: tokenDocument.token.access_token,
      toolName,
      arguments: parameters ?? {},
      timeoutSeconds: config.timeoutSeconds,
      pluginName: "calle",
      pluginVersion: PLUGIN_VERSION,
    });
    return formatToolResultForDisplay({ toolName, result });
  } catch (error) {
    if (isUnauthorizedMcpError(error)) {
      manager.invalidateCache();
      const pending = await manager.startLoginIfNeeded();
      return authRequiredResult({ toolName, pending, serverUrl: config.serverUrl });
    }
    return errorResult(String(error));
  }
}

function buildExactTemplateSystemMessage() {
  return {
    role: "system",
    content: OPENCLAW_CALL_PROGRESS_GUIDANCE,
  };
}

function normalizeCallToolName(toolName) {
  const raw = typeof toolName === "string" ? toolName : "";
  if (raw === "run_call" || raw === "calle_run_call") {
    return "run_call";
  }
  if (raw === "get_call_run" || raw === "calle_get_call_run") {
    return "get_call_run";
  }
  return "";
}

function getCallStateKey(ctx) {
  return ctx?.sessionKey || ctx?.sessionId || ctx?.agentId || "";
}

function storeLatestCallToolState(event, ctx) {
  const toolName = normalizeCallToolName(event?.toolName || event?.message?.toolName);
  const key = getCallStateKey(ctx);
  if (!toolName || !key) {
    return;
  }
  const text = extractTextFromContent(event?.message?.content);
  if (!text) {
    return;
  }
  LATEST_CALL_TOOL_STATE.set(key, {
    toolName,
    text,
    ts: Date.now(),
  });
}

function popLatestCallToolState(ctx) {
  const key = getCallStateKey(ctx);
  if (!key) {
    return null;
  }
  const state = LATEST_CALL_TOOL_STATE.get(key) || null;
  if (state) {
    LATEST_CALL_TOOL_STATE.delete(key);
  }
  return state;
}

function setLatestCallToolState(ctx, state) {
  const key = getCallStateKey(ctx);
  if (!key || !state) {
    return;
  }
  LATEST_CALL_TOOL_STATE.set(key, state);
}

function isFreshCallToolState(state) {
  return !!state && typeof state.ts === "number" && Date.now() - state.ts <= 30_000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollCallRunForReply(api, runId) {
  let lastReplyText = "";
  let lastRawText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const polled = await executeTool(api, "get_call_run", { run_id: runId });
    const rawText = extractTextFromContent(polled?.content);
    const replyText = extractReplyTextFromToolResult(polled);
    if (rawText) {
      lastRawText = rawText;
    }
    if (replyText) {
      lastReplyText = replyText;
      if (replyText.startsWith("[Status]")) {
        return { rawText, replyText };
      }
      if (replyText.includes("\n- ")) {
        return { rawText, replyText };
      }
    }
    if (attempt < 2) {
      await sleep(2000);
    }
  }
  return {
    rawText: lastRawText,
    replyText: lastReplyText || "Phone call is in progress! Progress:\n- Waiting for the next status update.",
  };
}

async function maybeOverrideCallReply(api, ctx) {
  const state = popLatestCallToolState(ctx);
  if (!isFreshCallToolState(state)) {
    return null;
  }

  if (state.toolName === "get_call_run") {
    const replyText = extractReplyTextFromInstructionText(state.text);
    if (replyText) {
      return replyText;
    }
    return null;
  }

  if (state.toolName === "run_call") {
    const runId = extractRunIdFromPollInstruction(state.text);
    if (!runId) {
      return "Phone call is in progress! Progress:\n- Waiting for the next status update.";
    }
    const polled = await pollCallRunForReply(api, runId);
    if (polled.rawText) {
      setLatestCallToolState(ctx, {
        toolName: "get_call_run",
        text: polled.rawText,
        ts: Date.now(),
      });
    }
    return polled.replyText;
  }

  return null;
}

function appendPromptGuidanceToMessages(event) {
  if (!event || !Array.isArray(event.messages)) {
    return undefined;
  }

  const hasGuidance = event.messages.some(
    (message) =>
      message &&
      message.role === "system" &&
      typeof message.content === "string" &&
      message.content.includes("CALL-E response formatting rules for OpenClaw chat:")
  );

  if (hasGuidance) {
    return undefined;
  }

  return {
    messages: [...event.messages, buildExactTemplateSystemMessage()],
  };
}

export default definePluginEntry({
  id: "calle",
  name: "calle",
  description: "Brokered web-login tools for calling the OpenAgent MCP from OpenClaw chat.",
  register(api) {
    if (typeof api.on === "function") {
      api.on(
        "before_prompt_build",
        async () => ({
          appendSystemContext: OPENCLAW_CALL_PROGRESS_GUIDANCE,
        }),
        { priority: 40 }
      );

      try {
        api.on(
          "transform_context",
          async (event) => appendPromptGuidanceToMessages(event),
          { priority: 40 }
        );
      } catch {
        // Older gateways may not support transform_context yet.
      }

      api.on("tool_result_persist", (event, ctx) => {
        storeLatestCallToolState(event, ctx);
      });

      api.on("before_agent_reply", async (_event, ctx) => {
        const replyText = await maybeOverrideCallReply(api, ctx);
        if (!replyText) {
          return undefined;
        }
        return {
          handled: true,
          reply: {
            text: replyText,
          },
          reason: "calle-template-override",
        };
      });
    }

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
      description:
        "Run a previously confirmed phone call via OpenAgent. After this returns a run_id, do not reply to the user yet. Immediately call calle_get_call_run with that run_id and use that follow-up result for the user-visible reply. Never paraphrase into prose like 'The call succeeded. Result: ...'. If the follow-up result is non-terminal, reply only as 'Phone call is in progress! Progress:' plus one '- HH:MM:SS message' bullet per activity item. If the follow-up result is terminal, reply only with these sections in this order and with these headings unchanged: [Status], [Call Summary], [Details], [Transcript]. Do not add any extra text before or after the template.",
      parameters: RUN_CALL_PARAMETERS,
      async execute(_id, params) {
        return executeTool(api, "run_call", params);
      },
    });

    api.registerTool({
      name: "calle_get_call_run",
      description:
        "Query the status and recent activity of a previously started phone call via OpenAgent. Use this result directly for the user-visible reply. Never paraphrase into prose like 'The call succeeded. Result: ...'. Non-terminal statuses must be reported exactly as 'Phone call is in progress! Progress:' followed by one '- HH:MM:SS message' bullet per activity item. Terminal statuses must be reported with exactly these sections in this order and with these headings unchanged: [Status], [Call Summary], [Details], [Transcript]. Do not add any extra text before or after the template.",
      parameters: GET_CALL_RUN_PARAMETERS,
      async execute(_id, params) {
        return executeTool(api, "get_call_run", params);
      },
    });
  },
});
