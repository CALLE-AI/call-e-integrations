# Cue OAuth follow-up diagnosis

Date: November 3, 2026 (Asia/Shanghai).

This is a read-only follow-up to the
[clean-install validation](cue-clean-install-2026-11-03.md), after the user
continued operating Cue. It preserves the earlier observations and does not
promote the Skill installation result to authenticated MCP acceptance.

## User-visible symptom

The latest test conversation showed the user reporting that tapping the
authorization button displayed success without opening a browser login or
consent page. Cue subsequently continued reporting an unauthenticated state.
This is a user-reported success indication, not an independently captured
successful OAuth callback.

The follow-up authorized checking the existing connection and diagnosing the
failure. No new authorization flow, connector replacement, business tool call,
call preparation, or phone call was initiated during this diagnosis.

## Cue management evidence

The following action names and sanitized results were reported by Cue in the
phone conversation. Codex inspected those messages through the native UI;
Codex did not directly execute Cue's backend management actions.

- `auth.status` on server `call-e` reportedly returned:
  `MCP auth status for call-e: unauthenticated. OAuth support: yes. Stored token: no.`
- The prior `auth.login` result reportedly said login had started and that the
  user should finish the login card. No error code or diagnostic error message
  was included. This diagnosis did not invoke login again.
- `manus-config connector get` reportedly returned the relevant fields
  `name=CALL-E`, `kind=builtin`, `enabled=true`, `editable=false`.
- The current connector record did not expose its saved URL or authentication
  mode. The production URL was present in the original `manus-config connector
  ensure` request, which reportedly used `mcp/http` and URL mode. The creation
  request is evidence of the requested target; it does not independently verify
  the current stored target or explain the `builtin` classification.
- `mcp.tool.list` on `call-e` reportedly returned the CALL-E tool names without
  an error. Cue could not determine whether this represented a fresh remote
  `tools/list` request or loaded/cached definitions. No separate runtime refresh
  action was exposed. Tool visibility therefore did not prove authentication.

These observations refine the earlier configuration claim: native added-app
inspection confirmed a CALL-E MCP entry, and creation specified the expected
URL, but the current management record did not independently reveal that URL.
No credentials or token cache were inspected.

## Public OAuth discovery checks

Unauthenticated, read-only HTTP requests were made without creating an OAuth
client, authorization session, or token:

| Check | Observed result |
| --- | --- |
| GET production `/mcp/openagent_oauth` | HTTP 401 with a Bearer `resource_metadata` challenge |
| GET the challenged protected-resource metadata | HTTP 200; resource ended in `/mcp`, issuer was `https://dashboard.heycall-e.com/mcp-auth` |
| GET the MCP origin's authorization-server metadata proxy without following redirects | HTTP 307 to the issuer's `/mcp-auth/.well-known/oauth-authorization-server` |
| GET that redirect target with an explicit diagnostic User-Agent | HTTP 200 with OAuth metadata |
| GET `https://dashboard.heycall-e.com/.well-known/oauth-authorization-server/mcp-auth` with the same diagnostic User-Agent | HTTP 200 with matching OAuth metadata |

Both successful authorization-server metadata responses advertised authorization,
token, and registration endpoints, PKCE `S256`, and token endpoint authentication
methods `client_secret_post` and `none`. This establishes public discovery
availability for those requests, not working client registration, user consent,
code exchange, token persistence, or Cue compatibility.

An initial request to the path-insertion metadata URL using Python's default
User-Agent received Cloudflare HTTP 403, error `1010`,
`browser_signature_banned`, at `2026-11-03T06:23:14Z` (14:23:14 Asia/Shanghai).
The same URL later returned HTTP 200 with the explicit diagnostic User-Agent
`CALL-E-read-only-diagnostics/1.0`. No browser identity was impersonated or site
security setting changed. Cue's outbound request signature and response were
not available, so this is a client compatibility lead, not an established cause
of the Cue failure.

The [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#authorization-server-metadata-discovery)
documents path-insertion discovery for issuers with a path component.
[Cloudflare's Error 1010 documentation](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)
explains the browser-signature rejection and identifies the default Python
client signature as one possible trigger. Neither source diagnoses this Cue
connection.

## Production inspection and limits

The `infra-troubleshoot` read-only wrappers were used against registered target
`calle-prod-sg`, namespace `prod`, through JumpServer's configured restricted
kubectl session. Preflight succeeded. The targeted `seleven-mcp` deployment
reported 20 ready and updated replicas, with image tag
`20261103115535-seleven-mcp-bdf8dfb3`.

The initial workload summary was partial: permissions denied listing
StatefulSets and DaemonSets. Those resources were not retried through another
mechanism. A permitted, targeted Deployment read succeeded.

Historical log queries starting at `2026-11-03T06:10:00Z`, filtered for the
missing-bearer authentication message, timed out after 60 seconds on two MCP
server pods. A smaller query for the newest 100 lines within 20 minutes on one
pod completed with `no_match=true`, `coverage=tail-bounded`. This sample does not
establish absence across the deployment or incident window. No Cue request was
correlated with a server authentication event. Raw production logs were not
saved to the repository, and no production state was changed.

## Conclusion

OAuth success remains unverified; Cue's reported host status is explicitly
unauthenticated with no stored token. The login action's started result and the
button's reported success indication are insufficient to establish completion.
Public OAuth metadata is reachable with the tested diagnostic client.

The exact cause remains unresolved. The missing visible login handoff makes
Cue's authorization entry and connection binding relevant investigation points.
Client-signature filtering remains a separate possibility. There is no captured
callback error supporting the earlier claim that the callback itself failed.
Resolving that distinction requires Cue's actual flow trace tied to the existing
connector, including discovery/registration, browser handoff, and callback/token
exchange results, without exposing secrets.

The installation conclusion is unchanged: the revised guide led to the correct
complete GitHub directory, the operator completed Cue's native import, and Cue
reported loading `calle` version `1.0.4` with references. This was a successful
native installation handoff, not proof of unattended CLI installation or OAuth.

Release decision: **No release needed**. Affected packages: none. Changeset:
not needed. Suggested version bump: none. This follow-up adds diagnostic evidence
only; the tested guide and packaged artifacts are unchanged. Follow-up release
commands: none.

Validation: public-probe status and issuer assertions passed, the tested guide's
SHA-256 was unchanged, this record passed English-content, local-link and
whitespace checks, and `git diff --check` passed. The USB test runner was
terminated and a fresh device process query found no remaining WebDriver
runner. The Cue Skill, connector, and conversations were preserved.
