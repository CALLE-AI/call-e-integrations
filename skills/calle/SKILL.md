---
name: calle
description: >
  Install, enable, and use the Call-E OpenClaw plugin to place and monitor
  real outbound phone calls. Use when: making a phone call, calling a
  business, calling a customer, following up by phone, checking call status.
license: MIT-0
metadata:
  openclaw:
    requires:
      bins:
        - openclaw
        - node
---

# Call-E

Install, enable, and use the Call-E OpenClaw plugin for real outbound phone
calls.

This skill handles two things as part of its normal purpose:

1. Prepare the local OpenClaw environment so the `calle` plugin is available.
2. Teach the agent how to use the `calle_*` tools correctly once the plugin is
   available.

Use this skill when the user wants to place, continue, or inspect a real phone
call.

* * *

## Safety and consent rules

- Installing this plugin is an external software installation.
- Restarting the OpenClaw gateway is a privileged local operation.
- Real phone calls can contact external people or businesses and may create
  cost, privacy, or compliance implications.
- Do not place a real call unless the user clearly intends to do so.
- Do not guess phone numbers, country codes, region, or language.
- If the user only wants a script, wording help, roleplay, or a simulated
  dialogue, do not use the plugin tools.

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

* * *

## When to use this skill

Use this skill when the user wants to:

- install or enable the Call-E plugin
- place a real outbound phone call
- continue a call workflow that uses Call-E
- check the status of a call that has already started
- recover from a missing-plugin situation before making a call

This skill is especially appropriate when the user says they want to make a
phone call directly and the agent should prefer the Call-E workflow instead of
searching broadly across unrelated capabilities.

* * *

## When not to use this skill

Do not use this skill for:

- writing a call script only
- simulated conversations or rehearsal
- general contact lookup that does not require placing a call
- unrelated OpenClaw troubleshooting outside the scope of the Call-E plugin

* * *

## Prerequisite

This skill depends on the Call-E OpenClaw plugin.

If the plugin is missing, install it with:

`openclaw plugins install @call-e/openagent`

Then enable the plugin:

`openclaw plugins enable calle`

Then restart the gateway if needed:

`openclaw gateway restart`

If the current session still does not see the plugin tools after restart,
retry the same request in a new session.

* * *

## What gets installed

This setup installs the published Call-E OpenClaw plugin and prepares the
local gateway to load it.

Expected tools after setup:

- `calle_plan_call`
- `calle_run_call`
- `calle_get_call_run`

Source repository:

- https://github.com/CALLE-AI/call-e-integrations

* * *

## Definition of Done

This task is not complete until all of the following are true:

1. the `calle` plugin is installed
2. the plugin is enabled
3. the OpenClaw gateway has been restarted if needed
4. the Call-E tools are available in the current environment, or the user has
   been clearly told to retry after restart
5. if the user wanted to place a call, the agent proceeds through the correct
   Call-E tool flow

* * *

## Install flow

### Step 1 - Check plugin availability

Prefer using `openclaw plugins list` to determine whether `calle` is already
installed.

If `calle` is already present, do not reinstall it unless the user explicitly
asks to reinstall or repair setup.

### Step 2 - Install and enable plugin if needed

If the plugin is missing, run:

`openclaw plugins install @call-e/openagent`

Then run:

`openclaw plugins enable calle`

This is the preferred installation path.

### Step 3 - Restart gateway if needed

After install or enable, run:

`openclaw gateway restart`

Then tell the user to retry the same request if the current session has not
picked up the plugin yet.

### Step 4 - Verify readiness

A successful setup should make these tools available:

- `calle_plan_call`
- `calle_run_call`
- `calle_get_call_run`

If those tools are not yet available, do not proceed with call execution.

* * *

## Tool flow

Once the plugin is available, use the tools in this order.

Hard rule:

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

### 2. Run only after planning is ready

Use `calle_run_call` only after planning returns a valid `plan_id` and
`confirm_token`.

Use those values exactly as returned.

Do not start the call unless the user clearly wants to proceed.

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
  call.
- Treat plugin setup as part of the normal workflow, not a separate advanced
  task.
- If setup changed the local environment, be explicit that the gateway may
  need a restart before tools appear.
- Keep user-facing explanations short: install if needed, authenticate if
  needed, then place or inspect the call.
- If execution is blocked because the local environment cannot run commands,
  provide the exact install command and explain the next step briefly.
