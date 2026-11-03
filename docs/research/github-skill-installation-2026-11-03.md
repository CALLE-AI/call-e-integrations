# GitHub Skill installation across agent platforms

Research date: November 3, 2026 (Asia/Shanghai).

Scope: representative agent platforms and their documented installation inputs.
This is an internal research note, not a new supported installation guide or a
market-share ranking. No installation, account connection, OAuth flow, or call
was performed. Platform documentation and source code describe capabilities;
they do not establish CALL-E acceptance in those hosts.

## Main finding

A GitHub directory link identifies a source location, but native installation
interfaces do not all accept the same input. Some consume repository URLs plus
path parameters, some require a plugin marketplace, and some accept a packaged
Skill upload. Select the host's documented installation interface before
choosing its input format. This is an engineering inference from the comparison
below, not a universal import protocol.

## GitHub address formats

| Input form | Appropriate consumer and scope | Evidence |
| --- | --- | --- |
| `owner/repo` or a full repository URL | Skills CLI repository discovery with `--skill calle`; native installers may need an additional path option | [Skills CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md#source-formats) |
| `/tree/main/skills/calle` | Skills CLI and native importers that accept a GitHub Skill directory; identifies the current branch contents | [Skills CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md#source-formats), [Cue evidence](../verification/cue-github-skill-import-2026-11-03.md) |
| `/tree/<commit>/skills/calle` | A fixed source selection when the installer supports this form; verify the actual parser | [Inspected upstream parser](https://github.com/vercel-labs/skills/blob/main/src/source-parser.ts), [GitHub permanent links](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files) |
| `/archive/refs/heads/main.zip` or `/archive/<commit>.zip` | A whole-repository source archive; select the complete `skills/calle` folder before using an uploader that expects one Skill | [GitHub archive documentation](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives) |
| A separately published Release asset containing one Skill | An archive-capable installer or native ZIP uploader, after checking the asset exists and has the expected layout | [Skills CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md#source-formats), [Claude custom Skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude) |
| A raw `SKILL.md` URL | Entry-point reading and update metadata; a single file does not include CALL-E's required bundled references | [CALL-E package guidance](../install/calle.md#install-the-source-or-zip) |

The Skills CLI also documents local directory installation. Its support for
hosted raw files and archives does not establish that a different host accepts
those formats. The inspected upstream parser classifies raw/archive/Release
URLs separately from Git repository URLs.
[CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md),
[source parser](https://github.com/vercel-labs/skills/blob/main/src/source-parser.ts)

The inspected parser consumes one path segment as the ref in a GitHub
`/tree/<ref>/<subpath>` URL. Do not assume that replacing `main` with a tag
containing `/`, such as this repository's standalone tag convention, works in
every installer. A fixed commit avoids that path ambiguity. This is source
inspection of upstream `main`, not an executed test of a deployed CLI version.
[Parser](https://github.com/vercel-labs/skills/blob/main/src/source-parser.ts),
[local tag convention](../git-naming-conventions.md#tags)

GitHub documents stable file contents for a commit archive; branches and tags
can point to different commits over time. The byte representation of a generated
archive need not be stable. No hosted CALL-E Skill ZIP asset was verified in
this research, and no download URL should be inferred from the local
`dist/skills/calle.zip` output path.
[GitHub archive guarantees](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives#stability-of-source-code-archives),
[local packaging guidance](../install/calle.md#validate-and-package-locally)

## Platform comparison

| Platform | Documented installation input | Application to this repository | Evidence |
| --- | --- | --- | --- |
| Codex | Ask `$skill-installer` to install a Skill, including Skills from other repositories; complete local Skill directories are also discovered | Select `skills/calle`; the installed helper supports a repository with a separate path or a GitHub tree URL, with version-specific behavior | [OpenAI Skill guide](https://learn.chatgpt.com/docs/build-skills); local installed helper inspection described below |
| Claude Code | Standalone Skill directories in personal or project locations; plugins distributed through GitHub-backed marketplaces | Obtain the complete `skills/calle` directory for standalone use. A marketplace source installs the separately maintained plugin product | [Skills](https://code.claude.com/docs/en/skills#choose-where-skills-load), [marketplaces](https://code.claude.com/docs/en/discover-plugins#add-a-marketplace) |
| Claude account custom Skills | Upload a ZIP containing the Skill folder in Customize > Skills | Use a complete Skill-only package; the documented uploader does not establish direct GitHub directory import | [Custom Skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude) |
| Cursor | Local Skill directories; native GitHub repository import installs plugins through a marketplace | Its native repository importer requires `.cursor-plugin/marketplace.json`; a standalone `skills/calle` directory is a different payload | [Official Skills guide](https://cursor.com/docs/skills#installing-skills-from-a-repository) |
| Gemini CLI | Git repository URL with `--path`, or a local Skill directory | A documented equivalent is repository clone URL plus `--path skills/calle`; a GitHub web-directory URL is not required by that route | [Skills](https://geminicli.com/docs/cli/skills/), [install command source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/commands/skills/install.ts) |
| Manus | Public GitHub repository containing root-level `SKILL.md`; `.skill`, ZIP, or folder upload | Our repository root does not contain this standalone Skill's `SKILL.md`. Subdirectory URL acceptance is not established by the cited Manus article | [Official sharing/import guide](https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus) |
| Cue | Separate configuration from Manus; this repository has dated native import evidence | The exact `tree/main/skills/calle` URL was recognized and subsequently imported; this result is limited to the recorded Cue build | [Manus/Cue boundary](https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus), [local import comparison](../verification/cue-github-skill-import-2026-11-03.md), [clean install](../verification/cue-clean-install-2026-11-03.md) |
| OpenClaw | ClawHub reference, `git:owner/repo[@ref]`, or local directory | Native Git installs expect `SKILL.md` at source root. A separately obtained complete `skills/calle` folder can use the documented local-directory route | [Official CLI reference](https://docs.openclaw.ai/cli/skills) |

## Important platform details

### Codex

The official Skill guide documents using `$skill-installer` to obtain curated
Skills or Skills from other repositories, as well as complete local Skill
directories and plugin distribution.
[Source](https://learn.chatgpt.com/docs/build-skills)

Read-only inspection of the bundled
`/Users/ray/.codex/skills/.system/skill-installer/SKILL.md` found two documented
helper forms: repository plus `--path`, and a GitHub
`--url https://github.com/<owner>/<repo>/tree/<ref>/<path>`. The helper also
documents `--ref` selection. This is evidence for the installed helper version;
no installation script was run. Its documented default destination differs
from the current public guide's recommended local discovery location, so do
not assume one universal install directory across versions.

### Claude Code and Claude account Skills

Claude Code documents personal Skills at
`~/.claude/skills/<skill-name>/SKILL.md` and project Skills at
`.claude/skills/<skill-name>/SKILL.md`. Its sharing routes include committing
project Skills to version control and distributing Skills inside plugins. A
complete downloaded directory placed in a supported location is therefore a
reasonable standalone installation approach; this is distinct from a native
GitHub URL importer.
[Source](https://code.claude.com/docs/en/skills#choose-where-skills-load)

Claude Code marketplace sources accept GitHub `owner/repo` shorthand, Git clone
URLs, local marketplace paths, or a hosted `marketplace.json`. Branch/tag
selection uses `#ref`, followed by installing a named plugin. This route expects
marketplace metadata, rather than an arbitrary standalone Skill directory.
[Source](https://code.claude.com/docs/en/discover-plugins#add-a-marketplace)

The Claude account guide documents creating a ZIP from the Skill folder and
uploading it through Customize > Skills. This is a suitable format to consider
for a host with a ZIP uploader; it does not prove that pasting a GitHub tree
page into that uploader is supported.
[Source](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

### Cursor

Cursor's current official guide explicitly routes GitHub repository imports
through plugins. Its From GitHub Repository action expects a repository with
`.cursor-plugin/marketplace.json`, then a plugin installation. The same guide
documents standalone directory discovery under `.agents/skills/`,
`.cursor/skills/`, and their user-level equivalents, with supporting resources
inside each Skill folder. Those two mechanisms should have separate guidance.
[Source](https://cursor.com/docs/skills)

Consequently, using Cursor's GitHub plugin importer as a fallback for this
standalone Skill could select a different product. Our existing Cursor plugin
payload remains separately maintained; this research does not authorize
substituting it for the standalone MCP/API Skill.

### Gemini CLI

The official Skills documentation and install-command implementation accept a
Git repository source and a separate `--path` value. The default scope is user
scope. For this repository, the corresponding documentation-derived example is:

```bash
gemini skills install https://github.com/CALLE-AI/call-e-integrations.git --path skills/calle --scope user
```

This example was not executed. It demonstrates source selection, not CALL-E
runtime compatibility. The implementation clones the Git source, resolves the
selected subpath, discovers Skills there, and copies each complete Skill
directory. It can replace an existing same-name destination after consent, so
preserving local changes still requires explicit care.
[Documentation](https://geminicli.com/docs/cli/skills/),
[command source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/commands/skills/install.ts),
[installation source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/utils/skillUtils.ts)

### Manus and Cue

Manus documents a public repository with `SKILL.md` at its root, alongside any
supporting resource folders, for native GitHub import. It also documents
uploading a complete `.skill`, ZIP, or folder. The article does not specify
subdirectory, tag, or commit URL parsing. That omission is an evidence gap,
rather than proof that every such URL is unsupported. It explicitly states that
Manus and Cue have separate Skill configurations.
[Source](https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus)

Cue's existing local record reproduced repository-root failure and recognized
the complete Skill-directory URL. A later clean installation imported and
enabled that directory, with Skill loading reported by Cue. OAuth and business
verification remained incomplete. These observations do not establish the same
behavior in Manus or another Cue version.
[Import comparison](../verification/cue-github-skill-import-2026-11-03.md),
[clean-install evidence](../verification/cue-clean-install-2026-11-03.md)

### OpenClaw

OpenClaw's native Git syntax is `git:owner/repo[@ref]`. Git and local-directory
installs require a valid `SKILL.md` at the selected source root. Its CLI reference
explicitly excludes ZIP/archive paths from this install command. ClawHub
installation is another route, with separate publisher/version references.
For this monorepo, obtaining the intended complete Skill folder and then using
the local-directory route is the documented shape that avoids a repository-root
layout mismatch. No OpenClaw installation was tested here.
[Source](https://docs.openclaw.ai/cli/skills)

## Evidence limits and next documentation decision

- Keep the distinction between a source link, an installer input, a downloaded
  package, installed files, and a Skill actually loaded in the target agent.
- Preserve `SKILL.md` and all bundled references when copying or packaging the
  standalone Skill. A single raw entry-point file is incomplete for CALL-E.
- Keep Skills CLI selection separate from a host's plugin, extension, marketplace,
  or MCP installation flow; those routes can install different artifacts.
- Keep the requested priority: use the Skills CLI when it supports the current
  host and can run there; otherwise, use that host's documented standalone Skill
  installer and accepted source format. This may be a repository plus a
  subdirectory parameter, a supported directory URL, or a complete folder/ZIP.
  GitHub subdirectory import remains conditional on documented or observed
  support. Plugin marketplace import is a separate product choice.
- The Windsurf Skills documentation URL redirected to a Devin customization page
  that the research reader could not access. No claim about current native
  GitHub import support is made for that surface.
  [Attempted official entry point](https://docs.windsurf.com/windsurf/cascade/skills)
- Earlier candidate hashes and validation results retain their original scope.
  This research does not establish live acceptance of a revised guide.

## Current guide candidate and checks

The stable installation guide's SHA-256 after the input-format clarification is
`bf6b8c4b2ccd3d6202069f2a2e55b1c6f559370d1e776dd6f7eee77b70acdc7e`.
This is a separate candidate from the earlier
[installation routing record](../verification/installation-routing-2026-11-03.md)
and the Cue test records. Those files and their hashes were preserved.

Validation for the revised guides:

- `pnpm --filter @call-e/skills-sh-skill check` passed.
- `pnpm run check:versions` passed.
- `git diff --check` passed.
- Existing fenced command blocks in all three installation guides match `HEAD`.
- English-content, local file link, and whitespace checks passed.
- The standalone Skill entry point and bundled update procedure match `HEAD`.

These checks do not establish live installation, loading, account connection,
or compatibility in any additional host.

## Repository and release impact

Related material checked: the stable install entry point, canonical `calle`
guide, manual installation guide, documentation maintenance rules, and existing
Cue verification records. The three installation guides were synchronized to
condition GitHub directory URLs on the importer's supported input and distinguish
standalone Skill installation from plugin marketplace installation. Existing
command blocks, source identities, packaged files, and runtime behavior are
unchanged. The platform examples in this note are documentation-derived, not
new support guarantees.

- Decision: **No release needed**.
- Affected packages: none.
- Changeset: not needed.
- Reason: internal research and clarification of existing installation input
  formats; no package output or runtime change.
- Suggested version bump: none.
- Follow-up release commands: none.
