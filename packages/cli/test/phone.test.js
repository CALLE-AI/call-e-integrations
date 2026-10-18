import test from "node:test";
import assert from "node:assert/strict";

import { DESTINATION_PHONE_FORMAT_GUIDANCE, destinationPhoneFormatError } from "../lib/phone.js";

function assertFormatError(phone) {
  const message = destinationPhoneFormatError(phone);
  assert.equal(typeof message, "string");
  assert.match(message, /malformed or fictional number/);
  assert.match(message, new RegExp(DESTINATION_PHONE_FORMAT_GUIDANCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(message, /region are not supported/i);
  return message;
}

test("flags the issue 144 malformed NANP examples as format problems", () => {
  assertFormatError("+15551234567");
  assertFormatError("+1234567890");
  assertFormatError("+15552001234");
});

test("accepts valid NANP-format fictional numbers and other E.164 destinations", () => {
  assert.equal(destinationPhoneFormatError("+14155550123"), null);
  assert.equal(destinationPhoneFormatError("+12125550199"), null);
  assert.equal(destinationPhoneFormatError("+442071838750"), null);
});

test("rejects missing plus, punctuation, invalid NPAs, and N11 area codes", () => {
  assertFormatError("14155550123");
  assertFormatError("+1-415-555-0123");
  assertFormatError("+11234567890");
  assertFormatError("+19115550123");
});
