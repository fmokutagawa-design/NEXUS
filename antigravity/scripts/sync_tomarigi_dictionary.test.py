import json
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "antigravity" / "scripts" / "sync_tomarigi_dictionary.py"

spec = importlib.util.spec_from_file_location("sync_dictionary", SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def run(repository, *args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(repository), *args],
        capture_output=True, encoding="utf-8",
    )


class DictionaryTests(unittest.TestCase):
    def test_quarantines_meaning_changing_source_entry(self):
        rules, patterns = sync.source_rules(ROOT / "Tomarigi/plugins")
        self.assertIn("漸く", patterns)  # Still removes the legacy generated fix.
        self.assertFalse(any(pattern == "漸く" for _, pattern in rules))
        self.assertIn(("いつも", "何時も"), rules)
        self.assertIn(("ただ", "唯"), rules)

    def test_check_detects_drift_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            plugins = repository / "Tomarigi/plugins"
            plugins.mkdir(parents=True)
            for name in sync.PAIR_FILES:
                shutil.copy2(ROOT / "Tomarigi/plugins" / name, plugins / name)
            target = repository / "antigravity/textlint/prh.yml"
            target.parent.mkdir(parents=True)
            target.write_text('rules:\n- expected: "manual"\n  pattern: "handwritten"\n', encoding="utf-8")
            self.assertEqual(run(repository).returncode, 0)
            canonical = target.read_bytes()
            for label, content in [
                ("missing canonical", canonical.replace('- expected: "いつも"\n  pattern: "何時も"\n'.encode(), b"")),
                ("altered canonical", canonical.replace('"いつも"'.encode(), '"誤変換"'.encode())),
                ("altered single-character canonical", canonical.replace('"ただ"'.encode(), '"誤変換"'.encode())),
                ("missing output", None),
            ]:
                with self.subTest(label=label):
                    if content is None:
                        target.unlink()
                    else:
                        self.assertNotEqual(content, canonical)
                        target.write_bytes(content)
                    result = run(repository, "--check")
                    self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                    self.assertIn("out of date", result.stderr)
                    self.assertEqual(target.read_bytes() if target.exists() else None, content)
            target.write_bytes(canonical)
            self.assertEqual(run(repository, "--check").returncode, 0)
            self.assertEqual(run(repository).returncode, 0)
            self.assertEqual(target.read_bytes(), canonical)
            self.assertIn(b'pattern: "handwritten"', canonical)
            self.assertNotIn('pattern: "漸く"'.encode(), canonical)

    def test_checked_in_dictionary_is_current(self):
        result = run(ROOT, "--check")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        stats = json.loads(result.stdout)
        self.assertEqual(stats["tomarigi_canonical"], 146)
        self.assertEqual(stats["final"], 636)
        self.assertEqual(stats["preserved_manual"], 490)
        self.assertNotIn('pattern: "漸く"', (ROOT / "antigravity/textlint/prh.yml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
