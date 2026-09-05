---
"@call-e/cli": patch
---

Always emit the documented JSON error envelope, and surface upstream error detail safely.

`runCli` previously rethrew every error that was not an `InvalidArgumentsError`, so any
transport or upstream HTTP failure escaped to `main()` and printed a bare message to stderr
with nothing on stdout. Agent hosts are instructed to treat all command output as JSON, so a
failed `auth login` left them with an empty stdout and no `error.code` to branch on.

Every failure now leaves through `writeCommandError`. `error.code` is always CLI-owned:
`broker_unavailable` when the brokered-login service returns a 5xx, `http_error` for other
non-success statuses, and `transport_error` when `fetch` rejects or times out before a
response arrives. Upstream detail is exposed only under `error.remote_error` after passing
through the same sanitizer used for MCP call errors: only `code` and `message` are read
(top-level or nested under `error`), all other fields are dropped unread, codes are
constrained to `[A-Za-z0-9_.:-]` and 64 characters, messages are capped at 500 characters,
and ANSI/C0/C1 terminal control sequences are stripped before anything reaches stdout or
stderr. An upstream body cannot set the top-level code, so it cannot impersonate stable
local codes such as `auth_required`.

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
    "status_code": 502,
    "remote_error": {
      "code": "oauth_register_failed",
      "message": "Failed to register an OAuth client. err_type=HTTPStatusError"
    }
  }
}
```

The CLI reference and README now document the error envelope and its stable fields.
