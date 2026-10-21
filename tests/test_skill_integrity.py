"""Keep local diagnostics and independent Skill version metadata consistent."""
import json
from pathlib import Path
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


class SkillIntegrityTests(unittest.TestCase):
    def test_diagnostics_distinguish_profile_from_supplemental_checks(self):
        from tests.diagnostics import collect_observations
        observations = {item["id"]: item for item in collect_observations()["observations"]}
        for name in ("G01", "G02"):
            self.assertTrue(observations[name]["accepted_by_current_local_profile"])
            self.assertFalse(observations[name]["accepted_by_client_semantic_check"])
            self.assertTrue(observations[name]["client_issues"])
        self.assertEqual(observations["G03"]["operation_report"]["information_status"], "INSUFFICIENT_INFORMATION")

    def test_skill_and_original_evaluation_versions_match(self):
        for name in ("callev2",):
            skill = ROOT / "skills" / name
            metadata = yaml.safe_load((skill / "SKILL.md").read_text().split("---", 2)[1])
            evaluation = json.loads((ROOT / "tests/behavior" / f"{name}-evals.json").read_text())
            self.assertEqual(metadata["metadata"]["version"], evaluation["version"])
            self.assertEqual(evaluation["evaluation_status"], "not_executed_on_an_agent")

    def test_personal_test_identity_has_consistent_install_and_ui_metadata(self):
        skill = ROOT / "skills/callev2"
        metadata = yaml.safe_load((skill / "SKILL.md").read_text().split("---", 2)[1])
        interface = yaml.safe_load((skill / "agents/openai.yaml").read_text())["interface"]
        self.assertEqual(metadata["name"], skill.name)
        self.assertEqual(metadata["metadata"]["version"], "2.0.1")
        self.assertEqual(interface["display_name"], metadata["name"])
        self.assertIn("$callev2", interface["default_prompt"])
        self.assertGreaterEqual(len(interface["short_description"]), 25)
        self.assertLessEqual(len(interface["short_description"]), 64)

    def test_update_identity_is_bound_to_the_same_repository_directory(self):
        from tests.behavior.fixture_server import SOURCE_URL as bridge_source
        from tests.behavior.lifecycle_mocks import SOURCE_URL, SKILL_DIRECTORY

        metadata = yaml.safe_load((ROOT / "skills/callev2/SKILL.md").read_text().split("---", 2)[1])
        expected = "https://raw.githubusercontent.com/CALLE-AI/call-e-integrations/main/skills/callev2/SKILL.md"
        self.assertEqual(metadata["metadata"]["update-source"], expected)
        self.assertEqual(metadata["metadata"]["source"],
                         "https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/callev2")
        self.assertEqual(SOURCE_URL, expected)
        self.assertEqual(bridge_source, expected)
        self.assertEqual(SKILL_DIRECTORY, "skills/callev2")
