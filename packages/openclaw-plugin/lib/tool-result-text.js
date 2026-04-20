function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

const EXACT_REPLY_PREFIX = [
  "Reply to the user with exactly the text below.",
  "Do not translate it. Do not paraphrase it. Do not add extra text.",
].join("\n");

function humanizeStatus(status) {
  const raw = normalizeString(status);
  if (!raw) {
    return "";
  }
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function formatActivityTime(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(11, 19);
}

function formatDuration(value) {
  if (!Number.isInteger(value) || value < 0) {
    return "Not available";
  }
  const totalSeconds = value;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}min${String(seconds).padStart(2, "0")}s`;
}

function formatTimeRange(startedAt, endedAt) {
  const start = formatActivityTime(startedAt);
  const end = formatActivityTime(endedAt);
  if (start && end) {
    return `${start} - ${end}`;
  }
  return start || end || "Not available";
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function replaceFirstTextContent(content, text) {
  const nextContent = Array.isArray(content) ? content.map((item) => ({ ...item })) : [];
  const firstTextIndex = nextContent.findIndex((item) => item && item.type === "text");
  if (firstTextIndex >= 0) {
    nextContent[firstTextIndex] = { ...nextContent[firstTextIndex], text };
    return nextContent;
  }
  return [{ type: "text", text }, ...nextContent];
}

export function extractTextFromContent(content) {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildActivityLines(activity) {
  if (!Array.isArray(activity)) {
    return [];
  }
  return activity
    .map((event) => {
      if (!event || typeof event !== "object") {
        return "";
      }
      const time = formatActivityTime(event.ts);
      const message = normalizeString(event.message) || humanizeStatus(event.kind) || "Update";
      if (!message) {
        return "";
      }
      return time ? `- ${time} ${message}` : `- ${message}`;
    })
    .filter(Boolean);
}

function withExactReplyInstruction(body) {
  const text = normalizeString(body);
  if (!text) {
    return "";
  }
  return [
    EXACT_REPLY_PREFIX,
    "",
    text,
  ].join("\n");
}

function withPollInstruction(runId) {
  const id = normalizeString(runId) || "<run_id>";
  return [
    `Do not reply to the user yet.`,
    `Immediately call calle_get_call_run with run_id=\"${id}\".`,
    "Use the result of calle_get_call_run for the user-visible reply.",
    "If that result is non-terminal, reply only with the exact progress template.",
    "If that result is terminal, reply only with the exact terminal template.",
  ].join("\n");
}

function isTerminalStatus(status) {
  const normalized = normalizeString(status).toUpperCase();
  return new Set([
    "COMPLETED",
    "FAILED",
    "NO ANSWER",
    "NO_ANSWER",
    "DECLINED",
    "CANCELED",
    "CANCELLED",
    "VOICEMAIL",
    "BUSY",
    "EXPIRED",
  ]).has(normalized);
}

function formatCallRunText(toolName, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const runId = firstNonEmptyString(payload.run_id);
  const status = normalizeString(payload.status);
  const message = normalizeString(payload.message);
  const result = getObject(payload.result);
  const extracted = getObject(result.extracted);
  const calling = getObject(extracted.calling);
  const toPhones = Array.isArray(extracted.to_phones) ? extracted.to_phones : [];
  const postSummary = firstNonEmptyString(result.post_summary, result.summary, message);
  const activityLines = buildActivityLines(payload.activity);
  const statusLabel = normalizeString(status).toUpperCase() || "UNKNOWN";

  const lines = [];
  if (activityLines.length > 0) {
    lines.push(...activityLines);
  } else if (message) {
    lines.push(`- ${message}`);
  } else if (statusLabel) {
    lines.push(`- Status: ${statusLabel}`);
  } else {
    lines.push("- Waiting for the next status update.");
  }

  if (isTerminalStatus(status)) {
    const calleeNumber = firstNonEmptyString(toPhones[0], calling.callee);
    const duration = formatDuration(calling.duration_seconds);
    const timeRange = formatTimeRange(calling.started_at, calling.ended_at);
    const callId = firstNonEmptyString(result.call_id);
    const transcript = firstNonEmptyString(result.transcript);

    return withExactReplyInstruction([
      "[Status]",
      statusLabel,
      "",
      "[Call Summary]",
      postSummary || "No summary available.",
      "",
      "[Details]",
      `Callee Number: ${calleeNumber || "Not available"}`,
      `Duration: ${duration}`,
      `Time: ${timeRange}`,
      `Call id: ${callId || "Not available"}`,
      "",
      "[Transcript]",
      transcript || "Not available.",
    ].join("\n"));
  }

  if (toolName === "run_call") {
    return withPollInstruction(runId);
  }

  return withExactReplyInstruction(`Phone call is in progress! Progress:\n${lines.join("\n")}`);
}

export function extractReplyTextFromInstructionText(value) {
  const text = normalizeString(value);
  if (!text) {
    return "";
  }
  if (text.startsWith(`${EXACT_REPLY_PREFIX}\n\n`)) {
    return text.slice(`${EXACT_REPLY_PREFIX}\n\n`.length).trim();
  }
  if (text.startsWith("Phone call is in progress! Progress:") || text.startsWith("[Status]")) {
    return text;
  }
  return "";
}

export function extractRunIdFromPollInstruction(value) {
  const text = normalizeString(value);
  if (!text) {
    return "";
  }
  const match = text.match(/run_id="?([^"\n.]+)"?/i);
  return match ? normalizeString(match[1]) : "";
}

export function extractReplyTextFromToolResult(result) {
  if (!result || typeof result !== "object") {
    return "";
  }
  return extractReplyTextFromInstructionText(extractTextFromContent(result.content));
}

export function formatToolResultForDisplay({ toolName, result }) {
  if (!result || typeof result !== "object" || result.isError) {
    return result;
  }
  if (toolName !== "run_call" && toolName !== "get_call_run") {
    return result;
  }

  const text = formatCallRunText(toolName, result.structuredContent);
  if (!text) {
    return result;
  }

  return {
    ...result,
    content: replaceFirstTextContent(result.content, text),
  };
}
