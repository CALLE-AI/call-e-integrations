"""Local development entrypoint. No business transport or credentials support."""
import argparse
import json
from pathlib import Path
import sys
import unittest

from tests.offline import offline_guard


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--diagnostics", action="store_true")
    parser.add_argument("--pattern", default="test_*.py")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    with offline_guard():
        if args.diagnostics:
            from tests.diagnostics import collect_observations
            print(json.dumps(collect_observations(root), indent=2))
            return 0
        suite = unittest.defaultTestLoader.discover(str(root / "tests"), pattern=args.pattern, top_level_dir=str(root))
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
