# Azuki Delta History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NEXUSの全文スナップショット式Undo/Redoを差分操作式へ置き換え、保存地点と外部競合を壊さず14万字原稿の履歴メモリを削減する。

**Architecture:** 文字列置換を表す純粋な`EditAction`と履歴状態機械を新設し、Reactフックはその薄いアダプターにする。保存処理は履歴から分離し、Undo/Redoは本文変更を通知しても保存許可を発行しない。

**Tech Stack:** JavaScript ES modules、React hooks、Node.js assertions

**Spec:** `docs/superpowers/specs/2026-09-12-azuki-delta-history-design.md`

## Global Constraints

- 履歴処理はファイル書込み、自動保存、外部再読込を呼ばない。
- IME変換は`compositionend`で一操作として確定する。
- 検索置換・AI挿入・ルビ挿入は明示的な一操作としてUndoできる。
- 「変更を保持して戻る」は本文と履歴を変更しない。
- 保存成功後にだけ保存済みリビジョンを更新する。
- 既存Editor変更と競合する箇所は、現在の動作をテストで固定してから最小差分で編集する。

---

### Task 1: 純粋な差分操作

**Files:**
- Create: `antigravity/src/utils/editAction.mjs`
- Create: `antigravity/src/utils/editAction.test.mjs`

**Interfaces:**
- Produces: `createEditAction(before, after, beforeSelection, afterSelection, source, timestamp)`、`applyEditAction(text, action, direction)`。

- [ ] **Step 1: 挿入・削除・置換の失敗テストを書く**

```javascript
const action = createEditAction('abc', 'aXbc', {anchor: 1, focus: 1}, {anchor: 2, focus: 2}, 'typing', 1);
assert.deepEqual(action, { start: 1, deletedText: '', insertedText: 'X', beforeSelection: {anchor:1,focus:1}, afterSelection: {anchor:2,focus:2}, source:'typing', timestamp:1 });
assert.equal(applyEditAction('aXbc', action, 'undo').text, 'abc');
assert.equal(applyEditAction('abc', action, 'redo').text, 'aXbc');
```

- [ ] **Step 2: モジュール不在による失敗を確認する**

Run: `cd antigravity && node src/utils/editAction.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 共通接頭辞・接尾辞で最小差分を実装する**

```javascript
export function createEditAction(before, after, beforeSelection, afterSelection, source = 'typing', timestamp = Date.now()) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let beforeEnd = before.length, afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) { beforeEnd--; afterEnd--; }
  return { start, deletedText: before.slice(start, beforeEnd), insertedText: after.slice(start, afterEnd), beforeSelection, afterSelection, source, timestamp };
}
```

- [ ] **Step 4: 差分操作テストを通す**

Run: `cd antigravity && node src/utils/editAction.test.mjs`

Expected: PASS for insertion, deletion, replacement, surrogate pair text and no-op rejection.

- [ ] **Step 5: 差分操作だけをコミットする**

```bash
git add antigravity/src/utils/editAction.mjs antigravity/src/utils/editAction.test.mjs
git commit -m "feat: model editor changes as deltas"
```

### Task 2: 保存地点を持つ履歴状態機械

**Files:**
- Create: `antigravity/src/utils/deltaHistory.mjs`
- Create: `antigravity/src/utils/deltaHistory.test.mjs`

**Interfaces:**
- Consumes: Task 1の`EditAction`。
- Produces: `createDeltaHistory(initialText, options)`と`push`、`undo`、`redo`、`markSaved`、`isDirty`、`memoryBytes`。

- [ ] **Step 1: 保存地点とメモリ上限の失敗テストを書く**

```javascript
const history = createDeltaHistory('abc', { maxBytes: 1024 });
history.push(createEditAction('abc', 'abcd', sel(3), sel(4), 'typing', 1));
assert.equal(history.isDirty(), true);
history.markSaved();
assert.equal(history.isDirty(), false);
history.undo();
assert.equal(history.isDirty(), true);
history.redo();
assert.equal(history.isDirty(), false);
assert.ok(history.memoryBytes() < 1024);
```

- [ ] **Step 2: 履歴モジュール不在による失敗を確認する**

Run: `cd antigravity && node src/utils/deltaHistory.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: リビジョン位置と差分バイト上限を実装する**

```javascript
const state = { actions: [], cursor: 0, savedCursor: 0, bytes: 0 };
const isDirty = () => state.cursor !== state.savedCursor;
const markSaved = () => { state.savedCursor = state.cursor; };
```

新規push時はredo領域を破棄し、保存地点が破棄された場合は`savedCursor = null`として未保存扱いを維持する。上限超過時は最古の操作から削除し、cursorとsavedCursorを同じ件数だけ補正する。

- [ ] **Step 4: 状態機械テストを通す**

Run: `cd antigravity && node src/utils/deltaHistory.test.mjs`

Expected: PASS for branch-after-undo, saved-state eviction, grouped action and byte cap.

- [ ] **Step 5: 状態機械だけをコミットする**

```bash
git add antigravity/src/utils/deltaHistory.mjs antigravity/src/utils/deltaHistory.test.mjs
git commit -m "feat: track delta history save point"
```

### Task 3: 連続入力とIMEの操作グループ

**Files:**
- Modify: `antigravity/src/utils/deltaHistory.mjs`
- Modify: `antigravity/src/utils/deltaHistory.test.mjs`

**Interfaces:**
- Produces: `beginGroup(source)`、`endGroup()`、隣接タイピングの`mergeActions(previous, next)`。

- [ ] **Step 1: 隣接入力だけをまとめる失敗テストを書く**

```javascript
history.push(type('a', 'ab', 1));
history.push(type('ab', 'abc', 2));
assert.equal(history.length, 1);
history.push(type('abc', 'Xabc', 3));
assert.equal(history.length, 2);
history.beginGroup('ime');
history.push(replace('かな', '仮名', 4));
history.endGroup();
assert.equal(history.undo().text, 'かな');
```

- [ ] **Step 2: 未実装のグループ化による失敗を確認する**

Run: `cd antigravity && node src/utils/deltaHistory.test.mjs`

Expected: FAIL because adjacent actions remain separate and `beginGroup` is undefined.

- [ ] **Step 3: 位置・時刻・sourceを確認して結合する**

```javascript
const canMergeTyping = (left, right, windowMs) => left.source === 'typing' && right.source === 'typing'
  && right.timestamp - left.timestamp <= windowMs
  && left.deletedText === '' && right.deletedText === ''
  && right.start === left.start + left.insertedText.length;
```

- [ ] **Step 4: グループ化テストを通す**

Run: `cd antigravity && node src/utils/deltaHistory.test.mjs`

Expected: PASS;離れた位置、削除と挿入、500ms超過は結合されない。

- [ ] **Step 5: グループ化変更だけをコミットする**

```bash
git add antigravity/src/utils/deltaHistory.mjs antigravity/src/utils/deltaHistory.test.mjs
git commit -m "feat: group typing and IME history"
```

### Task 4: Reactフックを差分履歴へ置換する

**Files:**
- Modify: `antigravity/src/hooks/useUndoHistory.js`
- Create: `antigravity/src/hooks/useUndoHistory.test.mjs`
- Modify: `antigravity/src/components/Editor.jsx`

**Interfaces:**
- 既存の`initHistory`、`pushHistory`、`undo`、`redo`、`pendingCursor`、`currentCursor`を維持する。
- Adds: `markSaved`、`isDirty`、`beginGroup`、`endGroup`、`getMemoryBytes`。

- [ ] **Step 1: 既存公開APIと14万字メモリの失敗テストを書く**

```javascript
const text = 'あ'.repeat(140000);
const history = createHarness(text);
for (let i = 0; i < 100; i++) history.pushHistory(text + 'x'.repeat(i), text + 'x'.repeat(i + 1), text.length + i);
assert.ok(history.getMemoryBytes() < 100000);
assert.equal(history.undo().text.length, 140099);
```

- [ ] **Step 2: 現行全文履歴で失敗することを確認する**

Run: `cd antigravity && node src/hooks/useUndoHistory.test.mjs`

Expected: FAIL because `getMemoryBytes` does not exist or retained history exceeds the limit.

- [ ] **Step 3: フック内部だけを差分状態機械へ差し替える**

`pushHistory(oldValue, newValue, cursorPos, nextCursorPos, source)`で差分を作り、undo/redo時だけ純粋状態機械から返された本文と選択位置を`onChangeRef`へ渡す。DOM操作と保存処理は追加しない。

- [ ] **Step 4: IME境界をEditorへ接続する**

`compositionstart`で`beginGroup('ime')`、`compositionend`で`endGroup()`を呼ぶ。検索置換・ルビ・AI挿入は`source`を明示し、一操作としてpushする。

- [ ] **Step 5: フックと既存編集テストを通す**

Run: `cd antigravity && node src/hooks/useUndoHistory.test.mjs && node src/utils/replacementTransaction.test.mjs && npm run build`

Expected: all commands exit 0; Editor compiles with the preserved public API.

- [ ] **Step 6: フック接続だけをコミットする**

```bash
git add antigravity/src/hooks/useUndoHistory.js antigravity/src/hooks/useUndoHistory.test.mjs antigravity/src/components/Editor.jsx
git commit -m "feat: use delta-based editor history"
```

### Task 5: 保存安全境界と保存地点を接続する

**Files:**
- Modify: `antigravity/src/utils/saveSafety.mjs`
- Modify: `antigravity/src/utils/saveSafety.test.mjs`
- Modify: `antigravity/src/hooks/useAutoSave.js`
- Modify: `antigravity/src/components/Editor.jsx`

**Interfaces:**
- Produces: `assessHistorySaveEligibility({source, conflictActive, reviewGate})`。
- 保存成功通知時だけ`markSaved()`を呼ぶ。

- [ ] **Step 1: Undoと競合時の保存禁止テストを書く**

```javascript
assert.deepEqual(assessHistorySaveEligibility({ source: 'undo', conflictActive: false, reviewGate: false }), { allowed: false, reason: 'history-navigation' });
assert.deepEqual(assessHistorySaveEligibility({ source: 'typing', conflictActive: true, reviewGate: false }), { allowed: false, reason: 'external-conflict' });
assert.equal(assessHistorySaveEligibility({ source: 'typing', conflictActive: false, reviewGate: false }).allowed, true);
```

- [ ] **Step 2: 現行保存判定で失敗することを確認する**

Run: `cd antigravity && node src/utils/saveSafety.test.mjs`

Expected: FAIL because `assessHistorySaveEligibility` is not exported.

- [ ] **Step 3: 履歴移動と保存許可を分離する**

```javascript
export function assessHistorySaveEligibility({ source, conflictActive, reviewGate }) {
  if (['undo', 'redo', 'external-reload', 'snapshot-restore'].includes(source)) return { allowed: false, reason: 'history-navigation' };
  if (conflictActive) return { allowed: false, reason: 'external-conflict' };
  if (reviewGate) return { allowed: false, reason: 'review-required' };
  return { allowed: true, reason: null };
}
```

- [ ] **Step 4: 保存成功時だけ保存地点を更新する**

`useAutoSave`の書込み成功結果が`ok === true`かつreadback検証済みの場合にだけ、Editorへ保存成功リビジョンを通知する。失敗・競合・キャンセルでは`markSaved()`を呼ばない。

- [ ] **Step 5: 保存安全テストを通す**

Run: `cd antigravity && node src/utils/saveSafety.test.mjs && node src/utils/autoSaveSafety.test.mjs && node src/utils/replacementTransaction.test.mjs`

Expected: all commands exit 0; undo/redo alone does not authorize a write.

- [ ] **Step 6: 保存境界だけをコミットする**

```bash
git add antigravity/src/utils/saveSafety.mjs antigravity/src/utils/saveSafety.test.mjs antigravity/src/hooks/useAutoSave.js antigravity/src/components/Editor.jsx
git commit -m "fix: separate history navigation from saving"
```

### Task 6: 編集に追随する検索・校正マーカー

**Files:**
- Create: `antigravity/src/utils/rangeMarkers.mjs`
- Create: `antigravity/src/utils/rangeMarkers.test.mjs`
- Modify: `antigravity/src/components/Editor.jsx`

**Interfaces:**
- Produces: `transformMarkers(markers, action) -> {markers, invalidatedIds}`。

- [ ] **Step 1: 前方・後方・重複範囲の失敗テストを書く**

```javascript
const result = transformMarkers([{id:'a',start:0,end:2},{id:'b',start:5,end:7},{id:'c',start:2,end:5}], actionAt(3, '', 'XX'));
assert.deepEqual(result.markers.find(x => x.id === 'a'), {id:'a',start:0,end:2});
assert.deepEqual(result.markers.find(x => x.id === 'b'), {id:'b',start:7,end:9});
assert.deepEqual(result.invalidatedIds, ['c']);
```

- [ ] **Step 2: マーカーモジュール不在による失敗を確認する**

Run: `cd antigravity && node src/utils/rangeMarkers.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 三つの位置変換規則を実装する**

```javascript
if (marker.end <= action.start) keep(marker);
else if (marker.start >= action.start + action.deletedText.length) shift(marker, action.insertedText.length - action.deletedText.length);
else invalidate(marker.id);
```

- [ ] **Step 4: Editorの検索・校正表示へ接続する**

ローカル編集時に保持中マーカーだけを変換し、重複範囲は描画対象から外して再校正フラグを立てる。本文や保存状態は変更しない。

- [ ] **Step 5: マーカーと全回帰テストを通す**

Run: `cd antigravity && node src/utils/rangeMarkers.test.mjs && node src/hooks/useUndoHistory.test.mjs && node src/utils/saveSafety.test.mjs && node src/utils/autoSaveSafety.test.mjs && npm run build`

Expected: all commands exit 0; marker changes do not call file APIs.

- [ ] **Step 6: マーカー接続だけをコミットする**

```bash
git add antigravity/src/utils/rangeMarkers.mjs antigravity/src/utils/rangeMarkers.test.mjs antigravity/src/components/Editor.jsx
git commit -m "feat: keep editor markers aligned with edits"
```

