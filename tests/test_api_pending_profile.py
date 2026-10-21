"""Pure dispatcher checks for the completed api-04 fixture, not Agent evidence."""
import copy
import json
from pathlib import Path
import unittest

from tests.behavior.preparation import build_catalog
from tests.behavior.stateful_mocks import API_ORIGIN, StatefulMock
from tests.offline import offline_guard


ROOT = Path(__file__).resolve().parents[1]
CALL_ID = "call_fixture_pending"
URL = API_ORIGIN + "/v2/calls/" + CALL_ID


def source_case():
    cases = json.loads((ROOT / "tests/behavior/callev2-evals.json").read_text())["cases"]
    return next(case for case in cases if case["id"] == "api-04")


def read(mock):
    return mock.dispatch("http.GET", {"url": URL})


def wait_with_progress(mock, seconds):
    while seconds:
        chunk = min(seconds, 30)
        if mock.clock + chunk - mock.last_progress_time > 60:
            mock.dispatch("local.report", {"message": "The existing Call result remains pending."})
        mock.dispatch("host.mock_wait", {"seconds": chunk})
        seconds -= chunk


class ApiPendingProfileTests(unittest.TestCase):
    def test_original_request_and_expectations_remain_intact_with_explicit_provenance(self):
        source = source_case()
        self.assertEqual(source["prompt"],
                         "Use the API Key interface for this task. Query the saved resource; do not redial.")
        self.assertEqual(source["expected"], [
            "Use GET, not POST.",
            "Do not declare the business result ready.",
            "Automatically keep reading the same resource while result_status is pending, including status=completed, using phased delays and the 120-request monitoring-session cap; do not stop at ten reads or ask to continue before a genuine stop condition.",
        ])
        self.assertEqual(source["fixture_status_reads"], [{
            "query_ordinal_range": [1, 120], "response": source["fixture_http_response"],
        }])
        self.assertEqual(source["fixture_provenance"]["kind"], "synthetic_fixture_completion")
        catalog_case = next(case for case in build_catalog(ROOT) if case["id"] == "api-04")
        self.assertEqual(catalog_case["fixture"]["allowed_actions"], source["mock_allowed_actions"])

    def test_complete_pending_session_performs_120_reads_and_cannot_read_121(self):
        source = source_case()
        with offline_guard():
            mock = StatefulMock(source)
            times = {}
            for ordinal in range(1, 121):
                plan = next(item for item in source["fixture_wait_plan"]
                            if item["query_ordinals"][0] <= ordinal <= item["query_ordinals"][1])
                wait_with_progress(mock, plan["seconds"])
                result = read(mock)
                self.assertEqual(result["body"], source["fixture_http_response"]["body"])
                self.assertEqual(result["synthetic_request_evidence"]["method"], "GET")
                self.assertEqual(result["synthetic_request_evidence"]["url"], URL)
                times[ordinal] = mock.clock
            self.assertEqual({key: times[key] for key in (1, 10, 11, 20, 21, 30, 31, 120)},
                             {1: 0, 10: 18, 11: 23, 20: 68, 21: 78, 30: 168, 31: 188, 120: 1968})
            self.assertEqual(mock.state, source["expected_saved_state"])
            self.assertEqual(mock.stopped_reason, "session_cap")
            self.assertEqual(mock.create_count, 0)
            self.assertEqual(sum(entry["action"] == "http.GET" for entry in mock.trace), 120)
            with self.assertRaises(PermissionError):
                read(mock)
            self.assertEqual(mock.state["session_query_count"], 120)
            mock.dispatch("journal.write", {"record": {"polling_state": copy.deepcopy(mock.state)}})
            self.assertEqual(mock.journal["polling_state"]["session_query_count"], 120)
            self.assertEqual(mock.journal["resource_id"], CALL_ID)
            self.assertEqual(mock.journal["result_status"], "pending")

    def test_seeded_journal_preserves_original_api_binding_on_partial_updates(self):
        source = source_case()
        mock = StatefulMock(source)
        observed = mock.dispatch("journal.read", {})
        self.assertEqual(observed["record"], source["setup"]["saved_record"])
        read(mock)
        mock.dispatch("journal.write", {"record": {"polling_state": copy.deepcopy(mock.state)}})
        for field in ("interface", "server_or_base_url", "identity_ref", "credential_ref",
                      "resource_id", "authorization_scope"):
            self.assertEqual(mock.journal[field], source["setup"]["saved_record"][field])
        specs = {spec["name"]: spec for spec in mock.tool_specs()}
        journal_properties = specs["journal.write"]["inputSchema"]["properties"]["record"]["properties"]
        self.assertEqual(journal_properties["server_or_base_url"], {"const": API_ORIGIN})
        for changed in ({"interface": "mcp"}, {"server_or_base_url": "https://other.invalid"},
                        {"resource_id": "another-call"}, {"credential_ref": "another-key"},
                        {"authorization_scope": {"operation": "redial"}}):
            with self.subTest(changed=changed), self.assertRaises((ValueError, PermissionError)):
                mock.dispatch("journal.write", {"record": changed})

    def test_read_only_profile_rejects_writes_cross_interface_and_other_resources(self):
        mock = StatefulMock(source_case())
        self.assertEqual({spec["name"] for spec in mock.tool_specs()},
                         {"local.report", "journal.read", "journal.write", "host.mock_wait", "http.GET"})
        for action, args in (
            ("http.POST.create_authorized_call_once", {}),
            ("http.POST.cancel_saved_resource_at_most_once", {}),
            ("mcp.get_call", {"call_id": CALL_ID}),
            ("http.GET", {"url": API_ORIGIN + "/v2/calls/other-call"}),
            ("http.GET", {"url": "https://other.invalid/v2/calls/" + CALL_ID}),
        ):
            with self.subTest(action=action, args=args), offline_guard(), self.assertRaises(PermissionError):
                mock.dispatch(action, args)
        self.assertEqual(mock.state["session_query_count"], 0)
        self.assertEqual(mock.create_count, 0)

    def test_checkpoint_restores_counts_phase_and_original_journal_without_future_answers(self):
        source = source_case()
        mock = StatefulMock(source)
        for ordinal in range(1, 11):
            wait_with_progress(mock, 0 if ordinal == 1 else 2)
            read(mock)
        mock.dispatch("journal.write", {"record": {"polling_state": copy.deepcopy(mock.state)}})
        envelope = json.loads(json.dumps(mock.export_state()))
        restored = StatefulMock.from_state(source, envelope)
        self.assertEqual(restored.snapshot(), mock.snapshot())
        with self.assertRaises(PermissionError):
            read(restored)
        self.assertEqual(restored.state["session_query_count"], 10)
        wait_with_progress(restored, 5)
        self.assertEqual(read(restored)["body"]["id"], CALL_ID)
        self.assertEqual(restored.state["session_query_count"], 11)
        for hidden in ("fixture_status_reads", "fixture_wait_plan", "expected_read_counts", "expected_saved_state"):
            self.assertNotIn(hidden, json.dumps(mock.public_state()))
            self.assertNotIn(hidden, json.dumps(envelope))
        changed = copy.deepcopy(envelope)
        changed["current"]["journal"]["server_or_base_url"] = "https://other.invalid"
        with self.assertRaises(ValueError):
            StatefulMock.from_state(source, changed)
        changed_source = copy.deepcopy(source)
        changed_source["prompt"] += " Changed."
        with self.assertRaises(ValueError):
            StatefulMock.from_state(changed_source, envelope)

    def test_seed_rejects_mismatched_identity_state_and_secrets(self):
        source = source_case()
        for patch in ({"resource_id": "another-call"}, {"interface": "mcp"},
                      {"server_or_base_url": "https://other.invalid"},
                      {"polling_state": {}}, {"api_key": "synthetic-secret"}):
            case = copy.deepcopy(source)
            case["setup"]["saved_record"].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                StatefulMock(case)


if __name__ == "__main__":
    unittest.main()
