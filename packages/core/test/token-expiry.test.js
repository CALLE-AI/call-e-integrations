import test from "node:test";
import assert from "node:assert/strict";

import { parseIsoDate, tokenIsUsable } from "@call-e/core/cache";

// Regression: an expiry that could not be parsed was read as "no expiry", so the
// token was treated as usable forever and never refreshed.
//
// The case that makes it more than theoretical is a numeric expiry. Epoch
// milliseconds is a standard representation, and broker-client stringifies
// whatever the broker sends — so 1700000000000 reaches the cache as the string
// "1700000000000", which `new Date()` reads as Invalid Date. Six different
// shapes of expires_at all resolved to "usable forever":
//
//     absent, null, "", "not-a-date", 1700000000000, {}
//
// Absent still means usable — the broker never committed to an expiry, and
// keeping the token is the reasonable reading. Present-but-unreadable now forces
// a refresh: one extra login costs far less than a client that is certain about
// a token it cannot reason about.

const TOKEN = { access_token: "abc" };
const MIN_TTL = 60;

function withExpiry(expires_at) {
  return { token: TOKEN, expires_at };
}

test("a numeric expiry is understood instead of ignored", () => {
  const inTenMinutes = Date.now() + 10 * 60 * 1000;

  // Milliseconds, as a number and as the string broker-client produces.
  assert.ok(tokenIsUsable(withExpiry(inTenMinutes), MIN_TTL));
  assert.ok(tokenIsUsable(withExpiry(String(inTenMinutes)), MIN_TTL));

  // Seconds, the other common epoch form.
  assert.ok(tokenIsUsable(withExpiry(Math.floor(inTenMinutes / 1000)), MIN_TTL));
});

test("a numeric expiry in the past is honoured, not treated as no expiry", () => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

  assert.equal(tokenIsUsable(withExpiry(tenMinutesAgo), MIN_TTL), false);
  assert.equal(tokenIsUsable(withExpiry(String(tenMinutesAgo)), MIN_TTL), false);
  assert.equal(
    tokenIsUsable(withExpiry(Math.floor(tenMinutesAgo / 1000)), MIN_TTL),
    false,
  );
});

test("an unreadable expiry forces a refresh rather than lasting forever", () => {
  for (const bad of ["not-a-date", "2026-13-45T99:99:99Z", {}, [], true]) {
    assert.equal(
      tokenIsUsable(withExpiry(bad), MIN_TTL),
      false,
      `expires_at ${JSON.stringify(bad)} must not read as "never expires"`,
    );
  }
});

test("an absent expiry still keeps the token", () => {
  // Unchanged behaviour: no expiry was ever promised, so there is nothing to
  // distrust. Only a value that is present and broken is suspicious.
  assert.ok(tokenIsUsable({ token: TOKEN }, MIN_TTL));
  assert.ok(tokenIsUsable(withExpiry(null), MIN_TTL));
  assert.ok(tokenIsUsable(withExpiry(""), MIN_TTL));
});

test("an ISO expiry behaves exactly as before", () => {
  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 3600 * 1000).toISOString();

  assert.ok(tokenIsUsable(withExpiry(future), MIN_TTL));
  assert.equal(tokenIsUsable(withExpiry(past), MIN_TTL), false);
});

test("minTtlSeconds still shortens the usable window", () => {
  const inThirtySeconds = new Date(Date.now() + 30 * 1000).toISOString();

  assert.ok(tokenIsUsable(withExpiry(inThirtySeconds), 0));
  assert.equal(
    tokenIsUsable(withExpiry(inThirtySeconds), 120),
    false,
    "a token expiring inside the minimum TTL is not usable",
  );
});

test("a malformed token is rejected regardless of expiry", () => {
  const future = new Date(Date.now() + 3600 * 1000).toISOString();

  assert.equal(tokenIsUsable(null, MIN_TTL), false);
  assert.equal(tokenIsUsable({ expires_at: future }, MIN_TTL), false);
  assert.equal(tokenIsUsable({ token: {}, expires_at: future }, MIN_TTL), false);
  assert.equal(
    tokenIsUsable({ token: { access_token: "" }, expires_at: future }, MIN_TTL),
    false,
  );
});

test("parseIsoDate reads both epoch forms and rejects junk", () => {
  const ms = 1_700_000_000_000;

  assert.equal(parseIsoDate(ms).getTime(), ms);
  assert.equal(parseIsoDate(String(ms)).getTime(), ms);
  assert.equal(parseIsoDate(ms / 1000).getTime(), ms, "epoch seconds scale up");

  assert.equal(parseIsoDate("2026-01-15T10:00:00Z").toISOString(), "2026-01-15T10:00:00.000Z");

  for (const junk of [null, undefined, "", "not-a-date", 0, -1, {}]) {
    assert.equal(parseIsoDate(junk), null, `parseIsoDate(${JSON.stringify(junk)})`);
  }
});
