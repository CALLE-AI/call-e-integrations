# `@call-e/openagent`

`@call-e/openagent` is a self-contained OpenClaw plugin for brokered web login and remote OpenAgent MCP tool execution.

It registers three OpenClaw-native tools:

- `calle_plan_call`
- `calle_run_call`
- `calle_get_call_run`

The package contains the full runtime needed to:

- create and reconcile brokered authentication sessions
- persist `token.json` and `pending_login.json`
- exchange authorized broker sessions into a local token cache
- call remote MCP tools over streamable HTTP

## Community

Join the Discord community for installation help, rollout updates, and feedback:

- [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)

## Installation

Install on the machine that runs `openclaw-gateway`:

```bash
openclaw plugins install @call-e/openagent
openclaw plugins enable calle
openclaw gateway restart
```

For repository-local debugging:

```bash
openclaw plugins install ./packages/openclaw-plugin --link
openclaw plugins enable calle
openclaw gateway restart
```

## Install Walkthrough

Example terminal session for installing, enabling, and restarting the plugin:

![Terminal install walkthrough](./docs/images/terminal-install.png)

## OpenClaw UI Chat

Example OpenClaw Control UI chat session with the plugin:

![OpenClaw UI chat using the plugin](./docs/images/openclaw-ui-chat.png)

## Default Target

With no explicit plugin configuration, the plugin targets:

- `baseUrl = https://seleven-mcp-sg.airudder.com`
- `serverUrl = https://seleven-mcp-sg.airudder.com/mcp/openagent_auth`

## Configuration

A minimal `openclaw.json` override looks like this:

```json
{
  "plugins": {
    "entries": {
      "calle": {
        "enabled": true,
        "config": {
          "baseUrl": "https://your-domain"
        }
      }
    }
  }
}
```

The plugin derives the following values from `baseUrl` unless they are explicitly overridden:

- `serverUrl`
- `brokerBaseUrl`
- `authBaseUrl`
- `channel`
- `cacheRoot`
- `scope`
- `clientName`
- `timeoutSeconds`
- `minTtlSeconds`

## Common Issues

- A brokered login session ID is stuck or keeps failing, for example `019d94db-a3eb-7081-9026-57f813e94a07`.
- You need to clear `token.json` and `pending_login.json` and sign in again.

See [docs/troubleshooting.md](./docs/troubleshooting.md) for the full troubleshooting guide.

## Remote Service Requirements

The remote deployment must expose:

- `POST /api/v1/openagent-auth/sessions`
- `GET /api/v1/openagent-auth/sessions/{session_id}`
- `POST /api/v1/openagent-auth/sessions/{session_id}/exchange`
- `GET /openagent-auth/sessions/{session_id}/start`
- `GET /openagent-auth/callback`
- a protected MCP endpoint, typically `/mcp/openagent_auth`

See the [OpenClaw service contract](https://github.com/CALLE-AI/call-e-integrations/blob/main/docs/openclaw-service-contract.md) for the full remote deployment contract.

## Development

Run the package tests from the repository root:

```bash
pnpm --filter @call-e/openagent test
pnpm --filter @call-e/openagent check
pnpm --filter @call-e/openagent pack:dry-run
```
