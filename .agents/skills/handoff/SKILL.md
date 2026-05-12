---
name: handoff
description: Create concise, forwardable handoffs for Coding Agent work, blockers, reviews, escalations, or context transfers. Use when Codex needs to package current state, decisions, evidence, file references, command outputs, risks, and next steps into a Markdown artifact that another person or agent can continue from.
---

# Handoff

Create a handoff that lets another person or agent continue the work without replaying the whole conversation. Prefer a compact, evidence-backed Markdown artifact over a broad transcript dump.

## Default Workflow

1. Identify the handoff intent:
   - `continue`: another agent should pick up the work
   - `review`: a person should inspect a decision, diff, or result
   - `escalate`: help is needed on a blocker or question
   - `archive`: preserve the current state for later
2. Capture only the context needed to continue:
   - current status and completed work
   - next steps or the specific question to answer
   - key files with narrow line ranges
   - relevant command outputs and verification results
   - risks, assumptions, constraints, and known non-goals
3. Generate the Markdown with `scripts/create_handoff.py` when a file or clipboard-ready artifact is useful.
4. Review the generated handoff before sharing:
   - The title should make the work recognizable in five seconds.
   - The summary should say what changed and why the handoff exists.
   - The next steps or open questions should be actionable.
   - The artifact should not leak secrets, customer data, or private credentials.

## Output Contract

- Default output directory: `_handoffs/`
- Resolve the output directory relative to `--base-dir`; if omitted, use the current working directory.
- Default filename: `YYYYMMDD-HHMMSS-<title-slug>.md`
- Copy the generated Markdown to the system clipboard by default when a clipboard command is available.
- Include Git repo root and branch when available.
- Every handoff should contain at least:
  - generation time
  - base directory and Git metadata when available
  - intent
  - summary
  - status
  - next steps or open questions
  - relevant context files, command outputs, and notes when provided

## Script

Script: `scripts/create_handoff.py`

Common flags:

- `--title`: one-line handoff title, required
- `--summary`: why this handoff exists and what the receiver needs to know, required
- `--intent`: `continue`, `review`, `escalate`, or `archive`; defaults to `continue`
- `--status`: repeat to record completed work or current state
- `--next-step`: repeat to list concrete continuation steps
- `--open-question`: repeat to list unresolved questions or blockers
- `--decision`: repeat to record decisions already made
- `--risk`: repeat to record risks, assumptions, or tradeoffs
- `--note`: repeat to record extra context
- `--context PATH[:START[-END]]`: repeat to attach code context
  - `src/app.py`
  - `src/app.py:20`
  - `src/app.py:20-60`
- `--command "..."`: repeat to capture read-only command output
- `--base-dir`: base directory for resolving context paths and running commands; defaults to the current working directory
- `--out-dir`: output directory; defaults to `_handoffs`
- `--slug`: override the filename slug; defaults to a slug derived from the title
- `--no-clipboard`: skip copying generated Markdown to the system clipboard

Example:

```bash
python3 scripts/create_handoff.py \
  --title "Auth callback refactor ready for review" \
  --intent review \
  --summary "The callback handler now validates state before exchanging tokens. Please review the error-path behavior and naming before merge." \
  --status "Updated the callback route and shared OAuth helper." \
  --status "Added regression coverage for missing and mismatched state." \
  --next-step "Review the redirect behavior for expired sessions." \
  --open-question "Should invalid state redirect to login or show a dedicated error page?" \
  --context "src/routes/auth/callback.ts:1-160" \
  --context "tests/auth-callback.test.ts:20-110" \
  --command "pnpm test tests/auth-callback.test.ts --runInBand" \
  --risk "No manual browser pass has been run yet."
```

## Context Rules

- Prefer file paths with explicit line ranges over whole files.
- Include command outputs only when they prove status, failures, or verification.
- If the handoff is tied to a diff, include the relevant snippets and a short change summary.
- Do not run mutating or destructive commands through `--command`; convert them to read-only checks or paste the relevant result manually.
- Do not include tokens, cookies, secrets, full `.env` files, production credentials, customer data, or private account details.

## Inline Handoffs

When a persistent artifact is unnecessary, write the handoff directly in the final response with the same shape:

- title
- intent
- summary
- status
- next steps or open questions
- evidence and verification
- risks or assumptions

Keep inline handoffs short enough to act on immediately.
