#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import traceback


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("sync_tomarigi_reference_data.py")
DATA_DIRECTORY = REPOSITORY_ROOT / "antigravity" / "textlint" / "data" / "tomarigi"
SOURCE_PATHS = (
    Path("Tomarigi/plugins/t_chinesenumeral.dll"),
    Path("Tomarigi/plugins/t_homonym.dll"),
    Path("Tomarigi/plugins/t_inappropriatepos.dll"),
    Path("Tomarigi/saezuri.dll"),
    Path("Tomarigi/plugins/t_punctuationmark.xml"),
    Path("Tomarigi/plugins/t_punctuationmark.dll"),
    Path("Tomarigi/plugins/t_alphanumeralkanasize.xml"),
    Path("Tomarigi/plugins/t_alphanumeralkanasize.dll"),
    Path("Tomarigi/plugins/t_sentenceendstyle.xml"),
    Path("Tomarigi/plugins/t_sentenceendstyle.dll"),
)


def encode(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def load_sync_module():
    spec = importlib.util.spec_from_file_location("sync_tomarigi_reference_data", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def expected_manifest() -> dict[str, object]:
    return {
        "schemaVersion": 2,
        "sources": [
            {
                "path": path.as_posix(),
                "sha256": hashlib.sha256((REPOSITORY_ROOT / path).read_bytes()).hexdigest(),
            }
            for path in sorted(SOURCE_PATHS)
        ],
        "counts": {
            "kanji": 6359,
            "commonKanji": 2136,
            "radicals": 265,
            "kanjiReadings": 18819,
            "settings": 9,
            "homonymGroups": 1550,
            "homonymItems": 3760,
            "sameKun": 181,
            "chineseNumeralExceptions": 328,
            "inappropriatePosExceptions": {"的": 490, "超": 129},
        },
    }


def test_kanji_details_preserve_source_fields():
    data = load_sync_module().build_reference_data(REPOSITORY_ROOT)
    records = {row["text"]: row for row in data["kanji"]}
    assert records["亜"].get("radicalId") == 8, records["亜"]
    assert records["亜"]["readings"] == {"OnS": ["ア"], "KunS": [], "On": [], "Kun": ["つ-ぐ"]}
    assert records["薔"]["readings"]["On"] == ["バ", "ショウ", "ショク", "ソウ"]
    assert records["愛"]["parts"] == "夂"
    assert all(row["similar"] == "" for row in data["kanji"])
    assert len(data["radicals"]) == 265
    assert next(row for row in data["radicals"] if row["id"] == 8) == {
        "id": 8, "text": "二", "reading": "に", "strokeCount": 2,
    }
    # These four source records reference ID 0, which has no radical definition.
    assert {row["text"] for row in data["kanji"] if row["radicalId"] == 0} == {"𠮟", "塡", "剝", "頰"}
    assert not any(row["id"] == 0 for row in data["radicals"])


def test_settings_preserve_exact_xml_values():
    data = load_sync_module().build_reference_data(REPOSITORY_ROOT)
    assert data.get("settings") == {
        "punctuation": {"PunctuationmarkTypeA": "3", "PunctuationmarkTypeB": "3", "ColoringStr": "Wheat"},
        "width": {"AlphaType": "1", "NumeralType": "1", "KanaType": "1", "ColoringStr": "RosyBrown"},
        "sentenceStyle": {"EndType": "1", "ColoringStr": "MediumAquamarine"},
    }


def test_manifest_identifies_resources_and_real_assembly_versions():
    sync = load_sync_module()
    manifest = sync._manifest(REPOSITORY_ROOT, sync.build_reference_data(REPOSITORY_ROOT))
    assert "datasets" in manifest, "missing dataset provenance"
    datasets = manifest["datasets"]
    assert datasets["kanji"] == {
        "source": {"path": "Tomarigi/saezuri.dll", "resource": "saezuri.Properties.Resources.resources", "key": "kanjiDB"},
        "sourceVersion": "1.0.0.0", "versionSource": "Tomarigi/saezuri.dll",
    }
    assert datasets["radicals"] == datasets["kanji"]
    assert datasets["homonymGroups"]["source"]["key"] == "homonymDB"
    assert datasets["sameKun"]["source"] == {
        "path": "Tomarigi/plugins/t_homonym.dll", "resource": "t_homonym.homonym.resources", "key": "同訓",
    }
    assert datasets["chineseNumeralExceptions"]["source"]["resource"] == "t_chinesenumeral.t_chinesenumeraldata.resources"
    assert datasets["inappropriatePosExceptions"]["source"]["resource"] == "t_inappropriatepos.t_inappropriateposdata.resources"
    for name in ["sameKun", "chineseNumeralExceptions", "inappropriatePosExceptions", "punctuation", "width", "sentenceStyle"]:
        assert datasets[name]["sourceVersion"] == "0.9.0.0"
    assert datasets["punctuation"]["source"] == {"path": "Tomarigi/plugins/t_punctuationmark.xml", "resource": "Setting"}
    assert datasets["punctuation"]["versionSource"] == "Tomarigi/plugins/t_punctuationmark.dll"
    assert datasets["width"]["source"]["path"] == "Tomarigi/plugins/t_alphanumeralkanasize.xml"
    assert datasets["sentenceStyle"]["source"]["path"] == "Tomarigi/plugins/t_sentenceendstyle.xml"


def test_counts_determinism_and_generated_files() -> None:
    sync = load_sync_module()
    data = sync.build_reference_data(REPOSITORY_ROOT)

    assert len(data["kanji"]) == 6359
    assert sum(1 for row in data["kanji"] if row["isCommon"]) == 2136
    assert len(data["homonymGroups"]) == 1550
    assert sum(len(row["items"]) for row in data["homonymGroups"]) == 3760
    assert len(data["sameKun"]) == 181
    assert len(data["chineseNumeralExceptions"]) == 328
    assert len(data["inappropriatePosExceptions"]["的"]) == 490
    assert len(data["inappropriatePosExceptions"]["超"]) == 129
    assert encode(data) == encode(sync.build_reference_data(REPOSITORY_ROOT))

    assert json.loads((DATA_DIRECTORY / "kanji.json").read_text(encoding="utf-8")) == {
        "kanji": data["kanji"], "radicals": data["radicals"],
    }
    assert json.loads((DATA_DIRECTORY / "homonyms.json").read_text(encoding="utf-8")) == {
        "homonymGroups": data["homonymGroups"],
        "sameKun": data["sameKun"],
    }
    assert json.loads((DATA_DIRECTORY / "usage-exceptions.json").read_text(encoding="utf-8")) == {
        "chineseNumeralExceptions": data["chineseNumeralExceptions"],
        "inappropriatePosExceptions": data["inappropriatePosExceptions"],
        "settings": data["settings"],
    }
    manifest = json.loads(
        (DATA_DIRECTORY / "reference-manifest.json").read_text(encoding="utf-8")
    )
    assert {key: manifest[key] for key in ("schemaVersion", "sources", "counts")} == expected_manifest()

    for path in DATA_DIRECTORY.glob("*.json"):
        assert path.read_bytes() == encode(json.loads(path.read_text(encoding="utf-8"))).encode(
            "utf-8"
        )


def test_check_reports_drift_without_writing() -> None:
    with tempfile.TemporaryDirectory() as temporary_directory:
        repository = Path(temporary_directory)
        for relative_path in SOURCE_PATHS:
            destination = repository / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(REPOSITORY_ROOT / relative_path, destination)

        dumper = Path("antigravity/scripts/tomarigi_resource_dump.cs")
        (repository / dumper).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPOSITORY_ROOT / dumper, repository / dumper)

        result = subprocess.run(
            ["python3", str(SCRIPT), "--repo", str(repository), "--check"],
            cwd=REPOSITORY_ROOT / "antigravity",
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1, result.stdout + result.stderr
        assert "out of date" in result.stderr.lower(), result.stdout + result.stderr
        assert not (repository / "antigravity/textlint/data/tomarigi").exists()


def test_generation_writes_lf_bytes_when_text_mode_would_translate() -> None:
    sync = load_sync_module()
    with tempfile.TemporaryDirectory() as temporary_directory:
        repository = Path(temporary_directory)
        for relative_path in SOURCE_PATHS:
            destination = repository / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(REPOSITORY_ROOT / relative_path, destination)

        dumper = Path("antigravity/scripts/tomarigi_resource_dump.cs")
        (repository / dumper).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPOSITORY_ROOT / dumper, repository / dumper)

        original_write_text = Path.write_text

        def write_text_with_windows_newlines(
            path: Path,
            data: str,
            encoding: str | None = None,
            errors: str | None = None,
            newline: str | None = None,
        ) -> int:
            del errors, newline
            return path.write_bytes(data.replace("\n", "\r\n").encode(encoding or "utf-8"))

        Path.write_text = write_text_with_windows_newlines
        try:
            assert sync.main(["--repo", str(repository)]) == 0
        finally:
            Path.write_text = original_write_text

        output_directory = repository / "antigravity/textlint/data/tomarigi"
        for output in output_directory.glob("*.json"):
            content = output.read_bytes()
            assert b"\r\n" not in content, output
            assert content.endswith(b"\n"), output

        first = {path.name: path.read_bytes() for path in output_directory.glob("*.json")}
        assert sync.main(["--repo", str(repository)]) == 0
        assert {path.name: path.read_bytes() for path in output_directory.glob("*.json")} == first
        assert sync.main(["--repo", str(repository), "--check"]) == 0
        changed = output_directory / "usage-exceptions.json"
        changed.write_bytes(first[changed.name].replace(b'"AlphaType": "1"', b'"AlphaType": "9"'))
        before_check = {path.name: path.read_bytes() for path in output_directory.glob("*.json")}
        assert before_check != first
        assert sync.main(["--repo", str(repository), "--check"]) == 1
        assert {path.name: path.read_bytes() for path in output_directory.glob("*.json")} == before_check


if __name__ == "__main__":
    failures = 0
    for test in [test_kanji_details_preserve_source_fields, test_settings_preserve_exact_xml_values,
                 test_manifest_identifies_resources_and_real_assembly_versions,
                 test_counts_determinism_and_generated_files, test_check_reports_drift_without_writing,
                 test_generation_writes_lf_bytes_when_text_mode_would_translate]:
        try:
            test()
            print(f"PASS: {test.__name__}", flush=True)
        except Exception:
            failures += 1
            print(f"FAIL: {test.__name__}", flush=True)
            traceback.print_exc()
    if failures:
        raise SystemExit(1)

    print("PASS: deterministic Tomarigi reference data and read-only --check")
