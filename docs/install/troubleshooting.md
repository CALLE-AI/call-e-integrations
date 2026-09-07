# CALL-E Troubleshooting

Use this guide when CALL-E installation, authentication, or tool verification
fails in a local agent environment.

## Cursor agent shell returns `CONNECT tunnel failed, response 403`

### Symptoms

In Cursor, CALL-E setup may fail even though the local machine has normal network
access. Common symptoms include:

- `npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g`
  fails because sandboxed Git cannot write hooks.
- `calle auth login` fails with a generic `fetch failed` error.
- A direct network check fails with:

  ```text
  curl: (56) CONNECT tunnel failed, response 403
  ```

- The agent environment reports limited or allowlist-only network access.

### Cause

The `403` is returned by Cursor's sandbox network gate before the request reaches
CALL-E. It is not a CALL-E authentication failure and does not mean the CALL-E
server rejected the user.

The sandboxed agent shell may block outbound HTTPS connections to
`https://seleven-mcp-sg.airudder.com`, which prevents the CLI from starting the
brokered OAuth flow.

### Fix

Change the local Cursor agent execution mode so commands are not running in the
restricted sandbox:

1. Open Cursor Settings.
2. Go to **Agents**.
3. In **Auto-Run**, open **Auto-Run Mode**.
4. Select **Run Everything (Unsandboxed)**.

After switching to a non-sandboxed mode, retry the CALL-E login or setup check.

### Cursor Setting Screenshot

![Cursor Auto-Run Mode setting showing Run Everything Unsandboxed](../assets/troubleshooting/cursor-agent-execution-mode.png)

### Verify

Outside the restricted sandbox, follow
[CLI entry point selection](../../packages/cli/docs/cli-reference.md#selecting-the-cli-entry-point)
and set `CALLE_CLI_ENTRY` before running:

```bash
node "$CALLE_CLI_ENTRY" auth login
node "$CALLE_CLI_ENTRY" auth status --json
node "$CALLE_CLI_ENTRY" mcp tools
```

Confirm that authentication is usable and that the tool list includes:

```text
plan_call
run_call
get_call_run
```

If the same URL works from the user's terminal but fails only inside the Cursor
agent shell, the issue is the Cursor sandbox policy rather than CALL-E service
availability.

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

```bash
node "$CALLE_CLI_ENTRY" call plan --help
```

If the command used an explicit timeout shorter than planning needs, remove the
flag to use the current planning default or retry with a longer value:

```bash
node "$CALLE_CLI_ENTRY" call plan \
  --to-phone +15551234567 \
  --goal "Confirm the appointment" \
  --timeout-seconds 300
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
