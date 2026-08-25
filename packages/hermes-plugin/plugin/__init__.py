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
from .tools import TOOLS, TOOLSET, pre_tool_call


def register(ctx) -> None:
    """Register the CALL-E tools and the pre-dial approval hook."""
    # Placing a call spends money and rings a stranger's phone, so calle_run
    # escalates to the host's human-approval gate before it runs. The host
    # resolves this at the dispatch site and is fail-closed: denial, timeout
    # or an error in the gate all block the call.
    #
    # This does not rely on the model asking first, and it survives a callee
    # transcript that tries to instruct the agent -- the hook fires either way.
    ctx.register_hook("pre_tool_call", pre_tool_call)

    for name, schema, handler, check_fn, emoji in TOOLS:
        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=handler,
            check_fn=check_fn,
            emoji=emoji,
        )
