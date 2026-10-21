---
---

No npm package release: replace the standalone calle-connect draft's ten-read
cutoff with automatic result waiting and progressively slower polling, with a
120-read fallback ceiling. Share the policy across API and MCP, honor server
delays, preserve the original call and polling phase, and report progress until
the result is final, the ceiling is reached, or a genuine interruption occurs.
Synchronize manual guidance and offline evaluation fixtures.

The standalone source remains an unpublished 0.2.0 draft outside existing npm
and plugin payloads. No package or Skill version bump, publication, service
deployment, or live call is included.
