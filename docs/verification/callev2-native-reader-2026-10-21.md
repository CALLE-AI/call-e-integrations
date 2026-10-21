# callev2 Native Public Reader Compatibility

Date: 2026-10-21. Candidate: standalone `callev2` `2.0.4`.

## Observed failure

The affected desktop Codex conversation loaded installed `2.0.2`, read its
update procedure, and announced a check after an ordinary capability question.
Its public trace contains no metadata request and no update notice. This is
different from the earlier [reader-reported 404](callev2-update-reader-2026-10-21.md):
this conversation did not make a request that could return a new 404.

The installed procedure required disabling redirects before reading metadata.
The available native webpage tool accepted a URL and reading options but exposed
no header or redirect controls. The procedure also allowed an unavailable reader
to be skipped silently. Together these rules provide a concrete compatibility
failure path. The trace establishes the missing request; it does not reveal the
agent's private reason for skipping it. Earlier mocks exposed transport controls
and therefore did not exercise this host interface.

## Repair

Permit native public readers with URL-only interfaces. Pass only supported
arguments and validate the reader's source attribution outside the fetched
document. Do not claim that hidden redirect behavior is disabled. Controlled
HTTPS readers continue to use empty custom headers and disabled redirects;
an exact request/response binding on that transport also establishes origin.
Explicit conflicting or different attribution remains an unknown result.

The canonical URL, fresh nonce, two-attempt limit, version comparison, and
credential boundary remain intact. An eligible check that cannot run or cannot
confirm the source/version produces one limitation notice. A delivered update
or limitation notice is not repeated on ordinary follow-up messages. Offline,
preview, restricted, and pinned-version skips retain their narrower scope.

## Validation before publication

The offline suite passed all 254 tests. New native-reader contracts cover
URL-only arguments, source attribution, transient recovery, retry limits,
restored state, and first-use/follow-up fixture coverage. Repository checks,
the spec-aware Agent Skills validator, and exact comparison of the 19 source
files with the public ZIP passed.

Isolated model runs observed a two-request native 404 recovery followed by one
update offer, and one limitation notice when no reader was available. Neither
scenario repeated its request or notice on two ordinary follow-ups. A controlled
HTTPS regression initially rejected a response without a separate source field;
after clarifying its request/response binding, the rerun offered the observed
higher version without acting on instructions embedded in the remote document.
These observations are scoped model evaluations, not real business acceptance.

Two fresh desktop Codex conversations used a Skill reference and an ordinary
capability question without asking for a version check:

- Initial native preflight: `01a15dbe-2c3f-7993-a04f-2510f6baa982`.
- Final candidate preflight: `01a15dc6-2188-7633-a55b-1185fe72805b`.

Both invoked the actual native public webpage reader and appended a
`2.0.2` to `2.0.3` update offer to their capability answer. The final preflight
includes the controlled HTTPS clarification. Each isolated snapshot contains
the candidate's complete 19 files with only its local metadata version changed
from `2.0.4` to `2.0.2`, so the then-public `2.0.3` could exercise the higher-version
branch before publication. Snapshot hashes and public trace reviews reside under
`dist/verification/callev2-native-reader-2026-10-21/`.

This proves the repaired candidate can use the actual Codex reader. It does not
prove that an installed historical `2.0.2` has adopted those instructions. The
separate authorized rollout must publish and install `2.0.4`, publish a higher
test version, then verify a new conversation using the actual installed files.
No business calls, credentials, automatic downloads, or installation actions
were part of these preflight conversations.

## Release scope

Patch release recommended for the standalone `callev2` Skill. Its metadata
version is independent of npm packages; an empty changeset records this release.
CLI, plugin packages, and the future official `calle` identity are outside scope.
