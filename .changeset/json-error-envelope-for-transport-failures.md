---
"@call-e/cli": patch
---

Always emit the documented JSON error envelope, and surface the upstream error body.

`runCli` previously rethrew every error that was not an `InvalidArgumentsError`, so any
transport or upstream HTTP failure escaped to `main()` and printed a bare message to stderr
with nothing on stdout. Agent hosts are instructed to treat all command output as JSON, so a
failed `auth login` left them with an empty stdout and no `error.code` to branch on.

Failures now leave through `writeCommandError` like any other error, and `HttpStatusError`
gains its own payload branch carrying `status_code`, the parsed upstream `remote_error`, and
a bounded fallback for non-JSON bodies. When the brokered-login registration endpoint returns
5xx, the message also states that the failure is server-side and that the Developer API path
does not depend on it — the previous output invited users to reinstall the CLI instead.

Before, against a broker returning 502:

```text
Client error '502 Bad Gateway' for url '.../api/v1/openagent-auth/sessions'
```

After:

```json
{
  "ok": false,
  "error": {
    "code": "oauth_register_failed",
    "status_code": 502,
    "remote_error": {
      "code": "oauth_register_failed",
      "message": "Failed to register an OAuth client. err_type=HTTPStatusError"
    }
  }
}
```
