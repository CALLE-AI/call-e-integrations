import {
  extractReplyTextFromInstructionText,
  extractRunIdFromPollInstruction,
  extractTextFromContent,
} from "./tool-result-text.js";
import { isTerminalReplyText } from "./call-run-monitor.js";

function normalizeSessionToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
}

export function normalizeCallToolName(toolName) {
  const raw = typeof toolName === "string" ? toolName : "";
  if (raw === "run_call" || raw === "calle_run_call") {
    return "run_call";
  }
  if (raw === "get_call_run" || raw === "calle_get_call_run") {
    return "get_call_run";
  }
  return "";
}

export function getCallStateKey(ctx) {
  const rawSessionKey = typeof ctx?.sessionKey === "string" ? ctx.sessionKey.trim() : "";
  if (rawSessionKey) {
    const lowered = rawSessionKey.toLowerCase();
    if (lowered.startsWith("agent:") || lowered === "global") {
      return lowered;
    }

    const agentId = normalizeSessionToken(ctx?.agentId) || "main";
    const sessionKey = normalizeSessionToken(rawSessionKey);
    if (sessionKey) {
      if (sessionKey === "main") {
        return `agent:${agentId}:main`;
      }
      return `agent:${agentId}:${sessionKey}`;
    }
  }

  const sessionId = typeof ctx?.sessionId === "string" ? ctx.sessionId.trim() : "";
  if (sessionId) {
    return sessionId;
  }

  const agentId = normalizeSessionToken(ctx?.agentId);
  if (agentId) {
    return `agent:${agentId}:main`;
  }

  return "";
}

export function analyzeCallToolStateTransition(event, ctx) {
  const toolName = normalizeCallToolName(event?.toolName || event?.message?.toolName);
  const sessionKey = getCallStateKey(ctx);
  const text = extractTextFromContent(event?.message?.content);
  if (!toolName || !sessionKey || !text) {
    return null;
  }

  if (toolName === "run_call") {
    const runId = extractRunIdFromPollInstruction(text);
    if (!runId) {
      return null;
    }
    return {
      action: "start-monitor",
      sessionKey,
      runId,
    };
  }

  if (toolName === "get_call_run") {
    const replyText = extractReplyTextFromInstructionText(text);
    if (!isTerminalReplyText(replyText)) {
      return null;
    }
    return {
      action: "clear-monitor",
      sessionKey,
    };
  }

  return null;
}
