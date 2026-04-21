export const ACTIVE_CALL_RUN_MONITORS = new Map();
export const CALL_RUN_MONITOR_INTERVAL_MS = 15_000;
export const CALL_RUN_MONITOR_MAX_POLLS = 60;

export function isTerminalReplyText(value) {
  return typeof value === "string" && value.startsWith("[Status]");
}

export function buildCallRunMonitorKey(sessionKey, runId) {
  const key = typeof sessionKey === "string" ? sessionKey.trim() : "";
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!key || !id) {
    return "";
  }
  return `${key}:${id}`;
}

export function clearCallRunMonitor(monitorKey) {
  const monitor = ACTIVE_CALL_RUN_MONITORS.get(monitorKey);
  if (!monitor) {
    return;
  }
  if (monitor.timer) {
    clearTimeout(monitor.timer);
  }
  ACTIVE_CALL_RUN_MONITORS.delete(monitorKey);
}

export function clearCallRunMonitorsForSession(sessionKey) {
  const prefix = `${sessionKey}:`;
  for (const key of ACTIVE_CALL_RUN_MONITORS.keys()) {
    if (key.startsWith(prefix)) {
      clearCallRunMonitor(key);
    }
  }
}

export function startCallRunMonitor({
  sessionKey,
  runId,
  intervalMs = CALL_RUN_MONITOR_INTERVAL_MS,
  maxPolls = CALL_RUN_MONITOR_MAX_POLLS,
  initialReplyText = "",
  onPoll,
  onProgress = null,
  onTerminal,
  onError = null,
}) {
  const monitorKey = buildCallRunMonitorKey(sessionKey, runId);
  if (!monitorKey || typeof onPoll !== "function" || typeof onTerminal !== "function") {
    return false;
  }
  if (ACTIVE_CALL_RUN_MONITORS.has(monitorKey)) {
    return true;
  }

  const monitor = {
    timer: null,
    pollsRemaining: Number.isFinite(maxPolls) && maxPolls > 0 ? Math.floor(maxPolls) : CALL_RUN_MONITOR_MAX_POLLS,
    lastReplyText: typeof initialReplyText === "string" ? initialReplyText : "",
  };

  const scheduleNext = () => {
    monitor.timer = setTimeout(() => {
      void pollOnce();
    }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : CALL_RUN_MONITOR_INTERVAL_MS);
  };

  const pollOnce = async () => {
    if (!ACTIVE_CALL_RUN_MONITORS.has(monitorKey)) {
      return;
    }
    try {
      const polled = await onPoll();
      const rawText = typeof polled?.rawText === "string" ? polled.rawText : "";
      const replyText = typeof polled?.replyText === "string" ? polled.replyText : "";

      if (isTerminalReplyText(replyText)) {
        await onTerminal({ sessionKey, runId, rawText, replyText });
        clearCallRunMonitor(monitorKey);
        return;
      }
      if (replyText && replyText !== monitor.lastReplyText) {
        if (typeof onProgress === "function") {
          await onProgress({
            sessionKey,
            runId,
            rawText,
            replyText,
            previousReplyText: monitor.lastReplyText,
          });
        }
        monitor.lastReplyText = replyText;
      }
    } catch (error) {
      if (typeof onError === "function") {
        await onError(error);
      }
    }

    monitor.pollsRemaining -= 1;
    if (monitor.pollsRemaining <= 0) {
      clearCallRunMonitor(monitorKey);
      return;
    }
    scheduleNext();
  };

  ACTIVE_CALL_RUN_MONITORS.set(monitorKey, monitor);
  scheduleNext();
  return true;
}

export function updateCallRunMonitorReply(sessionKey, runId, replyText) {
  const monitorKey = buildCallRunMonitorKey(sessionKey, runId);
  const monitor = ACTIVE_CALL_RUN_MONITORS.get(monitorKey);
  if (!monitor || typeof replyText !== "string") {
    return false;
  }
  monitor.lastReplyText = replyText;
  return true;
}
