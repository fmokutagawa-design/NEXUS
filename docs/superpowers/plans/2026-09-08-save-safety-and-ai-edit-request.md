# Save Safety and AI Edit Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent restored or stale text from reaching manuscript files without explicit review, and generate verifiable AI editing request manifests for one file, selected files, or a folder's direct files.

**Architecture:** Tie every writable editor baseline to its exact file target, and add a save gate for restored content. Snapshot restoration becomes a review state whose candidate text cannot auto-save. AI request manifests are generated from freshly read disk bytes and include SHA-256 fingerprints plus mandatory mismatch-stop instructions.

**Tech Stack:** React 19, Electron IPC, Node.js `crypto`, existing filesystem adapters, Node assertion tests, Vite.

**Spec:** `docs/superpowers/specs/2026-09-08-ai-edit-request-manifest-design.md`

## Global Constraints

- Never overwrite a file when the editor baseline belongs to another target.
- Restored snapshot text must not auto-save or manually save before explicit review.
- Folder scope includes direct supported text files only and never recurses.
- A manifest generation failure is all-or-nothing; never copy a partial manifest.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Save eligibility rules

**Files:**
- Create: `antigravity/src/utils/saveSafety.mjs`
- Create: `antigravity/src/utils/saveSafety.test.mjs`

**Interfaces:**
- Produces: `assessSaveEligibility({ activeFileHandle, baselineFileHandle, reviewGate }) -> { allowed, reason }`

- [ ] Write tests proving a mismatched baseline target and an active restore-review gate block saving, while a matching baseline allows saving.
- [ ] Run `node src/utils/saveSafety.test.mjs` and verify RED because the module is absent.
- [ ] Implement the pure eligibility function using `sameFileTarget`.
- [ ] Run the test and verify GREEN.

### Task 2: Snapshot restore review gate

**Files:**
- Create: `antigravity/src/utils/restoreReview.mjs`
- Create: `antigravity/src/utils/restoreReview.test.mjs`
- Create: `antigravity/src/components/RestoreReviewModal.jsx`
- Modify: `antigravity/src/components/SnapshotPanel.jsx`
- Modify: `antigravity/src/App.jsx`
- Modify: `antigravity/src/hooks/useAutoSave.js`
- Modify: `antigravity/src/hooks/useFileOperations.js`

**Interfaces:**
- Produces: `createRestoreReview({ fileHandle, fileName, diskText, restoredText, snapshotTimestamp })`.
- Consumes: Task 1 save eligibility.

- [ ] Write tests proving restore review retains disk and candidate text separately and rejects missing/mismatched targets.
- [ ] Run the test and verify RED.
- [ ] Implement restore-review data construction.
- [ ] Wire snapshot restoration to read the current disk text, establish the gate, then load candidate text.
- [ ] Block auto-save and ordinary manual save while the gate exists.
- [ ] Add a diff review modal with `この内容を保存`, `編集を続ける`, `復元を取り消す`, and `本文をコピー` actions.
- [ ] On explicit save, use `expectedContent: diskText`; on cancel, reload disk text and reset the baseline atomically.
- [ ] Run restore/save-safety tests and verify GREEN.

### Task 3: Startup and file-target baseline safety

**Files:**
- Modify: `antigravity/src/hooks/usePersistentData.js`
- Modify: `antigravity/src/hooks/useFileOperations.js`
- Modify: `antigravity/src/hooks/useAutoSave.js`
- Modify: `antigravity/src/App.jsx`
- Extend test: `antigravity/src/utils/saveSafety.test.mjs`

**Interfaces:**
- Produces: `baselineFileHandleRef`, updated only when a disk file is successfully opened or saved.

- [ ] Extend tests so text with no established baseline target cannot save into an active project file.
- [ ] Run the test and verify RED.
- [ ] Establish both baseline text and baseline target in the common file-open path.
- [ ] Route native startup file restoration through the common file-open path.
- [ ] Require save eligibility in auto-save and manual save.
- [ ] Run save-safety and auto-save-safety tests and verify GREEN.

### Task 4: Exact file fingerprints and target collection

**Files:**
- Modify: `antigravity/electron/main.cjs`
- Modify: `antigravity/electron/preload.cjs`
- Modify: `antigravity/src/utils/fileSystem.electron.js`
- Modify: `antigravity/src/utils/fileSystem.browser.js`
- Create: `antigravity/src/utils/aiEditRequestManifest.mjs`
- Create: `antigravity/src/utils/aiEditRequestManifest.test.mjs`

**Interfaces:**
- Produces: `fileSystem.getFileFingerprint(handle) -> { path, name, size, characterCount, modifiedAt, sha256 }`.
- Produces: `normalizeDriveFolderUrl(url)`, `collectDirectTextFiles(entries)`, `formatAIEditRequest(input)`.

- [ ] Write tests for one-character hash changes, Drive URL normalization, non-recursive direct-file collection, ordering, and mandatory stop instructions.
- [ ] Run the test and verify RED.
- [ ] Add Electron fingerprint IPC using raw bytes, `crypto.createHash('sha256')`, UTF-8 character count, and stat time.
- [ ] Add browser adapter fingerprinting with `File.arrayBuffer()` and `crypto.subtle.digest`.
- [ ] Implement pure manifest formatting and strict target validation.
- [ ] Run manifest tests and Electron syntax check; verify GREEN.

### Task 5: AI editing request UI

**Files:**
- Create: `antigravity/src/components/AIEditRequestPanel.jsx`
- Modify: `antigravity/src/App.jsx`
- Modify: `antigravity/src/index.css`
- Extend test: `antigravity/src/utils/aiEditRequestManifest.test.mjs`

**Interfaces:**
- Consumes: Task 4 collection, fingerprint, normalization, and formatting functions.

- [ ] Extend tests for current-file, explicitly selected files, and direct-folder manifests.
- [ ] Run the test and verify RED.
- [ ] Add a sidebar entry and panel with the three approved scopes.
- [ ] Populate candidates from the current file and existing file tree; preserve explicit selection order.
- [ ] Store folder URLs by local folder path in local settings.
- [ ] Disable generation when the active file has unsaved changes or any fingerprint fails.
- [ ] Preview the complete request and copy it to the clipboard, with a selectable fallback on clipboard failure.
- [ ] Run manifest tests and verify GREEN.

### Task 6: Verification

**Files:**
- Verify only; no production changes unless a failure is caused by this implementation.

- [ ] Run all new focused tests plus existing reader-edit, auto-save-safety, snapshot-store, conflict-diff, and atomic-write tests.
- [ ] Run ESLint only on changed JavaScript/JSX files.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Inspect the final diff for unrelated edits and report any UI scenario not exercised interactively.
