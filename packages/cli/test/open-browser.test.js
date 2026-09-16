import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { browserOpenCommand } from "../lib/cli.js";

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
// The assertions below run against browserOpenCommand, the function the CLI
// actually calls, so putting cmd.exe back makes them fail on every platform.

const OAUTH_URL =
  "https://example.invalid/oauth/authorize" +
  "?client_id=calle&redirect_uri=http://localhost:9999/cb&state=abc123&scope=mcp";

const onWindows = process.platform === "win32";

test("windows opens the URL with System32's rundll32, by absolute path", () => {
  const [command, args] = browserOpenCommand(OAUTH_URL, "win32", { SystemRoot: "C:\\Windows" });

  assert.equal(command, "C:\\Windows\\System32\\rundll32.exe");
  assert.deepEqual(args, ["url.dll,FileProtocolHandler", OAUTH_URL]);
});

test("windows never routes the URL through a shell", () => {
  const [command, args] = browserOpenCommand(OAUTH_URL, "win32", { SystemRoot: "C:\\Windows" });

  assert.doesNotMatch(command, /(^|[\\/])cmd(\.exe)?$/i);
  assert.ok(!args.includes("/c"), "no cmd switch in the argv");
  assert.ok(!args.includes("start"), "no start builtin in the argv");
});

test("windows names the opener by a qualified path, not a bare executable", () => {
  const [command] = browserOpenCommand(OAUTH_URL, "win32", { SystemRoot: "C:\\Windows" });

  // A bare "rundll32" would be resolved with the CreateProcess search order,
  // which looks in the current directory before System32.
  assert.ok(/^[A-Za-z]:\\/.test(command), `expected an absolute path, got ${command}`);
  assert.match(command, /\\System32\\rundll32\.exe$/i);
});

test("windows takes the system directory from the environment", () => {
  const [command] = browserOpenCommand(OAUTH_URL, "win32", { SystemRoot: "D:\\WINNT" });

  assert.equal(command, "D:\\WINNT\\System32\\rundll32.exe");
});

test("the URL travels as one argv entry, so nothing can split it", () => {
  const [, args] = browserOpenCommand(OAUTH_URL, "win32", { SystemRoot: "C:\\Windows" });
  const urlArgs = args.filter((arg) => arg.includes("example.invalid"));

  assert.equal(urlArgs.length, 1);
  assert.equal(urlArgs[0], OAUTH_URL);
  assert.ok(urlArgs[0].includes("&scope=mcp"), "the query survives whole");
});

test("macos and linux keep their openers", () => {
  assert.deepEqual(browserOpenCommand(OAUTH_URL, "darwin", {}), ["open", [OAUTH_URL]]);
  assert.deepEqual(browserOpenCommand(OAUTH_URL, "linux", {}), ["xdg-open", [OAUTH_URL]]);
});

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
