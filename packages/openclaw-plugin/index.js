import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  acquireSessionWriteLock,
  emitSessionTranscriptUpdate,
} from "openclaw/plugin-sdk/agent-harness";
import {
  BrokeredTokenManager,
} from "./lib/brokered-auth.js";
import { callRemoteTool, isUnauthorizedMcpError } from "./lib/mcp-http.js";
import { getPluginConfig } from "./lib/plugin-config.js";
import { OPENCLAW_CALL_PROGRESS_GUIDANCE } from "./lib/prompt-guidance.js";
import {
  clearCallRunMonitorsForSession,
  isTerminalReplyText,
  startCallRunMonitor as startBackgroundCallRunMonitor,
  updateCallRunMonitorReply,
} from "./lib/call-run-monitor.js";
import {
  analyzeCallToolStateTransition,
  getCallStateKey,
  normalizeCallToolName,
} from "./lib/call-tool-state.js";
import {
  extractReplyTextFromInstructionText,
  extractReplyTextFromToolResult,
  extractRunIdFromPollInstruction,
  extractTextFromContent,
  formatToolResultForDisplay,
} from "./lib/tool-result-text.js";

const PLUGIN_VERSION = "0.2.4";
const TRANSCRIPT_SESSION_VERSION = 3;
const MANAGER_CACHE = new Map();
const LATEST_CALL_TOOL_STATE = new Map();
const LATEST_CALL_RUN_BY_SESSION = new Map();

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

function logCallDebug(api, message, details = null) {
  if (!api?.logger?.info) {
    return;
  }
  const suffix =
    details && typeof details === "object"
      ? ` ${JSON.stringify(details)}`
      : details
        ? ` ${String(details)}`
        : "";
  api.logger.info(`calle: ${message}${suffix}`);
}

function logCallError(api, message, error) {
  if (!api?.logger?.error) {
    return;
  }
  api.logger.error(`calle: ${message}: ${String(error)}`);
}

function readNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed || "";
}

function hashText(value) {
  const text = typeof value === "string" ? value : "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function buildDeliveryContextFromSessionEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const context = entry.deliveryContext && typeof entry.deliveryContext === "object" ? entry.deliveryContext : null;
  const deliveryContext = {};
  const channel =
    readNonEmptyString(context?.channel) ||
    readNonEmptyString(entry.lastChannel) ||
    readNonEmptyString(entry.origin?.provider);
  const to = readNonEmptyString(context?.to) || readNonEmptyString(entry.lastTo);
  const accountId =
    readNonEmptyString(context?.accountId) ||
    readNonEmptyString(entry.lastAccountId) ||
    readNonEmptyString(entry.origin?.accountId);
  const threadId = context?.threadId ?? entry.lastThreadId ?? entry.origin?.threadId;

  if (channel) {
    deliveryContext.channel = channel;
  }
  if (to) {
    deliveryContext.to = to;
  }
  if (accountId) {
    deliveryContext.accountId = accountId;
  }
  if (threadId !== undefined && threadId !== null && threadId !== "") {
    deliveryContext.threadId = threadId;
  }

  return Object.keys(deliveryContext).length > 0 ? deliveryContext : null;
}

function resolveCallDeliveryContext(api, ctx) {
  const sessionKey = getCallStateKey(ctx);
  const agentId = readNonEmptyString(ctx?.agentId);
  const fallbackChannel = readNonEmptyString(ctx?.channelId) || readNonEmptyString(ctx?.messageProvider);

  try {
    const resolveStorePath = api?.runtime?.agent?.session?.resolveStorePath;
    const loadSessionStore = api?.runtime?.agent?.session?.loadSessionStore;
    if (sessionKey && agentId && typeof resolveStorePath === "function" && typeof loadSessionStore === "function") {
      const storePath = resolveStorePath(api?.config?.session?.store, { agentId });
      const store = loadSessionStore(storePath);
      const entry = store?.[sessionKey];
      const deliveryContext = buildDeliveryContextFromSessionEntry(entry);
      if (deliveryContext) {
        return deliveryContext;
      }
    }
  } catch {
    // Fall back to the live hook context when the session store is unavailable.
  }

  return fallbackChannel ? { channel: fallbackChannel } : null;
}

function buildCallMonitorWakeOptions(api, ctx, runId) {
  const sessionKey = getCallStateKey(ctx);
  if (!sessionKey) {
    return null;
  }
  return {
    sessionKey,
    agentId: readNonEmptyString(ctx?.agentId),
    reason: `hook:calle-call-run:${runId}`,
    deliveryContext: resolveCallDeliveryContext(api, ctx),
  };
}

function resolveCallSessionStoreContext(api, wakeOptions) {
  const sessionKey = readNonEmptyString(wakeOptions?.sessionKey);
  const agentId = readNonEmptyString(wakeOptions?.agentId);
  const resolveStorePath = api?.runtime?.agent?.session?.resolveStorePath;
  const loadSessionStore = api?.runtime?.agent?.session?.loadSessionStore;

  if (!sessionKey || !agentId || typeof resolveStorePath !== "function" || typeof loadSessionStore !== "function") {
    return null;
  }

  const storePath = resolveStorePath(api?.config?.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store?.[sessionKey];
  if (!entry?.sessionId) {
    return null;
  }

  const rawSessionFile = readNonEmptyString(entry.sessionFile);
  const sessionFile = rawSessionFile
    ? (path.isAbsolute(rawSessionFile)
        ? rawSessionFile
        : path.resolve(path.dirname(storePath), rawSessionFile))
    : "";

  return {
    sessionKey,
    sessionId: entry.sessionId,
    sessionFile,
  };
}

function buildAssistantTranscriptMessage(replyText, idempotencyKey) {
  const message = {
    role: "assistant",
    content: [
      {
        type: "text",
        text: replyText,
      },
    ],
    api: "openai-responses",
    provider: "openclaw",
    model: "gateway-injected",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  if (idempotencyKey) {
    message.idempotencyKey = idempotencyKey;
  }

  return message;
}

function generateTranscriptEntryId(existingIds) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = randomUUID().slice(0, 8);
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return randomUUID();
}

async function appendCallUpdateToTranscript(api, wakeOptions, replyText, idempotencyKey) {
  const sessionContext = resolveCallSessionStoreContext(api, wakeOptions);
  if (!sessionContext) {
    return { ok: false, reason: "session-store-context-unavailable" };
  }

  const { sessionFile, sessionId, sessionKey } = sessionContext;
  if (!sessionId || !sessionKey || !replyText) {
    return { ok: false, reason: "transcript-params-missing" };
  }
  if (!sessionFile) {
    return { ok: false, reason: "session-file-missing" };
  }

  const message = buildAssistantTranscriptMessage(replyText, idempotencyKey);
  let releaseLock = null;

  try {
    releaseLock = await acquireSessionWriteLock({
      sessionFile,
      allowReentrant: true,
      timeoutMs: 5000,
    });

    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    let raw = "";
    try {
      raw = await fs.readFile(sessionFile, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    if (!raw.trim()) {
      const header = {
        type: "session",
        version: TRANSCRIPT_SESSION_VERSION,
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd: process.cwd(),
      };
      raw = `${JSON.stringify(header)}\n`;
      await fs.writeFile(sessionFile, raw, "utf8");
    }

    const existingIds = new Set();
    let leafId = null;

    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (
        idempotencyKey &&
        parsed?.type === "message" &&
        parsed?.message?.role === "assistant" &&
        parsed?.message?.idempotencyKey === idempotencyKey &&
        typeof parsed?.id === "string"
      ) {
        return {
          ok: true,
          sessionFile,
          messageId: parsed.id,
        };
      }

      if (typeof parsed?.id === "string") {
        existingIds.add(parsed.id);
        if (parsed.type !== "session") {
          leafId = parsed.id;
        }
      }
    }

    const entry = {
      type: "message",
      id: generateTranscriptEntryId(existingIds),
      parentId: leafId,
      timestamp: new Date().toISOString(),
      message,
    };

    await fs.appendFile(sessionFile, `${JSON.stringify(entry)}\n`, "utf8");
    emitSessionTranscriptUpdate({
      sessionFile,
      sessionKey,
      message,
      messageId: entry.id,
    });

    return {
      ok: true,
      sessionFile,
      messageId: entry.id,
    };
  } catch (error) {
    logCallError(api, `appendCallUpdateToTranscript failed for ${sessionKey}`, error);
    return { ok: false, reason: "transcript-append-failed" };
  } finally {
    if (releaseLock?.release) {
      await releaseLock.release().catch(() => {});
    }
  }
}

function setLatestCallRunForSession(sessionKey, runId) {
  if (!sessionKey || !runId) {
    return;
  }
  LATEST_CALL_RUN_BY_SESSION.set(sessionKey, runId);
}

function getLatestCallRunForSession(sessionKey) {
  if (!sessionKey) {
    return "";
  }
  return LATEST_CALL_RUN_BY_SESSION.get(sessionKey) || "";
}

function clearLatestCallRunForSession(sessionKey, runId = "") {
  if (!sessionKey) {
    return;
  }
  if (!runId || LATEST_CALL_RUN_BY_SESSION.get(sessionKey) === runId) {
    LATEST_CALL_RUN_BY_SESSION.delete(sessionKey);
  }
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

function setLatestCallToolStateForKey(key, state) {
  if (!key || !state) {
    return;
  }
  LATEST_CALL_TOOL_STATE.set(key, state);
}

function isFreshCallToolState(state) {
  return !!state && typeof state.ts === "number" && Date.now() - state.ts <= 10 * 60_000;
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

async function dispatchCallRunUpdate(api, wakeOptions, runId, rawText, replyText, updateKind) {
  setLatestCallToolStateForKey(wakeOptions.sessionKey, {
    toolName: "get_call_run",
    text: rawText || replyText,
    ts: Date.now(),
  });

  const replyFingerprint = hashText(rawText || replyText);
  const contextKey =
    updateKind === "terminal"
      ? `calle-call-run:${runId}:terminal`
      : `calle-call-run:${runId}:progress:${replyFingerprint}`;
  const eventText =
    updateKind === "terminal"
      ? `CALL-E call update ready for run ${runId}. Send the latest CALL-E call result to the user now.`
      : `CALL-E call progress update ready for run ${runId}. Send the latest CALL-E call progress to the user now.`;
  const transcriptAppend = await appendCallUpdateToTranscript(api, wakeOptions, replyText, contextKey);
  logCallDebug(api, "appendCallUpdateToTranscript", {
    updateKind,
    runId,
    sessionKey: wakeOptions.sessionKey,
    ok: transcriptAppend?.ok === true,
    reason: transcriptAppend?.reason || "",
  });
  if (transcriptAppend?.ok) {
    return;
  }
  const eventOptions = {
    sessionKey: wakeOptions.sessionKey,
    contextKey,
    ...(wakeOptions.deliveryContext ? { deliveryContext: wakeOptions.deliveryContext } : {}),
  };

  const enqueued = api.runtime.system.enqueueSystemEvent(eventText, eventOptions);
  logCallDebug(api, "dispatchCallRunUpdate", {
    updateKind,
    runId,
    sessionKey: wakeOptions.sessionKey,
    enqueued,
    hasDeliveryContext: !!wakeOptions.deliveryContext,
    replyPreview: typeof replyText === "string" ? replyText.slice(0, 120) : "",
  });
  api.runtime.system.requestHeartbeatNow({
    sessionKey: wakeOptions.sessionKey,
    reason: wakeOptions.reason,
  });
}

function startCallRunMonitor(api, ctx, runId, options = {}) {
  const wakeOptions = buildCallMonitorWakeOptions(api, ctx, runId);
  if (
    !wakeOptions ||
    !api?.runtime?.system?.enqueueSystemEvent ||
    !api?.runtime?.system?.requestHeartbeatNow
  ) {
    logCallDebug(api, "startCallRunMonitor skipped", {
      runId,
      hasWakeOptions: !!wakeOptions,
      hasEnqueueSystemEvent: !!api?.runtime?.system?.enqueueSystemEvent,
      hasRequestHeartbeatNow: !!api?.runtime?.system?.requestHeartbeatNow,
      ctxSessionKey: ctx?.sessionKey || "",
      ctxAgentId: ctx?.agentId || "",
    });
    return false;
  }
  const started = startBackgroundCallRunMonitor({
    sessionKey: wakeOptions.sessionKey,
    runId,
    intervalMs: options.intervalMs,
    maxPolls: options.maxPolls,
    async onPoll() {
      const polled = await executeTool(api, "get_call_run", { run_id: runId });
      const rawText = extractTextFromContent(polled?.content);
      const replyText = extractReplyTextFromToolResult(polled);
      logCallDebug(api, "monitor poll", {
        runId,
        sessionKey: wakeOptions.sessionKey,
        replyPreview: typeof replyText === "string" ? replyText.slice(0, 120) : "",
      });
      return {
        rawText,
        replyText,
      };
    },
    async onProgress({ rawText, replyText }) {
      await dispatchCallRunUpdate(api, wakeOptions, runId, rawText, replyText, "progress");
    },
    async onTerminal({ rawText, replyText }) {
      clearLatestCallRunForSession(wakeOptions.sessionKey, runId);
      await dispatchCallRunUpdate(api, wakeOptions, runId, rawText, replyText, "terminal");
    },
    async onError(error) {
      logCallError(api, `monitor poll failed for ${runId}`, error);
    },
  });
  logCallDebug(api, "startCallRunMonitor", {
    runId,
    sessionKey: wakeOptions.sessionKey,
    hasDeliveryContext: !!wakeOptions.deliveryContext,
    started,
    ctxSessionKey: ctx?.sessionKey || "",
    ctxAgentId: ctx?.agentId || "",
  });
  return started;
}

export function handleCallToolResultPersist(api, event, ctx) {
  const sessionKey = getCallStateKey(ctx);
  const toolName = normalizeCallToolName(event?.toolName || event?.message?.toolName);
  const text = extractTextFromContent(event?.message?.content);
  const transition = analyzeCallToolStateTransition(event, ctx);
  if (!transition) {
    if (toolName === "get_call_run" && sessionKey && text) {
      const runId = getLatestCallRunForSession(sessionKey);
      const replyText = extractReplyTextFromInstructionText(text);
      if (runId && replyText && !isTerminalReplyText(replyText)) {
        logCallDebug(api, "updateCallRunMonitorReply", {
          runId,
          sessionKey,
          replyPreview: replyText.slice(0, 120),
        });
        updateCallRunMonitorReply(sessionKey, runId, replyText);
      }
    }
    return;
  }
  logCallDebug(api, "handleCallToolResultPersist transition", {
    action: transition.action,
    toolName,
    sessionKey,
    transitionSessionKey: transition.sessionKey,
    runId: transition.runId || "",
    ctxSessionKey: ctx?.sessionKey || "",
    ctxAgentId: ctx?.agentId || "",
  });
  if (transition.action === "start-monitor") {
    setLatestCallRunForSession(transition.sessionKey, transition.runId);
    startCallRunMonitor(api, ctx, transition.runId);
    return;
  }
  if (transition.action === "clear-monitor") {
    clearCallRunMonitorsForSession(transition.sessionKey);
    clearLatestCallRunForSession(transition.sessionKey);
  }
}

async function maybeOverrideCallReply(api, ctx) {
  const state = popLatestCallToolState(ctx);
  if (!isFreshCallToolState(state)) {
    return null;
  }

  if (state.toolName === "get_call_run") {
    const replyText = extractReplyTextFromInstructionText(state.text);
    if (replyText) {
      if (isTerminalReplyText(replyText)) {
        clearCallRunMonitorsForSession(getCallStateKey(ctx));
      }
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
    if (!isTerminalReplyText(polled.replyText)) {
      setLatestCallRunForSession(getCallStateKey(ctx), runId);
      startCallRunMonitor(api, ctx, runId);
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
        handleCallToolResultPersist(api, event, ctx);
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
