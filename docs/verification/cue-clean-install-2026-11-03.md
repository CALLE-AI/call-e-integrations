# Cue clean-install candidate validation

Date: November 3, 2026 (Asia/Shanghai).

Scope: At the user's request, remove the existing CALL-E Skill configuration and
test the revised generic installation guide in Cue. This record is separate
from the earlier [GitHub import comparison](cue-github-skill-import-2026-11-03.md).

## Candidate and delivery

- Physical iPhone XS, iOS 18.7.10.
- Cue `ai.manus.agents`, version `26.18.8`, build `16`.
- Candidate: local `docs/install/CALL-E-installation-guide.md`, 2287 bytes.
- Candidate SHA-256:
  `c2867e026d4066219f350d404ff0f1ae3b39a3189ff6085a901249b4836078dc`.
- The candidate was not published. Its complete Markdown was delivered to a
  fresh Cue agent named `CALL-E install test` in six numbered messages, followed
  by an explicit `END GUIDE` instruction to start. The concatenated guide parts
  matched the candidate exactly. Each unsent part was checked before submission.
- Cue acknowledged waiting for `END GUIDE` after the last guide part.

This exercises the candidate's installation instructions, not downloading the
candidate from the public installation URL. The public URL was not updated.

## Reset and preservation

1. The preexisting `calle` Skill was exported through Cue's Download action.
2. The ZIP was saved locally on the phone as
   `My iPhone/calle-before-reset-2026-11-03.zip`. Its presence and displayed
   size of 68 KB were verified in Files.
3. Cue's deletion dialog explained that the Skill could be restored by
   uploading it again. Deletion was performed within the user's reset request.
4. The Skills list then showed no available Skills and no `calle` entry.
5. The original agent and its conversation history were preserved. A new agent
   was used for the installation test to avoid relying on the old conversation.

The reset above establishes an empty Skill library. Matching CALL-E connector
configuration must be checked separately during setup; an empty Skill library
does not establish that OAuth credentials or connector configuration are absent.
The test request authorized removing matching CALL-E connector configuration
only and preserving unrelated connections.

## Test boundaries

The installation request covered Skill installation, loading, target connection
setup, and read-only verification. It excluded phone calls, call preparations,
and purchases. Any required account login and OAuth consent remain user actions.
Secrets and temporary authorization parameters do not belong in this record.

Automatic screen locking interrupted initial unsent drafts. The drafts were
cleared and the guide was subsequently delivered in verified short parts.
Normal wake/unlock was available without entering a passcode. No auto-lock or
device security setting was changed.

## Outcome

Execution was started after the complete candidate was delivered. Stage results
and any required user steps are recorded below as observed.

### First agent result: native-import handoff

Cue reported assembling the six guide parts with the expected SHA-256 and
returned a Markdown attachment displayed as 2.2 KB. It separated the results:

- Installation remained incomplete because its available installation entry
  could not install the Skill into Cue. It explicitly distinguished downloading
  files from activating a Skill.
- Loading remained incomplete, and it would not continue account setup until
  the Skill was installed and loaded.
- Matching CALL-E connector inspection reportedly found no existing entry.
  Cue reported leaving other connectors unchanged and not starting OAuth.

The requested user action was the native route
`Settings > Skills > Add Skills > Import from GitHub`, using exactly
`https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle`.
This corrected the repository-root instruction observed in the earlier test.

An activity line referred to a rejected configuration-create operation. The
final response did not expose its tool name or exact rejection reason. That
activity alone does not establish a permission policy, MCP support status, or
successful configuration change.

### Native Skill installation

The operator followed Cue's requested native GitHub import route. The Skills
list was confirmed empty before import. The complete `skills/calle` directory
URL produced the `calle` completion card, followed by one visible Skill entry;
there was no same-name replacement prompt.

The new Skill's enable switch was on. Its opaque Cue version identifier was
`bvoU3box4n7wUfmLZaWKiQ`, distinct from the prior installation's
`BeFr9PKEXgxXhNS5sqoJj4`. Neither UI identifier was treated as the Skill's
semantic metadata version.

The test agent was then told the native import and enablement were complete
and asked to continue loading, account setup, and read-only verification. It
was also asked for the sanitized exact reason for the earlier rejected create
operation, while respecting any host permission denial.

### Loading and connection configuration

After the native import, Cue reported loading `calle` version `1.0.4` from
`/home/ubuntu/.manus/skills/calle/SKILL.md`. It reported reading the installed
connection, MCP, update-check, source, and verification references, and finding
the same version in the public source.

Cue reported creating and enabling the CALL-E connection while leaving other
connectors unchanged. It clarified the earlier sanitized rejection:

> the current execution context does not allow submitting connector changes

The restriction applied to its subtask. Cue reported that its coordinator
subsequently completed connection creation and enablement. This was not evidence
that MCP was unsupported by the platform.

### OAuth and read-only verification

A native Cue card stated that the CALL-E connector token had expired and offered
an Authorize button. Opening that entry did not visibly produce a login page.
Cue subsequently reported the connection as unauthenticated with no stored token.
No user login or OAuth consent was completed during these steps.

Cue also reported that the discovered tools had no account-status read and
that `get_call` required an existing Call ID. It did not invoke the prohibited
legacy read tool or create a call as an authentication probe. Business reading
therefore remained unverified.

The operator supplied the observed card behavior and requested the existing
connection's non-secret name, server URL, and authentication state, plus the
active host-generated OAuth link or a confirmed UI step. The request excluded
duplicate connection creation, restarting an active flow, and constructing an
OAuth URL manually.

Cue subsequently confirmed the existing connection's name as `CALL-E`, its
enabled state, and the expected server URL:
`https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth`. It still reported
unauthenticated status and no stored token. It could not relay an active OAuth
link or confirm an alternative UI route and reported leaving the connection
unchanged without starting another login flow.

The phone's Apps catalog returned no result for a `CALL-E` search. This catalog
observation does not contradict the connector-management result or establish
that the connection is absent. A subsequent inspection of seven recent-history
scroll positions did not find the earlier Authorize button.

The operator then requested re-displaying the native authorization card and
waiting for user action: reuse an existing pending flow, or initiate host-managed
OAuth once for the same connection if no flow was pending. No manual OAuth URL
construction or duplicate connector was authorized.

Cue replied that the existing authorization card had been started again, but
the subsequent native UI snapshot showed only a text response and no actionable
authorization card or login page. Its response referred to a user completion
message that had not been sent. The operator corrected that premise: no browser
login or OAuth consent had occurred. This response is not evidence that an OAuth
callback ran or failed.

### Native connector inspection

The operator then found the existing connection through
`Agent Info > Apps > Added Apps > CALL-E`. The added-app list contained one app,
`CALL-E`, and its detail page displayed the application type as `MCP`. This
independently confirmed the connection's presence in the test agent's UI.

The detail page's Manage menu offered only Disconnect. No reauthorization
action was visible there. Nothing was disconnected or recreated. The operator
returned to the test conversation, corrected the OAuth completion premise, and
requested a final status report with no further flows or calls.

Cue acknowledged the correction and gave a final report separating installed
and loaded Skill, configured connection, incomplete authentication with no
stored token, and unverified business reading. No further OAuth flow was
requested or reported.

## Final result and limits

| Stage | Result | Evidence and limit |
| --- | --- | --- |
| Preserve and remove the old Skill | Passed | Local ZIP present in Files; native Skill library empty after deletion |
| Follow the revised generic guide | Passed for installation guidance | Exact local candidate delivered in chat; Cue requested the correct native import and complete GitHub directory |
| Import and enable a fresh Skill | Passed | Native completion card, one `calle` entry, enable switch on |
| Load the installed Skill | Reported loaded | Cue reported installed path, metadata version `1.0.4`, and bundled references; no independent runtime trace was exported |
| Configure the target MCP connection | Created | Cue reported enabled state and the correct production URL; native added-app detail confirmed CALL-E with type MCP |
| Complete OAuth | Incomplete | No visible login or consent page; Cue reported unauthenticated state and no stored token |
| Perform an authenticated business read | Unverified | No completed authentication or suitable account-status read; no existing Call ID supplied |
| Place a live call | Not requested or performed | No preparation, call, or purchase was used as a probe |

The candidate resolved the repository-root Skill import problem and led to the
appropriate manual handoff when the agent could not operate Cue's importer.
The remaining failure was observed at the OAuth entry stage. These observations
do not identify whether the cause belongs to the Cue client, the authorization
handshake, or another component. They do not establish an authenticated CALL-E
integration or a complete live-call acceptance result.

The reinstalled Skill, new CALL-E connector, and `CALL-E install test` agent were
left in place for inspection. The prior Skill backup and original conversation
were preserved. The public installation URL still serves the earlier guide;
this test does not establish that a URL-based install receives the candidate.

The test controller's typing frequency was confirmed at its default value of
60. The WebDriverAgent runner started for USB control was terminated, and a
fresh device process query found no remaining WebDriver runner. Cue and its
test state were left in place.

## Documentation and release decision

The related installation instructions in
[`CALL-E-installation-guide.md`](../install/CALL-E-installation-guide.md),
[`calle.md`](../install/calle.md), and
[`install-guide.md`](../install/install-guide.md) were updated together. The
stable guide's tested content and hash were preserved during this validation.
No packaged Skill, command, manifest, or version was changed.

- Decision: **No release needed**.
- Affected packages: none.
- Changeset: not needed; an empty changeset is optional and was not added.
- Reason: repository installation documentation clarifies existing supported
  import methods, with dated research and validation evidence. Published package
  contents and runtime behavior are unchanged.
- Suggested version bump: none.
- Follow-up release commands: none. Publishing the revised documentation is a
  separate step that was not performed in this test.

Validation: the revised guide's SHA-256 remained unchanged, the updated install
documents and this record passed English-content and whitespace checks, local
record links resolved, and `git diff --check` passed. Previously completed
Skill-package and version checks were not repeated for the record-only updates.
