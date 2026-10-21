---
---

No npm package release: make the customer-facing calle-connect Skill production
only, with fixed MCP endpoint https://seleven-mcp-sg.airudder.com/mcp/chatgpt_oauth
and API base URL https://api.heycall-e.com. Remove environment-selection prompts
and alternative service endpoints from the standalone source, setup, templates,
manual guidance, and synchronized repository scenarios and documentation.

Reject mismatched saved endpoints before sending credentials or business requests,
and require correction of that configuration rather than silently repointing
credentials or recovering records from another endpoint. A missing base URL uses
the fixed production address without a setup question.

This standalone root source remains an unpublished 0.2.0 draft outside all
existing npm and plugin payloads. No package versions, publication, or changes to
the separate CLI-based integrations are included.
