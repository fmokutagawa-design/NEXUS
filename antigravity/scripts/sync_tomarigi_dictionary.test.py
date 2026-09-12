import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "antigravity" / "scripts" / "sync_tomarigi_dictionary.py"

result = subprocess.run(
    [sys.executable, str(SCRIPT), "--repo", str(ROOT), "--check"],
    check=True,
    capture_output=True,
    text=True,
)
stats = json.loads(result.stdout)
assert stats["tomarigi_canonical"] > 100
assert stats["removed_source_entries"] > 0
assert stats["final"] <= stats["preserved_manual"] + stats["tomarigi_canonical"]
print("sync_tomarigi_dictionary: passed", stats)
