<div align="center">

# CALL-E Integrations

**CALL-E is your AI agent for getting phone work done.**

Tell CALL-E your goal, and it handles the phone task end-to-end: it plans, calls, adapts in real time, follows through, and improves along the way.

Use CALL-E directly, or integrate it into agents, platforms, and business systems through Skills, Plugins, SDKs, or APIs.

New users get 20 free calls to get started.

[Website](https://www.heycall-e.com/) · [Try on ClawHub](https://clawhub.ai/call-e-dev/phone-call-calle) · [Get started](#-get-started) · [Troubleshooting](#-troubleshooting) · [Discord](https://discord.gg/6AbXUzUV8w)

![npm](https://img.shields.io/npm/v/@call-e/cli?label=%40call-e%2Fcli)
![Codex](https://img.shields.io/badge/Codex-CALL--E-black)
![Claude Code](https://img.shields.io/badge/Claude%20Code-CALL--E-orange)
![Cursor](https://img.shields.io/badge/Cursor-CALL--E-blue)
![OpenClaw](https://img.shields.io/badge/OpenClaw-ClawHub-purple)
![Hermes Agent](https://img.shields.io/badge/Hermes%20Agent-ClawHub%20Prompt-green)
![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)

</div>

## 💡 Why CALL-E is Different

Unlike traditional voice/calling platforms that rely on prebuilt bots and high-volume calls, CALL-E focuses on goal-driven tasks. You provide a goal, and CALL-E manages the call workflow, adapts dynamically, and delivers structured results, enabling automation of low-frequency, personalized phone tasks that were previously too expensive or custom to automate.

## ✨ Key Features

- **Quick Start** - Start using CALL-E within minutes via direct use or integration through Skills, Plugins, SDKs, or APIs.
- **Goal-Driven Long Tasks** *(in development)* - Define your goal in natural language; CALL-E executes the task from planning to follow-up.
- **Reliable Voice Interaction** - CALL-E handles natural conversation flow, tone, interruptions, and changing call conditions in real time.

## 🧩 Other Features

| Feature | Description |
| --- | --- |
| Live Task Progress | Track task from planning to final result with status, activity history, call outcomes, and next steps. |
| Smart Goal Clarification | Ask missing details before execution (who, when, language, success criteria). |
| Managed Call Execution | Handle number/line setup, outbound dialing, monitoring, and result capture. |
| Actionable Call Results | Return summaries, transcripts, metadata, and recommended next steps. |
| Scheduled & Batch Calling | Schedule individual or batch calls; clarify timing when needed. |
| In-Task Optimization | Learn from prior attempts and adjust next steps. |
| Continuous Improvement | Improve over time based on historical patterns and outcomes. |
| Real-World Voice Runtime | Handle live pickup, voicemail, screening, hold, transfers, silence, interruptions. |
| Use Wherever Work Happens | Integrate via Skills, Plugins, MCP, ChatGPT Apps, SDKs, APIs, or enterprise systems. |
| Built-In Safety & Governance | Number governance, rate limits, concurrency controls, blocklists, kill switches, redacted logs, audit trails. |

## 🚀 Get Started

Choose the integration path that matches how you want to use CALL-E.

| Goal | Use | Start here |
| --- | --- | --- |
| Install CALL-E into an AI agent | Agent Install | Copy the stable prompt below or use the [manual install guide](./docs/install/install-guide.md). |
| Connect a Streamable HTTP MCP client | MCP | Use the [`openagent_oauth` MCP guide](./docs/mcp/openagent-oauth.md). |
| Add CALL-E with a server SDK | SDK *(preview / in development)* | Review the [SDKs](https://docs.heycall-e.com/#/sdks), then use the preview SDK example below. |
| Call CALL-E from your backend directly | API *(preview / in development)* | Review the [API Reference](https://docs.heycall-e.com/#api-reference), then use the preview API example below. |

---

### 🤖 Agent Install

For agent installs, the simplest path is to ask your agent to install CALL-E at
user-level/global scope, so the same agent can use `calle` across projects.

Copy this stable prompt into a local agent that can run shell commands or
install skills:

```text
Install CALL-E for me: https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/docs/install/CALL-E-installation-guide.md
```

The linked guide contains the full install steps, so this prompt can stay
unchanged when those steps evolve.

For manual setup, see the [manual install guide](./docs/install/install-guide.md).

> ⚠️ **Safety notice:** CALL-E can place real outbound phone calls. Always verify the plan, recipient, and user intent before running a phone task.

---

### SDK *(Preview / In Development)*

CALL-E server SDK support is in Phase 1 beta and still under active
development. Treat this section as a compact preview, not a complete or final
integration contract.

Current draft SDK docs:

- [SDKs](https://docs.heycall-e.com/#/sdks)

The SDK docs currently identify the TypeScript beta package as
`@call-e/calle@beta`. Python SDK packaging is still rolling out, with the
`calle-ai` distribution and `from calle import CalleClient` import path
documented for the upcoming Python package.

Set `CALLE_API_KEY` and `CALLE_BASE_URL` from your beta onboarding or the latest
SDK docs before running the example. The sample avoids hardcoding a production
API host because the public SDK docs are still evolving.

Representative TypeScript SDK **Create and wait** sample:

```ts
import { CalleClient } from "@call-e/calle";

const client = new CalleClient({
  apiKey: process.env.CALLE_API_KEY!,
  baseUrl: process.env.CALLE_BASE_URL!,
});

const call = await client.calls.createAndWait(
  {
    task: "Call the recipient and ask whether they can attend Friday lunch in San Francisco.",
    recipient: {
      phone: "+141xxxxxxxx",
      region: "US",
      locale: "en-US",
    },
    resultSchema: {
      type: "object",
      required: ["can_attend"],
      properties: {
        can_attend: { type: "string", enum: ["yes", "no", "unknown"] },
      },
      additionalProperties: false,
    },
    metadata: { workflow_run_id: "wf_123" },
  },
  { idempotencyKey: "wf_123_friday_lunch" },
);

console.log(call.status);
console.log(call.structuredResult);
console.log(call.resultValidation);
```

---

### API *(Preview / In Development)*

CALL-E Developer API support is in Phase 1 beta and still under active
development. Treat this section as a compact preview, not a complete or final
integration contract.

Current draft API docs:

- [API Reference](https://docs.heycall-e.com/#api-reference)

The current API reference covers the Phase 1 server flow:

- `POST /v1/calls` to create a call.
- `GET /v1/calls/{call_id}` to read call state and results.
- `GET /v1/calls/{call_id}/events` to list developer-facing call events.
- `POST /calle/webhook` for terminal call result webhooks.

Not all API surfaces are available in Phase 1. Batch calls, scheduled calls,
cancel calls, and project-level webhook management are still outside the
current beta scope.

Set `CALLE_API_KEY` and `CALLE_BASE_URL` from your beta onboarding or the latest
API docs before running the example. The sample avoids hardcoding a production
API host because the public API docs are still evolving.

Representative API **Create Call** sample:

```bash
curl "$CALLE_BASE_URL/v1/calls" \
  --request POST \
  --header "Authorization: Bearer $CALLE_API_KEY" \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: wf_123_friday_lunch' \
  --data '{
    "task": "Call the recipient and ask whether they can attend Friday lunch in San Francisco.",
    "recipient": {
      "phone": "+141xxxxxxxx",
      "region": "US",
      "locale": "en-US"
    },
    "result_schema": {
      "type": "object",
      "required": ["can_attend"],
      "properties": {
        "can_attend": {
          "type": "string",
          "enum": ["yes", "no", "unknown"]
        }
      },
      "additionalProperties": false
    },
    "metadata": {
      "workflow_run_id": "wf_123"
    },
    "webhook_url": "https://example.com/calle/webhook"
  }'
```

---

## 🧯 Troubleshooting

If installation, authentication, or MCP tool verification fails, start with the
[CALL-E troubleshooting guide](./docs/install/troubleshooting.md).

It covers local agent environment issues such as Cursor sandbox/network
restrictions, `CONNECT tunnel failed, response 403`, `calle auth login` failures,
and verification that `plan_call`, `run_call`, and `get_call_run` are available.

## 🧪 Examples

Runnable MCP client demos live under [examples](./examples):

- [Standard MCP OAuth clients](./examples/mcp-oauth-client): TypeScript and Python clients for standard MCP OAuth over Streamable HTTP.
- [CALL-E broker login MCP clients](./examples/mcp-broker-client): TypeScript and Python clients for CALL-E brokered login, local token cache, and MCP HTTP calls.
- [Python batch runner](./examples/python-batch-runner): Python JSONL batch runner using `calle` CLI auth state, FastMCP, Rich output, and MCP tool-call metadata.

These examples are runnable demos. Supported SDK and API surfaces should be
documented separately from demo clients.

## 🧭 Boundaries

- The CLI is not an OAuth server and not an MCP server. It is a local wrapper over the CALL-E broker API and remote MCP HTTP endpoint.
- CALL-E can be used directly or integrated through Skills, Plugins, MCP, ChatGPT Apps, SDKs, APIs, and enterprise systems.
- SDKs and APIs are supported integration surfaces. Runnable examples are demos and starting points, not the canonical SDK or API contract.
- Codex, Claude Code, OpenClaw, skills.sh, and Hermes Agent integrations intentionally reuse the shared `calle` CLI for authentication, token caching, JSON output, MCP tool discovery, and call workflow shortcuts.
- The Cursor plugin reuses the existing remote CALL-E MCP server and does not implement a new local MCP server or backend.
- The OpenClaw route in this repository does not register OpenClaw-native tools and does not require a gateway restart from this repository.
- Hermes Agent support uses the ClawHub Prompt flow for the published OpenClaw skill; this repository does not maintain a separate Hermes plugin.
- Future Copilot, VS Code, Gemini, Windsurf, Zed, Cline, Roo, Continue, or other ecosystem integrations should add their own ecosystem-specific entry point instead of sharing the Codex, Claude Code, or Cursor marketplaces.

See [docs/agent-integration-layout.md](./docs/agent-integration-layout.md) for layout and marketplace naming rules.

## 🔒 Telemetry / usage data

The `calle` CLI sends best-effort usage telemetry to CALL-E to diagnose installation, authentication, MCP tool availability, and early usage drop-off before a first `plan_call` reaches the server.

CLI telemetry includes an anonymous installation ID, CLI version, integration source such as `cli/cli/<version>`, `codex/codex_plugin/<version>`, `claude/claude_code_plugin/<version>`, `cursor/cursor_plugin/<version>`, `openclaw/openclaw_cli_skill/<version>`, or `skills_sh/skills_sh_skill/<version>`, command stage, outcome, error type, and server host/hash. It does **not** include phone numbers, call goals, OAuth tokens, broker login URLs, full argument JSON, transcripts, or contact data.

Disable CLI telemetry with any of:

```bash
DO_NOT_TRACK=1 calle auth status
CALLE_TELEMETRY=0 calle auth status
calle auth status --no-telemetry
```

Broker and MCP requests still create service-side security, audit, and business operation logs needed to authenticate users and run calls.

## 👩‍💻 Development

This repository uses Node `>=22`, pnpm `>=10.18.3`, Changesets, and GitHub Actions.

```bash
pnpm install
pnpm check
pnpm test
pnpm pack:dry-run
```

Package-specific checks:

```bash
pnpm --filter @call-e/core check
pnpm --filter @call-e/core test
pnpm --filter @call-e/cli check
pnpm --filter @call-e/cli test
pnpm --filter @call-e/codex-plugin check
pnpm --filter @call-e/codex-plugin test
pnpm --filter @call-e/claude-plugin check
pnpm --filter @call-e/claude-plugin test
pnpm --filter @call-e/cursor-plugin check
pnpm --filter @call-e/cursor-plugin test
pnpm --filter @call-e/openclaw-cli-skill check
pnpm --filter @call-e/openclaw-cli-skill test
pnpm --filter @call-e/skills-sh-skill check
pnpm --filter @call-e/skills-sh-skill test
pnpm run check:examples
```

For user-visible package changes, add a changeset. The release workflow publishes changed `@call-e/*` packages to npm and maintains the `@call-e/codex-plugin@latest` and `@call-e/claude-plugin@latest` install aliases.

## 💬 Community

- Website: [heycall-e.com](https://www.heycall-e.com/)
- Discord: [discord.gg/6AbXUzUV8w](https://discord.gg/6AbXUzUV8w)
