#!/usr/bin/env python3

import os
from pathlib import Path
import subprocess
import tempfile
import traceback


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name("tomarigi_resource_dump.cs")
SAEZURI_DLL = REPOSITORY_ROOT / "Tomarigi" / "saezuri.dll"


def run_dump():
    assert SOURCE.is_file(), f"missing dumper source: {SOURCE}"

    with tempfile.TemporaryDirectory() as temporary_directory:
        executable = Path(temporary_directory) / "tomarigi_resource_dump.exe"
        subprocess.run(
            [
                "mcs",
                "-nologo",
                f"-out:{executable}",
                f"-r:{SAEZURI_DLL}",
                str(SOURCE),
            ],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        environment = os.environ.copy()
        environment["MONO_PATH"] = str(SAEZURI_DLL.parent)
        result = subprocess.run(
            ["mono", str(executable)],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            text=True,
            env=environment,
        )
        return result.stdout


def test_dump_contains_known_records():
    rows = run_dump()
    assert "KANJI\t亜\t" in rows
    assert "HOMONYM\tアイショウ\t愛称\t" in rows
    assert "HOMONYM\tアイショウ\t相性\t" in rows

    lines = rows.splitlines()
    kanji_rows = [line for line in lines if line.startswith("KANJI\t")]
    homonym_rows = [line for line in lines if line.startswith("HOMONYM\t")]
    assert len(kanji_rows) == 6359, len(kanji_rows)
    assert len(homonym_rows) == 3760, len(homonym_rows)

    kanji_texts = [line.split("\t")[1] for line in kanji_rows]
    homonym_keys = [tuple(line.split("\t")[1:3]) for line in homonym_rows]
    assert kanji_texts == sorted(kanji_texts), "KANJI rows are not in ordinal Text order"
    assert homonym_keys == sorted(homonym_keys), (
        "HOMONYM rows are not in ordinal Read/Text order"
    )

    print(
        f"PASS: {len(kanji_rows):,} kanji records and "
        f"{len(homonym_rows):,} homonym items"
    )


if __name__ == "__main__":
    try:
        test_dump_contains_known_records()
    except Exception:
        print("FAIL: Tomarigi resource dump test", flush=True)
        traceback.print_exc()
        raise SystemExit(1)
