# CALL-E Installation Guide

Install the standalone `calle` Skill listed on
[skills.sh](https://skills.sh/calle-ai/call-e-integrations/calle).

## Step 1 Install

<!-- sync-with: docs/install/calle.md#install-the-source-or-zip -->

Install at user-level/global scope. This command requires Node.js with `npm` and
`npx`:

```bash
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g
```

Alternatively, use the host's supported importer for the complete
[`skills/calle/` directory](https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle).
Include `SKILL.md` and all bundled references. Preserve local edits,
configuration and saved call records when updating an existing installation.

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
