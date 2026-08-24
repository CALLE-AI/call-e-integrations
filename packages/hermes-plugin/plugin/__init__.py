"""CALL-E plugin for Hermes — phone calls with a human approval step.

Registers five tools in the `calle` toolset. Requires the `calle` CLI
(resolved from CALLE_BIN, then PATH, then npx) and a browser sign-in via
the calle_auth tool.

Tools are registered whether or not the user is authorized, so they appear
in `hermes tools`; check_fn blocks dispatch until a usable token exists and
the handlers explain how to get one.

No built-in tool name is claimed and no tool override is requested.
"""

from __future__ import annotations

# Relative, not `from plugins.calle.tools import ...`. Bundled plugins live
# on the import path; a user-installed one is under the Hermes home and may
# not be importable as `plugins.*`.
from .tools import TOOLS, TOOLSET


def register(ctx) -> None:
    """Register the CALL-E tools. Called once by the plugin loader."""
    for name, schema, handler, check_fn, emoji in TOOLS:
        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=handler,
            check_fn=check_fn,
            emoji=emoji,
        )
