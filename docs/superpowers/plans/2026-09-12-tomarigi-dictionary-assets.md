# Tomarigi Dictionary Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tomarigi/saezuriの再利用可能な日本語辞書を決定的なUTF-8生成物へ変換し、NEXUSの校正で通知専用データとして利用する。

**Architecture:** Monoでのみ読める埋め込みリソースは小さなC#ダンパーがTSVへ出力し、Python同期スクリプトがXML辞書と統合してJSONを生成する。通常のNEXUS実行は生成済みJSONだけを読み、DLL、Mono、自動保存には依存しない。

**Tech Stack:** Python 3、C#/Mono、Node.js CommonJS、textlint、JSON/YAML

**Spec:** `docs/superpowers/specs/2026-09-12-tomarigi-dictionary-assets-design.md`

## Global Constraints

- 意味判断を伴う規則は通知専用とし、自動置換文字列を返さない。
- 同一入力から同一生成物を作り、生成時刻を埋め込まない。
- 通常ビルドと実行はMonoおよびTomarigi DLLを必要としない。
- 作品別ホワイトリストと無効規則を既存の`textlintMain.cjs`で適用する。
- 既存の未コミット変更を巻き戻さず、各コミットは列挙したファイルだけを追加する。

---

### Task 1: 埋め込み辞書を読み出す決定的ダンパー

**Files:**
- Create: `antigravity/scripts/tomarigi_resource_dump.cs`
- Create: `antigravity/scripts/tomarigi_resource_dump.test.py`

**Interfaces:**
- Consumes: `Tomarigi/saezuri.dll`の`CkanjiSet.Load()`と`CHomonymSet.Load()`。
- Produces: 標準出力へ`KANJI`、`HOMONYM`から始まるUTF-8 TSV行を、読み・表記順で安定ソートして出力するCLI。

- [ ] **Step 1: 失敗する抽出テストを書く**

```python
def test_dump_contains_known_records():
    rows = run_dump()
    assert "KANJI\t亜\t" in rows
    assert "HOMONYM\tアイショウ\t愛称\t" in rows
    assert "HOMONYM\tアイショウ\t相性\t" in rows
```

- [ ] **Step 2: 未実装による失敗を確認する**

Run: `cd antigravity && python3 scripts/tomarigi_resource_dump.test.py`

Expected: FAIL because `tomarigi_resource_dump.cs` does not exist.

- [ ] **Step 3: C#ダンパーを実装する**

```csharp
static string Safe(string value) => (value ?? "").Replace("\\", "\\\\").Replace("\t", "\\t").Replace("\r", "\\r").Replace("\n", "\\n");

foreach (var item in saezuri.NLP.CkanjiSet.Load().KanjiList.OrderBy(x => x.Text))
    Console.WriteLine($"KANJI\t{Safe(item.Text)}\t{item.IsCommon}\t{item.LearnLv}\t{item.JISLv}\t{item.Stroke}");

foreach (var group in saezuri.NLP.CHomonymSet.Load().HomonymList.OrderBy(x => x.Read))
    foreach (var item in group.Items.OrderBy(x => x.Text))
        Console.WriteLine($"HOMONYM\t{Safe(group.Read)}\t{Safe(item.Text)}\t{Safe(item.Mean)}\t{item.Enabled}");
```

- [ ] **Step 4: 抽出テストを通す**

Run: `cd antigravity && python3 scripts/tomarigi_resource_dump.test.py`

Expected: PASS and report 6,359 kanji records and 3,760 homonym items.

- [ ] **Step 5: 対象ファイルだけをコミットする**

```bash
git add antigravity/scripts/tomarigi_resource_dump.cs antigravity/scripts/tomarigi_resource_dump.test.py
git commit -m "feat: extract Tomarigi embedded dictionaries"
```

### Task 2: XML・埋め込み資産の同期生成物

**Files:**
- Create: `antigravity/scripts/sync_tomarigi_reference_data.py`
- Create: `antigravity/scripts/sync_tomarigi_reference_data.test.py`
- Create: `antigravity/textlint/data/tomarigi/reference-manifest.json`
- Create: `antigravity/textlint/data/tomarigi/kanji.json`
- Create: `antigravity/textlint/data/tomarigi/homonyms.json`
- Create: `antigravity/textlint/data/tomarigi/usage-exceptions.json`

**Interfaces:**
- Consumes: Task 1のTSV、`t_inappropriateposdata.resources`、`t_chinesenumeraldata.resources`、`t_homonym.homonym.resources`。
- Produces: `build_reference_data(source_root: Path) -> dict[str, object]`と、`--check`対応CLI。

- [ ] **Step 1: 件数・決定性テストを書く**

```python
assert len(data["kanji"]) == 6359
assert sum(1 for row in data["kanji"] if row["isCommon"]) == 2136
assert len(data["homonymGroups"]) == 1550
assert sum(len(row["items"]) for row in data["homonymGroups"]) == 3760
assert len(data["sameKun"]) == 181
assert len(data["chineseNumeralExceptions"]) == 328
assert len(data["inappropriatePosExceptions"]["的"]) == 490
assert len(data["inappropriatePosExceptions"]["超"]) == 129
assert encode(data) == encode(build_reference_data(source_root))
```

- [ ] **Step 2: 同期スクリプト不在による失敗を確認する**

Run: `cd antigravity && python3 scripts/sync_tomarigi_reference_data.test.py`

Expected: FAIL because `sync_tomarigi_reference_data.py` cannot be imported.

- [ ] **Step 3: 安定ソートとSHA-256マニフェストを実装する**

```python
def stable_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

manifest = {
    "schemaVersion": 1,
    "sources": [{"path": relpath(path), "sha256": digest(path)} for path in sorted(source_paths)],
    "counts": counts,
}
```

`--check`ではファイルを書かず、期待するUTF-8文字列と既存生成物を比較して相違時に終了コード1を返す。

- [ ] **Step 4: 生成して同期テストを通す**

Run: `cd antigravity && python3 scripts/sync_tomarigi_reference_data.py && python3 scripts/sync_tomarigi_reference_data.test.py && python3 scripts/sync_tomarigi_reference_data.py --check`

Expected: three commands exit 0 with the fixed counts above.

- [ ] **Step 5: 生成物と同期処理だけをコミットする**

```bash
git add antigravity/scripts/sync_tomarigi_reference_data.py antigravity/scripts/sync_tomarigi_reference_data.test.py antigravity/textlint/data/tomarigi
git commit -m "feat: generate Tomarigi reference dictionaries"
```

### Task 3: 通知専用の辞書検索API

**Files:**
- Create: `antigravity/textlint/rules/tomarigi-reference-data.cjs`
- Create: `antigravity/textlint/rules/tomarigi-reference-data.test.cjs`

**Interfaces:**
- Consumes: Task 2のJSON生成物。
- Produces: `createTomarigiReferenceIndex()`、`findHomonymCandidates(token)`、`classifyKanji(char)`、`isUsageException(kind, word)`。

- [ ] **Step 1: 候補検索と除外の失敗テストを書く**

```javascript
const index = createTomarigiReferenceIndex();
assert.deepEqual(index.findHomonymCandidates({ surface: '愛称', reading: 'アイショウ' }).map(x => x.text), ['相性']);
assert.equal(index.classifyKanji('鬱').isCommon, false);
assert.equal(index.isUsageException('的', '圧倒的'), true);
```

- [ ] **Step 2: API不在による失敗を確認する**

Run: `cd antigravity && node textlint/rules/tomarigi-reference-data.test.cjs`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: JSONを一度だけ読み込む索引を実装する**

```javascript
function createTomarigiReferenceIndex(data = loadGeneratedData()) {
  const homonyms = new Map(data.homonymGroups.map(group => [group.reading, group.items]));
  const kanji = new Map(data.kanji.map(item => [item.text, item]));
  return {
    findHomonymCandidates(token) {
      return (homonyms.get(token.reading) || []).filter(item => item.text !== token.surface && item.enabled);
    },
    classifyKanji(char) { return kanji.get(char) || null; },
    isUsageException(kind, word) { return data.usageExceptions[kind]?.includes(word) || false; },
  };
}
```

- [ ] **Step 4: APIテストを通す**

Run: `cd antigravity && node textlint/rules/tomarigi-reference-data.test.cjs`

Expected: PASS.

- [ ] **Step 5: APIだけをコミットする**

```bash
git add antigravity/textlint/rules/tomarigi-reference-data.cjs antigravity/textlint/rules/tomarigi-reference-data.test.cjs
git commit -m "feat: index Tomarigi reference dictionaries"
```

### Task 4: NEXUS校正へ安全に接続する

**Files:**
- Create: `antigravity/textlint/rules/tomarigi-reference-rules.cjs`
- Create: `antigravity/textlint/rules/tomarigi-reference-rules.test.cjs`
- Modify: `antigravity/textlint/rules/nexus-integrated-rules.js`
- Modify: `antigravity/src/utils/proofreadingHub.mjs`
- Modify: `antigravity/src/utils/proofreadingHub.test.mjs`
- Modify: `docs/proofreading_profile.md`

**Interfaces:**
- Consumes: `runTomarigiReferenceRules(text, tokens, options) -> Finding[]`。
- Produces: `Finding = {start,end,target,ruleId,message,candidates}`。`suggested`またはtextlint `fix`は返さない。

- [ ] **Step 1: 自動修正禁止とホワイトリストの失敗テストを書く**

```javascript
const findings = runTomarigiReferenceRules('彼との相性を確認した。', tokens, { whitelist: [] });
assert.ok(findings.some(x => x.ruleId === 'tomarigi/homonym-reference'));
assert.ok(findings.every(x => !('fix' in x) && !('suggested' in x)));
assert.deepEqual(runTomarigiReferenceRules('愛称', tokens, { whitelist: ['愛称'] }), []);
```

- [ ] **Step 2: 規則不在による失敗を確認する**

Run: `cd antigravity && node textlint/rules/tomarigi-reference-rules.test.cjs`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: 保守的な通知規則を実装する**

同音異義語は読みが一致し候補が存在する語だけを参考通知する。常用漢字はプロファイルで`tomarigi/kanji-level`を有効にした場合だけ通知する。漢数字は除外熟語に含まれず、数字トークンとして解析された場合だけ通知する。

```javascript
for (const finding of runTomarigiReferenceRules(text, tokens, options)) {
  report(node, new RuleError(`【トマリギ】【対象:${finding.target}】${finding.message}`, {
    index: finding.start,
  }));
}
```

- [ ] **Step 4: 校正・統合テストを通す**

Run: `cd antigravity && node textlint/rules/tomarigi-reference-rules.test.cjs && npm run test:proofreading && python3 scripts/sync_tomarigi_reference_data.py --check`

Expected: all commands exit 0; findings have no automatic fix.

- [ ] **Step 5: 校正接続だけをコミットする**

```bash
git add antigravity/textlint/rules/tomarigi-reference-rules.cjs antigravity/textlint/rules/tomarigi-reference-rules.test.cjs antigravity/textlint/rules/nexus-integrated-rules.js antigravity/src/utils/proofreadingHub.mjs antigravity/src/utils/proofreadingHub.test.mjs docs/proofreading_profile.md
git commit -m "feat: add advisory Tomarigi dictionary checks"
```

### Task 5: 辞書資産の最終検証

- [ ] **Step 1: 全同期・テスト・ビルドを実行する**

Run: `cd antigravity && python3 scripts/sync_tomarigi_dictionary.test.py && python3 scripts/sync_tomarigi_reference_data.test.py && node textlint/rules/tomarigi-reference-data.test.cjs && node textlint/rules/tomarigi-reference-rules.test.cjs && npm run test:proofreading && npm run build`

Expected: all commands exit 0; Vite may report only the existing chunk-size warning.

- [ ] **Step 2: 差分の空白エラーと対象範囲を確認する**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; unrelated pre-existing changes remain untouched.

