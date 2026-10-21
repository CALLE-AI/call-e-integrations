---
---

No npm package release: publish standalone `callev2` `2.0.5` as the higher-version
target for the authorized automatic-update acceptance test. The packaged Skill
changes only its metadata version from `2.0.4` to `2.0.5`; current documentation
and evaluation versions are synchronized.

Keep the user's installed `2.0.4` unchanged. A fresh real Codex conversation must
load that installation and report the newer public version after an ordinary
capability question. Existing synthetic fixtures and historical evidence retain
their original versions. CLI and plugin package versions remain unchanged.
