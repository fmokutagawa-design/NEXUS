#!/usr/bin/env python3
"""Generate deterministic UTF-8 reference dictionaries from Tomarigi assets."""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


SETTINGS_FILES = {
    "punctuation": Path("Tomarigi/plugins/t_punctuationmark.xml"),
    "width": Path("Tomarigi/plugins/t_alphanumeralkanasize.xml"),
    "sentenceStyle": Path("Tomarigi/plugins/t_sentenceendstyle.xml"),
}
SOURCE_PATHS = (
    Path("Tomarigi/plugins/t_chinesenumeral.dll"),
    Path("Tomarigi/plugins/t_homonym.dll"),
    Path("Tomarigi/plugins/t_inappropriatepos.dll"),
    Path("Tomarigi/saezuri.dll"),
) + tuple(SETTINGS_FILES.values()) + tuple(path.with_suffix(".dll") for path in SETTINGS_FILES.values())
RESOURCE_FILES = {
    "sameKun": (
        Path("Tomarigi/plugins/t_homonym.dll"),
        "t_homonym.homonym.resources",
        "同訓",
    ),
    "chineseNumeralExceptions": (
        Path("Tomarigi/plugins/t_chinesenumeral.dll"),
        "t_chinesenumeral.t_chinesenumeraldata.resources",
        "kanjiword",
    ),
    "inappropriatePosExceptions": (
        Path("Tomarigi/plugins/t_inappropriatepos.dll"),
        "t_inappropriatepos.t_inappropriateposdata.resources",
        None,
    ),
}


def stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _unescape(value: str) -> str:
    output: list[str] = []
    index = 0
    escapes = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\"}
    while index < len(value):
        char = value[index]
        if char != "\\":
            output.append(char)
            index += 1
            continue
        index += 1
        if index == len(value):
            raise ValueError("Trailing escape in .resources text value")
        escaped = value[index]
        if escaped not in escapes:
            raise ValueError(f"Unsupported .resources escape: \\{escaped}")
        output.append(escapes[escaped])
        index += 1
    return "".join(output)


def _read_resource_file(source_root: Path, dll: Path, resource_name: str) -> dict[str, str]:
    with tempfile.TemporaryDirectory() as temporary_directory:
        work_directory = Path(temporary_directory)
        subprocess.run(
            ["monodis", "--mresources", str(source_root / dll)],
            cwd=work_directory,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        resource_path = work_directory / resource_name
        if not resource_path.is_file():
            raise FileNotFoundError(f"Embedded resource not found: {resource_name} in {dll}")

        text_path = work_directory / "resource.txt"
        subprocess.run(
            ["resgen", str(resource_path), str(text_path)],
            cwd=work_directory,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        resources: dict[str, str] = {}
        for line in text_path.read_text(encoding="utf-8-sig").splitlines():
            if not line or line.startswith("#"):
                continue
            key, separator, value = line.partition("=")
            if not separator:
                raise ValueError(f"Malformed .resources text line: {line!r}")
            resources[key] = _unescape(value)
        return resources


def _unescape_tsv(value: str) -> str:
    return _unescape(value)


def _parse_bool(value: str) -> bool:
    normalized = value.lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError(f"Expected boolean, got {value!r}")


def _dump_embedded_dictionaries(source_root: Path) -> str:
    source = source_root / "antigravity" / "scripts" / "tomarigi_resource_dump.cs"
    saezuri_dll = source_root / "Tomarigi" / "saezuri.dll"
    with tempfile.TemporaryDirectory() as temporary_directory:
        executable = Path(temporary_directory) / "tomarigi_resource_dump.exe"
        subprocess.run(
            ["mcs", "-nologo", f"-out:{executable}", f"-r:{saezuri_dll}", str(source)],
            cwd=source_root,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment["MONO_PATH"] = str(saezuri_dll.parent)
        result = subprocess.run(
            ["mono", str(executable)],
            cwd=source_root,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=environment,
        )
        return result.stdout


def _parse_dump(rows: str) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    kanji: list[dict[str, object]] = []
    radicals: list[dict[str, object]] = []
    homonyms: dict[str, list[dict[str, object]]] = defaultdict(list)
    for line in rows.splitlines():
        fields = line.split("\t")
        if fields[0] == "KANJI" and len(fields) == 9:
            kanji.append(
                {
                    "text": _unescape_tsv(fields[1]),
                    "isCommon": _parse_bool(fields[2]),
                    "learnLevel": int(fields[3]),
                    "jisLevel": int(fields[4]),
                    "strokeCount": int(fields[5]),
                    "radicalId": int(fields[6]),
                    "parts": _unescape_tsv(fields[7]),
                    "similar": _unescape_tsv(fields[8]),
                    "readings": {kind: [] for kind in ("OnS", "KunS", "On", "Kun")},
                }
            )
        elif fields[0] == "READING" and len(fields) == 4:
            if not kanji or kanji[-1]["text"] != _unescape_tsv(fields[1]) or fields[2] not in kanji[-1]["readings"]:
                raise ValueError(f"Reading without matching kanji/kind: {line!r}")
            kanji[-1]["readings"][fields[2]].append(_unescape_tsv(fields[3]))
        elif fields[0] == "RADICAL" and len(fields) == 5:
            radicals.append({"id": int(fields[1]), "text": _unescape_tsv(fields[2]),
                             "reading": _unescape_tsv(fields[3]), "strokeCount": int(fields[4])})
        elif fields[0] == "HOMONYM" and len(fields) == 5:
            reading = _unescape_tsv(fields[1])
            homonyms[reading].append(
                {
                    "text": _unescape_tsv(fields[2]),
                    "meaning": _unescape_tsv(fields[3]),
                    "enabled": _parse_bool(fields[4]),
                }
            )
        else:
            raise ValueError(f"Malformed Tomarigi dump row: {line!r}")

    kanji.sort(key=lambda row: str(row["text"]))
    groups = [
        {
            "reading": reading,
            "items": sorted(
                items,
                key=lambda item: (
                    str(item["text"]),
                    str(item["meaning"]),
                    bool(item["enabled"]),
                ),
            ),
        }
        for reading, items in sorted(homonyms.items())
    ]
    radicals.sort(key=lambda row: row["id"])
    return kanji, groups, radicals


def _nonempty_lines(value: str) -> list[str]:
    return sorted(line for line in value.splitlines() if line)


def build_reference_data(source_root: Path) -> dict[str, object]:
    source_root = source_root.resolve()
    kanji, homonym_groups, radicals = _parse_dump(_dump_embedded_dictionaries(source_root))

    same_kun_dll, same_kun_resource, same_kun_key = RESOURCE_FILES["sameKun"]
    same_kun_value = _read_resource_file(
        source_root, same_kun_dll, same_kun_resource
    )[str(same_kun_key)]
    same_kun = []
    for line in same_kun_value.splitlines():
        if not line:
            continue
        reading, separator, characters = line.partition("\t")
        if not separator:
            raise ValueError(f"Malformed same-kun entry: {line!r}")
        same_kun.append({"reading": reading, "kanji": sorted(characters)})
    same_kun.sort(key=lambda row: (str(row["reading"]), "".join(row["kanji"])))

    chinese_dll, chinese_resource, chinese_key = RESOURCE_FILES[
        "chineseNumeralExceptions"
    ]
    chinese_resources = _read_resource_file(source_root, chinese_dll, chinese_resource)
    chinese_numeral_exceptions = _nonempty_lines(chinese_resources[str(chinese_key)])

    inappropriate_dll, inappropriate_resource, _ = RESOURCE_FILES[
        "inappropriatePosExceptions"
    ]
    inappropriate_resources = _read_resource_file(
        source_root, inappropriate_dll, inappropriate_resource
    )
    inappropriate_pos_exceptions = {
        key: _nonempty_lines(inappropriate_resources[key]) for key in sorted(inappropriate_resources)
    }

    return {
        "kanji": kanji,
        "radicals": radicals,
        "homonymGroups": homonym_groups,
        "sameKun": same_kun,
        "chineseNumeralExceptions": chinese_numeral_exceptions,
        "inappropriatePosExceptions": inappropriate_pos_exceptions,
        # Keep the original field names and string values. These are reference
        # settings, not new runtime rules or an inferred mapping of enum values.
        "settings": {
            name: {child.tag: child.text or "" for child in ET.parse(source_root / path).getroot()}
            for name, path in sorted(SETTINGS_FILES.items())
        },
    }


def _counts(data: dict[str, object]) -> dict[str, object]:
    kanji = data["kanji"]
    homonym_groups = data["homonymGroups"]
    same_kun = data["sameKun"]
    chinese = data["chineseNumeralExceptions"]
    inappropriate = data["inappropriatePosExceptions"]
    assert isinstance(kanji, list)
    assert isinstance(homonym_groups, list)
    assert isinstance(same_kun, list)
    assert isinstance(chinese, list)
    assert isinstance(inappropriate, dict)
    return {
        "kanji": len(kanji),
        "commonKanji": sum(bool(row["isCommon"]) for row in kanji),
        "radicals": len(data["radicals"]),
        "kanjiReadings": sum(len(values) for row in kanji for values in row["readings"].values()),
        "settings": sum(len(values) for values in data["settings"].values()),
        "homonymGroups": len(homonym_groups),
        "homonymItems": sum(len(row["items"]) for row in homonym_groups),
        "sameKun": len(same_kun),
        "chineseNumeralExceptions": len(chinese),
        "inappropriatePosExceptions": {
            key: len(value) for key, value in sorted(inappropriate.items())
        },
    }


def _assembly_version(path: Path) -> str:
    result = subprocess.run(["monodis", "--assembly", str(path)], check=True,
                            capture_output=True, encoding="utf-8")
    match = re.search(r"^Version:\s+(\d+\.\d+\.\d+\.\d+)\s*$", result.stdout, re.MULTILINE)
    if not match:
        raise ValueError(f"Assembly version not found in {path}")
    return match[1]


def _dataset_sources(source_root: Path) -> dict[str, object]:
    versions = {path: _assembly_version(source_root / path) for path in SOURCE_PATHS if path.suffix == ".dll"}

    def provenance(path, resource, key=None):
        version_source = path.with_suffix(".dll")
        return {
            "source": {"path": path.as_posix(), "resource": resource, **({"key": key} if key is not None else {})},
            "sourceVersion": versions[version_source],
            "versionSource": version_source.as_posix(),
        }

    saezuri = Path("Tomarigi/saezuri.dll")
    datasets = {
        "kanji": provenance(saezuri, "saezuri.Properties.Resources.resources", "kanjiDB"),
        "radicals": provenance(saezuri, "saezuri.Properties.Resources.resources", "kanjiDB"),
        "homonymGroups": provenance(saezuri, "saezuri.Properties.Resources.resources", "homonymDB"),
    }
    for name, (dll, resource, key) in RESOURCE_FILES.items():
        datasets[name] = provenance(dll, resource, key)
    for name, path in SETTINGS_FILES.items():
        datasets[name] = provenance(path, "Setting")
    return datasets


def _manifest(source_root: Path, data: dict[str, object]) -> dict[str, object]:
    return {
        "schemaVersion": 2,
        "datasets": _dataset_sources(source_root),
        "sources": [
            {"path": path.as_posix(), "sha256": digest(source_root / path)}
            for path in sorted(SOURCE_PATHS)
        ],
        "counts": _counts(data),
    }


def _documents(source_root: Path, data: dict[str, object]) -> dict[str, object]:
    return {
        "kanji.json": {"kanji": data["kanji"], "radicals": data["radicals"]},
        "homonyms.json": {
            "homonymGroups": data["homonymGroups"],
            "sameKun": data["sameKun"],
        },
        "usage-exceptions.json": {
            "chineseNumeralExceptions": data["chineseNumeralExceptions"],
            "inappropriatePosExceptions": data["inappropriatePosExceptions"],
            "settings": data["settings"],
        },
        "reference-manifest.json": _manifest(source_root, data),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)

    source_root = args.repo.resolve()
    data = build_reference_data(source_root)
    documents = _documents(source_root, data)
    output_directory = source_root / "antigravity" / "textlint" / "data" / "tomarigi"

    if args.check:
        stale = []
        for filename, value in documents.items():
            path = output_directory / filename
            expected = stable_json(value).encode("utf-8")
            if not path.is_file() or path.read_bytes() != expected:
                stale.append(path)
        if stale:
            for path in stale:
                print(f"out of date: {path}", file=sys.stderr)
            return 1
    else:
        output_directory.mkdir(parents=True, exist_ok=True)
        for filename, value in documents.items():
            (output_directory / filename).write_bytes(stable_json(value).encode("utf-8"))

    print(json.dumps(_counts(data), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
