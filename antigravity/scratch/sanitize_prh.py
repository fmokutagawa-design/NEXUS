"""Remove context-free one-character replacements from the generated PRH file.

Those entries are handled by the POS-aware Tomarigi compatibility rule instead.
"""
from pathlib import Path
import re

path = Path(__file__).parents[1] / "textlint" / "prh.yml"
lines = path.read_text(encoding="utf-8").splitlines()
output = [lines[0]]
removed = 0
for index in range(1, len(lines), 2):
    block = lines[index:index + 2]
    if len(block) < 2:
        output.extend(block)
        continue
    match = re.match(r"\s*pattern:\s*['\"]?(.*?)['\"]?\s*$", block[1])
    if match and len(match.group(1)) == 1:
        removed += 1
        continue
    output.extend(block)
path.write_text("\n".join(output) + "\n", encoding="utf-8")
print(f"removed {removed} unsafe one-character PRH entries")
