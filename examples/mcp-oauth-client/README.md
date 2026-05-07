# Standard MCP OAuth Client Examples

Minimal TypeScript and Python clients for the standard MCP OAuth flow over
Streamable HTTP. These examples are intentionally small demos, not a CALL-E SDK.
They keep tokens in memory and should not be copied into production as-is.

## Configuration

```bash
export MCP_SERVER_URL='https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth'
export MCP_REDIRECT_URI='http://127.0.0.1:8090/callback'
export MCP_SCOPE='openid email profile'
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
Do not publish it because live runs may include a browser authorization URL.

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

```bash
cd examples/mcp-oauth-client/typescript
pnpm install --ignore-workspace --lockfile=false
pnpm start
pnpm check
pnpm test:e2e
```

## Python

```bash
cd examples/mcp-oauth-client/python
uv sync
uv run python client.py
uv run python -m py_compile client.py
uv run pytest
```

## Automated And Live Checks

The default e2e tests start `examples/shared/fake-mcp-broker-server.mjs` and run
without real OAuth or CALL-E credentials.

Live checks are opt-in:

```bash
export CALLE_EXAMPLES_LIVE=1
export MCP_SERVER_URL='https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth'
```

Live checks may require a browser login and should not run in CI by default.
