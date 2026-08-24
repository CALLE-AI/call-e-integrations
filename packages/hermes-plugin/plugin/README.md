# CALL-E for Hermes Agent

Place phone calls from Hermes and read back what was said.

The agent plans the call and shows you the plan. Nothing is dialled until you
say so. Calls to people open by disclosing that the caller is an AI. Outcomes
are written to your own disk, so a call is still readable after CALL-E has
deleted its copy.

## Install

```bash
hermes plugins install CALLE-AI/call-e-integrations/packages/hermes-plugin/plugin --enable
hermes gateway restart
```

The restart is required: tools are registered when the gateway starts, so the
plugin is not available until it does.

Then, in a conversation:

```text
sign in to CALL-E
```

The agent returns a link. Open it, finish in the browser, and tell the agent
you are done.

**Requires Node 22 or newer.** The plugin finds the CALL-E CLI at `CALLE_BIN`,
then `calle` on your `PATH`, and otherwise runs it through
`npx -y @call-e/cli`. No prior install needed.

## Use

```text
call Miller Hardware on +14155550123 and ask whether they have
12-inch flue pipe in stock and what it costs
```

The agent plans the call and shows you what it will say and ask. Say the word
and it dials; the outcome comes back with the callee's own words.

## Tools

| Tool | |
|---|---|
| `calle_auth` | Sign in. |
| `calle_plan` | Build a plan and show it to you. Dials nothing. |
| `calle_run` | Place the planned call. |
| `calle_status` | Poll a call in progress. |
| `calle_show` | Read a stored call back from local disk. |

## Configuration

Everything is optional.

| Variable | Default |
|---|---|
| `CALLE_PLUGIN_HOME` | `<hermes home>/plugins/calle` |
| `CALLE_BIN` | resolved from `PATH`, else npx |
| `CALL_LANGUAGE` | `English` |
| `CALL_REGION` | unset — resolved from the number |
| `CALL_DISPLAY_TZ` | `UTC` |
| `CALL_MAX_WAIT` | `360` seconds |
| `CALL_CONSENT_CMD` | unset — see below |

### Calling people

Person calls always disclose. There is no flag to turn that off.

By default the disclosure names nobody: *"an AI assistant calling on behalf of
my client."* Ask the agent to give your name and it will be said aloud instead.

If you keep a record of who has agreed to be called, point `CALL_CONSENT_CMD`
at a command that takes `--phone` and exits `0` when that number has consented.
Person calls will then be refused unless it does. Unset, no check is made.

## Notes

- **Updating.** `hermes plugins update` cannot update a plugin installed from a
  subdirectory — the installed copy carries no git metadata. Re-run the install
  command with `--force`.
- **The skill file does not load.** `skills/calle/SKILL.md` ships as
  documentation. Hermes discovers skills from its skills directory and
  `skills.external_dirs`; a plugin's own directory is in neither, so it will not
  appear in `hermes skills list`. The behaviour it describes lives in the tools.
- **`call start` is not exposed.** It plans and dials in one step without
  printing confirmation data. There is no code path to it here.
- **Calls in flight cannot be cancelled**, and one approval covers every
  recipient on the plan. The plan is capped at five.

MIT.
