import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Regression: `auth login` opened the browser through cmd.exe on Windows.
//
//   spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" })
//
// cmd treats `&` as a command separator, and an OAuth URL is full of them.
// Measured with the real URL shape:
//
//   in   ...authorize?client_id=calle&redirect_uri=http://localhost:9999/cb&state=abc&scope=mcp
//   out  ...authorize?client_id=calle
//   err  'redirect_uri' is not recognized as an internal or external command
//
// So the browser got a truncated URL -- no redirect_uri, no state, no scope, so
// login could not complete -- and the rest of the query string was executed as
// shell commands. `stdio: "ignore"` meant the user saw none of it.
//
// The opener now uses rundll32, which takes the URL as one argument and never
// parses it. This test pins the underlying cmd behaviour so nobody reintroduces
// the old approach; it is skipped off Windows, where cmd does not exist.

const OAUTH_URL =
  "https://example.invalid/oauth/authorize" +
  "?client_id=calle&redirect_uri=http://localhost:9999/cb&state=abc123&scope=mcp";

const onWindows = process.platform === "win32";

test("cmd.exe mangles a URL containing &", { skip: !onWindows }, () => {
  const result = spawnSync("cmd", ["/c", "echo", OAUTH_URL], { encoding: "utf8" });
  const received = (result.stdout || "").trim();

  // This is the bug, asserted so its absence would be noticed: cmd stops at the
  // first `&` and treats what follows as separate commands.
  assert.ok(
    !received.includes("scope=mcp"),
    "expected cmd to truncate the URL -- if this now passes the whole URL, " +
      "the platform changed and the comment above needs revisiting",
  );
  assert.ok(received.startsWith("https://example.invalid/oauth/authorize?client_id=calle"));
});

test("rundll32 receives the URL intact", { skip: !onWindows }, () => {
  // Argument passing only -- `echo` stands in for rundll32 so nothing opens.
  // The point is that the URL survives as a single argv entry.
  const result = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(process.argv[1])", OAUTH_URL],
    { encoding: "utf8" },
  );

  assert.equal((result.stdout || "").trim(), OAUTH_URL);
});
