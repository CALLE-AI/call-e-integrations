# Cue remote OAuth MCP control tests

Date: November 3, 2026 (Asia/Shanghai).

Purpose: compare independent providers' OAuth behavior in Cue with the earlier
[CALL-E OAuth diagnosis](cue-oauth-diagnosis-2026-11-03.md). Provider selection,
official endpoints, Google-login sources, free-account requirements, and
excluded confounders are recorded in the
[control-service research](../research/cue-oauth-control-services-2026-11-03.md).

## Setup and boundaries

- Physical USB-connected iPhone XS, iOS 18.7.10.
- Cue `ai.manus.agents`, version `26.18.8`, build `16`, rechecked from the device.
- A fresh Cue agent named `MCP OAuth test` was created for this comparison.
- Each provider is requested through native custom-URL MCP setup, avoiding an
  intentional substitution with a prewired catalog connector. Any actual
  reclassification or reuse must be reported.
- Only one OAuth flow is active at a time. Any missing credentials, ambiguous
  account choice, or new onboarding input require the user. The existing sole
  signed-in Google account may be selected within the user's requested Google
  connection test; each actual account selection and approval is recorded below.
- No business writes, paid trials, database/project provisioning, phone calls,
  API-key workarounds, proxies, or manual OAuth clients are authorized.
- A minimal safe read may be used only after authentication, if the actual
  discovered tool semantics permit it without inventing resource identifiers.
- Credentials and temporary OAuth parameters are excluded from this record.

## Comparison stages

Configuration, opening the provider login flow, user consent, host callback and
authenticated state, fresh runtime tool discovery, and an optional safe read
are separate observations. Tool names or a host enablement success indication
alone are insufficient evidence of completed OAuth.

| Provider | Endpoint | Current observed stage |
| --- | --- | --- |
| Linear | `https://mcp.linear.app/mcp/readonly` | Passed: host reported authenticated and token present; one actual `get_workspace` read succeeded |
| Notion | `https://mcp.notion.com/mcp` | Skipped on user request; new test entry remains disabled because the session refused deletion; no login or business call performed |
| Neon | `https://mcp.neon.tech/mcp` | Passed: host reported authenticated and token present; one actual `list_organizations` read succeeded |

## Linear: first control

The agent was instructed to test only Linear, inspect before creating, reuse
only an exact matching test connection, preserve unrelated configuration, and
stop at the login handoff without business calls or further provider setup.

Cue reported an empty custom-connector list and no same-name test connection.
It reported creating `Linear OAuth test` with the supplied read-only URL. A
message included a provider authorization URL; its temporary parameters are
not retained here.

Cue distinguished the native enablement-review card from the provider's OAuth
login/consent page. It reported that the first enablement submission failed
because local connector settings were missing, and that loading settings and
retrying the submission succeeded. These are Cue's reported management results,
not direct Codex calls to its backend.

The operator observed the native card for `Linear OAuth test` and selected
Continue within the user's connection-test request. A screenshot then showed
the actual iOS prompt asking to let Cue use `linear.app` to sign in. This is
independent UI evidence that the sign-in handoff began. It does not establish
provider authentication, user consent, or callback completion.

The user was initially asked to continue with Google, complete any necessary
free onboarding, and report completion or an error. When the system prompt
remained open, the operator advanced it within the authorized setup request.
The provider page then displayed `Manus is requesting access`, with the actual
requested access `Read, Identity, Email address`.

After exposing the bottom of that page and checking the displayed scope, the
operator selected Approve as part of the requested read-only connection test.
No credentials were entered by the operator. The next page's address metadata
identified `linear.app`. It displayed
`Network error while loading` and asked to reload. One Reload action in the
same existing flow produced the same error. No account-selection or credential
input step was completed, and no successful callback was observed.

A cancel action was attempted while the page was transitioning, but the window
did not close. The intended next-provider message was blocked by a native-chat
guard and was not sent. Subsequent UI inspection showed the existing flow had
continued to Google's Choose an account page for Linear. The loading error was
therefore transient, not an established terminal failure.

The operator corrected the user-facing status and prepared to use the sole
existing signed-in Google account. That action's guard found that the account
picker had already changed, so no account-selection action was executed by the
operator. The next snapshot showed Loading. The cause of this transition and
any user interaction are unconfirmed until the user or final host state supplies
evidence. No credentials or token values were read or entered. No replacement
Linear flow or Notion flow was started. New account/workspace input, if required,
remains a user handoff.

The user then reported completing authorization and returning to Cue. Native UI
inspection confirmed the test chat was visible again. The agent was asked to
verify the existing connection through native management, report current saved
metadata and authentication without secrets, discover runtime tools, and perform
at most one safe identity read if available. A user completion message and a
return to chat alone were not treated as proof that the host retained a token.

### Linear verification result

Cue's final verification report stated:

- The current management record had `kind=builtin`, `enabled=true`, and
  `editable=false`. It omitted a saved URL, so the current record's URL remained
  unavailable; the creation receipt retained the requested read-only endpoint.
- Native auth status exposed `OAuth support=true`, `authenticated=true`, and
  `stored token=true`, without exposing a token value.
- Runtime discovery exposed `get_workspace`. Cue called it once, and the
  operation succeeded. Returned workspace-identifying values were omitted from
  the test report. No issues or projects were read and no writes were made.
- One tool-list attempt briefly required login. Cue stopped that pending prompt
  rather than starting a second flow; the final authenticated status and actual
  successful read are the stronger evidence of usability.

The native card also displayed Applied after the user returned. Host auth and
the successful safe read support a positive Linear control result. The
`builtin`/non-editable representation alone is not a defect indicator: the
successful Linear connection shares that representation with the earlier
CALL-E record.

## Notion: skipped at the user's request

After Linear passed, a custom-URL Notion test request was submitted. The user
immediately requested that Notion not be tested. A stop-and-cleanup message was
sent before any operator approval of a Notion card or login. It instructed Cue
to stop that provider, remove only a newly created exact test connection if one
existed, preserve Linear and unrelated connections, and avoid new OAuth or
business calls. No Notion result is counted as a test pass or failure.

Cue reported that the exact new test entry could not be removed because
`this session won't allow connector deletions`. It remained present but disabled.
The report did not provide an underlying error code or establish the scope of
the restriction beyond that session. It reported no Notion login or tool call
and no changes to Linear or unrelated connections. The deletion refusal was
not worked around through another interface. The next request explicitly kept
Notion cancelled and disabled.

## Neon: second active control

The next request selected only `Neon OAuth test` at the official remote URL,
using the same native custom-URL HTTP/OAuth setup pattern. It required inspection
before creation, preservation of Linear, one login flow at a time, and no manual
API-key fallback, proxy, paid trial, SQL, or project/branch creation.

The native UI reached Google's account chooser for `neon.tech`. A guarded
operator account-selection attempt found that the page had already advanced,
so no account action was performed. The next observed page asked to authorize
Neon MCP Server. Its visible permissions included creating, reading, modifying,
and deleting projects and organizations, plus modifying organization permissions.
That was a full management grant, not a read-only OAuth grant.

The operator left that page for the user to review and explicitly disclosed its
scope. The user then reported Neon authorization had succeeded. On return to
the native test chat, the card displayed Applied and Cue reported
`OAuth support=true`, `authenticated=true`, and `stored token=true`.

Cue reported finding no exact custom test match, creating the new connection
through URL mode, and recording the intended endpoint in its creation receipt.
The current management representation was again `kind=builtin`, `enabled=true`,
`editable=false`. It reported no SQL, project/branch changes, or other writes,
and did not start a second login after finding authenticated state.

The final check reuses that positive auth result and requests current runtime
discovery plus at most one safe account/organization identity read if an actual
tool permits it. It excludes SQL, project/branch creation or content reads,
business writes, API keys, and further Notion setup. The result is recorded below.

### Neon verification result

Cue reported freshly invoking runtime `tool.list`, finding `list_organizations`,
and retrieving that tool's parameter schema with `tool.get`. It then called
`list_organizations` once without a filter. The operation returned one
organization record; identifying values were omitted from its report. It
reported no SQL, project/branch/content read, or write, and no further Linear
calls. Discovery and the schema were reported as fetched during this run rather
than reused from cached definitions.

Together with the observed native return, user completion report, and explicit
host authenticated/token-present state, this supports a positive Neon control
result. The broad grant was reviewed and completed by the user; the actual test
actions remained limited to setup and one safe identity-metadata read.

## Anonymous public metadata comparison

Separate anonymous GET requests used the same explicit diagnostic User-Agent
against the two controls and CALL-E. They did not register clients, start an
OAuth flow, send tokens, or perform authenticated business requests. Each
endpoint returned a 401 resource-metadata challenge, and each advertised
metadata document returned HTTP 200.

| Service | Endpoint path | Declared resource path | Authorization-server issuer |
| --- | --- | --- | --- |
| Linear | `/mcp/readonly` | `/mcp/readonly` | `https://mcp.linear.app` |
| Neon | `/mcp` | `/mcp` | `https://mcp.neon.tech` |
| CALL-E | `/mcp/openagent_oauth` | `/mcp` | `https://dashboard.heycall-e.com/mcp-auth` |

The exact challenged documents were
[Linear](https://mcp.linear.app/.well-known/oauth-protected-resource/mcp/readonly),
[Neon](https://mcp.neon.tech/.well-known/oauth-protected-resource/mcp), and
[CALL-E](https://seleven-mcp-sg.airudder.com/.well-known/oauth-protected-resource/mcp).
CALL-E differs in resource-path shape and uses a cross-origin issuer with a
path component. These are compatibility investigation candidates, not proof of
invalid metadata or the actual failed Cue request. The
[MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#canonical-server-uri)
defines canonical resource identifiers and path-aware issuer discovery; deciding
whether Cue and CALL-E disagree on these values requires the actual failing
discovery/registration/authorization trace. No production setting was changed.

## Interpretation limits

The requested active controls are complete: Linear and Neon both reached
authenticated/token-present host state and returned one successful actual safe
read each. Notion was skipped on the user's instruction and is not counted as
a success or failure. No Todoist test was started; its optional research does
not represent an additional phone result.

These results rule out the claim that all remote OAuth MCP authentication is
broken in this Cue environment. They narrow the earlier problem to the CALL-E
and Cue integration path, but do not identify fault ownership, prove a CALL-E
server defect, or establish universal custom-client/DCR compatibility. The
management wrapper's `builtin` classification also occurred on both successful
controls and is not independently diagnostic. Actual discovery/registration,
authorization handoff, and token-exchange evidence for CALL-E would still be
needed to distinguish service configuration from Cue-specific compatibility.

Native screens directly establish the provider handoffs, displayed permissions,
and return to the test chat. Management-state and remote-read details above are
Cue's reports in that inspected conversation; raw remote protocol traces were
not exported. No personal values, credentials, or temporary authorization
parameters are included here.

The test agent and successful Linear/Neon connections are retained for review.
The disabled Notion test definition remains because of the reported deletion
restriction. CALL-E was not reinstalled, and no CALL-E connection was recreated
as part of these provider controls. Prior conversations, the phone's saved
installation-guide note, unrelated configuration, and production settings were
not changed.

## Release decision

- Decision: **No release needed**.
- Affected packages: none.
- Changeset: not needed; no empty changeset added.
- Reason: dated research and on-device verification evidence only; no packaged
  behavior, installation guide, or integration metadata changed in this test.
- Suggested version bump: none.
- Follow-up release commands: none.

Validation: the research and control records passed English-content, whitespace,
relative-link, and temporary-parameter checks; the public metadata status and
resource-comparison assertions passed; `git diff --check` passed. The USB
WebDriver runner started for this test was terminated, and a fresh process
query found no remaining WebDriver runner. Cue and the test state were retained.
