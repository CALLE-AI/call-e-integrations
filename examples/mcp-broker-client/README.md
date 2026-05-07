# CALL-E Broker Login MCP Client Examples

Minimal TypeScript and Python clients for CALL-E's brokered login flow. These
examples are runnable demos, not a CALL-E SDK.

The broker flow is different from standard MCP OAuth:

- The client asks the CALL-E broker to create a pending login session.
- The broker returns a `login_url`, which the user opens in a browser.
- The client polls the pending session and exchanges it for a token after the
  user authorizes.
- MCP calls then use the same Bearer token shape as any other MCP HTTP client.

## Configuration

```bash
export MCP_BASE_URL='https://seleven-mcp-sg.airudder.com'
export MCP_SERVER_URL='https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth'
export MCP_BROKER_BASE_URL="$MCP_BASE_URL"
export MCP_AUTH_BASE_URL="$MCP_BASE_URL"
export MCP_SCOPE='openid email profile'
export MCP_CACHE_ROOT="$HOME/.calle-mcp/examples/broker"
```

Optional tool call:

```bash
export MCP_TOOL_NAME='plan_call'
export MCP_TOOL_ARGS_JSON='{"user_input":"Plan a short test call to +15550101001 in English. Do not start it."}'
```

Optional log file for long manual runs:

```bash
export MCP_LOG_FILE=/tmp/calle-mcp-example.log
```

The log file receives the same JSON events printed to stdout, plus timestamps.
Do not publish it because live runs may include a browser login URL.

## Plan Call Example

`plan_call` creates a CALL-E call plan. It does not start the call; running the
call is a separate `run_call` step that these minimal client examples do not
perform.

TypeScript:

```bash
MCP_TOOL_NAME='plan_call' \
MCP_TOOL_ARGS_JSON='{"user_input":"Plan a short test call to +15550101001 in English. Do not start it."}' \
MCP_LOG_FILE=/tmp/calle-mcp-example.log \
pnpm start
```

Python:

```bash
MCP_TOOL_NAME='plan_call' \
MCP_TOOL_ARGS_JSON='{"user_input":"Plan a short test call to +15550101001 in English. Do not start it."}' \
MCP_LOG_FILE=/tmp/calle-mcp-example.log \
uv run python client.py
```

## TypeScript

Because this repository has a pnpm workspace at the root, run the install
command exactly as shown below. Plain `pnpm install` from an example directory
will install the root workspace and can leave the example's local `node_modules`
missing.

Core-backed version:

```bash
cd examples/mcp-broker-client/typescript
pnpm install --ignore-workspace --lockfile=false
pnpm start
pnpm check
pnpm test:e2e
```

Standalone version with no `@call-e/core` dependency:

```bash
cd examples/mcp-broker-client/typescript-standalone
pnpm install --ignore-workspace --lockfile=false
pnpm start
pnpm check
pnpm test:e2e
```

If the cached token exists locally but the MCP server rejects it with 401, the
client removes the stale token and pending session cache once, then restarts the
broker login flow and prints a fresh `login_url`.

## Python

```bash
cd examples/mcp-broker-client/python
uv sync
uv run python client.py
uv run python -m py_compile client.py
uv run pytest
```

## Automated And Live Checks

The default e2e tests start `examples/shared/fake-mcp-broker-server.mjs` and run
without real CALL-E credentials or browser login.

Live checks are opt-in:

```bash
export CALLE_EXAMPLES_LIVE=1
export MCP_BASE_URL='https://seleven-mcp-sg.airudder.com'
export MCP_SERVER_URL='https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth'
```

Live checks may require browser authorization and should not run in CI by
default.
