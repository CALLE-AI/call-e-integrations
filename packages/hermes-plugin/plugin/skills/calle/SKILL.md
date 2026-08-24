---
name: calle
description: Place a phone call and report what was said. Use when the answer exists only on the other end of a phone line — stock, price, availability, hours, lead times, whether a service is offered — or when the user asks for somewhere to be called. Plans first and never dials without the user's word.
version: 0.1.0
metadata:
  hermes:
    tags: [phone-call, call-e, voice, retrieval]
---

# CALL-E

Places real phone calls through CALL-E and reports what was said.

> **This ships as documentation, not as a loaded skill.** Hermes discovers
> skills from its skills directory and `skills.external_dirs`, and a plugin's
> own directory is in neither. The behaviour below is implemented in the
> plugin's tools; this file explains it to a reader. It will not appear in
> `hermes skills list`.

## When to use

- The user asks for a place to be called.
- The answer exists only by phone: current stock, a quoted price, whether
  something is in, hours that contradict the website, lead times.
- A website search has failed or the site is stale.

Do not use it to call people who have not agreed to be called, to place
marketing calls, or to call the same small business repeatedly.

## The tools

| Tool | Does |
|---|---|
| `calle_auth` | Sign in to CALL-E. Returns a URL for the user to open. |
| `calle_plan` | Build a call plan and return a summary. **Dials nothing.** |
| `calle_run` | Place the planned call. **Spends money. Rings a real phone.** |
| `calle_status` | Poll a call in progress, or fetch a finished one. |
| `calle_show` | Read a stored plan or outcome from local disk. |

## The flow

**1. Plan.** Call `calle_plan` with the number, the purpose, and each question
as a separate entry in `field`. Say who is being called with `callee_name`, and
whether it is a `business` or a `person`.

**2. Show the user, and stop.** `calle_plan` returns `confirm_summary`. Show it
to the user in full and ask whether to place the call. **Wait for an answer.**

This is the point of the split. Planning is free and reversible; the call is
neither. A phone rings in someone's house or shop, a stranger stops what they
are doing, and money is spent. The user decides that, not you.

**3. Run.** Once the user has agreed, call `calle_run` with the `plan_id`. It
waits for the call to finish, then returns the outcome. If it returns before
the call ends, poll `calle_status` with the `run_id`.

**4. Report.** Give the user what was actually said. If a question was not
answered, say so — do not fill the gap from the web or from what seems likely.

## Rules

**Never call `calle_run` without the user's explicit agreement in that
conversation.** Not implied by the request. Not assumed because they asked for
the call in the first place. A plan they have not seen is not a plan they have
approved.

**Person calls always disclose.** The opening says the caller is an AI and that
the call is transcribed. This is not optional and there is no flag to remove
it. On a `business` call, the disclosure is made if the callee asks.

**Read what was said, not what was meant.** The outcome carries the callee's
own words. Quote them. Do not upgrade a hedge into a commitment: "should be in
Friday" is not "in stock Friday".

**A missing answer is a result.** Report it as unanswered. An invented answer to
a question a stranger did not answer is worse than no call.

**Say the callee's name as they would say it.** `callee_name` is spoken aloud.
Use "Alex Fraser" or "Miller Hardware", never a relationship label like "Mom"
or "the dentist" — the callee does not know they are that to the user.

**One question per `field` entry.** Two questions in one entry get asked as one
and half the answer comes back.

## Authorization

If these tools are missing entirely after an install, the gateway has not been
restarted since. Tools are registered at gateway start.

If any tool reports that it is not authorized, call `calle_auth` with
`action: start`. Show the user the returned URL and wait. **Do not ask them to
reply with anything from the page.** When they say they are done, call
`calle_auth` with `action: poll`.

## What is not here

`call start` — plans and dials in one step with no confirmation — is not
exposed and there is no code path to it. Nor is any tool that injects text into
a call while it is running.

Outcomes are written to local disk when a call ends. The provider deletes its
own copy within days, after which `calle_show` is the only way to read it back.

Full command reference: `references/commands.md`.
