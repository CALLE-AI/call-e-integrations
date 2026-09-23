# CALL-E Troubleshooting

Use this guide when CALL-E installation, authentication, or tool verification
fails in a local agent environment.

## Cursor agent shell returns `CONNECT tunnel failed, response 403`

### Symptoms

A request works in your terminal but fails in the Cursor agent shell with
`CONNECT tunnel failed, response 403`. The CALL-E CLI may also report
`fetch failed`.

### Check the sandbox

In Cursor 3.21.16, the setting is under **Settings → Agents → Execution and
Approvals → Run Mode**. Keep **Auto-Review (with Sandbox)** enabled while checking
network access. Run this in the agent shell:

```bash
printf "CURSOR_SANDBOX=%s\n" "$CURSOR_SANDBOX"
curl -sS --connect-timeout 10 --max-time 20 -o /dev/null -w "HTTP %{http_code}\n" https://seleven-mcp-sg.airudder.com/
```

On macOS, `CURSOR_SANDBOX=seatbelt` identifies the sandbox. If curl reports a
CONNECT 403 there but reaches the same host in your terminal, check the sandbox's
domain policy. A generic `fetch failed` alone does not identify the cause.

### Allow the CALL-E host

Using your editor, add the CALL-E host to the workspace's
`.cursor/sandbox.json`. If the file already exists, merge the entry into its
`networkPolicy.allow` list without replacing other settings:

```json
{
  "networkPolicy": {
    "default": "deny",
    "allow": ["seleven-mcp-sg.airudder.com"]
  }
}
```

This keeps the sandbox enabled. Existing deny rules and organization policies
can still block the host; see Cursor's
[sandbox configuration reference](https://cursor.com/docs/reference/sandbox).
Retry the curl check. An HTTP 404 from this root URL still confirms that HTTPS
reached the server; it does not verify authentication.

### Verify the CLI through the sandbox proxy

If curl connects but the Node CLI still reports `fetch failed`, Node may not be
using the sandbox's proxy. Follow
[CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
to prepare the trusted launcher and a `tools-request.json` with this `argv`:

```json
["mcp", "tools"]
```

With an existing CALL-E login, run:

```bash
NODE_USE_ENV_PROXY=1 node run-agent-command.mjs tools-request.json
```

This asks Node to use the proxy environment supplied by the sandbox. Keep TLS
certificate verification enabled. The environment variable requires a Node
version that supports it; see the
[Node reference](https://nodejs.org/api/cli.html#node_use_env_proxy1).
A successful response has `ok: true` and lists `plan_call`, `run_call`, and
`get_call_run` among its tools.

These steps were tested on macOS with Cursor 3.21.16, Node 26.8.2, and CALL-E CLI
0.5.2, using an existing login. The domain entry resolved curl's CONNECT 403;
`NODE_USE_ENV_PROXY=1` also resolved the CLI's `fetch failed`. This check does not
cover a fresh OAuth login or skill installation.

## Run CALL-E from Python on Windows

Python's `subprocess.run(["calle", "--help"])` can raise
`FileNotFoundError: [WinError 2]` even when `calle` works in a terminal.
The npm installation provides a `calle.cmd` wrapper on Windows; a direct
process launch does not resolve the bare command like a shell does. This
failure occurs before the CLI starts.

In the reported Windows test, specifying `calle.cmd` displayed help:

```python
import subprocess

subprocess.run(["calle.cmd", "--help"])
```

This help check requires no login and makes no calls. The test confirms this
invocation; it does not validate arbitrary arguments through the `.cmd` wrapper.
For application integrations, see the existing
[CLI launcher guidance](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point).

## Run CALL-E from Node on Windows

### Symptoms

A Node integration on Windows may abort while its host process exits with this
libuv assertion:

```text
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
```

This has been observed when the same long-running Node process starts CALL-E
with asynchronous `spawn()` handles and also uses a synchronous child process,
such as `execSync("npm root -g")`, to discover the CLI entry point.

A separate shell-launch symptom can occur when a multiline `--goal` is sent
through `cmd /c`: `cmd.exe` may split or reinterpret the arguments before the
CLI receives them, sometimes surfacing as `Unknown option: --to-phone`.

### Cause

In the reported configuration, the assertion came from Node/libuv teardown in
the embedding process after synchronous and asynchronous child-process paths
were mixed. It is not evidence that the CALL-E CLI rejected the request or
failed internally. The same assertion can have other causes, so apply this
guidance when the host matches the child-process pattern above.

The multiline failure is related but distinct: a command shell parses the
command string before CALL-E sees it, so newlines and quoting may change the
argument boundaries.

### Fix

Keep the embedded CLI launch asynchronous and shell-free from discovery through
process exit:

1. Install `@call-e/cli` as a dependency of the embedding application and
   resolve its published JavaScript entry point during application startup.
2. Start that entry point with the current Node executable and asynchronous
   `spawn()`.
3. Pass every CLI token as a separate array element, including the complete
   multiline goal as one element.
4. Set `shell: false` and wait for the child process to close before tearing
   down the host.

```js
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cliEntry = require.resolve("@call-e/cli/bin/calle.js");

export async function planCall({ phone, goal }) {
  const child = spawn(
    process.execPath,
    [
      cliEntry,
      "call",
      "plan",
      "--to-phone",
      phone,
      "--goal",
      goal,
    ],
    {
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  const [exitCode] = await once(child, "close");
  if (exitCode !== 0) {
    throw new Error(`calle call plan exited with code ${exitCode}`);
  }
}
```

Do not route this integration path through `cmd /c`, a PowerShell command
string, or a package-manager command shim. Do not run
`execSync("npm root -g")` while the host still owns live asynchronous child
handles. If a global CLI install is unavoidable, resolve its absolute entry
path outside the long-running host, inject it as application configuration, and
validate it before starting concurrent child work.

### Verify

First use the same launch pattern with `call plan --help`; this verifies the
shell-free child path and normal process exit without a network request. Then
use `calle call plan` with a multiline goal; planning does not place a call.
Confirm that the integration no longer reports shell argument-parsing errors
and that the child and host processes exit normally. If the assertion remains
in an integration that does not match the pattern above, investigate that
host's other child handles and teardown paths separately.

## `calle call plan` fails with `MCP request timed out for tools/call`

### Symptoms

`calle call plan` exits with this error while authentication and MCP tool
discovery still work:

```text
MCP request timed out for tools/call
```

### Cause

The `plan_call` request took longer than the CLI's effective request timeout.
Current CLI releases allow 150 seconds for `plan_call` by default while keeping
the shared 15-second default for other MCP requests. Older CLI releases used
the shared 15-second timeout for planning too. An explicit
`--timeout-seconds` value overrides either default.

This is a client-side timeout, not an authentication error. Planning does not
place a call, so it is safe to retry after adjusting the timeout.

### Fix

Check the defaults reported by the installed CLI:

```json
["call", "plan", "--help"]
```

If the command used an explicit timeout shorter than planning needs, remove the
flag to use the current planning default or retry with a longer value:

```json
["call", "plan", "--to-phone", "+15551234567", "--goal", "Confirm the appointment", "--timeout-seconds", "300"]
```

If help reports only the 15-second shared default for planning, update the CLI
and retry:

```bash
npm install -g @call-e/cli
```

See the [CLI reference](../../packages/cli/docs/cli-reference.md#common-options)
for the canonical timeout defaults and option behavior.

### Verify

A successful retry prints the planned call payload as JSON. Review the plan and
continue through the normal confirmation flow; do not treat a successful plan
as evidence that a call has already started.
