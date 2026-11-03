# CALL-E Installation Guide

Install the standalone `calle` Skill listed on
[skills.sh](https://skills.sh/calle-ai/call-e-integrations/calle).

## Step 1 Install

<!-- sync-with: docs/install/calle.md#install-the-source-or-zip -->

Identify the current host first. Prefer the Skills CLI when it supports that
host and command execution is available. Confirm the target using the
[supported-agent list](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)
or available CLI help; shell access alone does not establish host support.

For a supported host with Node.js, `npm` and `npx` available, install at
user-level/global scope:

```bash
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g
```

Select the current host's verified supported agent target.

If the Skills CLI does not support the host, support cannot be confirmed, or
command execution or the required CLI tooling is unavailable, use the host's
own supported Skill installer or import interface to download and install the
Skill instead. Follow its documented input format: a repository URL with
subdirectory selection, a URL of a Skill directory, or a complete folder/ZIP.
Use an entry point for standalone Skills; plugin marketplace installation is
a separate integration route.

For an importer that accepts GitHub URLs of Skill directories, use the complete
[`skills/calle/` directory](https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle).
This directory URL points to the folder containing `SKILL.md`.
An importer may not discover nested Skills from the repository root. If the
host accepts folder or ZIP uploads instead, import the complete Skill directory
with `SKILL.md` and all bundled references.

If neither route is available to the Agent, provide confirmed user steps through
the host's supported interface and report installation as pending. If the host
cannot load Skills, report that limitation; downloading from GitHub alone does
not install a usable Skill.

Preserve local edits, configuration and saved call records when updating an
existing installation.

## Step 2 Load and Connect

Reload or rediscover Skills, then read and follow the installed `calle/SKILL.md`
before account setup. Use its MCP/API connection and verification instructions.

Let the user complete any required browser login and consent. API Keys must be
saved in supported private configuration; never request or paste them in chat.

## Step 3 Confirm

Verify that `calle` is loaded from the installed source with its references
available. Perform only authorized read-only checks of the selected connection;
do not place a call as part of installation verification.

Report installation, Skill loading and account connection separately. State any
pending user actions, unsupported capabilities or unverified checks.

For additional installation options, see the
[detailed guide](https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/docs/install/calle.md#install-the-source-or-zip).
