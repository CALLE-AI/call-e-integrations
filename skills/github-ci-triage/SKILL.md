---
name: github-ci-triage
description: Use this project-local skill when the user asks Codex to inspect, diagnose, summarize, rerun, or fix GitHub Actions CI, release, test, deploy, or workflow failures for this repository.
---

# GitHub CI Triage

Use this skill to investigate GitHub Actions failures from this repository.
Prefer the GitHub CLI (`gh`) when it is installed and authenticated because it
can read private repository runs without the user pasting logs.

## Guardrails

- Never print, request, or expose token values, npm tokens, GitHub PATs, or
  secret contents. Secret names and last-updated timestamps are safe.
- Do not rerun release, deploy, publish, or production-impacting workflows unless
  the user clearly asks to retry that workflow.
- Do not assume a failure is in "CI" just because the user says CI. Check all
  recent workflows for the relevant branch, PR, and commit.
- Preserve unrelated worktree changes. Do not use destructive git commands.

## Fast Path

1. Identify local context:

```bash
git status --short --branch
git remote -v
git branch --show-current
git log -1 --oneline --decorate
```

2. Check GitHub CLI access:

```bash
command -v gh
gh auth status
```

If `gh` is missing, tell the user to install it or provide a run URL/logs. If
`gh` is present but not authenticated, tell the user to run `gh auth login`.

3. List relevant runs, broadening scope as needed:

```bash
gh run list --branch <current-branch> --limit 20
gh run list --limit 20
gh pr status
gh pr view --json number,title,headRefName,baseRefName,state,url,statusCheckRollup
```

For a known PR number, use:

```bash
gh pr checks <pr-number>
```

4. Inspect the failing run:

```bash
gh run view <run-id> --json name,displayTitle,event,headBranch,headSha,status,conclusion,jobs,url
gh run view <run-id> --log-failed
```

Read the failed job and failed step first. Capture the workflow name, run URL,
job name, step name, event, branch, commit SHA, and the first concrete error.

## Diagnosis Pattern

- If PR checks pass but a push workflow fails, say so explicitly and distinguish
  PR CI from main-branch release/deploy workflows.
- If the error mentions permissions, pull requests, pushes, packages, secrets,
  or authentication, inspect the workflow file and secret names:

```bash
rg -n "permissions|github-token|GITHUB_TOKEN|secrets\\.|NPM_TOKEN|pull-requests|contents" .github package.json scripts packages -g '!node_modules'
gh secret list --repo <owner>/<repo>
```

Do not attempt to read secret values. Explain which secret or repository setting
likely needs to change.

- If logs point to a code, lint, typecheck, test, package, or lockfile failure,
  reproduce locally with the repository's documented commands, usually from
  `AGENTS.md`.
- If the run logs are too large or truncated, inspect the specific job log:

```bash
gh run view <run-id> --job <job-id> --log
```

Download artifacts or full logs only as needed.

## Retrying

For normal CI after a fix or when the user asks to retry:

```bash
gh run rerun <run-id> --failed
gh run watch <run-id>
```

For workflow dispatch:

```bash
gh workflow run <workflow-file-or-name> --ref <branch>
gh run list --workflow <workflow-file-or-name> --limit 5
```

Before rerunning release, deploy, publish, or production workflows, state the
potential side effect and wait for clear user intent if it was not already
given.

## Response Shape

Keep the answer concise and include:

- failing workflow and run link
- failing job and step
- exact error summary
- likely root cause
- concrete next action or fix
- whether local reproduction or rerun was performed
