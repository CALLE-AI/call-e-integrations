---
"@call-e/core": minor
"@call-e/cli": patch
---

Always emit the documented JSON error envelope, with one sanitization boundary for remote text.

`runCli` previously rethrew every error that was not an `InvalidArgumentsError`, so any
transport or upstream HTTP failure escaped to `main()` and printed a bare message to stderr
with nothing on stdout. Agent hosts are instructed to treat all command output as JSON, so a
failed `auth login` left them with an empty stdout and no `error.code` to branch on.

**core** (minor: new public subpath and additive error API)

- New public subpath `@call-e/core/sanitize`: `stripTerminalControls`, `redactSecrets`,
  `safeRemoteString`, `safeRemoteCode`, `publicRemoteError`, `sanitizeRemoteError`. One
  implementation for every remote-supplied string. Control sequences are *removed* before
  credential detection so a control code cannot split a secret; credential-shaped substrings
  are redacted; codes must match `-?[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}` (numbers only as safe
  integers); messages are bounded to 500 characters; `publicRemoteError` is the only shape
  remote detail may take (`{ code?, message? }`).
- Control removal is by *sequence*, covering the 7-bit `ESC [` / `ESC ]` forms, the 8-bit
  `U+009B` / `U+009D` introducers, and invisible format characters (zero widths, joiners, bidi
  controls, soft hyphen, BOM). Safety is checked over two canonicalizations, because a sequence
  swallows its final byte and that byte can be chosen from the word being searched for
  (`Bea<U+009B>rer secret` strips to `Beaer`). Whenever the readings differ at all, the whole
  string is redacted. Mixed sequences can require a different interpretation per sequence,
  leaving neither global reading with a recognisable sensitive key, so conditioning the
  fail-closed path on either reading finding a credential is insufficient.
- Every terminal string control is consumed with its payload — OSC, DCS, SOS, PM and APC, in
  both 7-bit and 8-bit forms. OSC ends at BEL or ST; the other four end only at ST. All consume
  through end of input when unterminated. Embedded non-terminating ESC sequences remain part
  of that payload rather than defeating the outer match. Unicode line/paragraph separators
  are removed with other line
  controls so they cannot split a credential value. Private, standardized, and
  intermediate-byte ECMA-35 escape functions are removed whole, and C0/C1 bytes embedded in a
  CSI cannot strand its parameters. Stripping a lone introducer left the payload as text and
  split key names apart.
- `@call-e/core/http` adds `TransportError` (`url`, `method`, `timedOut`, `phase`, `code`),
  `InvalidResponseError`, and `causeCodeOf`. `McpHttpError` carries `phase` too, so every
  transport failure names where it failed. `requestJson` throws `TransportError` when `fetch`
  rejects, times out, or the body cannot be read, and `InvalidResponseError` when a 2xx body is
  not a JSON object — `JSON.parse` quotes its input in its own message, so letting a native
  `SyntaxError` escape would have published remote text as a locally-authored summary. Arrays
  are no longer accepted as JSON objects. `HttpStatusError` now records `url` and keeps the
  server-controlled HTTP reason phrase out of its locally authored `message`.
- `BrokerLoginError` keeps a terminal broker status/error message out of `Error.message` and
  distinguishes a terminal authorization outcome from the overall authorization wait timeout.
- `McpHttpError.message` is always locally authored. The server's JSON-RPC error text is kept
  raw in `payload` and, sanitized, in the new `remoteError` field. New fields `transport`,
  `timedOut`, `causeCode`. Timeouts, rejected fetches, and body-read failures are
  `code: "transport_error"`. Successful statuses must carry a JSON-RPC 2.0 response for the
  exact request ID with exactly one well-formed result/error; malformed, stale, wrong-version,
  or ambiguous outcomes are typed `invalid_response` errors instead of becoming successes.

**cli**

- Every failure leaves through `writeCommandError`. `error.code` comes from a single
  exported `ERROR_CODES` table via `classifyError`, which the JSON envelope, stderr, and
  telemetry all share; a test asserts the table matches `docs/cli-reference.md` exactly.
- `error.message` and stderr are authored by the CLI and never contain remote text. Remote
  detail — HTTP bodies, JSON-RPC errors, `plan_not_ready` clarifying questions — appears only
  under `error.remote_error` after sanitization.
- `transport_error` (and `error.transport: true`) is set only from the typed transport
  boundary. An unrelated local `TypeError` is `internal_error`, never a network condition.
- Terminal broker outcomes and the overall authorization wait use the CLI-owned
  `broker_login_failed` / `broker_login_timeout` codes; service wording is sanitized under
  `error.remote_error`, never copied into the trusted summary.
- `error.phase` survives the call-stage wrapper, and a body-phase failure says the request
  had already been accepted rather than claiming nothing was received — the difference
  decides whether retrying would place a second real call.
- Hostile-input regressions: forged `auth_required`, 20 KB flat and nested bodies,
  CR/LF/ANSI content, secret-like fields and secret-like substrings inside messages absent
  from stdout and stderr, hostile MCP `tools/list` and `tools/call` errors, a hostile
  clarifying question, rejected fetch, timeout, and an unrelated `TypeError`.

Before, against a broker returning 502:

```text
Client error '502 Bad Gateway' for url '.../api/v1/openagent-auth/sessions'
```

After:

```json
{
  "ok": false,
  "error": {
    "code": "broker_unavailable",
    "message": "HTTP 502 from https://.../api/v1/openagent-auth/sessions. The CALL-E login service is unavailable. ...",
    "status_code": 502,
    "remote_error": {
      "code": "oauth_register_failed",
      "message": "Failed to register an OAuth client. err_type=HTTPStatusError"
    }
  }
}
```

The CLI reference documents every stable envelope field and the complete `error.code` list.
