# @call-e/core

`@call-e/core` contains shared CALL-E runtime helpers for brokered authentication, private local token cache files, JSON HTTP requests, and MCP streamable HTTP tool calls.

This package is used by CALL-E integrations such as `@call-e/cli`. It is not a standalone CLI, OAuth server, or MCP server.

## Modules

```js
import { tokenCachePath } from "@call-e/core/cache";
import { createBrokerSession } from "@call-e/core/broker-client";
import { callMcpTool } from "@call-e/core/mcp-client";
```

Public subpaths:

- `@call-e/core/constants`
- `@call-e/core/config`
- `@call-e/core/cache`
- `@call-e/core/http`
- `@call-e/core/broker-client`
- `@call-e/core/mcp-client`

## Development

```bash
pnpm --filter @call-e/core test
pnpm --filter @call-e/core check
pnpm --filter @call-e/core pack:dry-run
```
