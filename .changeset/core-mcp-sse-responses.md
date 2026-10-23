---
"@call-e/core": patch
---

Decode `text/event-stream` MCP responses instead of returning an empty result. The client reads the stream incrementally, returns the JSON-RPC response that matches the request id and stops reading as soon as it arrives. JSON-RPC errors in the stream are surfaced as errors. Streams that are empty, truncated, malformed, larger than 8 MiB or longer than 10,000 events are rejected with an `mcp_protocol_error`. The limits can be overridden with `maxSseResponseBytes` and `maxSseEvents` in the client config.
