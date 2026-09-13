# Tomarigi dictionary/advisory final-fix report

## Resolved findings

1. Quarantined the meaning-changing `漸く -> しばらく` source tuple in an audited `SOURCE_QUARANTINE`, regenerated `prh.yml`, and added source, generated-file, and IPC regressions proving it cannot become a PRH fix.
2. Added request-local UTF-16 whitelist spans at the IPC boundary. A whole-word entry such as `薔薇` now suppresses its contained per-kanji advisories only at matching occurrences, including after supplementary Unicode, without mutating cached linter state.
3. Made `sync_tomarigi_dictionary.py --check` compare deterministic serialized bytes and return 1 for missing, altered, or stale generated output without writing.
4. Added source-backed kanji radical IDs and definitions, four reading lists, parts and similar-character fields; exact punctuation, width, and sentence-style XML settings; dataset resource names, resource keys, assembly source versions, version-source paths, counts, and source hashes.
5. Strictly reject malformed tokens and non-positive, non-integer `word_position` values. Strings, booleans, null, undefined, arrays, objects, and BigInt are ignored without coercion or exceptions.
6. Advisory XML now carries escaped stable rule IDs and deduplicated source metadata while continuing to omit `<suggested>` and remain separate from corrective records.

## Closed deferred test gaps

- The C# resource dumper runs twice and its raw stdout bytes must match.
- Subprocess compilation output is decoded explicitly as UTF-8; dumper bytes are decoded explicitly after byte-equality comparison.
- Python assertions sort by UTF-16 big-endian code units to match .NET `StringComparer.Ordinal`.
- The read-only reference index asserts its complete method surface and the absence of suggestion, replacement, save, write, and fix methods.

## Changed files in the final-fix wave

- `antigravity/electron/textlintMain.cjs`
- `antigravity/scripts/sync_tomarigi_dictionary.py`
- `antigravity/scripts/sync_tomarigi_dictionary.test.py`
- `antigravity/scripts/sync_tomarigi_reference_data.py`
- `antigravity/scripts/sync_tomarigi_reference_data.test.py`
- `antigravity/scripts/tomarigi_resource_dump.cs`
- `antigravity/scripts/tomarigi_resource_dump.test.py`
- `antigravity/src/utils/proofreadingHub.mjs`
- `antigravity/src/utils/proofreadingHub.test.mjs`
- `antigravity/textlint/data/tomarigi/kanji.json`
- `antigravity/textlint/data/tomarigi/reference-manifest.json`
- `antigravity/textlint/data/tomarigi/usage-exceptions.json`
- `antigravity/textlint/prh.yml`
- `antigravity/textlint/rules/tomarigi-reference-data.cjs`
- `antigravity/textlint/rules/tomarigi-reference-data.test.cjs`
- `antigravity/textlint/rules/tomarigi-reference-rules.cjs`
- `antigravity/textlint/rules/tomarigi-reference-rules.test.cjs`
- `docs/proofreading_profile.md`

## Verification

- PASS: `python3 scripts/sync_tomarigi_dictionary.test.py` (3 tests)
- PASS: `python3 scripts/tomarigi_resource_dump.test.py` (6,359 kanji; 3,760 homonym items)
- PASS: `python3 scripts/sync_tomarigi_reference_data.test.py` (6 tests)
- PASS: both dictionary/reference `--check` commands
- PASS: `node textlint/rules/tomarigi-reference-data.test.cjs`
- PASS: `node textlint/rules/tomarigi-reference-rules.test.cjs` (31 tests)
- PASS: all six declared npm `test:*` scripts; proofreading integration has 21 tests
- PASS: `npm run build` (Vite, 441 modules; existing chunk-size warning only)
- PASS: `git diff --check`
- NOT AVAILABLE: `npm test` exits 1 because `package.json` defines no `test` script. Every declared `test:*` script was run individually instead.

## Implementation commits

- `2e82a988fb5eadb2c6fcd78ff4a93a53b18098fc` — quarantine unsafe mapping and enforce PRH drift detection
- `40cebfc` — preserve complete source-backed reference assets and close dumper/index test gaps
- `8a6c08c59efe3c972bf901cbf36ee8005eebc35e` — harden IPC whitelist, malformed-token, and advisory XML boundaries

## Residual concerns

- The source contains an empty `Similar` field for all 6,359 kanji; no similar characters were invented.
- Four source kanji (`𠮟`, `塡`, `剝`, `頰`) use radical ID 0, but the source defines no radical 0; this is preserved and documented.
- Existing Node module-type warnings and Vite's large-chunk warning remain outside this scoped safety fix.
- Normal runtime and build use generated JSON only. Mono tooling remains regeneration/test-only.
