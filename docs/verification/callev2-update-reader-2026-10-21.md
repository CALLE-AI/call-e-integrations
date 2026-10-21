# callev2 Update Reader Investigation

Date: 2026-10-21. Candidate repair: `callev2` `2.0.2`.

## Observed failure and timing

The affected host loaded installed version `2.0.0` and automatically requested
the official raw `skills/callev2/SKILL.md` after an ordinary capability question.
At 07:26:13 UTC, its public webpage reader reported `404 Not Found`. The installed
procedure required a single request, silently skipped automatic failures, and
reused the session result. A later capability question did not retry the check.

Version `2.0.1` was merged at 07:34:37 UTC through
[PR #162](https://github.com/CALLE-AI/call-e-integrations/pull/162). The initial
failed check therefore preceded that publication. Even a successful read at the
initial check would not have established an available `2.0.1` update. The 404
explains why that check was unconfirmed; timing and session reuse also explain
the absence of a later update notice.

## Differential reproduction

The anonymous direct HTTP path returned status 200 and metadata `2.0.1` for:

```text
https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/callev2/SKILL.md
```

Its response dated 07:59:42 UTC had `Cache-Control: max-age=300` and the source
SHA-256 `23f0c6df6aba5e259293d3f29d0f54abee20cd9c08199077bbe16481b6feac9c`.
The public webpage reader returned metadata `2.0.0` for the same URL during the
comparison. A subsequent read returned `2.0.1`; reads using a new request nonce
and the explicit `refs/heads/main` form also returned `2.0.1`.

These observations establish inconsistent freshness and a transient reader
failure, not a missing repository file or an incorrect configured path. They
are consistent with caching in the reader or its upstream fetch path. They do
not identify which cache served the old content, prove the internal cause of
the earlier 404, or establish that a query parameter always bypasses every
intermediary. No business credentials were used in these probes.

## Repair scope

The previous procedure made one unqualified read, had no bounded recovery, and
hid the failed automatic result. The repair keeps the same canonical source and
adds a fresh, non-secret 16-character hexadecimal query nonce to every request.
A 404, timeout, or HTTP 500–599 permits one retry with another nonce. Other
failures, including permission denials and redirects, do not authorize a retry
or a different source. An attempted check that remains unconfirmed produces one
brief notice and preserves the original task.

Successful and unknown results are reused for the session. Ordinary later
messages do not create a request loop. The check also retains whether its notice
was delivered, so repeated ordinary questions omit the prior update paragraph.
An explicit check may start a new bounded check. Source parsing, anonymous access, download authorization, and
business-operation boundaries remain separate.

## Acceptance limits

Offline regression cases exercise fresh request validation, stale base-URL
responses, transient recovery, attempt limits, failure notices, and restored
mock state. Their execution results are recorded separately from real host
acceptance. They do not prove an external reader's future availability.

The user's installed `2.0.0` copy is preserved. It cannot acquire the repaired
procedure by reading remote version data: the old installed instructions remain
active until the user installs and loads a newer Skill. Publisher-side fresh
reads and isolated installation are distinct from that user acceptance test.

## Candidate validation

The offline suite passed all 245 tests, including eight added regression tests
for request validation, transient recovery, retry bounds, explicit rechecks,
and state restoration. Repository checks and the spec-aware Agent Skills
validator passed. The public ZIP contains the same 19 non-hidden source files.

An isolated Codex run used synthetic metadata responses and a local version
override of `2.0.0` with the repaired instructions. Initial trace review found
that both three-turn cases repeated their update paragraph when the user
repeated an identical capability question. The original failed evidence was
retained, and the procedure was strengthened to track delivered notices and
consult prior assistant responses before composing each response.

The rerun covered a fresh read after a stale base-URL snapshot, 404 recovery,
and exhausted 404s. In both three-turn cases, the initial capability question
was followed by the identical question and then a transcript capability question.
These are isolated model evaluations, not real CALL-E operations or proof that
the installed historical copy has adopted the new procedure. Local evidence
resides under `dist/verification/callev2-2.0.2-publication-2026-10-21/`;
publication and installation checks are recorded there separately.
