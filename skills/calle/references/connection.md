# MCP connection, verification, and logout

## Connection target and host responsibilities

| Item | Value or status |
| --- | --- |
| MCP URL | https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth |
| Authentication | OAuth specified by the user; initiated and managed by the host. |
| Business tool inventory / namespace | Discover after connection and apply the [MCP tool policy](mcp.md#current-call-tools-and-legacy-exclusion); host prefixes may vary. |
| OAuth issuer / scopes / client registration | Unverified; let the host discover them rather than prepopulating values. |
| Transport / protocol version | Negotiated by the host and server; not verified by this package. |

This is the fixed production target for the customer-facing Skill; no environment selection is needed. These details are not an importable configuration. Failure of an ordinary webpage GET to the URL does not establish that MCP is offline or OAuth is invalid.

See [public publisher attribution](sources-mcp.md#public-publisher-attribution-verified-on-2026-10-28)
for the official CALL-E and AI Rudder source chain behind this target.

A compatible host manages OAuth registration, callbacks, and the token lifecycle. If the service requires a preregistered client ID/secret, explain the specific missing information and have the user supply it through secure configuration; do not guess or put secrets in chat. Use the host management preference below for configuration, authentication, and authorized cleanup. Do not build an OAuth client or read the host's token cache.

## Identify the requested stage first

- **Existing-connection check, offline check, or preview only:** Inspect existing state and report gaps; do not add a connection or initiate OAuth.
- **First connection or login:** When the user has requested and authorized this work, proceed with available host capabilities without asking for the same authorization again. Connection setup does not authorize dialing or other business writes.
- **First connection with usability verification / read-only integration check:** Complete host authentication, real tool discovery, and one authorized safe read-only call. If no suitable tool exists, explicitly report that business read verification is incomplete.
- **Logout, removal, or revocation:** Handle only the cleanup layers requested by the user and verify their results separately as described below.

First inspect non-secret connection metadata provided by the host. Reuse a connection bound to the target URL whose identity suits this task; do not create a duplicate or overwrite another server with the same name. Record unknown identity as unknown; do not infer account/project from the connection name. If identity is confirmed mismatched, stop related business calls and use a host-supported switch flow within the user's connection/login authorization. Switching webpage accounts does not establish that the existing MCP identity switched.

When the connection is missing, explain the remaining sequence: configure the
production URL in the current host, complete its OAuth flow, then load the
current tools. A missing/unverified status alone is not a setup handoff. Perform
only the stages authorized by the user; for a check-only request, describe the
next step without starting it. Use a confirmed host entry point when available,
and state when the host's specific controls are unknown rather than inventing
menu names.

## Host interface and tool flow

Identify the current host and use its own connection manager. In Codex, use Codex's management capabilities; in Claude Code, use Claude Code's. For other hosts, verify their supported mechanism rather than copying another host's commands. Installed versions and permissions differ, so confirm actual capabilities before selecting an entry point.

Use this preference order for each missing connection-management step:

1. **Native management first.** Use exposed host tools, management APIs, or a permitted settings interface the Agent can operate. Reuse existing authenticated connections; no command fallback is needed when these capabilities suffice.
2. **Official host commands when needed.** If native management is unavailable to the Agent, use the current host's already-installed official MCP management command through a permitted execution tool. Verify its identity and supported syntax from installed help or official documentation. A generic terminal or an executable with a familiar name is insufficient evidence. Execute the authorized setup step rather than asking the user to type it. Do not install or update a host client to obtain this capability.
3. **User assistance for the remaining gap.** If neither permitted mechanism is available, provide the confirmed host settings entry point and target URL, then verify the result when the user returns. Do not invent menus, fabricate success, or install a replacement proxy.

The command exception is limited to host MCP help/status inspection, authorized target connection configuration, OAuth initiation/status, supported connection/tool refresh, and explicitly requested logout or connection removal. It does not permit business tool execution through a command, REST requests, Skill checks/downloads/installation, arbitrary scripts, terminal proxies, package installers, or manually constructed OAuth flows. Tokens remain with the host; display only the target connection's non-secret name, URL, enabled state, and authentication status, never raw configuration or credential fields. Give the user only host-generated authorization links for the active flow; exclude temporary authorization parameters from saved reports.

Respect explicit user no-CLI restrictions, offline/preview scope, and host permission or safety refusals. An unavailable interface is not a permission denial: do not use another mechanism to bypass a denial. A request to connect does not authorize changing unrelated servers, broadening permissions, business writes, or cleanup.

Choose the next step from the actual state:

1. **Inspect existing connections.** Read non-secret metadata through the selected host management mechanism, and output only the target's name, URL, and enabled/authentication state. Do not expose other connections, headers, or credential fields or search configuration files and token caches. Offline and preview tasks use already available metadata without launching commands.
2. **Add a connection only when missing and setup/login is authorized.** Use the selected host management mechanism with the URL in the table. Check for a duplicate display name first; reuse the actual name of an existing target connection. Adding a connection may initiate OAuth; rely on the host's actual result.
3. **Log in only when needed and no authorization flow is already running.** Initiate authentication through the selected host mechanism for the target connection. If adding the connection initiated OAuth, continue that flow instead of starting another. Open the host-generated authorization URL using a permitted browser interface; do not replace it with an ordinary website login URL.
4. **Leave the browser to the user.** The user selects the account, signs in, and consents to the actual permissions. A read-only purpose does not imply read-only OAuth scopes. Follow the host/server's actual display without prepopulating or expanding scopes. Do not ask the user to copy passwords, codes, or tokens. Keep state, challenge, and callback details from temporary authorization links out of shared reports.
5. **Verify host results when the user returns.** Check whether the host authorization operation completed its callback successfully, then verify the target URL and authentication state. The user saying "authorized" or a webpage showing success is insufficient by itself. Distinguish pending authorization, user cancellation, and callback failure. After cancellation, stop without automatically restarting login or deleting saved configuration.
6. **Load tools in the current chat.** If authentication succeeded but the current chat has no tools, use an actually supported refresh/discovery mechanism in the preference order above. A status command reporting authentication does not prove this chat loaded tools. If the Agent cannot refresh them, provide confirmed interface steps to refresh or reopen a session; without evidence, state that tools cannot currently be loaded. Recheck after refreshing. Do not claim an unavailable function was called or repeat configuration/login just to load tools.

Refresh guidance must match the actual host. Historical reference experiments distinguish authentication, tool loading, and read-only call completion; they do not guarantee current host capabilities. See [Sources and applicability](sources-mcp.md).

## Discovery, read-only verification, and completion criteria

MCP `tools/list` may return `nextCursor`. Use the host's actual discovery, search, or loading mechanism and continue available pagination; do not construct raw JSON requests if no protocol-call interface exists. Record discovery completeness as complete, partial, or unknown. Tool names, schemas, and business IDs must come from the current connection, not REST, Xquik, or Overskill.

A read-only integration check requires the following evidence:

| Stage | Completion evidence / limits of inference |
| --- | --- |
| Configuration | The host confirms the connection points to the specified URL; saved configuration alone is not OAuth success. |
| OAuth | The host confirms successful authorization or an existing authenticated state; a browser response does not replace callback evidence. |
| Current tools | Candidate schemas are actually loaded in the current chat, with discovery completeness recorded; a configuration list is not a tool inventory. |
| Business read | Actual tool semantics establish a safe read, required parameters are known, and the current task authorizes it. A real call has no protocol/tool error and returns the information needed for that operation. |
| Identity | Verify only actually returned non-secret account/project references; state "identity unverified" when usable fields are absent. |

Select the smallest necessary permitted read-only operation after reviewing its actual semantics and charges. Apply the [MCP tool policy](mcp.md#current-call-tools-and-legacy-exclusion) before choosing an authentication check; an excluded legacy read tool is not a verification option. `readOnlyHint` is only supporting information; read-only does not automatically mean free. If safety cannot be confirmed, required parameters are missing, or no permitted read-only tool exists, report completed OAuth/discovery and the specific limitation, with business reading unverified. Do not use call preparation or task creation to probe login. Missing identity fields do not negate a real successful read, but the read does not establish account/project alignment.

Successful read-only calls do not establish create/cancel capability, other scopes, account balance, or authorization to dial. A task requesting only tool listing can end after discovery; a task requesting only OAuth ends according to authentication evidence. A completed read-only integration check must include the actual read result above.

## Expiry, permission errors, and cancellation

Let the host refresh tokens automatically. When the host explicitly reports refresh failure or requires reauthorization, recover within the current task's existing login authorization. If the task permits only checking and not renewed login, report the next step and stop login operations. Diagnose network unavailability, 403, and unloaded tools separately; do not classify them all as expired tokens. If a new scope is needed, explain the actual requirement and let the user review the host's consent interface; do not add unrelated scopes.

After the user cancels authorization, report incomplete/canceled OAuth and whether configuration still exists. Resuming requires a user request to continue login. After successful reauthorization, recheck tools and identity and retry only authorized safe reads. Handle writes with unknown outcomes according to recovery rules in the [MCP workflow](mcp.md).

## Four layers of logout and revocation results

Perform only the cleanup requested by the user. Use actions actually supported by the current host and the actual connection name; do not automatically expand "logout" to deleting other accounts or website sessions.

| Layer | Conditional action and evidence |
| --- | --- |
| Local OAuth credentials | Use actual host logout or credential cleanup capabilities in the preference order above for the target connection and check the result. If configuration removal is also requested, first check whether that entry point also clears credentials; otherwise use the separate host cleanup capability. |
| Connection configuration | Use the host connection-removal capability in the preference order above, then check the target connection's state. Configuration removal is not server-side revocation. If no permitted entry point exists, report incomplete removal. |
| Current chat client | Refresh/reload through host-supported means. Old tool definitions remaining or disappearing do not prove that all in-memory credentials were released; state unverified without runtime evidence. After cleanup, do not probe with business tools or automatically reauthorize. |
| Server-side grant/token | Use only an actual host revocation capability or confirmed server account authorization-management interface. CALL-E revocation capability remains unconfirmed; without evidence, report incomplete/unverified. Do not guess an endpoint or export host tokens to construct a revocation request manually. |

Successful local cleanup does not prove that CALL-E server authorization was revoked or every token invalidated. Report success, not performed, or unverified for each layer, plus concrete steps the user still needs to complete in confirmed host/server interfaces.

## Credential isolation and interface selection

Do not send MCP OAuth tokens to the Developer REST API or Developer API Keys to the MCP endpoint. The two paths may belong to different accounts/projects; do not assume shared identity or Call IDs. Authentication failure, authorization cancellation, and logout do not trigger automatic fallback. When a business capability is confirmed missing before execution, return to the [shared entry point](../SKILL.md) for interface selection. Incomplete discovery and permission denial do not meet this condition.
