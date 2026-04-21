---
name: calle
description: >
  Use the Call-E OpenClaw plugin, when already installed and enabled, to plan,
  start, and monitor real outbound phone calls. Also use when the user
  explicitly asks to set up or repair the Call-E plugin.
license: MIT-0
metadata:
  openclaw:
    requires:
      bins:
        - openclaw
        - node
---

# Call-E

Use this skill to work with the existing `calle_*` tools for real outbound
phone calls.

Default assumption:

- the Call-E plugin is already installed
- the plugin is already enabled
- the current environment already exposes the `calle_*` tools

Do not treat plugin setup as part of the normal call flow.

* * *

## Safety and consent rules

- Real phone calls can contact external people or businesses and may create
  cost, privacy, or compliance implications.
- Do not guess phone numbers, country codes, region, or language.
- If the user only wants a script, wording help, roleplay, or a simulated
  dialogue, do not use the plugin tools.
- `openclaw plugins install`, `openclaw plugins enable`, and
  `openclaw gateway restart` are local persistent environment changes.
- Never run install, enable, or restart commands unless the user explicitly
  asked to set up or repair the plugin and explicitly approved that specific
  action.
- A request to place a phone call is not permission to install the plugin,
  enable it, or restart the gateway.
- If the plugin is missing during a call request, stop and tell the user what
  is missing. Offer the exact setup command or ask whether they want setup
  help, but do not perform setup automatically.
- Before `calle_run_call`, obtain explicit confirmation that the user wants to
  place the real call now.

* * *

## Trigger phrases

Use this skill when the user expresses intent such as:

- "call this number"
- "make a phone call"
- "call the business"
- "call the customer"
- "place an outbound call"
- "follow up by phone"
- "check the status of that call"
- "set up the Call-E plugin"
- "repair the Call-E plugin"

* * *

## When to use this skill

Use this skill when the user wants to:

- place a real outbound phone call with the existing Call-E tools
- continue a call workflow that already uses Call-E
- check the status of a call that has already started
- explicitly set up, repair, or verify the Call-E plugin

This skill is appropriate when the user clearly means a real phone call and
the agent should prefer the Call-E workflow over unrelated capabilities.

* * *

## When not to use this skill

Do not use this skill for:

- writing a call script only
- simulated conversations or rehearsal
- general contact lookup that does not require placing a call
- proactive local setup when the user only asked to make a call
- unrelated OpenClaw troubleshooting outside the scope of the Call-E plugin

* * *

## Prerequisite

Normal call handling assumes the Call-E plugin is already ready in the current
environment.

Expected tools:

- `calle_plan_call`
- `calle_run_call`
- `calle_get_call_run`

If those tools are available in the current session, use them directly and do
not fall back to shell commands, raw HTTP requests, or other improvised paths.

If those tools are not available:

- do not place the call
- explain that the plugin is not ready in this session
- provide the setup commands if helpful
- only perform setup if the user explicitly requested setup or repair and then
  explicitly approved each local change

Source repository:

- https://github.com/CALLE-AI/call-e-integrations

* * *

## Optional setup or repair flow

Use this section only when the user explicitly asked to set up, reinstall, or
repair the Call-E plugin.

### Step 1 - Inspect current state

Prefer the read-only command below to check whether `calle` is present:

`openclaw plugins list`

Inspection alone does not authorize install, enable, or restart.

### Step 2 - Install only with explicit approval

Run this only after the user explicitly approved installation:

`openclaw plugins install @call-e/openagent`

### Step 3 - Enable only with explicit approval

Run this only after the user explicitly approved enabling the plugin:

`openclaw plugins enable calle`

### Step 4 - Restart only with explicit approval

Run this only after the user explicitly approved restarting the gateway:

`openclaw gateway restart`

### Step 5 - Verify readiness

After setup changes, confirm whether the current session can see the Call-E
tools.

If the current session still does not expose the tools after restart, tell the
user to retry the same request in a new session.

* * *

## Tool flow

Once the plugin is available, use the tools in this order.

Hard rules:

- If `calle_plan_call`, `calle_run_call`, and `calle_get_call_run` are
  available in the current session, do not use `exec`, shell commands, Node
  scripts, `curl`, raw HTTP requests, or direct MCP calls for Call-E work.
- When those `calle_*` tools are available, do not delegate Call-E execution
  or polling to a subagent.
- If the user asked not to use subagents, that does not authorize an `exec`
  fallback. Stay on the `calle_*` tool path.

### 1. Plan first

Always start with `calle_plan_call`.

Pass the user's latest request in `user_input`.

Only provide structured fields such as `goal`, `language`, `region`, or
`to_phones` when they are explicitly known.

Do not invent or normalize uncertain phone numbers or locale details.

### 2. Run only after planning is ready and the user confirms

Use `calle_run_call` only after planning returns a valid `plan_id` and
`confirm_token`.

Use those values exactly as returned.

Do not start the call unless the user explicitly confirmed that they want the
real call to be placed now.

### 3. Check status only for an existing call

Use `calle_get_call_run` only when a call has already started and a valid
`run_id` exists.

Summarize the status clearly for the user.

* * *

## Authentication flow

If a Call-E tool returns authentication requirements:

- check for `auth_required`
- check for `login_url`

When present:

1. tell the user to open the browser link
2. ask them to complete login
3. retry the same tool call after login completes

Do not switch to a different tool or invent fallback behavior for protected
actions.

* * *

## Notes for the agent

- Prefer the Call-E workflow quickly when the user clearly means a real phone
  call and the plugin is already available.
- Keep setup separate from normal call execution.
- If plugin setup is required but not yet approved, stop and ask for approval
  or provide the exact commands for the user to run manually.
- Keep user-facing explanations short: verify readiness, authenticate if
  needed, then plan or inspect the call.
- If execution is blocked because local setup has not been approved, do not
  bypass that restriction with other tools or ad hoc scripts.
