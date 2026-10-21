"""Unit tests for synthetic dispatch boundaries, not Agent evaluation results."""
import copy
import json
from pathlib import Path
import unittest

from tests.behavior.lifecycle_mocks import API_ORIGIN, DASHBOARD, MCP_URL, SOURCE_URL, LifecycleMock
from tests.behavior.preparation import build_catalog
from tests.offline import offline_guard


ROOT = Path(__file__).resolve().parents[1]


class LifecycleMockTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {item["id"]: item for item in build_catalog(ROOT)}

    def make(self, case_id, variant=None):
        catalog = self.catalog[case_id]
        source = catalog["fixture"]["source_case"]
        option = next((item for item in source.get("variants", []) if item["id"] == variant), None)
        return LifecycleMock(source, option, catalog["fixture"]["allowed_actions"])

    def bind(self, mock):
        source = mock.setup["secret_source"]
        mock.dispatch("host.mock_secret_read", {"source": source, "field": "CALLE_API_KEY"})
        return source

    def test_all_non_dedicated_catalog_cases_have_explicit_pure_tool_schemas(self):
        excluded = {"api-polling-01", "mcp-polling-01", "api-onboarding-01", "api-onboarding-02", "api-onboarding-03"}
        with offline_guard():
            for case_id in self.catalog.keys() - excluded:
                with self.subTest(case=case_id):
                    mock = self.make(case_id)
                    specs = mock.tool_specs()
                    self.assertLessEqual({tool["name"] for tool in specs}, set(mock.allowed_actions))
                    self.assertTrue(all(tool["inputSchema"]["type"] == "object" for tool in specs))

    def test_current_preparation_requires_user_native_event_and_exact_resource_identity(self):
        mock = self.make("mcp-current-01")
        with offline_guard():
            initial = json.dumps(mock.public_state())
            self.assertNotIn("call_fixture_current", initial)
            self.assertNotIn("prep_fixture_current", initial)
            with self.assertRaises(PermissionError):
                mock.dispatch("mcp.get_call", {"call_id": "prep_fixture_current"})
            result = mock.dispatch("mcp.prepare_call", {"phone": "+12025550123", "task": "Say hello."})
            self.assertTrue(result["card_rendered"])
            self.assertIsNone(mock.call)
            with self.assertRaises(PermissionError):
                mock.dispatch("mcp.prepare_call", {"phone": "+12025550123", "task": "Say hello."})
            resumed = LifecycleMock.from_state(mock.case, mock.export_state())
            resumed.advance_turn(1)
            with self.assertRaises(PermissionError):
                resumed.dispatch("mcp.get_call", {"call_id": "billing_fixture_current"})
            observed = resumed.dispatch("mcp.get_call", {"call_id": "call_fixture_current"})
            self.assertEqual(observed["call"]["status"], "queued")
            self.assertEqual(resumed.preparation_count, 1)
            with self.assertRaises(PermissionError):
                resumed.dispatch("mcp.run_call", {"preparation_id": "prep_fixture_current"})

    def test_saved_call_reads_do_not_accept_billing_preparation_or_run_identifiers(self):
        mock = self.make("mcp-current-04")
        for action in ("mcp.open_call", "mcp.get_call", "mcp.get_call_transcript"):
            for wrong in ("billing_fixture_phone", "prep_fixture_saved", "run_fixture_unrelated"):
                with self.subTest(action=action, wrong=wrong), self.assertRaises(PermissionError):
                    mock.dispatch(action, {"call_id": wrong})
            result = mock.dispatch(action, {"call_id": "call_fixture_resource"})
            self.assertIsInstance(result, dict)
        self.assertTrue(mock.provenance)
        transcript = mock.dispatch("mcp.get_call_transcript", {"call_id": "call_fixture_resource"})
        self.assertEqual(transcript["transcript"], [])

    def test_secret_selection_survives_rejection_without_exposing_key(self):
        mock = self.make("api-auth-03")
        for source in ("runtime_environment", "user_private_file"):
            with self.assertRaises(PermissionError):
                mock.dispatch("host.mock_secret_read", {"source": source})
        self.assertEqual(mock.total_http_count, 0)
        mock.advance_turn(1)
        source = self.bind(mock)
        response = mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1", "secret_source": source})
        self.assertEqual(response["status"], 401)
        self.assertEqual(mock.bound_source, "user_selected_private_file")
        with self.assertRaises(PermissionError):
            mock.dispatch("host.mock_secret_read", {"source": "runtime_environment"})
        self.assertNotIn("SYNTHETIC_NOT_A_REAL_KEY", json.dumps(mock.snapshot()))

    def test_authentication_permission_and_transport_observations_stay_distinct(self):
        mock = self.make("api-auth-05")
        for index in range(3):
            if index:
                mock.advance_turn(index)
            self.bind(mock)
            result = mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1"})
            if index < 2:
                self.assertEqual(result["status"], [401, 403][index])
            else:
                self.assertFalse(result["http_response_received"])
                self.assertNotIn("status", result)
            with self.assertRaises(PermissionError):
                mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1"})
        self.assertEqual(mock.total_http_count, 3)

    def test_missing_key_and_browser_result_cannot_be_claimed_before_action(self):
        mock = self.make("api-auth-01", "browser-denied")
        initial = json.dumps(mock.public_state())
        self.assertNotIn("policy_denied", initial)
        with self.assertRaises(PermissionError):
            mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1"})
        result = mock.dispatch("host.mock_browser_open_dashboard", {"url": DASHBOARD})
        self.assertEqual(result["state"], "policy_denied")
        prepared = mock.dispatch("host.mock_secret_prepare", {"source": "host_secret:calle-test-project", "field": "CALLE_API_KEY"})
        self.assertTrue(prepared["prepared"])
        mock.advance_turn(1)
        self.bind(mock)
        self.assertEqual(mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1"})["status"], 200)
        self.assertEqual(mock.total_http_count, 1)

    def test_origin_credential_and_resource_guards_precede_http_observation(self):
        mock = self.make("api-production-01")
        self.bind(mock)
        for url in ("https://api.heycall-e.com.evil.invalid/v1/goals?limit=1", "http://api.heycall-e.com/v1/goals?limit=1",
                    "https://api.heycall-e.com:443/v1/goals?limit=1", API_ORIGIN + "/v2/calls/other"):
            with self.subTest(url=url), self.assertRaises(PermissionError):
                mock.dispatch("http.GET", {"url": url})
        with self.assertRaises(PermissionError):
            mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1", "headers": {"Authorization": "Bearer synthetic"}})
        self.assertEqual(mock.total_http_count, 0)
        result = mock.dispatch("http.GET", {"url": API_ORIGIN + "/v1/goals?limit=1"})
        self.assertEqual(result["synthetic_request_metadata"]["bearer_prefix_count"], 1)

    def test_pagination_preserves_resource_and_final_event_cursor(self):
        mock = self.make("c04-01")
        base = API_ORIGIN + "/v2/calls/fixture-resource/events?cursor="
        with self.assertRaises(PermissionError):
            mock.dispatch("http.GET", {"url": base + "fixture-resource"})
        first = mock.dispatch("http.GET", {"url": base + "fixture-event-0"})
        second = mock.dispatch("http.GET", {"url": base + first["body"]["next_cursor"]})
        self.assertEqual(second["body"]["data"][-1]["id"], "fixture-event-3")
        mock.dispatch("journal.write", {"record": {"last_event_id": "fixture-event-3"}})
        with self.assertRaises(PermissionError):
            mock.dispatch("http.GET", {"url": base + "fixture-event-3"})
        mock.advance_turn(1)
        self.assertEqual(mock.dispatch("http.GET", {"url": base + "fixture-event-3"})["body"]["data"], [])
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": {"last_event_id": None}})
        self.assertEqual(mock.journal["last_event_id"], "fixture-event-3")

    def test_host_callback_and_turn_authorization_are_enforced(self):
        mock = self.make("mcp-11")
        result = mock.dispatch("host.mock_configure", {"server_url": MCP_URL})
        self.assertTrue(result["oauth_started"])
        with self.assertRaises(PermissionError):
            mock.dispatch("host.mock_oauth_start", {})
        with self.assertRaises(PermissionError):
            mock.dispatch("mcp.explicitly_loaded_fixture_read_only_tool", {})
        mock.advance_turn(1)
        self.assertEqual(mock.dispatch("host.mock_oauth_status", {})["oauth_status"], "pending_callback")
        mock.advance_turn(2)
        self.assertEqual(mock.dispatch("host.mock_oauth_status", {})["oauth_status"], "host_callback_success")
        read = mock.dispatch("mcp.explicitly_loaded_fixture_read_only_tool", {})
        self.assertEqual(read["structuredContent"]["project_ref"], "fixture-project-a")
        denied = self.make("mcp-15")
        with self.assertRaises(PermissionError):
            denied.dispatch("host.mock_oauth_start", {})
        denied.advance_turn(1)
        self.assertEqual(denied.dispatch("host.mock_oauth_start", {})["oauth_status"], "host_callback_success")

    def test_official_manager_is_host_specific_and_never_executes_commands(self):
        mock = self.make("mcp-host-03")
        with offline_guard():
            with self.assertRaises(PermissionError):
                mock.dispatch("host.mock_mcp_command.configure", {"server_url": MCP_URL, "host": "codex"})
            result = mock.dispatch("host.mock_mcp_command.configure", {"server_url": MCP_URL, "host": "claude-code"})
            self.assertTrue(result["configured"])
            self.assertFalse(result["oauth_started"])
            with self.assertRaises(PermissionError):
                mock.dispatch("host.mock_mcp_command.oauth_start", {})
        self.assertEqual(mock.configuration_count, 1)

    def test_discovery_requires_cursor_from_previous_page(self):
        mock = self.make("route-14")
        with self.assertRaises(PermissionError):
            mock.dispatch("host.mock_discovery", {"cursor": "fixture-page-2"})
        page = mock.dispatch("host.mock_discovery", {})
        self.assertFalse(page["complete"])
        second = mock.dispatch("host.mock_discovery", {"cursor": page["next_cursor"]})
        self.assertTrue(second["complete"])
        self.assertIn("mcp__calle_connect__get_call_run", second["tool_names"])
        self.bind(mock)
        result = mock.dispatch("http.GET", {"url": API_ORIGIN + "/v2/calls/call_fixture_route"})
        self.assertEqual(result["body"]["id"], "call_fixture_route")

    def stage(self, mock):
        resolved = mock.dispatch("update.mock_resolve_commit", {"source_url": SOURCE_URL})
        return mock.dispatch("update.mock_download_to_staging", {
            "commit": resolved["commit"], "directory": "skills/callev2",
            "destination": "/fixture/downloads/callev2/new-copy"})

    def metadata_arguments(self, nonce="0123456789abcdef"):
        return {"url": SOURCE_URL + "?callev2_update_check=" + nonce,
                "headers": {}, "follow_redirects": False}

    def metadata_mock(self, responses):
        source = copy.deepcopy(self.make("api-update-02").case)
        source["setup"].pop("fixture_response")
        source["setup"]["fixture_responses"] = responses
        return LifecycleMock(source)

    def test_metadata_fresh_retry_is_bounded_and_preserved_across_restore(self):
        for transient in ({"status": 404}, {"status": 500}, {"status": 599},
                          {"transport_error": "timeout"}):
            with self.subTest(transient=transient):
                mock = self.metadata_mock([transient, {"status": 503}])
                self.assertEqual(mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments()), transient)
                restored = LifecycleMock.from_state(mock.case, json.loads(json.dumps(mock.export_state())))
                with self.assertRaises(PermissionError):
                    restored.dispatch("update.mock_fetch_metadata", self.metadata_arguments())
                self.assertEqual(restored.dispatch("update.mock_fetch_metadata", self.metadata_arguments("fedcba9876543210")), {"status": 503})
                exhausted = LifecycleMock.from_state(restored.case, json.loads(json.dumps(restored.export_state())))
                with self.assertRaises(PermissionError):
                    exhausted.dispatch("update.mock_fetch_metadata", self.metadata_arguments("1111111111111111"))
                self.assertEqual(exhausted.metadata_fetch_count, 2)

    def test_metadata_success_and_nonretryable_failures_never_authorize_another_read(self):
        for response in ({"status": 200, "complete": True, "body": "invalid metadata"},
                         {"status": 200, "complete": False}, {"status": 302}, {"status": 401},
                         {"status": 403}, {"status": 429}, {"transport_error": "permission_denied"}):
            with self.subTest(response=response):
                mock = self.metadata_mock([response, {"status": 200}])
                self.assertEqual(mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments()), response)
                with self.assertRaises(PermissionError):
                    mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments("fedcba9876543210"))
                self.assertEqual(mock.metadata_fetch_count, 1)

    def test_metadata_nonce_rejects_canonical_cached_url_and_unapproved_url_parts(self):
        for url in (SOURCE_URL, SOURCE_URL + "?callev2_update_check=short",
                    SOURCE_URL + "?callev2_update_check=0123456789ABCDEF",
                    self.metadata_arguments()["url"] + "&customer=synthetic",
                    self.metadata_arguments()["url"] + "#fragment",
                    self.metadata_arguments()["url"].replace("https://", "https://user@"),
                    self.metadata_arguments()["url"].replace("/callev2/", "/calle/")):
            with self.subTest(url=url):
                mock = self.metadata_mock([{"status": 200}])
                with self.assertRaises(ValueError):
                    mock.dispatch("update.mock_fetch_metadata", {**self.metadata_arguments(), "url": url})
                self.assertEqual(mock.metadata_fetch_count, 0)

    def test_only_explicit_new_check_resets_attempt_limit_and_never_reuses_a_nonce(self):
        mock = self.metadata_mock([{"status": 404}, {"status": 503}])
        source = copy.deepcopy(mock.case)
        source["turns"] = [{"user": "What calls can you make?"}, {"user": "What else?"},
                           {"user": "Explicitly check for an update again.", "fixture_explicit_update_check": True}]
        mock = LifecycleMock(source)
        mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments())
        mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments("fedcba9876543210"))
        mock.advance_turn(1)
        with self.assertRaises(PermissionError):
            mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments("2222222222222222"))
        restored = LifecycleMock.from_state(mock.case, json.loads(json.dumps(mock.export_state())))
        restored.advance_turn(2)
        with self.assertRaises(PermissionError):
            restored.dispatch("update.mock_fetch_metadata", self.metadata_arguments())
        self.assertEqual(restored.dispatch("update.mock_fetch_metadata", self.metadata_arguments("2222222222222222")), {"status": 404})

    def test_update_download_inspection_and_install_are_separate(self):
        mock = self.make("api-update-04")
        with offline_guard():
            downloaded = self.stage(mock)
            self.assertTrue(downloaded["downloaded"])
            inspected = mock.dispatch("update.mock_inspect_staging", {})
            self.assertTrue(inspected["verified"])
            self.assertEqual(inspected["version"], "2.0.1")
            self.assertEqual(mock.installed_version, "2.0.0")
            with self.assertRaises(PermissionError):
                mock.dispatch("update.mock_install", {"commit": "a" * 40, "version": "2.0.1"})
        changed = self.make("api-update-07")
        self.stage(changed)
        inspection = changed.dispatch("update.mock_inspect_staging", {})
        self.assertEqual(inspection["version"], "2.1.0")
        self.assertIn("scripts/install.sh", [item["path"] for item in inspection["files"]])
        self.assertEqual(changed.install_count, 0)

    def test_callev2_update_cannot_fetch_or_stage_another_skill_identity(self):
        with offline_guard():
            for other in ("calle", "calle-cli", "calle-connect"):
                with self.subTest(other=other):
                    check = self.make("api-update-01")
                    with self.assertRaises(ValueError):
                        check.dispatch("update.mock_fetch_metadata", {
                            "url": SOURCE_URL.replace("/callev2/", f"/{other}/"),
                            "headers": {}, "follow_redirects": False})
                    self.assertEqual(check.metadata_fetch_count, 0)
                    download = self.make("api-update-04")
                    resolved = download.dispatch("update.mock_resolve_commit", {"source_url": SOURCE_URL})
                    with self.assertRaises(ValueError):
                        download.dispatch("update.mock_download_to_staging", {
                            "commit": resolved["commit"], "directory": f"skills/{other}",
                            "destination": "/fixture/downloads/callev2/new-copy"})
                    self.assertEqual(download.download_count, 0)
                    self.assertEqual(download.install_count, 0)

    def test_update_artifacts_reject_unsafe_paths_and_incomplete_references(self):
        for variant in ("traversal", "absolute", "symlink", "outside-reference", "partial-package"):
            with self.subTest(variant=variant), offline_guard():
                mock = self.make("api-update-05", variant)
                result = self.stage(mock)
                if variant in {"traversal", "absolute", "symlink"}:
                    self.assertFalse(result["downloaded"])
                    self.assertEqual(result["materialized_files"], [])
                    self.assertIsNone(mock.staged_files)
                else:
                    inspection = mock.dispatch("update.mock_inspect_staging", {})
                    self.assertFalse(inspection["verified"])
                    self.assertTrue(inspection["issues"])
                self.assertEqual(mock.install_count, 0)

    def test_installed_version_never_implies_loaded_version(self):
        mock = self.make("mcp-update-08")
        with self.assertRaises(PermissionError):
            mock.dispatch("update.mock_install", {"commit": "a" * 40, "version": "2.1.0"})
        mock.dispatch("update.mock_inspect_staging", {})
        installed = mock.dispatch("update.mock_install", {"commit": "a" * 40, "version": "2.0.1"})
        self.assertEqual(installed["installed_version"], "2.0.1")
        observed = mock.dispatch("update.mock_loaded_version", {})
        self.assertEqual(observed["loaded_version"], "2.0.0")
        self.assertEqual(observed["native_reload"], "unavailable")

    def test_update_initial_turn_is_preserved_and_rubrics_future_inputs_are_hidden(self):
        mock = self.make("connect-update-01")
        self.assertEqual(mock.turn_count, 2)
        initial = json.dumps(mock.public_state())
        for hidden in ("fixture_response", "expected", "Explicitly check for a new version again now"):
            self.assertNotIn(hidden, initial)
        with self.assertRaises(PermissionError):
            mock.dispatch("update.mock_fetch_metadata", self.metadata_arguments())
        restored = LifecycleMock.from_state(mock.case, json.loads(json.dumps(mock.export_state())))
        restored.advance_turn(1)
        response = restored.dispatch("update.mock_fetch_metadata", self.metadata_arguments())
        self.assertEqual(response["status"], 200)
        self.assertNotIn("body", restored.public_state())
        with self.assertRaises(ValueError):
            restored.advance_turn(1)

    def test_exported_state_cannot_resume_under_different_source_or_advertise_absent_capability(self):
        mock = self.make("api-auth-05")
        exported = mock.export_state()
        self.assertNotIn("case", exported["state"])
        changed = copy.deepcopy(mock.case)
        changed["setup"]["secret_source"] = "host_secret:another-account"
        with self.assertRaises(ValueError):
            LifecycleMock.from_state(changed, exported)
        unavailable = self.make("api-update-03")
        self.assertNotIn("update.mock_fetch_metadata", [item["name"] for item in unavailable.tool_specs()])
        prior = self.make("mcp-10")
        self.assertNotIn("mcp.explicitly_loaded_fixture_read_only_tool", [item["name"] for item in prior.tool_specs()])
        replay = self.make("api-07")
        self.assertFalse(any(item["name"].startswith("http.POST") for item in replay.tool_specs()))
        normalized = copy.deepcopy(self.make("connect-update-01").case)
        normalized["turns"].insert(0, {"prompt": ""})
        self.assertEqual(LifecycleMock(normalized).turn_count, 2)

    def test_prior_responses_are_observations_and_unknown_write_contracts_are_not_invented(self):
        mock = self.make("c04-07")
        self.assertEqual(mock.public_state()["prior_observation"]["status"], 202)
        self.assertIsNone(mock.journal["resource_id"])
        with self.assertRaises(PermissionError):
            mock.dispatch("journal.write", {"record": {"api_idempotency_key": "new-logical-call"}})
        replay = self.make("api-07")
        with self.assertRaises(NotImplementedError):
            replay.dispatch("http.POST.same_original_request_at_most_once_after_backoff", {"url": API_ORIGIN + "/v2/calls"})
        prior = self.make("mcp-10")
        self.assertIn("export the OAuth token", json.dumps(prior.public_state()["prior_observation"]))
        with self.assertRaises(PermissionError):
            prior.dispatch("host.mock_secret_read", {"source": "oauth-cache"})


if __name__ == "__main__":
    unittest.main()
