# Install The CALL-E Hermes Agent Plugin

The Hermes integration path in this repository is the plugin package at
`packages/hermes-plugin/plugin`. It registers native Hermes tools and does not
require a skill file, a marketplace entry, or a pasted prompt.

## Install

```bash
hermes plugins install CALLE-AI/call-e-integrations/packages/hermes-plugin/plugin --enable
```

`hermes plugins install` resolves a subdirectory from the identifier, so there
is no sparse checkout and no marketplace entry point to add. `--enable` turns
the plugin on without a second command.

The plugin installs to `<hermes home>/plugins/calle`.

## Restart The Gateway

Tools are registered when the gateway starts, so a newly installed plugin is
not available until it restarts:

```bash
hermes gateway restart
```

Confirm it loaded:

```bash
hermes plugins list
hermes tools list
```

`calle` should appear as an enabled plugin and as an enabled toolset under
**Plugin toolsets**.

## Authorize

In a Hermes conversation:

```text
sign in to CALL-E
```

The agent calls `calle_auth`, returns a link, and waits. Open the link, finish
in the browser, and tell the agent when you are done. No terminal step is
needed, which matters because most Hermes users reach the agent through
Telegram, Discord, or Slack rather than a shell.

## CLI Availability

The plugin uses `CALLE_BIN` when set, then a global `calle` command when
available, then falls back to:

```bash
npx -y @call-e/cli
```

Node 22 or newer is required. Set `CALLE_BIN` to pin a specific build.

## Tools

| Tool | |
| --- | --- |
| `calle_auth` | Sign in. |
| `calle_plan` | Build a call plan and return a summary. Dials nothing. |
| `calle_run` | Place the planned call. |
| `calle_status` | Poll a call in progress. |
| `calle_show` | Read a stored plan or outcome from local disk. |

Planning and dialling are separate tools. `calle_plan` returns a
`confirm_summary` for the user to read; `calle_run` takes the `plan_id`. The
call authorization stays in local state and is never returned to the agent.

Calls to a person open by disclosing that the caller is an AI and that the call
is transcribed. There is no flag to remove it.

## Notes

**The skill file does not load.** `plugin/skills/calle/SKILL.md` ships as
documentation. Hermes discovers skills from its skills directory and from
`skills.external_dirs` in `config.yaml`; a plugin's own directory is in
neither, so the file will not appear in `hermes skills list`. The behaviour it
describes is implemented in the tools.

**Updating.** `hermes plugins update` cannot update a plugin installed from a
subdirectory: the installer moves that directory out of a shallow clone, so the
installed copy carries no git metadata and the update command exits with an
error. Re-run the install command with `--force` instead.

```bash
hermes plugins install CALLE-AI/call-e-integrations/packages/hermes-plugin/plugin --force --enable
```

**Configuration is optional.** Call outcomes and the token cache live under
`<hermes home>/plugins/calle`. See
[packages/hermes-plugin/plugin/README.md](../../packages/hermes-plugin/plugin/README.md)
for the environment variables, including the optional `CALL_CONSENT_CMD` hook
for sites that keep a record of who has agreed to be called.

## Local Development

From a clone of this repository:

```bash
hermes plugins install file:///path/to/call-e-integrations#packages/hermes-plugin/plugin --force --enable
```

The `#subdir` fragment works for any scheme. Restart the gateway so the new
plugin directory is picked up, then check it loaded:

```bash
hermes gateway restart
hermes plugins list
hermes tools list
```

## Verify The Package

```bash
pnpm --filter @call-e/hermes-plugin check
pnpm --filter @call-e/hermes-plugin test
pnpm --filter @call-e/hermes-plugin pack:dry-run
```

## More

See [packages/hermes-plugin/README.md](../../packages/hermes-plugin/README.md)
for package layout, how this package differs from the other clients, and
validation commands.
