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
        "schemaVersion": 1,
        "sources": [
            {
                "path": path.as_posix(),
                "sha256": hashlib.sha256((REPOSITORY_ROOT / path).read_bytes()).hexdigest(),
            }
            for path in SOURCE_PATHS
        ],
        "counts": {
            "kanji": 6359,
            "commonKanji": 2136,
            "homonymGroups": 1550,
            "homonymItems": 3760,
            "sameKun": 181,
            "chineseNumeralExceptions": 328,
            "inappropriatePosExceptions": {"的": 490, "超": 129},
        },
    }


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

    assert json.loads((DATA_DIRECTORY / "kanji.json").read_text(encoding="utf-8")) == data["kanji"]
    assert json.loads((DATA_DIRECTORY / "homonyms.json").read_text(encoding="utf-8")) == {
        "homonymGroups": data["homonymGroups"],
        "sameKun": data["sameKun"],
    }
    assert json.loads((DATA_DIRECTORY / "usage-exceptions.json").read_text(encoding="utf-8")) == {
        "chineseNumeralExceptions": data["chineseNumeralExceptions"],
        "inappropriatePosExceptions": data["inappropriatePosExceptions"],
    }
    assert json.loads(
        (DATA_DIRECTORY / "reference-manifest.json").read_text(encoding="utf-8")
    ) == expected_manifest()

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


if __name__ == "__main__":
    try:
        test_counts_determinism_and_generated_files()
        test_check_reports_drift_without_writing()
        test_generation_writes_lf_bytes_when_text_mode_would_translate()
    except Exception:
        print("FAIL: Tomarigi reference data sync test", flush=True)
        traceback.print_exc()
        raise SystemExit(1)

    print("PASS: deterministic Tomarigi reference data and read-only --check")
