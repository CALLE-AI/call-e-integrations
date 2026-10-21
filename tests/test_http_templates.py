"""Offline checks of executable HTTP request boundaries, not host execution."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "skills/callev2/assets"


def requests(path):
    return re.findall(r"^(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE|CONNECT|TRACE)\s+(\S+)", path.read_text(), re.M)


class HttpTemplateTests(unittest.TestCase):
    def test_default_read_only_template_has_all_five_get_requests(self):
        parsed = requests(ASSETS / "read-only.http")
        self.assertEqual(len(parsed), 5)
        self.assertEqual({method for method, _ in parsed}, {"GET"})

    def test_write_template_contains_only_create_and_cancel(self):
        self.assertEqual(requests(ASSETS / "write-requests.http"), [
            ("POST", "https://api.heycall-e.com/v2/calls"),
            ("POST", "https://api.heycall-e.com/v2/calls/{{CALL_RESOURCE_ID}}/cancel"),
        ])

    def test_all_request_targets_use_the_fixed_public_api_origin(self):
        parsed = [request for path in ASSETS.glob("*.http") for request in requests(path)]
        self.assertTrue(parsed)
        for _, url in parsed:
            self.assertTrue(url.startswith("https://api.heycall-e.com/"), url)
            self.assertNotIn("{{CALLE_BASE_URL}}", url)

    def test_no_http_file_mixes_reads_and_writes(self):
        for path in ASSETS.glob("*.http"):
            methods = {method for method, _ in requests(path)}
            self.assertFalse(methods & {"GET", "HEAD", "OPTIONS"} and methods & {"POST", "PUT", "PATCH", "DELETE"}, path)

    def test_write_body_preserves_the_invalid_phone_placeholder(self):
        text = (ASSETS / "write-requests.http").read_text()
        body = text[text.index("\n{"):text.index("\n###", text.index("\n{"))].strip()
        self.assertEqual(json.loads(body), json.loads((ASSETS / "hello-call.request.json").read_text()))

    def test_default_testing_http_links_only_resolve_to_reads(self):
        path = ROOT / "skills/callev2/references/testing-api.md"
        # The default section precedes A (the later, explicitly authorized stages).
        intro = path.read_text().split("## A.", 1)[0]
        links = re.findall(r"\]\(([^)]+\.http)\)", intro)
        self.assertTrue(links, "Default testing entry must expose a read-only HTTP template")
        for link in links:
            parsed = requests(path.parent / link)
            self.assertTrue(parsed)
            self.assertEqual({method for method, _ in parsed}, {"GET"})
