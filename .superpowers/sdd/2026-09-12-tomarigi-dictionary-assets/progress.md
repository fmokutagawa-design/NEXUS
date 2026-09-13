# SDD ledger — plan: docs/superpowers/plans/2026-09-12-tomarigi-dictionary-assets.md

Spec: docs/superpowers/specs/2026-09-12-tomarigi-dictionary-assets-design.md
Branch start: f1c9c1c
Imported baseline: 4433ce9 (existing XML sync, generated prh.yml, inventory, workspace ignore)

## Preflight interface scan

| Tasks | Producer / consumer interface | Finding |
| --- | --- | --- |
| 1 / 1 | Test invokes the C# dumper; implementation emits deterministic UTF-8 TSV | Consistent; test must compile against tracked Tomarigi/saezuri.dll and fail first while source is absent. |
| 1 / 2 | Task 1 emits KANJI/HOMONYM TSV; Task 2 consumes that TSV | Consistent; Task 2 must invoke or parse the exact Task 1 format without embedding runtime DLL dependencies in normal NEXUS execution. |
| 2 / 2 | Generator emits four JSON files plus manifest; its test fixes counts, hashes, and byte determinism | Consistent; --check must be read-only and generatedAt is forbidden. |
| 2 / 3 | Generated kanji/homonym/usage-exception JSON feeds the CommonJS index | Consistent; generated schemas must match Task 3 fields (reading, items, text, enabled, usageExceptions). |
| 3 / 3 | Index API tests candidate exclusion, kanji classification, and usage exceptions | Consistent; index is read-only and loads generated JSON once. |
| 3 / 4 | Task 4 consumes createTomarigiReferenceIndex through advisory rules | Consistent; all findings must omit fix and suggested fields. |
| 4 / 4 | Advisory rule output integrates with nexus-integrated-rules and proofreadingHub | Consistent; whitelist/profile controls must continue through existing textlintMain.cjs behavior. |
| 4 / 5 | Task 5 reruns Task 4 integration plus every earlier focused test and build | Consistent; final task is verification-only and must not add production behavior. |
| 5 / 5 | Final verification checks tests, build, whitespace, and scope | Consistent; unrelated source-worktree changes are absent from this isolated branch. |

Task 1: minor (deferred): Add explicit assertions for ordinal sort order and byte-identical repeated output.
Task 1: minor (deferred): Decode dumper subprocess output with explicit UTF-8 in the Python test.
Task 1: fix round 1/5 (1 addressed, 0 open — ordinal sort fixed; commits 29493bb..019b20c)
Task 1: minor (deferred): Python code-point ordering is not universally identical to .NET UTF-16 ordinal ordering, though current DLL data is unaffected.
Task 1: complete (commits 4433ce9..019b20c, review clean)
Task 2: fix round 1/5 (1 addressed, 0 open — UTF-8 byte writes fix cross-platform newlines; commits 662560f..e4375e4)
Task 2: complete (commits 019b20c..e4375e4, review clean)
Task 3: Ruling: the brief's example classifying 鬱 as non-common conflicts with the source-generated record and the spec's source-of-truth requirement — preserve 鬱 as common and test a real non-common character (丐) instead — if wrong, the common-kanji reference semantics would need a separately versioned historical profile.
Task 3: minor (deferred): The read-only boundary test does not explicitly assert absence of suggested or generic write-like methods.
Task 3: complete (commits e4375e4..bcd74df, review clean)
Task 4: Ruling: add antigravity/electron/textlintMain.cjs to Task 4 ownership because the spec requires existing whitelist and disabled-rule behavior at that boundary — use profile.enabled_rules for positive opt-in and keep tomarigi/kanji-level disabled unless explicitly enabled — carry fine-grained advisory rule IDs through a deterministic message marker, normalize before filtering, preserve outer nexus-integrated-rules disable compatibility, and omit undefined fix fields — if wrong, project profile compatibility or advisory identity would need rework.
Task 4: Ruling: advisory findings must not inherit a corrective suggestion when proofreading results overlap; keep advisory and corrective findings separate and omit suggested XML for advisory findings — if wrong, the UI could present a contextual candidate as an automatic correction.
Task 4: fix round 1/5 (1 addressed, 0 open — supplementary Unicode offsets converted to UTF-16; commits 4f3bcf5..1555236)
Task 4: complete (commits bcd74df..1555236, review clean)
Task 5: complete (commits 1555236..1555236, review clean; verification-only)
Final review: Important open — quarantine meaning-changing PRH mapping 漸く→しばらく and add regression coverage.
Final review: Important open — whole-word project whitelist must suppress contained kanji advisories through IPC.
Final review: Important open — sync_tomarigi_dictionary.py --check must fail on generated-output drift.
Final review: Important open — include specified kanji detail fields, punctuation/width/sentence-style settings, resource names, and source versions.
Final review: minor open — strictly validate malformed token objects and word_position.
Final review: minor open — preserve rule IDs and source metadata in advisory XML.
Final fix: complete — dangerous PRH mapping quarantined; dictionary drift check enforced; full source-backed reference assets generated; IPC whole-word whitelist, malformed-token handling, and advisory provenance completed (commits 2e82a98, 40cebfc, 8a6c08c).
Final fix deferred-minor triage: complete — repeated dumper byte equality, explicit UTF-8 decoding, .NET UTF-16 ordinal parity, and explicit read-only API surface assertions are covered.
Final verification: all six declared npm test scripts, focused Node/Python tests, normal Vite build, sync checks, and git diff checks pass. `npm test` itself remains unavailable because package.json has no `test` script.
