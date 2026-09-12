#!/usr/bin/env python3
"""Rebuild the Tomarigi-derived part of prh.yml from the original XML files.

The old conversion was not auditable: disabled entries and entries marked as
non-mistakes could enter the active dictionary. This script preserves the
hand-maintained rules in prh.yml, removes only entries whose pattern belongs
to a Tomarigi source dictionary, and appends the active, deterministic subset.
"""

from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path


PAIR_FILES = (
    "t_adverbkana.xml",
    "t_adverbkanji.xml",
    "t_conjunctionkanji.xml",
    "t_substitutecharacter.xml",
    "t_okurikana.xml",
)

# Tomarigi's adverb dictionary explicitly treats 唯 as the adverb ただ.
# Keep this one-character entry because it is covered by the existing NEXUS
# regression test; do not generalize this exception to the other dictionaries.
SAFE_SINGLE_CHAR_PATTERNS = {"唯"}


def katakana_to_hiragana(value: str) -> str:
    return "".join(
        chr(ord(char) - 0x60) if "ァ" <= char <= "ヶ" else char
        for char in value
    )


def text(node: ET.Element, name: str) -> str:
    child = node.find(name)
    return (child.text or "").strip() if child is not None else ""


def active_mistake(node: ET.Element) -> bool:
    return text(node, "Disable").lower() != "true" and text(node, "Mistake").lower() == "true"


def source_rules(plugin_dir: Path) -> tuple[list[tuple[str, str]], set[str]]:
    rules: list[tuple[str, str]] = []
    source_patterns: set[str] = set()

    for filename in PAIR_FILES:
        root = ET.parse(plugin_dir / filename).getroot()
        for node in root.iter():
            kanji = text(node, "Kanji")
            kana = text(node, "Kana")
            correct = text(node, "Correct")
            exclude = text(node, "Exclude")

            if kanji:
                source_patterns.add(kanji)
            if exclude:
                source_patterns.add(exclude)

            if not active_mistake(node):
                continue

            if correct and exclude:
                expected, pattern = correct, exclude
            elif kanji and kana:
                expected = kana
                if filename != "t_substitutecharacter.xml" or text(node, "IsHiragana").lower() == "true":
                    expected = katakana_to_hiragana(expected)
                else:
                    # The non-hiragana substitute entries intentionally keep
                    # their stored Katakana spelling (e.g. ガス, コーヒー).
                    expected = expected
                pattern = kanji
            else:
                continue

            if (len(pattern) <= 1 and pattern not in SAFE_SINGLE_CHAR_PATTERNS) or not expected or expected == pattern:
                continue
            rules.append((expected, pattern))

    unique: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for rule in rules:
        if rule not in seen:
            unique.append(rule)
            seen.add(rule)
    unique.sort(key=lambda rule: (-len(rule[1]), rule[1], rule[0]))
    return unique, source_patterns


def read_existing(path: Path) -> list[tuple[str, str]]:
    content = path.read_text(encoding="utf-8")
    matches = re.findall(r"^- expected: (.*)\n  pattern: (.*)$", content, flags=re.MULTILINE)
    if not matches:
        raise ValueError(f"No simple prh rules found in {path}")
    return [(json.loads(expected) if expected.startswith('"') else expected,
             json.loads(pattern) if pattern.startswith('"') else pattern)
            for expected, pattern in matches]


def write_rules(path: Path, rules: list[tuple[str, str]]) -> None:
    lines = ["rules:"]
    for expected, pattern in rules:
        lines.append(f"- expected: {json.dumps(expected, ensure_ascii=False)}")
        lines.append(f"  pattern: {json.dumps(pattern, ensure_ascii=False)}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--check", action="store_true", help="Print counts without rewriting prh.yml")
    args = parser.parse_args()

    plugin_dir = args.repo / "Tomarigi" / "plugins"
    prh_path = args.repo / "antigravity" / "textlint" / "prh.yml"
    canonical, source_patterns = source_rules(plugin_dir)
    existing = read_existing(prh_path)
    # 一文字の表記は文脈なしのprhに新規生成しない。ただし、明示した
    # 手動確認済み例外（現在は唯→ただ）だけは消さずに保持する。
    preserved = [
        rule for rule in existing
        if rule[1] not in source_patterns or rule[1] in SAFE_SINGLE_CHAR_PATTERNS
    ]
    merged: list[tuple[str, str]] = []
    for rule in preserved + canonical:
        if rule not in merged:
            merged.append(rule)

    print(json.dumps({
        "existing": len(existing),
        "preserved_manual": len(preserved),
        "tomarigi_canonical": len(canonical),
        "final": len(merged),
        "removed_source_entries": len(existing) - len(preserved),
    }, ensure_ascii=False))
    if not args.check:
        write_rules(prh_path, merged)


if __name__ == "__main__":
    main()
