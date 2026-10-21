# CALL-E Connect live acceptance attempt — 2026-10-15

Status: **blocked before call submission; neither live path passed**.

This is a historical attempt against the draft available on 2026-10-15. The
current customer Skill uses fixed production endpoints without environment
selection; see the [installation guide](../install/calle-connect.md). The
historical submission and verification results below remain unchanged.

## Scope and source

- Requested sequence: one MCP greeting call, followed by one separately authorized API Key greeting call. Maximum: two new calls, one per interface, with no duplicate write after an unknown outcome.
- Destination: +1******3381. Objective: say hello in English, allow a brief reply, then politely end the short test call.
- Loaded source: [working CALL-E Connect Skill](../../skills/calle-connect/SKILL.md), metadata version **0.2.0**, including current unpublished working files. No legacy CLI Skill or public replacement was loaded.
- Loaded SKILL.md SHA-256: `7a725c2a4e105b88d559e6f81a9824e7884ccb199f4507f5eeed1e1f863a6159`.
- Source fingerprint timestamp: 2026-10-15T07:11:02.090Z (15:11:02 Asia/Shanghai).
- Update check: skipped under the [pinned-version exception](../../skills/calle-connect/references/update-check.md). This task explicitly targets the current unpublished working files. No public version, download, installation, or reload was claimed.
- Selected references: update-check, MCP workflow, connection lifecycle, API workflow, configuration lifecycle, API testing, API contract, and client checks. References were loaded from the working tree as their path was selected.
- Execution used native file access, host tool metadata, plugin discovery, and browser UI. No terminal, CLI client, subprocess, helper proxy, dependency installation, raw MCP client, or REST substitute for MCP was used.

## MCP stage

Target server: https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth. No mapping from this endpoint to a Developer API environment was assumed.

| Stage | Evidence and result |
| --- | --- |
| Configuration | Unverified. Current host tool metadata exposed no target connection-management operation. Native Codex settings access was denied by Computer Use safety policy. No configuration file or token cache was searched. |
| OAuth | Unverified; no host-managed authorization flow or callback completed. |
| Tool discovery | Unknown/incomplete for the target server. The available callable tool catalog contained no identified CALL-E tools. Plugin search returned no matching CALL-E/HeyCall connector. This does not establish that the server itself lacks calling capability. |
| Business read / identity | Not performed / unverified. |
| Submission | Not sent; zero MCP business writes. |
| Acceptance / connection / completion | Not established. |
| Resource IDs | None; actual MCP ID type and tool schema were not discovered. |

The stage stopped at the host setup/discovery boundary before any business write. No unknown call outcome or pending write recovery existed. The next stage was the user's separate API Key test, not an automatic retry or fallback. A compatible host connection to this exact endpoint, host-managed OAuth, and tool loading in the current chat are required to resume MCP verification.

## API Key stage

The official [Dashboard API keys page](https://dashboard.heycall-e.com/account/api-keys) was reached after signing in through the official account/password form using the supplied account. The resulting workspace display label matched the supplied account identifier's local part. This establishes a web session only; it does not authenticate the Developer API or establish an API project binding.

| Stage | Evidence and result |
| --- | --- |
| Runtime | Native file access and an in-process HTTPS request facility are available. Authenticated API transport has not been exercised. |
| Credential source | One new private configuration file was prepared outside the repository, with mode 0600 in a mode-0700 directory. No other secret source was scanned. The API Key remains unset pending user entry. |
| API endpoint | Not configured. The historical draft incorrectly requested endpoint selection; current customer setup uses the fixed production base URL `https://api.heycall-e.com`. No API request was sent during this attempt. |
| Dashboard Key inventory | The page displayed three masked Key rows and an enabled-Key limit of 2/2. Its Create API key control was disabled. One row was labeled Enabled and two Expired; the UI's limit counter was recorded without reconciling those labels. |
| Full Key availability | The page states full Keys are shown only when created or regenerated. No full existing Key was obtained. No Key was created, regenerated, disabled, deleted, or revoked. |
| Read-only API verification | GET /v1/goals?limit=1 was not sent; HTTP status unavailable. |
| API account/project identity | Unverified; no authoritative API identity evidence. |
| Local call preparation | A direct short greeting task and closed scalar result schema were prepared. No Goal/template was selected or executed. |
| Submission | POST /v2/calls was not sent; zero API call writes. |
| Acceptance / connection / completion | Not established. |
| Resource ID / result_status / call_outcome | No server response; not available. |

Private operation records were saved at 2026-10-15T07:15:39Z (15:15:39 Asia/Shanghai). The API record retains the original full request and a single generated Idempotency-Key; the MCP record retains its server and authorized intent, with unknown tool/schema fields left unresolved. Neither record contains credentials. No submission recovery is needed because no business write was sent.

Local preparation checked E.164 shape, closed object schema, scalar-only fields, field count, declared required fields, enum types and uniqueness, and absence of an unrequested webhook. These checks passed locally and do not establish server validation, regional support, balance, calling permission, or a successful greeting.

## Blockers and user action

1. MCP: provide the native host-managed connection/OAuth/discovery capability and expose the actual tools for the documented endpoint in this chat. Native Codex UI access was denied by the computer-use safety layer; it was not bypassed.
2. API: privately save an existing complete production project Key for `https://api.heycall-e.com`, and identify the intended account/project in the prepared private configuration. Do not paste a Key into chat. The [configuration lifecycle](../../skills/calle-connect/references/setup.md) requires the user to obtain/fill the Key; the Agent did not create one or change existing Keys. Resolve any different saved endpoint before sending credentials or requests. The Dashboard's creation limit does not authorize disabling another Key.

For a separately authorized continuation, valid production configuration precedes
the read-only Goals check and account/project verification. A later call requires
covering execution authorization and retains its request and Idempotency-Key.
Do not replay or create calls merely to validate credentials.

## Credential-handling deviation

One source-message retrieval output was insufficiently redacted and exposed the supplied login password in the chat tool trace. This is a test-execution handling failure. The password is omitted from this report, private configuration, operation records, and URLs; no password or token cache was copied. The original source-message objects were cleared from temporary orchestration storage after use. The conversation trace must be treated as sensitive. No password rotation or broader account change was performed.

## Verification and release decision

This attempt is evidence of a setup blocker and an authenticated Dashboard session, not successful live MCP/API acceptance. It submitted **0 of 2 authorized calls**. No unrelated mock/evaluation cases were executed or marked passed. No public verification metadata was updated.

At the time of this attempt, only this report was added inside the repository.
Existing Skill sources and historical verification reports were not edited.
Private configuration, recovery records, and a cropped Dashboard screenshot were
kept outside the repository. Related guidance checked: documentation-maintenance,
release-decision, current Skill references, existing verification record layout,
and package inclusion boundaries. The 2026-10-19 production-only follow-up updated
the endpoint guidance above without changing the recorded attempt or its results.

- Decision: **No release needed**.
- Affected packages: none.
- Changeset: not needed.
- Suggested version bump: none.
- Reason: this root verification report changes no published behavior, API, packaged output, marketplace metadata, installation, or usage semantics.
- Validation: English and redaction review, report link checks, source fingerprint comparison, and private file permission checks. Package test suites were not run for this documentation-only report, consistent with the no-CLI task boundary.
