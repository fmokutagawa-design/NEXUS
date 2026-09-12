# Native Japanese Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MeCab 0.996・CRF++ 0.58・CaboCha 0.69を再現可能に構築し、原稿を書き換えない高度校正用の係り受け解析としてNEXUSへ接続する。

**Architecture:** ローカルアーカイブを検証してアプリデータ領域へ構築するスクリプトと、標準入力・標準出力だけで解析するElectron子プロセス層を分ける。結果には本文SHA-256を付け、現在本文と一致する場合だけ校正表示へ統合する。

**Tech Stack:** POSIX shell、Node.js CommonJS、Electron IPC、MeCab 0.996、CRF++ 0.58、CaboCha 0.69

**Spec:** `docs/superpowers/specs/2026-09-12-native-japanese-analysis-design.md`

## Global Constraints

- ビルドはユーザーの明示操作時だけ実行し、起動・入力・保存時には実行しない。
- 解析プロセスは原稿ファイルを開かず、本文を標準入力で受け取る。
- 解析結果は通知専用で本文変更APIを持たない。
- 未導入・破損・タイムアウト時も編集と通常校正を継続できる。
- macOS x86_64で確認し、未確認のarm64では診断結果を明示する。

---

### Task 1: 依存アーカイブのロックと検証

**Files:**
- Create: `antigravity/native/tomarigi-native-lock.json`
- Create: `antigravity/scripts/verify_tomarigi_native_sources.mjs`
- Create: `antigravity/scripts/verify_tomarigi_native_sources.test.mjs`

**Interfaces:**
- Produces: `verifyArchives(directory) -> {ok, files, errors}`。

- [ ] **Step 1: 正常・欠落・改変アーカイブの失敗テストを書く**

```javascript
assert.equal(verifyArchives(validFixture).ok, true);
assert.match(verifyArchives(missingFixture).errors[0], /mecab-0.996\.tar\.gz/);
assert.match(verifyArchives(modifiedFixture).errors[0], /SHA-256/);
```

- [ ] **Step 2: 検証関数不在による失敗を確認する**

Run: `cd antigravity && node scripts/verify_tomarigi_native_sources.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: ロックファイルと検証を実装する**

```json
{
  "schemaVersion": 1,
  "archives": {
    "mecab-0.996.tar.gz": "e073325783135b72e666145c781bb48fada583d5224fb2490fb6c1403ba69c59",
    "mecab-ipadic-2.7.0-20070610.tar.gz": "77a678efddb6f932b4c87fdd299458c3122591044102517e526587a0582ff9d3",
    "CRF++-0.58.tar.gz": "9d1c0a994f25a5025cede5e1d3a687ec98cd4949bfb2aae13f2a873a13259cb2",
    "cabocha-0.69.tar.bz2": "9db896d7f9d83fc3ae34908b788ae514ae19531eb89052e25f061232f6165992"
  }
}
```

- [ ] **Step 4: テストと実アーカイブ検証を通す**

Run: `cd antigravity && node scripts/verify_tomarigi_native_sources.test.mjs && node scripts/verify_tomarigi_native_sources.mjs /Users/mokutagawa/Downloads`

Expected: both commands exit 0 and list all four archives as verified.

- [ ] **Step 5: ロックと検証だけをコミットする**

```bash
git add antigravity/native/tomarigi-native-lock.json antigravity/scripts/verify_tomarigi_native_sources.mjs antigravity/scripts/verify_tomarigi_native_sources.test.mjs
git commit -m "build: lock Tomarigi native sources"
```

### Task 2: 再現ビルドと診断

**Files:**
- Create: `antigravity/scripts/build_tomarigi_native.sh`
- Create: `antigravity/scripts/diagnose_tomarigi_native.sh`
- Create: `antigravity/scripts/tomarigi_native_build.test.mjs`
- Modify: `antigravity/package.json`

**Interfaces:**
- Consumes: `build_tomarigi_native.sh SOURCE_DIR INSTALL_DIR`。
- Produces: `INSTALL_DIR/bin/mecab`、`crf_test`、`cabocha`とUTF-8 IPA辞書。

- [ ] **Step 1: 不正入力と診断契約の失敗テストを書く**

```javascript
assert.notEqual(runBuild('/missing', installDir).status, 0);
assert.match(runDiagnostic(validInstall).stdout, /mecab 0\.996/);
assert.match(runDiagnostic(validInstall).stdout, /cabocha 0\.69/);
assert.match(runDiagnostic(validInstall).stdout, /charset: UTF-8/);
```

- [ ] **Step 2: スクリプト不在による失敗を確認する**

Run: `cd antigravity && node scripts/tomarigi_native_build.test.mjs`

Expected: FAIL because build and diagnostic scripts do not exist.

- [ ] **Step 3: `set -eu`で再現ビルドを実装する**

スクリプトは`mktemp -d`で作業し、四アーカイブを展開して、MeCab、UTF-8 IPA辞書、CRF++、CaboChaの順に構築する。インストール先は引数で受け、`/`、空文字、ホームディレクトリそのものを拒否する。Electronが渡す`app.getPath('userData')/native/tomarigi`は許可する。

```sh
test -n "$SOURCE_DIR"
test -n "$INSTALL_DIR"
case "$INSTALL_DIR" in /|"$HOME") exit 64;; esac
"$INSTALL_DIR/bin/mecab" --version
"$INSTALL_DIR/bin/cabocha" --version
```

- [ ] **Step 4: 実アーカイブから構築・診断する**

Run: `cd antigravity && npm run native:build-tomarigi -- /Users/mokutagawa/Downloads "$TMPDIR/nexus-tomarigi-native-test" && npm run native:diagnose-tomarigi -- "$TMPDIR/nexus-tomarigi-native-test"`

Expected: exit 0, MeCab 0.996, CRF++ 0.58, CaboCha 0.69 and a Japanese dependency parse.

- [ ] **Step 5: ビルド系だけをコミットする**

```bash
git add antigravity/scripts/build_tomarigi_native.sh antigravity/scripts/diagnose_tomarigi_native.sh antigravity/scripts/tomarigi_native_build.test.mjs antigravity/package.json
git commit -m "build: reproduce native Japanese analyzer"
```

### Task 3: 解析出力の純粋パーサー

**Files:**
- Create: `antigravity/electron/nativeJapaneseParser.cjs`
- Create: `antigravity/electron/nativeJapaneseParser.test.cjs`

**Interfaces:**
- Produces: `parseMecab(text, output)`、`parseCabocha(text, output)`、`analyzeStructure(text, morphemes, chunks)`。

- [ ] **Step 1: UTF-16位置と係り受け距離の失敗テストを書く**

```javascript
const parsed = parseCabocha('彼は走った。', fixture);
assert.deepEqual(parsed.chunks.map(x => [x.start, x.end, x.link]), [[0, 2, 1], [2, 6, -1]]);
assert.equal(analyzeStructure('彼は走った。', [], parsed.chunks).maxDependencyDistance, 1);
```

- [ ] **Step 2: パーサー不在による失敗を確認する**

Run: `cd antigravity && node electron/nativeJapaneseParser.test.cjs`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: 出力パーサーと通知規則を実装する**

```javascript
function analyzeStructure(text, morphemes, chunks, thresholds = {}) {
  const dependencyLimit = Number(thresholds.dependencyDistance || 4);
  return {
    maxDependencyDistance: Math.max(0, ...chunks.filter(x => x.link >= 0).map(x => x.link - x.index)),
    findings: chunks.filter(x => x.link - x.index > dependencyLimit).map(x => ({
      start: x.start, end: x.end, ruleId: 'tomarigi-native/long-dependency', severity: 1,
    })),
  };
}
```

- [ ] **Step 4: パーサーテストを通す**

Run: `cd antigravity && node electron/nativeJapaneseParser.test.cjs`

Expected: PASS for Japanese, surrogate pairs, malformed output and EOS handling.

- [ ] **Step 5: パーサーだけをコミットする**

```bash
git add antigravity/electron/nativeJapaneseParser.cjs antigravity/electron/nativeJapaneseParser.test.cjs
git commit -m "feat: parse native Japanese analysis"
```

### Task 4: 安全な子プロセス実行層

**Files:**
- Create: `antigravity/electron/nativeJapaneseRunner.cjs`
- Create: `antigravity/electron/nativeJapaneseRunner.test.cjs`

**Interfaces:**
- Produces: `createNativeJapaneseRunner({binDir, dicDir, timeoutMs})`、`runner.analyze({text, requestId}) -> Promise<AnalysisResult>`。

- [ ] **Step 1: ハッシュ、タイムアウト、未導入の失敗テストを書く**

```javascript
const result = await runner.analyze({ text: '彼は走った。', requestId: 'r1' });
assert.equal(result.textHash, sha256('彼は走った。'));
await assert.rejects(missingRunner.analyze({ text: 'x', requestId: 'r2' }), /not-installed/);
await assert.rejects(slowRunner.analyze({ text: 'x', requestId: 'r3' }), /timeout/);
```

- [ ] **Step 2: ランナー不在による失敗を確認する**

Run: `cd antigravity && node electron/nativeJapaneseRunner.test.cjs`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: `spawn`の引数配列と標準入力で実装する**

```javascript
const child = spawn(cabochaPath, ['-f1', '-d', dicDir], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stdin.end(text, 'utf8');
const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
```

本文、ファイル名、辞書パスをシェル文字列へ連結せず、`shell: false`を維持する。

- [ ] **Step 4: ランナーテストを通す**

Run: `cd antigravity && node electron/nativeJapaneseRunner.test.cjs`

Expected: PASS with stub executables; no source-file write occurs.

- [ ] **Step 5: ランナーだけをコミットする**

```bash
git add antigravity/electron/nativeJapaneseRunner.cjs antigravity/electron/nativeJapaneseRunner.test.cjs
git commit -m "feat: run native analyzer safely"
```

### Task 5: Electron IPCと校正UIへの接続

**Files:**
- Create: `antigravity/electron/nativeJapaneseMain.cjs`
- Create: `antigravity/electron/nativeJapaneseMain.test.cjs`
- Modify: `antigravity/electron/main.cjs`
- Modify: `antigravity/electron/preload.cjs`
- Modify: `antigravity/src/components/AuditReportWindow.jsx`
- Modify: `antigravity/src/utils/proofreadingHub.mjs`
- Modify: `antigravity/src/utils/proofreadingHub.test.mjs`
- Modify: `docs/proofreading_profile.md`

**Interfaces:**
- Produces: `window.api.textlint.proofreadAdvanced(text, profile)`。
- Result: `{status:'ok'|'not-installed'|'timeout'|'stale', textHash, findings}`。

- [ ] **Step 1: 古い結果を破棄する失敗テストを書く**

```javascript
assert.equal(acceptNativeResult({ text: 'new', result: { textHash: sha256('old') } }).status, 'stale');
assert.deepEqual(acceptNativeResult({ text: 'new', result: { textHash: sha256('new'), findings: [] } }).findings, []);
```

- [ ] **Step 2: IPC統合不在による失敗を確認する**

Run: `cd antigravity && node electron/nativeJapaneseMain.test.cjs && npm run test:proofreading`

Expected: native IPC test fails because the module does not exist.

- [ ] **Step 3: 明示ボタンからだけ高度解析を実行する**

`AuditReportWindow`に「高度な日本語解析」ボタンと未導入表示を追加する。ウィンドウを開いただけでは実行せず、クリック時の本文を保持し、完了時に現在本文のSHA-256と照合する。

```javascript
proofreadAdvanced: (text, profile = {}) => ipcRenderer.invoke('native-japanese:analyze', text, profile)
```

- [ ] **Step 4: IPC、校正、ビルドを通す**

Run: `cd antigravity && node electron/nativeJapaneseMain.test.cjs && npm run test:proofreading && npm run build`

Expected: all commands exit 0;未導入時の通常校正も成功する。

- [ ] **Step 5: 統合部分だけをコミットする**

```bash
git add antigravity/electron/nativeJapaneseMain.cjs antigravity/electron/nativeJapaneseMain.test.cjs antigravity/electron/main.cjs antigravity/electron/preload.cjs antigravity/src/components/AuditReportWindow.jsx antigravity/src/utils/proofreadingHub.mjs antigravity/src/utils/proofreadingHub.test.mjs docs/proofreading_profile.md
git commit -m "feat: expose advanced Japanese analysis"
```
