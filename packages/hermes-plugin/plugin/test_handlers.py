"""Runtime tests for the CALL-E tool handlers.

These execute the handlers against a fake provider and assert on SIDE EFFECTS
-- how many times the provider was asked to place a call -- not only on return
values.

That distinction is the point of this file. An earlier revision passed a
14-case suite that checked strings, schemas and registration, and shipped a
defect where `calle_run` submitted a real call and then raised while reading
its own arguments. The handler reported failure, an agent would retry, and the
retry placed a second charged call to the same person. Nothing that inspects
files can catch that; only calling the handler and counting submissions can.

Run: python3 test_handlers.py
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import types

FAILURES: list[str] = []


def check(condition, message):
    if condition:
        print(f"  ok   {message}")
    else:
        print(f"  FAIL {message}")
        FAILURES.append(message)


def _install_registry_stub():
    """Hermes' tools.registry, reduced to the two functions handlers use."""
    registry = types.ModuleType("tools.registry")
    registry.tool_error = lambda message, **extra: json.dumps(
        {"error": str(message), **extra}
    )
    registry.tool_result = lambda data=None, **kw: json.dumps(
        data if data is not None else kw
    )
    tools_pkg = types.ModuleType("tools")
    tools_pkg.registry = registry
    sys.modules["tools"] = tools_pkg
    sys.modules["tools.registry"] = registry


class FakeProvider:
    """Records every submission. A real one would ring a phone here."""

    name = "fake"

    def __init__(self, *, fail_status=False):
        self.submissions: list[str] = []
        self.status_calls: list[str] = []
        self.fail_status = fail_status
        self.last_argv = ["<fake>"]

    def plan(self, to_phones, goal, *, region=None, language=None):
        return {
            "plan_id": "PLAN-1",
            "confirm_token": "SPEND-CREDENTIAL",
            "confirm_summary": "Call Miller Hardware and ask two questions.",
            "display_goal": goal,
            "ready_to_run": True,
        }

    def run(self, plan_id, confirm_token):
        self.submissions.append(plan_id)
        return {"run_id": "RUN-1", "status": "IN_PROGRESS"}

    def status(self, run_id):
        self.status_calls.append(run_id)
        if self.fail_status:
            raise RuntimeError("status unavailable")
        # The provider's real shape: the outcome is nested under `result`, not
        # flat. A fake that gets this wrong produces tests that pass or fail
        # for reasons unrelated to the code -- an earlier version returned a
        # flat `summary`, the adapter correctly recorded the result as empty,
        # and the test reported a defect that did not exist.
        return {
            "run_id": run_id,
            "status": "COMPLETED",
            "result": {
                "summary": "price: 24 dollars; stock: yes",
                # One newline-joined string in "[HH:MM:SS] WHO: text" form,
                # which is what the provider ships and what the adapter's
                # transcript parser expects. Built from that contract, not
                # from a guess at a plausible shape.
                "transcript": (
                    "[00:00:03] BOT: How much is the 12-inch flue pipe?\n"
                    "[00:00:07] USER: That is 24 dollars.\n"
                    "[00:00:09] BOT: And do you have it in stock?\n"
                    "[00:00:12] USER: Yes, we have several."
                ),
                "extracted": {"calling": {}},
                "outcome": {"evidence": []},
            },
        }


def load(tmp, *, fail_status=False):
    """Fresh module state against an empty plugin home."""
    os.environ["CALLE_PLUGIN_HOME"] = tmp
    for name in [m for m in sys.modules if m.startswith("calle")]:
        del sys.modules[name]
    # Rebind after the purge: each test wants a module reading a fresh plugin
    # home, and the name has just been removed along with the rest.
    _make_importable_as_calle()
    import calle.adapter as adapter
    import calle.tools as tools

    provider = FakeProvider(fail_status=fail_status)
    adapter.get_provider = lambda: provider
    tools._auth_status = lambda: {"usable": True}
    return tools, adapter, provider


PLAN_ARGS = {
    "to": ["+15550101234"],
    "purpose": "ask about a part",
    "field": ["price=How much is it", "stock=Do you have it in"],
    "callee_type": "business",
    "callee_name": "Miller Hardware",
}


def test_plan_then_run_places_exactly_one_call(tmp):
    print("plan -> run places exactly one call")
    tools, _, provider = load(tmp)
    plan = json.loads(tools._handle_calle_plan(dict(PLAN_ARGS)))
    check("plan_id" in plan, "plan returns a plan_id")
    check(provider.submissions == [], "planning submits nothing")

    result = json.loads(tools._handle_calle_run({"plan_id": plan["plan_id"]}))
    check("error" not in result, f"run succeeds (got {result.get('error', '')[:60]})")
    check(provider.submissions == ["PLAN-1"], "exactly one submission")
    check(result.get("run_id") == "RUN-1", "run returns the run id")


def test_retry_does_not_place_a_second_call(tmp):
    print("a retried plan does not place a second call")
    tools, _, provider = load(tmp)
    plan = json.loads(tools._handle_calle_plan(dict(PLAN_ARGS)))
    tools._handle_calle_run({"plan_id": plan["plan_id"]})
    again = json.loads(tools._handle_calle_run({"plan_id": plan["plan_id"]}))
    check(provider.submissions == ["PLAN-1"], "still exactly one submission")
    check("note" in again or "already" in json.dumps(again), "the reuse is reported")


def test_status_polls(tmp):
    print("status polls a run")
    tools, _, provider = load(tmp)
    plan = json.loads(tools._handle_calle_plan(dict(PLAN_ARGS)))
    tools._handle_calle_run({"plan_id": plan["plan_id"]})
    result = json.loads(tools._handle_calle_status({"run_id": "RUN-1"}))
    check("error" not in result, f"status succeeds (got {result.get('error','')[:60]})")
    check(result.get("state") == "completed", "status reports the state")


def test_no_spend_credential_reaches_the_model(tmp):
    print("the spend credential never reaches a tool result")
    tools, _, _ = load(tmp)
    plan_out = tools._handle_calle_plan(dict(PLAN_ARGS))
    plan = json.loads(plan_out)
    run_out = tools._handle_calle_run({"plan_id": plan["plan_id"]})
    show_out = tools._handle_calle_show({"id": plan["plan_id"]})
    for label, blob in [("plan", plan_out), ("run", run_out), ("show", show_out)]:
        check("SPEND-CREDENTIAL" not in blob, f"{label} output carries no token")
        check("confirm_token" not in blob, f"{label} output has no confirm_token key")


def test_bad_args_do_not_submit(tmp):
    print("invalid arguments never reach the provider")
    tools, _, provider = load(tmp)
    for bad in [{}, {"plan_id": ""}, {"plan_id": "NOT-A-PLAN"}]:
        result = json.loads(tools._handle_calle_run(bad))
        check("error" in result, f"rejected {bad}")
    check(provider.submissions == [], "nothing was submitted")


def test_unreadable_outcome_does_not_invite_a_retry(tmp):
    print("an unreadable outcome does not read as 'try again'")
    tools, _, provider = load(tmp, fail_status=True)
    plan = json.loads(tools._handle_calle_plan(dict(PLAN_ARGS)))
    result = json.loads(tools._handle_calle_run({"plan_id": plan["plan_id"]}))
    check(provider.submissions == ["PLAN-1"], "one submission")
    blob = json.dumps(result).lower()
    if "error" in result:
        check(
            "do not run this plan again" in blob or "run_id" in result,
            "the error names the run rather than inviting a retry",
        )
    again = json.loads(tools._handle_calle_run({"plan_id": plan["plan_id"]}))
    check(provider.submissions == ["PLAN-1"], "a retry still submits nothing")


def test_show_returns_the_stored_outcome(tmp):
    print("show returns a finished call from local disk")
    tools, adapter, provider = load(tmp)
    plan = json.loads(tools._handle_calle_plan(dict(PLAN_ARGS)))
    run = json.loads(tools._handle_calle_run({"plan_id": plan["plan_id"]}))
    run_id = run["run_id"]

    by_run = json.loads(tools._handle_calle_show({"id": run_id}))
    check("error" not in by_run, "show finds the outcome by run id")
    check(by_run.get("summary"), "the outcome carries the summary")

    by_plan = json.loads(tools._handle_calle_show({"id": plan["plan_id"]}))
    check("error" not in by_plan, "show finds the outcome by plan id")
    check(by_plan.get("run_id") == run_id, "the plan id resolves to its run")

    missing = json.loads(tools._handle_calle_show({"id": "NO-SUCH-ID"}))
    check("error" in missing, "an unknown id is an error")


def test_state_files_are_owner_only(tmp):
    print("the sidecar holding the spend credential is owner-only")
    import stat

    tools, adapter, _ = load(tmp)
    tools._handle_calle_plan(dict(PLAN_ARGS))

    directory = adapter.STATE_DIR
    sidecars = list(directory.glob("*.json"))
    check(bool(sidecars), "a sidecar was written")

    leftovers = list(directory.glob("*.tmp"))
    check(not leftovers, f"no temporary files left behind ({leftovers})")

    if os.name == "nt":
        # POSIX modes are advisory on Windows: chmod toggles a read-only bit
        # and the mode read back says nothing about who can open the file.
        # Asserting 0600 here would pass for the wrong reason.
        print("  skip Windows: POSIX modes are advisory, nothing to assert")
        return

    dir_mode = stat.S_IMODE(os.stat(directory).st_mode)
    check(dir_mode == 0o700, f"state dir is 0700 (got {oct(dir_mode)})")
    for sidecar in sidecars:
        mode = stat.S_IMODE(os.stat(sidecar).st_mode)
        check(mode == 0o600, f"{sidecar.name} is 0600 (got {oct(mode)})")


def test_regions_are_not_second_guessed(tmp):
    print("region codes are checked for format, not against a local list")
    _, adapter, _ = load(tmp)

    for value, expected in [
        (None, None), ("", None), ("us", "US"), (" in ", "IN"),
        ("GB", "GB"), ("ZA", "ZA"), ("NZ", "NZ"),
    ]:
        check(
            adapter._validate_region(value) == expected,
            f"{value!r} -> {expected!r}",
        )

    # A local allowlist of provider regions goes stale and then refuses calls
    # that would have worked. The provider owns that list.
    check(
        not hasattr(adapter, "VALID_REGIONS"),
        "no local region allowlist is maintained",
    )

    for bad in ["USA", "United States", "12"]:
        try:
            adapter._validate_region(bad)
            check(False, f"{bad!r} should be refused")
        except adapter.CallAgentError:
            check(True, f"{bad!r} refused on format")


def test_every_verb_arg_is_supplied(tmp):
    print("every attribute the adapter reads is supplied")
    tools, adapter, _ = load(tmp)
    import ast
    import inspect

    tree = ast.parse(inspect.getsource(adapter))
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or not node.name.startswith("cmd_"):
            continue
        verb = node.name[len("cmd_"):]
        if verb not in tools._VERB_ARGS:
            continue
        read = {
            child.attr
            for child in ast.walk(node)
            if isinstance(child, ast.Attribute)
            and isinstance(child.value, ast.Name)
            and child.value.id == "args"
        }
        missing = read - set(tools._VERB_ARGS[verb]) - {"last_argv"}
        check(not missing, f"cmd_{verb}: no unsupplied args (missing {sorted(missing)})")


def _make_importable_as_calle():
    """Expose this directory as the `calle` package.

    Installed, the plugin lives in a directory named `calle` and imports
    resolve naturally. In the repository it lives in `plugin/`, so the same
    tests would not run where a contributor is most likely to run them. Bind
    the name explicitly rather than depending on the directory it sits in.
    """
    import importlib.util

    here = os.path.dirname(os.path.abspath(__file__))
    if os.path.basename(here) == "calle":
        sys.path.insert(0, os.path.dirname(here))
        return

    spec = importlib.util.spec_from_file_location(
        "calle", os.path.join(here, "__init__.py"),
        submodule_search_locations=[here],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["calle"] = module
    spec.loader.exec_module(module)


def main():
    _install_registry_stub()
    _make_importable_as_calle()

    for test in [
        test_plan_then_run_places_exactly_one_call,
        test_retry_does_not_place_a_second_call,
        test_status_polls,
        test_no_spend_credential_reaches_the_model,
        test_bad_args_do_not_submit,
        test_unreadable_outcome_does_not_invite_a_retry,
        test_show_returns_the_stored_outcome,
        test_state_files_are_owner_only,
        test_regions_are_not_second_guessed,
        test_every_verb_arg_is_supplied,
    ]:
        tmp = tempfile.mkdtemp(prefix="calle-test-")
        try:
            test(tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} failure(s)")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("all handler tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
