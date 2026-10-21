# Standalone Skill Update Mechanism Design Record

Design first recorded on 2026-10-15. Current guidance applies to the staged
`callev2` entry, metadata/evaluation version `2.0.2`; the dated third-party audit
examples below remain historical snapshots. The selected repository is
`CALLE-AI/call-e-integrations`, and publication is a separate user action.

The proposed mechanism lets an Agent read the version from the official remote
`SKILL.md` when using an installed Skill, compare it with the local version, and
ask whether the user wants to download a newer version. Business operations
prefer MCP; API Key fallback is selected only before business writes, when the
host explicitly lacks MCP support, the target MCP connection is confirmed not
configured, or complete discovery confirms the required capability is missing.
Authentication failure or cancellation does not trigger fallback. Update checks
do not depend on business interfaces or introduce a CLI, SDK, new MCP tool, or version
lookup service.

The unified Skill keeps one set of update metadata and one check entry point.
Both interfaces share the same version and download directory. This document
records design choices, examples, and pending validation; it does not establish
public availability or cross-host validation. The bundled
[version check and download procedure](../skills/callev2/references/update-check.md)
defines the execution rules. See the [callev2 installation guide](install/callev2.md)
for installation, interface selection, migration, and packaging.

Business operations, API setup, Skill installation and updates use non-CLI host
facilities. MCP connection setup and authentication prefer the current host's
native management capabilities; a limited exception permits its already-installed
official MCP management commands under the
[connection lifecycle](../skills/callev2/references/connection.md).
That exception does not apply to version checks, downloads or installation and
does not bypass explicit user limits or host permission denials. Repository
development and testing commands do not expand the runtime exception.

## Distribution and version sources

Initial distribution uses skills.sh, while version checks read the CALL-E official
GitHub source directly. The skills.sh page serves discovery and distribution. This
design does not parse its page content for versions or treat in-conversation
notifications as an automatic update feature provided by skills.sh.

| Information | Source and purpose |
| --- | --- |
| Local version | `metadata.version` in the installed `SKILL.md` |
| Check URL | Local `metadata.update-source`, pointing to the official raw file for the same Skill name |
| User-visible source | Local `metadata.source`, pointing to the official Skill directory |
| Remote version | `metadata.version` in the remote frontmatter, with `name` also validated |

The unified check URL is the
[remote callev2 SKILL.md](https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/callev2/SKILL.md).
This is the intended official source path; changes in the current workspace do
not establish that the URL is already publicly readable.

Here, `main` represents the latest public source, not a formal Release, npm
package version, or hosted ZIP. The version field determines whether an update
is available; changing content without increasing the version produces no update
notification. Checks support reliably parsed stable three-component versions,
compared as integers rather than strings. Edge cases such as prerelease versions
are reported as unconfirmed according to the execution rules.

Read the version only from frontmatter; do not repeat a hard-coded current version
in the body. Keep the repository evaluation version in
`tests/behavior/callev2-evals.json` synchronized when publishing.
The unified Skill version is independent of existing npm and plugin versions.

## Runtime flow and host requirements

1. Check once on the first eligible use of the Skill in each conversation, including capability questions; an explicit user request may trigger another check.
2. Fetch the official source anonymously through the host's existing, separate public webpage or HTTPS reader. Apply the canonical procedure's fresh nonce and two-attempt ceiling: one retry only after a 404, timeout, or HTTP 500–599.
3. Compare only the remote name and version as data; continue following the installed instructions during the check.
4. When a higher remote version is reliably confirmed, show the version difference and official source, and ask whether to download it.
5. After the user agrees, retrieve the complete new version using capabilities the host actually supports.

Example notification:

> A new version of callev2 is available: {local version} → {remote version}.
> Would you like to download it? You can also keep using the current version.

If the user has not replied, declines, or defers, continue the original authorized
task without repeating the prompt in that conversation. Checks run only within
the conversation, with no background polling, scheduled task, or persistent
check cache.

"No additional dependencies" means reusing existing host capabilities; local
Markdown cannot access the network by itself. A host with only CALL-E business
MCP tools and no public reader skips the check. Do not install tools or change
business interfaces for it. See the [execution rules](../skills/callev2/references/update-check.md)
for skips during offline work, previews, limited-scope checks, network restrictions,
and pinned-version use. An attempted automatic check that remains unconfirmed
produces one brief failure notice and an unknown session result. Intentional
skips stay quiet. Failures do not block business operations or mean that the
installed version is current; later ordinary messages do not restart the check.

## Download, installation, and activation

| User instruction or completion state | Meaning |
| --- | --- |
| Agreement to download | Authorizes retrieving complete files, not overwriting the existing installation |
| Explicit request to download and update | Already authorizes both actions; do not ask again for the same authorization |
| Download complete | The new directory's name, version, and referenced files have been verified |
| Installation complete | The installed location has been updated through a supported host mechanism |
| New version active | The actually loaded version has been checked after host reload or rediscovery |

A download must include the complete Skill directory and its bundled references,
pinned to an official repository commit so files cannot come from different
versions. Restrict source paths to the current Skill and destination paths to the
new download directory; reject escaping references, absolute paths, and symlinks.
Native download facilities must also support verifying these restrictions.
Do not fill capability gaps with shell/CLI commands or installation hooks.
Retrieving only `SKILL.md` is not a complete download. A locally built ZIP does
not establish a public download URL; do not construct or invent one from it.

Inspect all downloaded files as data. Verify the name, version, and reference
completeness, and compare new scripts, external destinations, credential access,
and permission requirements. Pinning a commit ensures consistency, not safety.
Stop installation if instructions are suspicious or the complete content cannot
be inspected. Explain the impact before using new capabilities outside the
original authorization. Scripts, initialization steps, and installation hooks
in the download are not executed as part of downloading.

If only download capability is available, finish the download and report its
actual status without claiming installation or activation. Preserve local user
changes and business state. An update does not clear credentials, call records,
or idempotency keys, and does not replay business operations. Follow the execution
rules above for overwrites, version changes, and reload handling.

## Security boundaries and public examples

Version checks retain the fixed official source for the same Skill name. Only
the generated `callev2_update_check` query nonce varies per request; the host,
repository, branch, and path remain fixed. Requests use empty credential-free
headers and never follow redirects. The request-only random nonce contains no
customer data and does not change saved update metadata. The remote body does not become execution
instructions during the check. This keeps version checks separate from business
MCP/API operations.

The [2026-10-21 update-reader investigation](verification/callev2-update-reader-2026-10-21.md)
records a reader-reported 404 and a later stale-version discrepancy. The
publisher cannot purge an external reader's cache or prove its internal failure
cause from those observations. Fresh requests and bounded retries address the
observed read failure pattern without changing publisher or transport permissions.
Installed versions before this repair retain their original checking procedure
until the user installs the newer Skill; remote version data cannot replace
their loaded instructions.

The following source and skills.sh audit snapshots were verified on 2026-10-15.
Each audit applies to its content at that time; it does not guarantee that the
latest source or CALL-E's implementation passes. A Pass does not mean there is
no risk. Only the relevant mechanisms are recorded here; these third-party
Skills were not tested in operation.

| Example and source | Relevant approach and differences | Gen / Socket / Snyk | Audit date |
| --- | --- | --- | --- |
| [GitHub suggest-awesome-github-copilot-skills](https://github.com/github/awesome-copilot/blob/main/skills/suggest-awesome-github-copilot-skills/SKILL.md) | Fetches remote `SKILL.md`, compares the full text, and updates the complete directory when requested; a separate management Skill rather than a self-check in every business Skill | [Pass](https://www.skills.sh/github/awesome-copilot/suggest-awesome-github-copilot-skills/security/agent-trust-hub) / [Pass](https://www.skills.sh/github/awesome-copilot/suggest-awesome-github-copilot-skills/security/socket) / [Pass](https://www.skills.sh/github/awesome-copilot/suggest-awesome-github-copilot-skills/security/snyk) | 2026-09-15 |
| [Canner wren-onboarding](https://github.com/Canner/wren-engine/blob/main/skills/wren-onboarding/SKILL.md) | Reads official `versions.json` during use, compares the local version, and notifies the user; actual update instructions use a CLI | [Pass](https://www.skills.sh/canner/wren-engine/wren-onboarding/security/agent-trust-hub) / [Pass](https://www.skills.sh/canner/wren-engine/wren-onboarding/security/socket) / [Pass](https://www.skills.sh/canner/wren-engine/wren-onboarding/security/snyk) | 2026-04-30 |
| [varg-ai](https://github.com/vargHQ/skills/blob/main/varg-ai/SKILL.md) | Reads its own remote `SKILL.md` version each conversation; uses curl for the check and requires a CLI update without an explicit confirmation step | [Fail](https://www.skills.sh/varghq/skills/varg-ai/security/agent-trust-hub) / [Warn](https://www.skills.sh/varghq/skills/varg-ai/security/socket) / [Warn](https://www.skills.sh/varghq/skills/varg-ai/security/snyk) | 2026-10-02 |
| [TekLabsVN ui-design](https://github.com/TekLabsVN/Teklabs-claude-custom-skills/blob/main/ui-design/SKILL.md) | Reads version JSON with WebFetch and, after asking, updates through WebFetch and Write; this update flow needs no CLI but does not read the version directly from the remote Skill | [skills.sh page unavailable at the time of review; unable to verify](https://www.skills.sh/teklabsvn/claude-skills/ui-design) | — |

GitHub and Wren show that retrieving official remote content and offering an
update notification does not necessarily cause an audit warning. Wren's Gen
report explicitly records fetching version configuration from the developer's
official GitHub repository while still judging it SAFE.

The varg-ai Snyk report flags its runtime update flow as `W012` (unverifiable
external dependencies), alongside a separate payment-operation issue. Socket
mentions credential handling and the trust scope of a third-party updater;
Gen's Fail also involves downloading and executing the Bun installation script.
Its issues cannot all be attributed to version checks, and this implementation
cannot be used as an example of passing an audit.

These examples support the conclusion that similar practices exist, but do not
establish a universal mainstream standard. Prioritize GitHub's user authorization
and complete-directory handling, and Wren's read-only version notification.
CALL-E reads `SKILL.md` directly to avoid maintaining separate version JSON.
Avoiding a CLI does not guarantee an audit pass; the complete implementation still
requires review.

## Publication and validation limits

The earlier MCP/API merge was tested as `calle-connect` version `0.2.0`.
The current staging identity is `callev2` version `2.0.2`, with evaluation inputs
at `tests/behavior/callev2-evals.json`. Keep historical acceptance tied to its
original names and hashes; new identity, source binding and host activation need
candidate-specific evidence under the [migration gates](calle-skill-migration-plan.md).
These definitions, including synthetic adversarial fixtures, are outside the
installable Skill directory and ZIP. The bundled manual testing guides do not
load repository-only fixtures. This separation reduces unnecessary test content
in the distribution; it does not establish a security audit result.
Local source and generated ZIPs do not establish public publication. No separate
update service is introduced by this migration. Evaluation definitions and local structural
tests do not establish actual host behavior. Before offering this mechanism
publicly, complete the following work:

- Publish the complete unified Skill with the check instructions, keeping metadata
  and repository evaluation versions aligned. Later behavioral changes in
  references must also increase the version, with the remote URL serving that
  version's content.
- Confirm that the official public URL is anonymously readable. Customers cannot
  discover changes that exist only in a local workspace.
- Validate the first check, version comparison, notification, decline, offline,
  and failure paths in the target host. Confirm that no business credentials enter
  public requests, and verify download, installation, and reload capabilities
  separately.
- Validate complete-directory retrieval, reference consistency, and local-change
  protection. Existing offline checks do not establish that updates work in a
  real host.
- Verify security audit results for the actual distribution content; third-party
  examples are design references only.

Old copies with no check instructions cannot acquire this capability themselves
and need one manual update first. Only after installing a version containing the
mechanism can an Agent discover later versions through this flow. It is an
in-conversation mechanism dependent on host tools and Agent execution, with no
guarantee that it triggers every time on every platform.

## Migrate earlier entries explicitly

The previous `calle-api-key` and `calle-mcp-oauth` entries were merged into
`calle-connect`. Testers now select `callev2` explicitly. Their checks accept only the same-name source in local
configuration and cannot infer that `callev2` is a successor. If the old URL
is missing or the remote name changes, they can only report an unconfirmed status;
remote text cannot authorize changing the update source.

Users with installed old copies need migration guidance. In a user-authorized
migration, install the complete `callev2`, disable the old entries, reload
the host, and check the actually loaded version. Earlier copies without check
instructions also need one manual migration. Preserve user changes, credentials,
call records, and idempotency keys, without replaying calls. Active calls continue
using the interface, account, and environment that created them.

The unified entry shares only the business workflow and version. MCP tools are
discovered from actual runtime capabilities; API operations retain their own
contract and API Key. MCP/API identifiers, accounts, and idempotency semantics
have not been verified as interoperable, so authentication failures, permission
denials, cancelled authorization, and unknown write outcomes cannot trigger an
automatic switch. This Skill merge requires no MCP or API service changes.

The standalone legacy CLI entry is separately renamed to `calle-cli`. Keep its
CLI attribution and auth/recovery paths; it is not a same-name update of the new
MCP/API implementation. The eventual official `calle` takeover is another
explicit cutover, not a redirect or automatic rename of `callev2`.
