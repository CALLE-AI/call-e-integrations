# Cue by Manus: extension research

Research date: November 3, 2026 (Asia/Shanghai).

Scope: Cue by Manus at [cue.im](https://cue.im/), as identified by the user.
This is an internal research note, not a verified installation guide. No Cue
account, application settings, Skills, or MCP connections were changed or tested.

Follow-up: [on-device GitHub Skill import validation](../verification/cue-github-skill-import-2026-11-03.md)
records subsequent Cue UI and installed-file evidence. The public-source
findings below retain their original research scope.

## Product identity

Cue is a standalone personal-agent app from Manus. Its launch announcement
describes agents with their own email, phone number, wallet, and computer, plus
collaboration through group chats. These are published product capabilities,
not results of an end-to-end test in this research.
[Source: Manus launch announcement, Cue section](https://manus.im/blog/introducing-manus-2-0)

The current help article still describes invitation-code access. It also
documents creating a scheduled automation by telling Cue what to do and when.
[Source: Manus Help Center, What is Cue?](https://help.manus.im/en/articles/17190150-what-is-new-in-manus-2-0)

## Evidence summary

| Surface | Evidence | Verification boundary |
| --- | --- | --- |
| Cue Skills | Official help explicitly requires separate Cue configuration | Exact Cue importer and accepted formats remain unverified |
| Custom remote MCP | Integration providers publish Cue-specific chat and OAuth setup instructions | Provider claims; no Cue account test or universal compatibility claim |
| Messenger | Cue-specific official setup instructions | Messaging connections do not establish a custom-MCP menu |
| Agent API | Official API documentation explicitly includes agents created in Cue | Does not establish Skill or MCP installation APIs |

## Skills: confirmed product boundary

The official Manus help article includes a section specifically about Cue:
Skills created or imported in Manus do not automatically become available in
Cue. Cue requires its own configuration. Sharing an account must therefore not
be treated as evidence of sharing an installed Skill library.
[Source: Manus Help Center, Using Skills in Cue](https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus)

The same article describes Manus Skills as a `SKILL.md` file with YAML metadata
and optional supporting resources. It documents Manus imports from packaged
files, folders, and GitHub repositories. Those steps explicitly refer to the
Manus interface; the article does not establish that Cue exposes identical
import controls or accepts the same formats.
[Source: Manus Help Center, Understanding Skill Files and import methods](https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus)

## Cue-specific questions still requiring verification

The primary sources reviewed did not establish:

- The exact Cue menu or conversation flow for adding a Skill.
- Whether Cue directly imports a `SKILL.md` folder, `.skill`, ZIP, or GitHub URL.
- Whether importing a repository subdirectory is supported.
- Whether Skill installation is scoped to an agent, a workspace, or an account.
- Whether Cue supports a Skill CLI, local discovery directories, or automatic
  updates.
- Whether Manus's slash-command invocation also applies in Cue.

These are research gaps, not evidence that the features are unsupported. A
future Cue installation guide should record the Cue app version, observed UI,
accepted package layout, and a successful invocation before claiming support.

## Custom MCP: provider-documented Cue workflow

ClipperTask publishes a Cue-specific connection guide: ask the Cue agent to add
a custom MCP connector using its remote URL and OAuth, open the returned
sign-in link, and approve access. Its troubleshooting section explicitly allows
for Cue being unable to add the connector and suggests Manus as another client.
This is first-party documentation for ClipperTask's integration, not a Cue
product guarantee.
[Source: ClipperTask integration guide](https://clippertask.com/agents/cue)

OmniSocials separately documents the same pattern for Cue: a chat request with
an HTTP MCP URL and OAuth, followed by browser sign-in. It describes the setup
as conversational and states that propagation of Manus connectors into Cue is
undocumented. Its menu observations are provider statements, not verified UI
observations from this research.
[Source: OmniSocials Cue integration, updated October 18, 2026](https://omnisocials.com/cue)

The following is an adapted validation prompt, not an officially verified Cue
installation command. Substitute an actual provider's confirmed URL:

```text
Add a custom MCP connector for the current agent.
Name: SERVICE_NAME
Server URL: https://example.com/mcp
Transport: HTTP
Authentication: OAuth
Send me the sign-in link. After authorization, list the available tools and
confirm the connection with a read-only request supported by that service.
If connector management is unavailable, report that limitation.
```

The reviewed sources do not establish Cue support for local stdio servers,
localhost access, arbitrary authentication headers, every remote MCP server,
MCP Apps rendering, or automatic sharing between agents. Remote HTTP with OAuth
is the documented provider pattern; it still requires validation for a target
service and account.

## Manus MCP instructions are a separate reference

Manus's current connector feature page documents `Connectors > Create > Add
MCP by URL`, plus command-based Custom MCP and JSON import. Its custom-MCP
documentation uses a different route, `Settings > Integrations > Custom MCP
Servers > Add Server`. Both explicitly describe Manus. Neither establishes
Cue's current menu or local-command support.
[Sources: Manus connector feature page](https://www.manus.im/features/connectors),
[Manus custom MCP documentation](https://manus.im/docs/integrations/custom-mcp)

## Other documented integration surface

Cue's official help documents Messenger connections for iMessage, Telegram,
LINE, and Slack. The path is `Agent Info > Integration > Messenger`; each
platform is connected and enabled separately. This is a messaging connection
surface and does not establish a Skills or custom-MCP configuration path.
[Source: Manus Help Center, multiple messaging platforms in Cue](https://help.manus.im/en/articles/14178640-can-i-connect-multiple-messaging-agents-at-once-in-cue)

## API access to Cue agents

The official Manus API v2 Agents guide explicitly includes agents created in
Cue. It documents listing and inspecting agents, updating their nickname and
description, and sending messages to their persistent conversation through
`task.sendMessage`. Agent subtask inspection is also documented.
[Source: Manus API v2 Agents guide](https://open.manus.ai/docs/v2/agents-overview)

The `agent.list` and `agent.update` references require an API key or a trusted
client; standard OAuth clients cannot access those endpoints. The update
operation documents `nickname` and `about`, not Skill or MCP configuration.
[Sources: agent.list](https://open.manus.ai/docs/v2/agent.list),
[agent.update](https://open.manus.ai/docs/v2/agent.update)

Manus also documents installed-Skill listing and archive download. These pages
do not establish an API for installing a Skill into Cue's separate configuration.
[Sources: skill.list](https://open.manus.ai/docs/v2/skill.list),
[skill.detail](https://open.manus.ai/docs/v2/skill.detail)

## Implications for a future CALL-E evaluation

As an engineering inference, the provider-documented remote OAuth MCP route is
a reasonable candidate for a CALL-E compatibility evaluation. It is not evidence
that CALL-E has been connected successfully to Cue. Reuse the production endpoint
and complete standalone Skill artifact defined in the existing
[CALL-E installation guide](../install/calle.md); do not establish a second
source of truth here.

Record connector registration, OAuth completion, discovered tool schemas, and
a suitable read-only result separately from Skill import and actual Skill
loading. Cue's own phone capability does not establish CALL-E compatibility.
Installing or checking a connection is not a live-call acceptance test.

## Repository impact

Related repository material checked: root `AGENTS.md` and
`docs/documentation-maintenance.md`, `docs/agent-integration-layout.md`, and
`docs/install/calle.md`. A search of README, docs, packages, project helpers, and
Skills found no existing Cue integration guidance requiring synchronization.
This note introduces no supported install flow, command changes, package output,
or integration metadata. Related installation documents were checked and remain
unchanged.

Release decision: **No release needed**. Affected packages: none. Changeset:
not needed. Suggested version bump: none. Reason: internal research only, with
no published package or installation behavior change.
Follow-up release commands: none.
