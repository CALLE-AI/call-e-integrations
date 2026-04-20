import test from "node:test";
import assert from "node:assert/strict";

import {
  extractReplyTextFromInstructionText,
  extractRunIdFromPollInstruction,
  formatToolResultForDisplay,
} from "../lib/tool-result-text.js";

test("formatToolResultForDisplay instructs run_call to immediately poll get_call_run", () => {
  const result = formatToolResultForDisplay({
    toolName: "run_call",
    result: {
      content: [{ type: "text", text: "{\"run_id\":\"run-1\"}" }],
      structuredContent: {
        run_id: "run-1",
        status: "PREPARING",
        message: "run_call started.",
        activity: [
          {
            ts: "2026-04-20T11:45:03Z",
            message: "Call task created.",
          },
          {
            ts: "2026-04-20T11:45:10Z",
            message: "Outbound dial started.",
          },
        ],
      },
      isError: false,
    },
  });

  assert.equal(
    result.content[0].text,
    "Do not reply to the user yet.\n" +
      "Immediately call calle_get_call_run with run_id=\"run-1\".\n" +
      "Use the result of calle_get_call_run for the user-visible reply.\n" +
      "If that result is non-terminal, reply only with the exact progress template.\n" +
      "If that result is terminal, reply only with the exact terminal template."
  );
  assert.equal(result.structuredContent.run_id, "run-1");
});

test("formatToolResultForDisplay converts get_call_run activity into exact progress text", () => {
  const result = formatToolResultForDisplay({
    toolName: "get_call_run",
    result: {
      content: [{ type: "text", text: "{\"run_id\":\"run-1\"}" }],
      structuredContent: {
        run_id: "run-1",
        status: "PREPARING",
        message: "run_call started.",
        activity: [
          {
            ts: "2026-04-20T11:45:03Z",
            message: "Call task created.",
          },
          {
            ts: "2026-04-20T11:45:10Z",
            message: "Outbound dial started.",
          },
        ],
      },
      isError: false,
    },
  });

  assert.equal(
    result.content[0].text,
    "Reply to the user with exactly the text below.\n" +
      "Do not translate it. Do not paraphrase it. Do not add extra text.\n\n" +
      "Phone call is in progress! Progress:\n" +
      "- 11:45:03 Call task created.\n" +
      "- 11:45:10 Outbound dial started."
  );
});

test("formatToolResultForDisplay includes a summary for terminal run results", () => {
  const result = formatToolResultForDisplay({
    toolName: "run_call",
    result: {
      content: [{ type: "text", text: "{\"run_id\":\"run-1\"}" }],
      structuredContent: {
        run_id: "run-1",
        status: "COMPLETED",
        activity: [],
        result: {
          post_summary: "The connectivity test call to +8618585062540 was successful. The call connected, lasted 9 seconds, and was ended by the callee.",
          transcript: "I am calling to perform a brief automated connectivity test for this line.",
          call_id: "91c547402f7043e8b48a12652bc24197",
          extracted: {
            to_phones: ["+8618585062540"],
            calling: {
              duration_seconds: 9,
              started_at: "2026-04-20T17:16:07Z",
              ended_at: "2026-04-20T17:16:16Z",
            },
          },
        },
      },
      isError: false,
    },
  });

  assert.equal(
    result.content[0].text,
    "Reply to the user with exactly the text below.\n" +
      "Do not translate it. Do not paraphrase it. Do not add extra text.\n\n" +
      "[Status]\n" +
      "COMPLETED\n\n" +
      "[Call Summary]\n" +
      "The connectivity test call to +8618585062540 was successful. The call connected, lasted 9 seconds, and was ended by the callee.\n\n" +
      "[Details]\n" +
      "Callee Number: +8618585062540\n" +
      "Duration: 0min09s\n" +
      "Time: 17:16:07 - 17:16:16\n" +
      "Call id: 91c547402f7043e8b48a12652bc24197\n\n" +
      "[Transcript]\n" +
      "I am calling to perform a brief automated connectivity test for this line."
  );
});

test("formatToolResultForDisplay leaves non-run tools unchanged", () => {
  const source = {
    content: [{ type: "text", text: "original" }],
    structuredContent: { ready_to_run: true },
    isError: false,
  };

  const result = formatToolResultForDisplay({
    toolName: "plan_call",
    result: source,
  });

  assert.deepEqual(result, source);
});

test("extractReplyTextFromInstructionText unwraps exact reply instructions", () => {
  const text = extractReplyTextFromInstructionText(
    "Reply to the user with exactly the text below.\n" +
      "Do not translate it. Do not paraphrase it. Do not add extra text.\n\n" +
      "[Status]\nCOMPLETED"
  );

  assert.equal(text, "[Status]\nCOMPLETED");
});

test("extractRunIdFromPollInstruction parses run ids from poll instructions", () => {
  const runId = extractRunIdFromPollInstruction(
    "Do not reply to the user yet.\nImmediately call calle_get_call_run with run_id=\"abc-123\".\nUse the result of calle_get_call_run for the user-visible reply."
  );

  assert.equal(runId, "abc-123");
});
