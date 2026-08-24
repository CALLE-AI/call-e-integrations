---
"@call-e/hermes-plugin": minor
---

Add the Hermes Agent plugin package. Registers five CALL-E tools (`calle_auth`,
`calle_plan`, `calle_run`, `calle_status`, `calle_show`) and installs from this
subdirectory in one command. Planning and dialling are separate tools, calls to
a person disclose that the caller is an AI, and call outcomes are stored
locally so they remain readable after the provider deletes its copy.
