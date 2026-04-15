# OpenClaw Service Contract

`@call-e/openagent` is a self-contained OpenClaw plugin, but it relies on a compatible remote OpenAgent deployment for authentication and MCP tool execution.

This document describes the HTTP and MCP behavior the plugin expects from that deployment.

## Authentication Endpoints

The remote service must expose the following brokered authentication routes:

- `POST /api/v1/openagent-auth/sessions`
- `GET /api/v1/openagent-auth/sessions/{session_id}`
- `POST /api/v1/openagent-auth/sessions/{session_id}/exchange`
- `GET /openagent-auth/sessions/{session_id}/start`
- `GET /openagent-auth/callback`

### Create Session

`POST /api/v1/openagent-auth/sessions`

Request body:

```json
{
  "server_url": "https://your-domain/mcp/openagent_auth",
  "auth_base_url": "https://your-domain",
  "channel": "openagent_auth",
  "scope": "openid email profile",
  "client_name": "calle Login"
}
```

Expected response:

```json
{
  "session_id": "session-1",
  "session_secret": "secret-1",
  "login_url": "https://your-domain/openagent-auth/sessions/session-1/start",
  "status": "PENDING",
  "expires_at": "2030-01-01T00:00:00Z",
  "poll_after_ms": 2000
}
```

Required fields:

- `session_id`
- `session_secret`
- `login_url`
- `status`

Optional fields:

- `expires_at`
- `poll_after_ms`

### Session Status

`GET /api/v1/openagent-auth/sessions/{session_id}`

Required request header:

- `X-OpenAgent-Session-Secret: <session_secret>`

Expected response:

```json
{
  "session_id": "session-1",
  "status": "AUTHORIZED",
  "expires_at": "2030-01-01T00:00:00Z",
  "error_message": null,
  "poll_after_ms": 2000
}
```

The plugin treats `PENDING` and `AUTHORIZED` as active states. `FAILED`, `EXPIRED`, and `EXCHANGED` terminate the local pending session.

### Exchange Session

`POST /api/v1/openagent-auth/sessions/{session_id}/exchange`

Required request header:

- `X-OpenAgent-Session-Secret: <session_secret>`

Expected response:

```json
{
  "token": {
    "access_token": "token-1",
    "token_type": "Bearer"
  },
  "issued_at": "2030-01-01T00:00:00Z",
  "expires_at": "2030-01-01T12:00:00Z"
}
```

The plugin only requires `token.access_token`. If `expires_at` is omitted, the token is treated as reusable until the remote MCP returns `401` or `403`.

## Browser Login

The plugin returns `login_url` to the user when authentication is required. The deployment must support:

- `GET /openagent-auth/sessions/{session_id}/start`
- `GET /openagent-auth/callback`

These routes are expected to complete a browser-based OAuth flow and advance the session state to `AUTHORIZED`.

## Protected MCP Endpoint

The default protected MCP endpoint is:

```text
https://your-domain/mcp/openagent_auth
```

The plugin can target a different channel or URL if `channel` or `serverUrl` is explicitly configured.

### Request Expectations

The plugin sends JSON-RPC style POST requests and expects:

- `Authorization: Bearer <access_token>`
- `mcp-protocol-version: 2025-11-25`
- `Accept: application/json, text/event-stream`
- `Content-Type: application/json`

It performs the following sequence:

1. `initialize`
2. `notifications/initialized`
3. `tools/call`

If the `initialize` response includes `mcp-session-id`, that value is echoed on subsequent requests.

### Required Remote Tools

The remote MCP server must expose these tool names:

- `plan_call`
- `run_call`
- `get_call_run`

The OpenClaw plugin registers `calle_plan_call`, `calle_run_call`, and `calle_get_call_run`, then forwards those calls to the remote MCP tool names above.

### Error Handling

The plugin treats `401` and `403` responses from the protected MCP endpoint as authentication failures and starts a fresh brokered login flow.
