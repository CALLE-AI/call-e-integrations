---
"@call-e/cli": patch
"@call-e/codex-plugin": patch
"@call-e/claude-plugin": patch
"@call-e/cursor-plugin": patch
---

Validate `--to-phone` locally in `calle call plan` and `calle call start` so malformed or fictional numbers fail as a format problem instead of being forwarded to `plan_call`, where they could be mislabeled as an unsupported region. Update packaged `call plan` examples to a valid-format NANP number.

Fixes #144
