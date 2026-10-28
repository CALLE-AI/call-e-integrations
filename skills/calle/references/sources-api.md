# Sources and verification status

Core business contract compiled on 2026-10-13; public authentication sources reviewed and guidance revised on 2026-10-14. `verified-on` covers public sources and offline deliverable checks only, not successful account authentication.

- [Quickstart](https://docs.heycall-e.com/quickstart): basic requests, the production API address, and reads after creation.
- [Authentication](https://docs.heycall-e.com/authentication) (2026-10-14): project API Keys, Bearer headers, server-side secret storage, read-only Goals checks, 401/403, and rotation by deploying a new Key before revoking the old one.
- [Dashboard](https://dashboard.heycall-e.com) (entry point confirmed by authentication documentation): login and project Key management. The Dashboard was not accessed; menus, permission options, display frequency, and revocation operations are not verified.
- [Calls](https://docs.heycall-e.com/calls): states, schema, idempotency, events, and cancellation.
- [Calls API Reference](https://docs.heycall-e.com/api-reference/calls): core HTTP interface.
- [Goals API Reference](https://docs.heycall-e.com/api-reference/goals): read-only interfaces for published Goals.
- [Goal Runs](https://docs.heycall-e.com/goal-runs): Goal discovery and interface boundaries; this Skill does not create Runs.
- [Errors](https://docs.heycall-e.com/errors): structured errors and recovery.
- [Regions & languages](https://docs.heycall-e.com/regions): destination and language support, requiring runtime rechecking.
- [Agent Skills Specification](https://agentskills.io/specification): directory and SKILL.md format.

Completed: reviewed public documentation; compiled the Skill, HTTP templates, core OpenAPI subset, and offline cases. Repository test records govern the execution status of static checks and Agent scenarios; test runners are not distributed with the Skill. Existing cases or parseable JSON do not establish passing Agent behavior.

Not completed: target-host integration for secret storage/injection/deletion; read-only or write requests using a real API Key; account/project identity, permissions, and balance verification; real Key rotation or server-side revocation; live dialing. No user Key was read and no real call was made.

The OpenAPI subset was manually authored for this package, not successfully downloaded as a complete official OpenAPI file. Offline validation from any version cannot replace real-environment integration tests.

Version 0.2.0 incorporated the API path into the unified calle-connect Skill. Interface selection and session update checking share the main entry point; API credentials, parameters, and idempotency rules remain separate. This did not change or revalidate the server contract.

The initial canonical standalone `calle` release was version 2.0.0, adopting the tested
`callev2` implementation and its existing MCP and API business contracts.
Existing host connections, private credential locations and saved call records
keep their original references. The initial live acceptance baseline is Codex
MCP; unexecuted API and other-client live checks remain explicitly unverified.
Earlier verification remains evidence only for its recorded source and scope.

On 2026-10-28, the publisher selected 1.0.0 as the current release designation,
retaining the 2.0.1 MCP/API workflow and result-handling protections. Earlier
release artifacts and verification records retain their original versions; this
version reset does not establish new service, host or security-audit acceptance.
