# Troubleshooting

This page covers common operational issues for `@call-e/openagent`.

## Quick triage

Use this page when you see one of these symptoms:

- `429 Rate limit exceeded` during `openclaw plugins install`.
- Plugin tool calls keep returning an authentication-required response.
- The remote MCP endpoint returns `401` or `403`.
- Browser login completed, but the next tool call still asks you to authenticate.
- The plugin works in one OpenClaw surface, but not from your current chat surface.

## Before deeper troubleshooting

Check these basics first:

1. Confirm the plugin is installed.
2. Confirm `calle` is present in `plugins.allow`.
3. Confirm `plugins.entries.calle.enabled` is `true`.
4. Restart `openclaw-gateway` after changing plugin configuration.
5. Retry the same tool call once after the restart.

This avoids chasing auth or network issues when the plugin was never loaded by the running gateway process.

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

## Why does the plugin work in Web UI but not from my current chat surface?

What this usually means:

- The plugin itself may be installed and healthy.
- The current OpenClaw surface may not expose the same native tool path as another surface.
- The current chat surface may be falling back to `exec` for related actions.
- That fallback path may require separate exec approval routing or approver configuration.

This can look like a plugin failure even when the plugin was never actually invoked.

What to check:

1. Retry the same operation from another OpenClaw surface, such as Web UI, to confirm whether the issue is surface-specific.
2. Check whether the current chat surface supports native exec approvals.
3. If you use Discord, verify the current gateway config for:
   - `channels.discord.execApprovals.enabled`
   - `channels.discord.execApprovals.approvers`
   - `commands.ownerAllowFrom`
4. If the chat surface falls back to `exec`, verify that the approval prompt can actually be delivered and resolved in that surface.

What happens after the fix:

- The same user action should stop failing at the approval or surface-routing layer.
- The plugin tool call should either execute normally or return a plugin-specific error instead of failing before invocation.

If the problem persists:

- Compare the behavior between Web UI and the failing chat surface.
- Confirm that the running gateway has reloaded the latest channel approval configuration.
- Confirm that the plugin is being reached at all, rather than failing in a pre-plugin approval path.
