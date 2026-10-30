# CALL-E Installation Guide

These steps are for AI agents installing CALL-E from the stable installation
prompt. The default is the standalone `calle` Skill at version `1.0.1`. It
prefers host-managed OAuth MCP and supports API Key access under its
[interface selection rules](calle.md#choose-the-interface).

Users choosing the legacy CLI workflow should follow the
[`calle-cli` compatibility guide](skills-sh-skill.md). Plugin-owned `calle`
Skills have their own installation lifecycle.

## Requirements

- A host with supported Skill installation and loading facilities.
- For MCP, host-managed remote MCP, OAuth and real tool discovery; cards are
  optional when `start_call` is available.
- For API, authenticated HTTPS capabilities with secure credential injection
  and private operation-record storage.
- For update checks, an anonymous public reader separate from business tools.

The initial live acceptance baseline is Codex MCP. API and other clients must
identify unexecuted live checks explicitly; installation alone establishes no
account access, calling permission or completed acceptance.

## Step 1 Install the Skill

<!-- sync-with: docs/install/calle.md#install-the-source-or-zip -->

Install the complete standalone Skill at user-level/global scope. This optional
user-run distribution command requires Node.js with `npm` and `npx`:

```bash
npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g
```

Alternatively, use the host's existing importer or supported file interface to
install the complete `skills/calle/` source. Follow the
[canonical installation guide](calle.md#install-the-source-or-zip) for ZIP and
host capability details. The installed Skill uses non-CLI facilities for its
own updates and business operations.

If replacing an old standalone CLI `calle`, preserve local edits, configuration
and recovery records, then replace the complete tree in the intended scope.
Verify the replacement before retiring the selected old copy. Users retaining
that workflow should use the [CLI compatibility route](skills-sh-skill.md#existing-calle-users).

Reload or rediscover Skills and verify that the loaded name is `calle` and its
metadata version is `1.0.1`. Saving files and activating the new version are
separate completion states.

## Step 2 Connect the Account

Follow the Skill's [interface selection rules](calle.md#choose-the-interface).
Honor an explicit user interface choice and keep existing calls on their
original interface, account and endpoint.

For MCP, reuse a suitable connection to
`https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth`. Follow the
[connection lifecycle](../../skills/calle/references/connection.md), prefer the
host's native management capabilities and let the user complete any required
browser login or consent. The limited official host-command exception applies
only as documented; explicit user restrictions and permission denials remain
binding. Verify the callback, connection state and actual tools before claiming
readiness.

For API, follow [secure configuration](../../skills/calle/references/setup.md)
with the fixed production base URL `https://api.heycall-e.com`. Never request an
API Key in chat, copy credentials into the Skill or reuse MCP tokens as API Keys.
Authentication failure or cancelled OAuth does not trigger automatic fallback.

## Step 3 Verify the Current Workflow

The standalone Skill uses only the current exposed MCP tools: `prepare_call`,
`start_call`, `open_call`, `get_call` and `get_call_transcript`. Discovery does
not authorize invoking the excluded legacy `plan_call`, `run_call` or
`get_call_run` tools. Follow the [MCP workflow](../../skills/calle/references/mcp.md)
for chat clarification, optional cards, recovery and cancellation limits.

Installation and account connection do not authorize dialing. A real call needs
a user-defined recipient, task and execution instruction. For an authorized
ready preparation, use `start_call` without redundant confirmation, while
preserving any instruction to wait or use the card's Dial control. Follow the
same call until its result is final and deliver the outcome and requested
answers under the [polling policy](../../skills/calle/references/polling.md).

## More

- [Canonical calle installation and updates](calle.md)
- [CLI compatibility installation](skills-sh-skill.md)
- [Client-specific integration options](install-guide.md)
- [Troubleshooting](troubleshooting.md)
