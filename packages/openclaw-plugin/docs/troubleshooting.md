# Troubleshooting

This page covers common operational issues for `@call-e/openagent`.

## ClawHub install fails with `429 Rate limit exceeded`

Example install command:

- `openclaw plugins install clawhub:@call-e/openagent`

Example error:

- `ClawHub /api/v1/packages/%40call-e%2Fopenagent/download failed (429): Rate limit exceeded`

What this usually means:

- The machine is downloading from ClawHub anonymously.
- The current egress IP has exhausted the anonymous download rate limit.
- The plugin package metadata can still resolve, but the archive download is rejected.

How to fix it:

1. Configure a ClawHub access token for the user running `openclaw`.
2. Create `~/.config/clawhub/config.json`.
3. Store the token there as `accessToken`.
4. Retry the same install command.

Recommended file contents:

```json
{
  "accessToken": "<YOUR_CLAWHUB_ACCESS_TOKEN>"
}
```

If `~/.config/clawhub` does not exist yet, create it before writing `config.json`.

Important:

- Do not put `accessToken` at the root of `~/.openclaw/openclaw.json`.
- `openclaw.json` does not accept a root-level `accessToken` key.
- If you put the token there, OpenClaw CLI commands may fail with `Config invalid`.

What happens after the fix:

- OpenClaw sends authenticated ClawHub requests instead of anonymous download requests.
- The install command can download the package archive without hitting the anonymous `429` limit.

## How do I clear `token.json` and `pending_login.json` and sign in again?

Use this when:

- The plugin keeps returning an authentication-required response.
- The remote MCP endpoint returns `401` or `403`.
- A previous browser login session is stale and you want to force a clean re-authentication.

Default cache location:

- `~/.calle-mcp/openclaw-brokered-auth`

If you use a custom cache root in plugin config:

- Check the `cacheRoot` value in your OpenClaw plugin configuration and remove the files there instead.

Recommended cleanup steps:

1. Stop any in-flight login attempt in the browser.
2. Remove `pending_login.json`.
3. Remove `token.json`.
4. Retry the same plugin tool call.
5. Open the new browser login URL returned by the plugin.
6. Finish the browser login flow.
7. Retry the same tool call again after login completes.

Shell example:

```bash
find ~/.calle-mcp/openclaw-brokered-auth -name pending_login.json -delete
find ~/.calle-mcp/openclaw-brokered-auth -name token.json -delete
```

What happens after cleanup:

- The next tool call creates a new brokered login session.
- The plugin writes a new `pending_login.json` file.
- After successful exchange, the plugin writes a new `token.json` file.

If the problem persists:

- Verify the remote broker endpoints listed in the service contract.
- Verify that the remote MCP endpoint is reachable from the machine running `openclaw-gateway`.
- Verify that the configured `serverUrl` matches the environment where the login flow is being completed.
