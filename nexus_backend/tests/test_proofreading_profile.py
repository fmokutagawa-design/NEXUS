import json
import tempfile
import unittest
from pathlib import Path

from proofreading_profile import load_profile
from proofreader import Proofreader


class ProofreadingProfileTest(unittest.TestCase):
    def test_loads_nearest_project_profile_and_global_whitelist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".nexus").mkdir()
            (root / "chapters").mkdir()
            (root / ".nexus" / "proofreading.json").write_text(json.dumps({
                "whitelist": ["固有語"],
                "techniques": {"allow_repetition": False},
            }), encoding="utf-8")
            global_file = root / "global.json"
            global_file.write_text(json.dumps({"whitelist": ["共通語"]}), encoding="utf-8")
            profile = load_profile(root / "chapters" / "one.txt", global_file)
            self.assertEqual(profile["whitelist"], ["共通語", "固有語"])
            self.assertFalse(profile["techniques"]["allow_repetition"])
            self.assertTrue(profile["techniques"]["allow_nominal_endings"])

    def test_redpen_heading_level_and_whitelist_filter(self):
        proofreader = Proofreader()
        issues = proofreader.proofread("# 第一部\n\n### 第一章\n本文。", mode="proof", profile={})
        self.assertTrue(any(issue["rule_id"] == "redpen/section-level" for issue in issues))
        issues = proofreader.proofread("することができる。", mode="proof", profile={
            "whitelist": ["することができる"]
        })
        self.assertFalse(any(issue["rule_id"] == "nexus/redundancy" for issue in issues))


if __name__ == "__main__":
    unittest.main()
