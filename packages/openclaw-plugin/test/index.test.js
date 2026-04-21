import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_CALL_RUN_MONITORS,
  clearCallRunMonitorsForSession,
  startCallRunMonitor,
  updateCallRunMonitorReply,
} from "../lib/call-run-monitor.js";
import { analyzeCallToolStateTransition, getCallStateKey } from "../lib/call-tool-state.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("startCallRunMonitor enqueues a heartbeat wake after the call reaches a terminal state", async () => {
  const events = [];
  const wakes = [];
  let pollCount = 0;
  const sessionKey = "session-terminal";

  const started = startCallRunMonitor({
    sessionKey,
    runId: "run-terminal",
    intervalMs: 5,
    maxPolls: 3,
    async onPoll() {
      pollCount += 1;
      if (pollCount === 1) {
        return {
          replyText: "Phone call is in progress! Progress:\n- 11:45:03 Outbound dial started.",
        };
      }
      return {
        rawText: "[Status]\nCOMPLETED",
        replyText: "[Status]\nCOMPLETED",
      };
    },
    async onTerminal({ sessionKey: currentSessionKey, runId, rawText, replyText }) {
      events.push({
        text: `CALL-E call update ready for run ${runId}. Send the latest CALL-E call result to the user now.`,
        options: {
          sessionKey: currentSessionKey,
          contextKey: `calle-call-run:${runId}`,
        },
      });
      wakes.push({
        sessionKey: currentSessionKey,
        reason: `calle-call-run:${runId}`,
      });
      assert.equal(rawText, "[Status]\nCOMPLETED");
      assert.equal(replyText, "[Status]\nCOMPLETED");
    },
  });

  assert.equal(started, true);
  await sleep(30);

  assert.equal(pollCount, 2);
  assert.equal(events.length, 1);
  assert.equal(
    events[0].text,
    "CALL-E call update ready for run run-terminal. Send the latest CALL-E call result to the user now."
  );
  assert.deepEqual(events[0].options, {
    sessionKey,
    contextKey: "calle-call-run:run-terminal",
  });
  assert.deepEqual(wakes, [
    {
      sessionKey,
      reason: "calle-call-run:run-terminal",
    },
  ]);
  assert.equal(ACTIVE_CALL_RUN_MONITORS.size, 0);
  clearCallRunMonitorsForSession(sessionKey);
});

test("startCallRunMonitor stops after max polls when the call never becomes terminal", async () => {
  const events = [];
  const wakes = [];
  let pollCount = 0;
  const sessionKey = "session-nonterminal";

  const started = startCallRunMonitor({
    sessionKey,
    runId: "run-still-going",
    intervalMs: 5,
    maxPolls: 2,
    async onPoll() {
      pollCount += 1;
      return {
        replyText: "Phone call is in progress! Progress:\n- Waiting for the next status update.",
      };
    },
    async onTerminal() {
      events.push("unexpected");
      wakes.push("unexpected");
    },
  });

  assert.equal(started, true);
  await sleep(25);

  assert.equal(pollCount, 2);
  assert.deepEqual(events, []);
  assert.deepEqual(wakes, []);
  assert.equal(ACTIVE_CALL_RUN_MONITORS.size, 0);
  clearCallRunMonitorsForSession(sessionKey);
});

test("startCallRunMonitor only emits progress updates when the reply changes", async () => {
  const progressReplies = [];
  let pollCount = 0;
  const sessionKey = "session-progress";
  const runId = "run-progress";
  const initialReplyText = "Phone call is in progress! Progress:\n- 11:45:03 Outbound dial started.";
  const updatedReplyText = [
    "Phone call is in progress! Progress:",
    "- 11:45:03 Outbound dial started.",
    "- 11:46:03 Callee answered.",
  ].join("\n");

  const started = startCallRunMonitor({
    sessionKey,
    runId,
    intervalMs: 5,
    maxPolls: 3,
    async onPoll() {
      pollCount += 1;
      if (pollCount === 1) {
        return {
          replyText: initialReplyText,
        };
      }
      return {
        rawText: updatedReplyText,
        replyText: updatedReplyText,
      };
    },
    async onProgress({ replyText }) {
      progressReplies.push(replyText);
    },
    async onTerminal() {
      assert.fail("unexpected terminal update");
    },
  });

  assert.equal(started, true);
  assert.equal(updateCallRunMonitorReply(sessionKey, runId, initialReplyText), true);
  await sleep(30);

  assert.equal(pollCount, 3);
  assert.deepEqual(progressReplies, [updatedReplyText]);
  assert.equal(ACTIVE_CALL_RUN_MONITORS.size, 0);
  clearCallRunMonitorsForSession(sessionKey);
});

test("analyzeCallToolStateTransition starts a monitor from run_call tool results", () => {
  const event = {
    message: {
      toolName: "calle_run_call",
      content: [
        {
          type: "text",
          text:
            'Do not reply to the user yet.\nImmediately call calle_get_call_run with run_id="run-123".\nUse the result of calle_get_call_run for the user-visible reply.',
        },
      ],
    },
  };
  const ctx = {
    sessionKey: "agent:testray:main",
  };

  assert.deepEqual(analyzeCallToolStateTransition(event, ctx), {
    action: "start-monitor",
    sessionKey: "agent:testray:main",
    runId: "run-123",
  });
});

test("getCallStateKey canonicalizes main session aliases to the agent store key", () => {
  assert.equal(
    getCallStateKey({
      agentId: "main",
      sessionKey: "main",
    }),
    "agent:main:main"
  );

  assert.equal(
    getCallStateKey({
      agentId: "TesTray",
      sessionKey: "Follow Up",
    }),
    "agent:testray:follow-up"
  );

  assert.equal(
    getCallStateKey({
      agentId: "main",
    }),
    "agent:main:main"
  );
});

test("analyzeCallToolStateTransition clears a monitor after terminal get_call_run results", () => {
  const event = {
    message: {
      toolName: "calle_get_call_run",
      content: [
        {
          type: "text",
          text:
            "Reply to the user with exactly the text below.\nDo not translate it. Do not paraphrase it. Do not add extra text.\n\n[Status]\nFAILED",
        },
      ],
    },
  };
  const ctx = {
    sessionKey: "agent:testray:main",
  };

  assert.deepEqual(analyzeCallToolStateTransition(event, ctx), {
    action: "clear-monitor",
    sessionKey: "agent:testray:main",
  });
});
