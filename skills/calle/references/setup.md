# API Key configuration and lifecycle

This Skill provides Agent instructions; it is not a deployed HTTP tool or standalone application. The host needs actual HTTPS request capability that can securely read credentials. A public webpage browser generally cannot replace an authenticated arbitrary HTTP request tool.

## Initial setup and reuse of existing configuration

Use the fixed production API address `https://api.heycall-e.com` without asking the user to select an environment. Keep the single secret source already selected by the user or explicitly bound by the host and the intended project; check configuration only at that bound location. Validate any existing base URL before reading the Key. If it points elsewhere, stop and explain the configuration mismatch; do not silently rebind credentials or existing operation records. If a Key already exists and the URL is compatible, skip account/Key creation and proceed to authorized read-only verification. On first use or when something is missing, fill only the gaps:

1. **Obtain a Key when needed:** A missing binding does not establish that the user has no Key. If the user already has one, skip Dashboard opening and account/Key creation, and proceed to private saving. Otherwise, direct the user to the [CALL-E Dashboard](https://dashboard.heycall-e.com) to sign in or create an account, select the target project, and create or manage its API Key through the current interface. During authorized setup or a call workflow, use the host's permitted native browser-opening capability to open this official page without a separate confirmation, and include the clickable link in the handoff. If opening is unavailable, denied, or unsuccessful, provide the link and say that the page was not opened; do not substitute a CLI or claim success from a queued request. Login and Key creation remain user actions. Public authentication documentation confirms the entry point and project Keys; this package does not establish current menus, permission options, or how many times Keys are displayed. Use the actual interface without inventing those details or creating a Key for the user.
2. **Bind one source:** Use a secret store, trusted runtime environment, or private local file actually supported by the host. If none is bound and exactly one safe entry point is confirmed, provide a concrete storage plan directly. Ask only when multiple sources conflict or the user's preference is needed. Remember the non-secret source reference, variable name, production endpoint, and user-provided account/project label; do not ask again for existing choices. Do not scan secret contents to discover sources or automatically substitute another source.
3. **Prepare storage:** Within the user's authorized setup scope, use actual host tools to prepare an empty secret entry or private empty file and provide an editing interface. Complete the first-use handoff below before waiting for the user to fill in the complete Key privately and reply "saved." A local file is optional private plaintext configuration: first confirm secure reading and injection are supported. When file tools suffice, the Agent sets access restrictions, excludes the file from version control/shared output, and checks its binding. Ask the user to complete only the specific gaps that host capabilities cannot handle. Do not assume `.env` exists or is required; writing a file does not establish host binding. Do not ask for the Key in chat.
4. **Continue the original task:** After the user reports saving, recheck configuration only in the same source; the reply alone does not verify credentials. If read-only checking is authorized, continue with `GET /v1/goals?limit=1` in the [API workflow](api.md). For an already authorized call, this prerequisite check is covered by the call request. After a successful check, resume that same task, phone number, and single-call scope, retaining its authorization without asking again for the interface, known facts, or permission to dial. Follow the API persistence and idempotency rules before submission; an existing or uncertain submission stays on its recovery path. For setup-only authorization, report "configured, not yet verified" and present read-only verification as the next step; a request limited to read access stops after its check. Honor any intervening user change or cancellation. If secure injection or HTTPS capability is unavailable, explain the specific gap and required host capability, retain the preview, and do not read secrets or invent tools/successful results.

### First-use handoff

Before waiting for private Key entry, give one concise message in the user's
language. Make the save instruction the main visible action: use a short bold
lead, put the actual save location on its own line, and name the Key field
separately. A path buried in a paragraph or shown only as a link label is not a
complete handoff. Connect these actions:

- Where to obtain a Key, when needed: the official Dashboard link, whether opening
  actually succeeded, and the sign-in/project/Key steps. For users who already
  have a Key, go directly to private saving without opening the Dashboard or
  asking them to create another Key.
- Where to save it: the actual prepared private editing location and its Key
  field (for example, `CALLE_API_KEY`). For a local file, show its complete
  absolute path on a separate, copyable line; add a clickable entry when the
  host supports one. Say whether the editor actually opened. If it did not,
  give a concrete manual opening step, such as copying the path into a local
  editor's Open File action. Creating a file does not establish that it opened.
  Explain exactly which value to replace, using a short non-secret example
  matching the prepared format. For JSON, replace only the empty quoted value
  of `CALLE_API_KEY`, preserving the field name, quotes, and other settings.
  If no entry could be prepared, label the confirmed manual storage plan as
  not yet created and give the required location, format, and creation step.
  If the host cannot securely read that location, explain the capability gap
  instead of directing the user to an unusable save location.
- What happens next: ask the user to save privately and reply "saved," then state
  the continuation covered by their original request, such as checking access
  and continuing the one requested Hello call.

An empty file alone does not complete this handoff. Keep the message focused on
the user's next action; Skill clause quotations, transport details, and internal
schemas are unnecessary unless they explain a specific blocker or the user asks.

For a prepared JSON file, adapt this layout to the user's language and the
actual path and task. The placeholder is illustrative, never a credential:

> **Next step: save your API Key locally**
>
> **File:**
>
> `<actual absolute path to the prepared file>`
>
> **Field:** `CALLE_API_KEY`
>
> Replace its empty value so the line reads
> `"CALLE_API_KEY": "<paste the complete Key here>"`.
> Keep the quotes and other settings. If the editor is not open, copy the full
> path above into your local editor's Open File action.
>
> Save the file, then reply **"saved"**. I will verify access and continue the
> same requested call.

| Configuration | Meaning |
| --- | --- |
| CALLE_API_KEY | Complete project API Key; inject only from the single source selected by the user. |
| CALLE_BASE_URL | Optional host setting fixed to `https://api.heycall-e.com`. If absent, use this address directly; a missing value requires no user input. Stop on a conflicting value. |
| Private operation storage | Save the original body and idempotency key before creation, then the resource ID after creation. Do not put the API Key in operation records. |

## Request injection

HTTP request header:

```http
Authorization: Bearer <CALLE_API_KEY>
```

The credential is an API Key; Bearer formatting does not make it an OAuth login. If the tool's secure credential setting automatically adds the Bearer prefix, supply only the Key. If it expects a complete Authorization value, configure `Bearer ` followed by the Key. Avoid `Bearer Bearer ...`.

The bundled `openapi-calls.yaml` is an optional, manually compiled core interface description for hosts that actually support OpenAPI import; it is not an automatically active connector configuration. This version uses `type: apiKey` and header=`Authorization`, so the security scheme's value must include the `Bearer ` prefix. Direct import and secret binding depend on the host.

Without such a tool, the Agent may use a standard HTTP library in a trusted code runtime with network access. The current API path must not switch to an SDK, CLI, or self-built MCP proxy. Do not expose project secrets in a webpage frontend, disable TLS verification, or send secrets to additional proxies.

## Verification results and recovery

Distinguish "source selected," "configured but unverified," "specified read-only request succeeded," and failure reasons. Only an actual response establishes a successful read. Provide the environment, non-secret configuration reference, HTTP status, and minimal summary. A project label is a user-provided choice, not server verification. Unless an actually confirmed official read-only endpoint returns authoritative identity, report that account/project identity is unconfirmed; do not invent identity endpoints. Success does not establish balance, regional support, or write permission.

| Observation | Next step |
| --- | --- |
| Not configured | Guide the user to save in the selected source; do not query other credential locations. |
| 200, including an empty Goals list | Record a successful read for this source/environment and reuse the configuration; do not require another Key. |
| 401 | Keep the original source and check the fixed production address and secure injection settings, including the Bearer prefix. If needed, have the user correct/replace the Key in that same source. A 401 alone does not establish expiry or revocation. |
| 403 | Report that the current operation was denied and use the actual error to guide project/Key permission checks. Do not treat it as missing configuration or automatically expand permissions. |
| DNS, TLS, timeout, or no HTTP response | Report transport failure and unverified authentication. Recheck under existing authorization after restoring connectivity; do not declare the Key invalid. |

Stop blind retries after authentication rejection. After configuration is corrected, repeat only the authorized read-only check against the same selected source; do not change interfaces. Do not output Authorization headers or secrets from debug logs.

## Replacement, deletion, and revocation

- **Replace a Key:** After the user replaces it in the same source, mark the old verification state as requiring revalidation, then perform an authorized read-only check. In the completion report, remind the user to revoke the old Key only after its intended callers have switched to and verified the replacement. This read check cannot establish that every caller has switched or that the old Key was revoked; do not revoke it automatically. Update the non-secret binding when the project changes; do not carry successful verification over to a new identity. The production address stays fixed.
- **Calls awaiting recovery:** Replacing a Key does not authorize call recreation or replay. Preserve the original environment, identity, body, idempotency key, and any resource ID. A successful read with the new Key does not establish the same project. Further actions for unknown submission outcomes still follow the main Skill's recovery rules; stop replay if identity cannot be confirmed.
- **Delete local storage only:** On explicit request, use a confirmed secure host deletion capability for the specified source and clear its reusable verification state. If unavailable, guide the user to delete it through the corresponding storage interface. Report the actual outcome; local deletion neither invalidates the server-side Key nor removes the Skill.
- **Server-side revocation:** When requested, direct the user to manage the corresponding project Key in the Dashboard using the currently visible interface or official guidance. This package has no verified revocation menu or management API; do not invent one. Distinguish "awaiting user action," "user reports revocation," and "server confirmed." Do not export or request the old Key again to verify revocation. Uninstalling the Skill also does not revoke a Key.

## Installation and host differences

The standard directory entry point is `calle/SKILL.md`. Add the entire directory in a host supporting directory-based Skills, or select the standalone ZIP in a host supporting Skill ZIP import. Installation menus and ZIP root rules differ across products; this package does not assume a particular product's menu path.

Installing the Skill does not supply an API Key, grant network access, or authorize real dialing.
