import test from "node:test";
import assert from "node:assert/strict";

import { OPENCLAW_CALL_PROGRESS_GUIDANCE } from "../lib/prompt-guidance.js";

test("OPENCLAW_CALL_PROGRESS_GUIDANCE includes the exact terminal template headings", () => {
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /\[Status\]/);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /\[Call Summary\]/);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /\[Details\]/);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /\[Transcript\]/);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /Phone call is in progress! Progress:/);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /do not translate the headings/i);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /do not add extra commentary/i);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /do not wrap the result in code fences/i);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /Immediately call calle_get_call_run/i);
  assert.match(OPENCLAW_CALL_PROGRESS_GUIDANCE, /Never reply with free-form summaries/i);
});
