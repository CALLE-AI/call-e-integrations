# CALL-E Examples

These examples are runnable MCP client demos. They are not a CALL-E SDK and do
not define a supported application API.

| Example | Purpose |
| --- | --- |
| [Standard MCP OAuth clients](./mcp-oauth-client) | TypeScript and Python clients using the standard MCP OAuth flow over Streamable HTTP. |
| [CALL-E broker login MCP clients](./mcp-broker-client) | TypeScript and Python clients using CALL-E's brokered login, local token cache, and MCP HTTP calls. Includes both `@call-e/core` and standalone TypeScript versions. |
| [Python batch runner](./python-batch-runner) | Python JSONL batch runner using `calle` CLI auth state, FastMCP, Rich output, and MCP tool-call metadata. |

The default e2e tests use a local fake broker/OAuth/MCP server, so they do not
require real CALL-E credentials or browser login. Live verification against the
real CALL-E service is opt-in through each example README.
