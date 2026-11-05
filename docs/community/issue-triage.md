# Community issue triage

This policy keeps CALL-E Integrations issues actionable, safe, and useful for
maintainers and community contributors. Issue types identify the kind of work;
labels identify the affected area, priority, workflow status, and whether
community participation is appropriate.

## Issue types

Use the existing organization issue types. Do not duplicate them with labels.

| Type | Use when |
| --- | --- |
| `Bug` | Existing or promised behavior is broken, a public contract is violated, or runtime behavior creates an unexpected result or safety risk. |
| `Feature` | A user requests a capability or product outcome that does not exist yet. |
| `Task` | The work is documentation, testing, refactoring, release, maintenance, or another concrete engineering task. |

Account, billing, credit, routing-availability, and general usage questions are
support requests rather than engineering work. Answer or redirect those through
the configured support channel. If a support thread reveals a reproducible
defect, track the defect in a separate `Bug` issue and link both issues.

## Area labels

Use one primary area in most cases and no more than two when the issue genuinely
spans separate owners.

| Label | Scope |
| --- | --- |
| `area:core` | Core package, shared authentication, tokens, and call-tool integration logic. |
| `area:cli` | CALL-E CLI installation, authentication, and command behavior. |
| `area:plugins` | Claude, Codex, Cursor, OpenClaw, and other agent integrations. |
| `area:docs` | README files, guides, examples, API or MCP documentation, and developer guidance. |
| `area:platform` | Deployed API, telephony routing, speech, billing, and backend runtime behavior. |

## Priority labels

Priority expresses impact and urgency, not implementation effort.

| Label | Meaning |
| --- | --- |
| `priority:p1` | Critical safety or production impact requiring immediate maintainer attention, including possible delayed, duplicate, or unintended calls. |
| `priority:p2` | Blocks meaningful usage or violates a public product or developer contract. |
| `priority:p3` | Planned improvement, feature request, or non-blocking documentation work. |

## Status labels

Every open actionable issue must have exactly one status. Closed issues must not
retain a status label.

| Label | Meaning |
| --- | --- |
| `status:needs-triage` | New issue awaiting maintainer classification. |
| `status:needs-info` | Waiting for specific reproducible details or environment information from the reporter. |
| `status:needs-investigation` | Accepted report requiring maintainer investigation. |
| `status:blocked` | Accepted work blocked by product, operations, a provider, or an upstream dependency. |
| `status:ready-for-work` | Scope and acceptance criteria are clear and implementation can start. |
| `status:needs-validation` | A fix or capability is available and awaiting real-world validation. |

The normal flow is:

```text
needs-triage
  -> needs-info
  -> needs-investigation
  -> blocked or ready-for-work
  -> needs-validation
  -> closed
```

Move directly between states when the evidence supports it. Do not use status
labels to promise delivery dates.

## Community labels

Community labels signal genuine readiness for external contributions.

| Label | Use when |
| --- | --- |
| `help wanted` | The solution direction and acceptance criteria are clear, and maintainers explicitly welcome an external implementation. |
| `good first issue` | The scope is small, the edit location and validation steps are explicit, and the work requires no internal permissions or operational access. |

Do not use `good first issue` as a promotional label. Apply it only after a
maintainer has made the issue independently executable by a newcomer.

## Closing reasons

- Use `Completed` when the requested outcome is implemented or otherwise
  satisfied.
- Use `Not planned` when maintainers deliberately decline or cannot pursue the
  work, and explain the decision respectfully.
- Use `Duplicate` when another issue owns the same actionable scope, and link
  the canonical issue.
- Do not close an issue only because it has been inactive for a long time.
- Remove every `status:*` label when closing an issue.

Do not use `invalid`, `wontfix`, or `duplicate` labels as substitutes for the
GitHub closing reason.

## Titles and triage comments

Write titles as concise outcomes or problems. Do not repeat issue types with
prefixes such as `Bug:`, `Feature:`, or `[Bug]`. Avoid rewriting a reporter's
title unless it is misleading or the issue scope has changed.

Read the complete description and discussion before triaging. A maintainer
triage comment should state the decision, type, area, priority, status, and a
concrete next step without promising an unconfirmed delivery date. Ask for
specific missing evidence rather than using a generic response. Avoid adding
comments solely for historical metadata backfills.

When one thread mixes support, a feature request, and a reproducible defect,
keep the original purpose intact, split each actionable scope into its own
issue, and link the issues in both directions.

## Security and privacy

Never post API keys, OAuth tokens, confirmation tokens, full phone numbers,
personal data, sensitive call transcripts, or private internal logs in a public
issue. Redact reproduction steps and include only diagnostic identifiers that
are safe to disclose. Report security vulnerabilities through the repository's
security policy rather than a public issue.

For calling incidents, explicitly record whether an unintended, duplicate, or
delayed real call is possible. Treat that uncertainty as a safety concern until
maintainers confirm the run is terminal and cannot dispatch later.
