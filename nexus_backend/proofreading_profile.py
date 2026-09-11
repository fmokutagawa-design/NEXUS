"""Project-scoped deterministic proofreading preferences."""
from __future__ import annotations

import json
import os
from pathlib import Path


DEFAULT_PROFILE = {
    "mode": "novel",
    "whitelist": [],
    "disabled_rules": [],
    "techniques": {
        "allow_nominal_endings": True,
        "allow_repetition": True,
        "relax_dialogue": True,
    },
    "thresholds": {
        "long_paragraph": 1000,
        "blank_lines": 3,
    },
}


def _merge(base, override):
    result = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = value
    return result


def load_profile(file_path="", global_whitelist_path=None):
    profile = _merge(DEFAULT_PROFILE, {})
    global_words = []
    if global_whitelist_path and os.path.exists(global_whitelist_path):
        try:
            global_words = json.loads(Path(global_whitelist_path).read_text(encoding="utf-8")).get("whitelist", [])
        except (OSError, ValueError):
            pass

    path = Path(str(file_path)) if file_path else None
    if path:
        directory = path if path.is_dir() else path.parent
        for parent in [directory, *directory.parents]:
            candidates = [parent / ".nexus" / "proofreading.json", parent / ".nexus-proofreading.json"]
            found = next((candidate for candidate in candidates if candidate.exists()), None)
            if found:
                try:
                    profile = _merge(profile, json.loads(found.read_text(encoding="utf-8")))
                    profile["source"] = str(found)
                except (OSError, ValueError) as error:
                    profile["warning"] = f"校正設定を読み込めません: {error}"
                break

    profile["whitelist"] = sorted(set(global_words + list(profile.get("whitelist", []))))
    return profile
