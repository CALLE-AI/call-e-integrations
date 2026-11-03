# Remote OAuth MCP controls for Cue

Research date: November 3, 2026 (Asia/Shanghai).

Purpose: select independent, official remote MCP services for comparing Cue's
OAuth behavior with the earlier CALL-E connection attempt. This note records
public documentation only. It does not claim any phone test, Cue configuration,
account creation, or successful authentication.

These are well-known provider candidates, not a measured ranking of the most
popular MCP servers. The selection favors remote HTTP, browser OAuth, Google
sign-in, and a free account path without creating OAuth application credentials.

## Primary controls

| Provider | Exact remote endpoint | Authentication and account requirements |
| --- | --- | --- |
| Linear | `https://mcp.linear.app/mcp/readonly` | Official read-only endpoint. Streamable HTTP, interactive OAuth 2.1 with dynamic client registration. Google authentication and a Free workspace plan are documented. |
| Notion | `https://mcp.notion.com/mcp` | Official recommended Streamable HTTP endpoint. Interactive OAuth is documented for custom MCP clients; MCP works on every Notion plan. Google login is supported. A Notion account and accessible workspace are needed. |
| Neon | `https://mcp.neon.tech/mcp` | Official remote OAuth option requires no local MCP installation. Google account sign-up is documented, and a Free plan without a credit card is available. A Neon account is still required. |

### Linear sources and boundary

The [official MCP guide](https://linear.app/docs/mcp) identifies the primary
Streamable HTTP transport, OAuth 2.1 and dynamic registration, and the
`/mcp/readonly` endpoint that exposes only read tools. The normal `/mcp` endpoint
provides read-write access by default. Use the documented read-only endpoint for
this control instead of assuming that a testing purpose narrows a normal token.

[Login methods](https://linear.app/docs/login-methods) documents Google
authentication for Google-supported email addresses. The
[pricing page](https://linear.app/pricing) lists a Free plan. An account and
workspace may require user onboarding before the OAuth connection can complete.

### Notion sources and boundary

The [official connection guide](https://developers.notion.com/guides/mcp/get-started-with-mcp)
documents the exact remote URL, recommended HTTP transport, custom-client setup,
OAuth, and availability on every plan. Feature access varies by workspace plan.
[Notion login help](https://www.notion.com/help/log-in-and-out) documents Continue
with Google when the account email matches the Google email.

Use the hosted server. The separately distributed local open-source server uses
a different authentication path and would not be an equivalent OAuth control.
Do not confuse external agents connecting to Notion with Notion Agent connecting
to other providers' MCP servers, which is a separate product surface.

### Neon sources and boundary

The [official client connection guide](https://neon.com/guides/neon-mcp-server-github-copilot-vs-code)
documents `https://mcp.neon.tech/mcp` as the remote OAuth option, distinct from
API-key setup. It identifies `/sse` as a deprecated fallback. The guide's setup
commands are not required for a host with native remote MCP management.

The current [account documentation](https://neon.com/docs/manage/accounts)
explicitly describes Google and GitHub social sign-up and associated account
settings. The [pricing page](https://neon.com/pricing) lists a Free plan with no
time limit or credit-card requirement.

Use only the remote URL in Cue. The quick-setup CLI can create an API key and
install other components, which would change the authentication experiment.
Do not create a database project, branch, or SQL query as an authentication
probe. If account onboarding requires resource creation, record that stage as
pending rather than automatically provisioning resources.

## Alternatives and confounders

| Provider | Official endpoint | Reason to exclude from the first comparison or keep only as an exploratory case |
| --- | --- | --- |
| Figma | `https://mcp.figma.com/mcp` | [Official remote-server instructions](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) restrict access to clients in Figma's MCP catalog. Cue's approval is unverified, so rejection could reflect client approval rather than a general OAuth defect. |
| Vercel | `https://mcp.vercel.com` | [Official MCP documentation](https://vercel.com/docs/agent-resources/vercel-mcp) requires reviewed and approved AI clients. Availability on all plans does not remove that client restriction. |
| Canva | `https://api.canva.com/connect/v1/mcp` | [Access documentation](https://www.canva.dev/docs/apps/mcp/access/) requires a registered app, client ID, client secret, and configured redirects. [Google sign-up and a free account](https://www.canva.com/help/sign-up-log-in/) exist, but do not eliminate the client-registration prerequisite. |
| Asana V2 | `https://mcp.asana.com/v2/mcp` | [Integration documentation](https://developers.asana.com/docs/integrating-with-asanas-mcp-server) requires a preregistered MCP app and credentials; dynamic client registration is unsupported. Do not use the deprecated beta SSE URL as a current control. |
| Sentry | `https://mcp.sentry.dev/mcp` | The [official MCP site](https://mcp.sentry.dev/) documents remote HTTP and OAuth/DCR. However, [Sentry's current login help](https://www.sentry.help/en/articles/13964916-can-t-log-in-using-the-login-with-google-option) says regular Google login requires an existing Sentry user with a matching verified email; Google-only access may therefore require additional account setup. |
| GitLab.com | `https://gitlab.com/api/v4/mcp` | [Official MCP documentation](https://docs.gitlab.com/user/model_context_protocol/mcp_server/) documents HTTP, dynamic registration and the Free tier, but requires MCP access allowed for a top-level group. The [public sign-in page](https://gitlab.com/users/sign_in) offers Google. Group setup and policy can confound a fresh-account test. |

## Comparison method

Keep the Cue app version, phone, user, fresh test agent, native custom-URL setup
mechanism, and test order recorded. The primary variable should be the provider
endpoint. A prewired built-in connector may exercise a different OAuth client
and must be reported separately from a custom-URL connection.

For each provider, record these stages independently:

1. The host accepts the exact remote URL and records a connection.
2. A host-generated authorization entry opens the expected provider's page.
3. The user can choose Google sign-in, complete any free account onboarding,
   and review the actual consent request.
4. Cue receives the OAuth completion and reports the connection authenticated.
5. Current runtime tools can be discovered. Distinguish fresh server results
   from cached definitions whenever the host exposes that distinction.
6. Optionally, perform one minimal safe read if its actual schema and semantics
   permit it. Authentication success does not require inventing a resource ID
   or creating provider data to manufacture a test.

Google sign-in supplies an identity; it does not guarantee an existing service
account, workspace membership, completed onboarding, or client approval. Those
steps remain user actions. A read-only test purpose does not imply read-only
OAuth scopes. Do not request purchases or accept paid trials for this test.

Do not restart an active OAuth flow, construct an authorization URL manually,
copy credentials into chat, or persist temporary OAuth parameters. Preserve
unrelated connectors. OAuth consent and Google account selection remain with
the user.

A successful independent control would show that at least one OAuth route works
in Cue, not that CALL-E is faulty. Repeated failure before browser handoff
across independent custom-URL providers would strengthen a common-host-path
hypothesis, but would not isolate Cue from shared account, network, or policy
causes without additional evidence.

## Optional candidate: Todoist

Todoist's official hosted Streamable HTTP endpoint is
`https://ai.todoist.net/mcp`. Its [developer landing page](https://developer.todoist.com/)
documents connecting MCP-compatible clients through OAuth without an API key or
local server. The [OAuth API reference](https://developer.todoist.com/api/v1/#tag/Authorization)
documents unauthenticated RFC 7591 dynamic client registration, public PKCE
clients, and Client ID Metadata Documents. These are host-managed OAuth options,
not instructions to register an app or build an OAuth client manually.

[Account setup help](https://www.todoist.com/help/account-and-billing/account/set-up-your-todoist-account-N6PSTd4CH)
documents Google sign-up. The [pricing page](https://www.todoist.com/pricing)
lists the free Beginner plan, and the
[hosted MCP help article](https://www.todoist.com/help/todoist/todoist-and-ai/connect-todoist-to-an-ai-assistant-xMSzFfHng)
includes Beginner and permits any compatible MCP assistant, including clients
without a native integration.

The important limitation is the grant: that MCP help article explicitly says
the hosted connection requests `data:read_write`, allowing task and project
creation, editing, and task completion. This is an optional common OAuth control,
not a verified read-only replacement for Neon.

Todoist's general OAuth reference separately defines `data:read` as read-only and
allows scopes in dynamic registration. That does not establish that its hosted
MCP accepts a `data:read` grant. No official read-only MCP endpoint or supported
hosted-MCP read-only configuration was found in the reviewed sources. Do not
invent a `/readonly` URL, modify an authorization link, or assume that a narrower
general API scope works against this MCP. Any test must disclose the actual
consent grant to the user and keep business writes excluded from the experiment.
No Todoist phone test or authorization flow was performed for this research.

## Repository impact

This internal research note adds no install commands, supported-client promise,
package behavior, or integration metadata. Earlier verification records and the
tested CALL-E installation guide remain unchanged.

- Decision: **No release needed**.
- Affected packages: none.
- Changeset: not needed.
- Reason: public-source research only; no published artifact changes.
- Suggested version bump: none.
- Follow-up release commands: none.
