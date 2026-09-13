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
            encoding="utf-8",
        )

        environment = os.environ.copy()
        environment["MONO_PATH"] = str(SAEZURI_DLL.parent)
        result = subprocess.run(
            ["mono", str(executable)],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
            env=environment,
        )
        repeated = subprocess.run(
            ["mono", str(executable)], cwd=REPOSITORY_ROOT, check=True,
            capture_output=True, env=environment,
        )
        assert result.stdout == repeated.stdout, "repeated raw dump bytes differ"
        return result.stdout


def test_dump_contains_known_records():
    rows = run_dump().decode("utf-8")
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
    ordinal = lambda value: value.encode("utf-16-be", errors="surrogatepass")
    assert kanji_texts == sorted(kanji_texts, key=ordinal), "KANJI rows are not in ordinal Text order"
    assert homonym_keys == sorted(homonym_keys, key=lambda pair: tuple(map(ordinal, pair))), (
        "HOMONYM rows are not in ordinal Read/Text order"
    )

    # Source-inspected values; retain all four distinct reading lists and raw
    # empty Similar, not a guessed collection of visually similar characters.
    assert "KANJI\t亜\tTrue\t7\t1\t7\t8\t\t" in lines
    assert "READING\t亜\tOnS\tア" in lines
    assert "READING\t亜\tKun\tつ-ぐ" in lines
    assert "RADICAL\t1\t一\tいち\t1" in lines
    assert sum(line.startswith("RADICAL\t") for line in lines) == 265
    assert sum(line.startswith("READING\t") for line in lines) == 18819
    radical_ids = [int(line.split("\t")[1]) for line in lines if line.startswith("RADICAL\t")]
    assert radical_ids == sorted(radical_ids)

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
