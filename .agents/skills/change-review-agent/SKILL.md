---
name: change-review-agent
description: Use this project-local skill when the user asks Codex to start, spawn, launch, or use an agent/subagent to review current code changes, implementation, diff, or completed modifications in this repository with read-only review, readiness checks, conflict checks, impact analysis, evidence-backed findings, escalation notes, and P0-P3 severity ratings.
---

# Change Review Agent

Use this skill after implementation work when the user explicitly asks for an
agent or subagent to review the current changes. The review agent is a second
pass, not the implementer, and must not edit files.

## Trigger Phrases

Examples include:

- "start an agent review for these changes"
- "ask another agent to review the diff"
- "spawn a review agent"
- "run a subagent code review"
- "use an agent to review my changes"

Do not use this skill merely because the user asks for depth, confidence, or a
normal review. Only start a subagent when the user explicitly requests an agent
or subagent.

## Workflow

1. Finish any in-progress local edits before starting the review.
2. Capture the local review scope, including staged and untracked files:

```bash
git status --short --untracked-files=all
git diff --stat HEAD
git diff --name-only HEAD
git diff --check HEAD
git ls-files --others --exclude-standard
```

If the worktree contains unrelated user changes, identify the files that belong
to the current task and tell the review agent to focus on those files. If
untracked files are in scope, include their paths and either their contents or a
concise content summary in the review prompt because `git diff` will not show
them.

3. Check review readiness before spawning:
   - If the diff is too broad, mixes unrelated goals, or has unclear scope, ask
     the reviewer to report this as a finding or note.
   - If verification is missing, pass that fact through explicitly instead of
     implying the change was tested.
   - If generated files, lockfiles, snapshots, or package outputs are present,
     tell the reviewer whether they are in scope or incidental.
4. Start one read-only review agent, normally an `explorer` agent.
5. In the review prompt, include:
   - repository path
   - original user request or current task goal
   - files in scope
   - verification already run and any failures
   - explicit instruction not to edit files or run mutating commands
6. Wait for the reviewer before giving the final answer, unless the user asks
   for an asynchronous handoff.
7. Triage the review result:
   - Do not make follow-up code edits just because the reviewer found issues.
     Report the findings first and wait for explicit user direction unless the
     user already asked to "review and fix".
   - If the user explicitly asked to review and fix, validate the finding
     yourself before editing, then rerun relevant checks.
   - If the user asked only for review, report the findings without making
     further changes.
   - If the review has no findings, say that clearly and mention any remaining
     test gaps or risks.

## Allowed and Forbidden Actions

The review agent may run read-only inspection commands such as `git status`,
`git diff`, `git diff --check`, `git log`, `rg`, `sed`, `find`, `ls`, package
metadata reads, and test-file inspection.

The review agent must not edit files, format code, stage changes, commit,
install or update dependencies, regenerate outputs, run package scripts that
can mutate the worktree, or apply automated fixes. If a command might mutate
the worktree, the reviewer should list it as suggested verification instead of
running it.

## Review Readiness

Before line-level review, the reviewer should decide whether the diff is ready
for useful review:

- scope: one coherent task, no unrelated refactors or formatting churn
- context: task goal and changed files are understandable from the prompt and
  diff
- size: large or multi-package diffs identify main files and likely review
  order; overly broad diffs should be flagged for splitting
- verification: relevant checks are reported, missing, or intentionally skipped
- generated artifacts: lockfiles, snapshots, bundled outputs, and generated docs
  are either explained or flagged as unclear

Readiness problems can be findings when they create merge risk, or notes when
they only limit review confidence.

## Review Order

Ask the reviewer to inspect in this order:

1. Understand the task goal, diff summary, changed file list, and impact area.
2. Review the main implementation files and contracts first.
3. Review tests next, including whether they fail for the changed behavior.
4. Review package metadata, manifests, docs, install steps, generated files, and
   release/changeset implications.
5. Scan the rest of the in-scope files so every human-written change has been
   considered.

## Review Focus

The review agent should inspect the diff as a production code reviewer. Ask it
to cover:

- conflicts with existing behavior, public APIs, package/plugin manifests,
  install flows, docs, marketplace entries, and established repository patterns
- impact area: affected packages, commands, docs, tests, generated artifacts,
  user-visible behavior, and release or changeset implications
- correctness risks: regressions, broken contracts, missing edge cases,
  incomplete error handling, async/concurrency issues, and platform assumptions
- test risk: changed behavior without targeted coverage, stale snapshots, or
  verification that does not exercise the risky path
- maintainability risk: duplicated logic, unclear ownership boundaries, or
  changes that make future package integration work harder
- security and supply-chain risk: secrets, unsafe shelling out, untrusted input,
  dependency changes, permissions, tokens, and package publishing surfaces
- migration and rollback risk: config changes, persistent state, release tags,
  marketplace pointers, install commands, or behavior that is hard to undo

## Evidence Standard

Every finding must be actionable and evidence-backed:

- include priority, file/line, affected surface, risk, and smallest fix
- explain the concrete failure mode or merge risk, not just a preference
- distinguish confirmed defects from hypotheses and unverified concerns
- label style-only or taste-only feedback as `P3` or a note
- avoid comments that only restate the diff or ask broad questions without a
  specific risk

If a reviewer cannot verify a concern from the available context, they should
state what evidence is missing and which command or file would resolve it.

## Escalation

Ask for a domain expert or maintainer decision instead of overclaiming when the
change touches areas such as:

- security, auth, tokens, private data, or permissions
- release automation, package publishing, versioning, changesets, or
  marketplace metadata
- installation flows, generated package contents, plugin manifests, or host-tool
  compatibility
- concurrency, async ordering, persistent state, migrations, or destructive
  commands
- broad architecture changes or ownership boundaries across packages

## Severity Ratings

Require every finding to include one priority:

- `P0`: blocks release or can cause data loss, security exposure, widespread
  runtime failure, broken installs, or destructive behavior.
- `P1`: likely user-facing regression, broken supported workflow, incompatible
  package/API behavior, or high-confidence CI/release failure.
- `P2`: localized bug, missing important test, confusing behavior, or
  compatibility risk that should be fixed before merge.
- `P3`: low-risk cleanup, naming clarity, minor docs issue, or maintainability
  improvement that can reasonably follow later.

Findings without a concrete risk should be reported as notes, not blocking
findings.

## Review Agent Prompt Template

Use a focused prompt like this:

```text
Review the current uncommitted changes in <repo-path> as a code reviewer.

Do not edit files or run mutating commands. Inspect git status, git diff, and
the relevant source/tests. Focus only on these in-scope files unless another
file is needed to understand a contract:

<files>

Original task:
<task>

Verification already run:
<commands and results>

First assess review readiness: scope clarity, unrelated changes, diff size,
missing verification, and any unexplained generated artifacts.

Review in order: overall task and impact, main implementation and contracts,
tests, package/docs/manifests/generated files, then the rest of the in-scope
human-written changes.

Review for conflicts with existing behavior, public APIs, package/plugin
manifests, install flows, docs, marketplace entries, and established repository
patterns. Assess impact area, security/supply-chain risk, rollback risk, and
release/changeset implications.

Return findings first, ordered by severity. Each finding must include a P0-P3
priority, concrete file/line reference, affected surface, risk, and smallest
actionable fix. Prioritize bugs, regressions, broken contracts, missing tests
for changed behavior, release or packaging risks, and hidden compatibility
conflicts. If there are no findings, say that directly and list residual test
gaps or impact areas that were not verified. Escalate anything needing a domain
expert or maintainer decision instead of overclaiming certainty.
```

## Reporting Shape

When the agent returns, answer in a code-review style:

- findings first, ordered by severity, each with `P0`-`P3`
- affected surface and impact area for each finding
- review readiness issues, if any
- escalation or maintainer-decision items, if any
- open questions or assumptions
- whether the reviewer found no issues
- verification status and remaining test gaps

Do not bury real findings in a long summary. If you disagree with a reviewer
finding, state why and whether you verified the disagreement locally. Do not
make additional code changes after the review unless the user explicitly asks
you to fix the findings.
