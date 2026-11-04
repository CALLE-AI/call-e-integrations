# Python CALL-E Broker Login MCP Example

Run:

```bash
uv sync
uv run python client.py
uv run pytest
```

The client uses `MCP_CACHE_ROOT` for token and pending-login cache files. It
does not print access tokens, refresh tokens, or broker session secrets.
It accepts login URLs only from the configured broker or auth origin over HTTPS
or configured HTTP loopback, and discards invalid cached sessions before use.
