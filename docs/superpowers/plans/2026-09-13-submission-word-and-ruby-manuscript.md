# 強化型原稿用紙＋応募用Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 青空文庫ルビを編集本文を変更せずに原稿用紙へ反映表示し、選択中の応募規定を使ったネイティブルビ付きDOCXを書き出す。

**Architecture:** ルビ解析を純粋な共通Parserとして `textUtils` に集約し、Previewは既存の組版データを表示専用レイヤーとして利用する。DOCXは同じParserからOpenXML rubyを生成し、レイアウトは既存 `resolveSubmissionLayout` に委譲する。

**Tech Stack:** React, Vite, JSZip, Node built-in test runner, OpenXML DOCX.

**Spec:** `docs/superpowers/specs/2026-09-13-submission-word-and-ruby-manuscript-design.md`

## Global Constraints

- textarea内部の本文、保存内容、Undo、カーソル座標、`charPositionsCache` は変更しない。
- 原稿用紙のルビ反映は表示専用とし、OFFで元の青空文庫記法表示へ戻る。
- ルビは文字数に加算せず、既存の `submissionLayout` を優先する。
- 無関係なリファクタリングと既存の未コミット変更には触れない。

### Task 1: 共通ルビParserのテストと実装

**Files:**
- Modify: `antigravity/src/utils/textUtils.jsx`
- Test: `antigravity/src/utils/textUtils.test.mjs`
- Modify: `antigravity/src/utils/docxExporter.js`

- [ ] `｜漢字《かんじ》`、簡易形式、表示用プレーン本文、元本文不変の失敗テストを書く。
- [ ] Nodeテストを実行して、共有API未実装の失敗を確認する。
- [ ] Parserを純粋なトークン配列として整理し、DOCXの手書き正規表現を共通Parserへ置き換える。
- [ ] テストを通し、既存DOCXテストも通す。

### Task 2: ルビ反映原稿用紙表示

**Files:**
- Modify: `antigravity/src/components/Preview.jsx`
- Modify: `antigravity/src/styles/Preview.css`
- Modify: `antigravity/src/App.jsx`

- [ ] 表示モードの表示専用変換をテストする。
- [ ] ルビ反映ON時だけParser結果を使う別表示レイヤーを追加し、textarea経路を変更しない。
- [ ] 固定のlineGapを維持し、既存の20字×20行・背景・カーソル計算に触れない。
- [ ] 小さな「ルビ反映」切替を原稿用紙側へ接続する。

### Task 3: 応募用Word UIと清張賞書式表示

**Files:**
- Modify: `antigravity/src/components/ExportPanel.jsx`
- Modify: `antigravity/src/hooks/useExport.js`
- Modify: `antigravity/src/App.jsx`
- Test: `antigravity/src/utils/exportLayout.test.mjs`

- [ ] 清張賞レイアウトの文字数・行数・縦書きがDOCX生成に渡る失敗テストを追加する。
- [ ] Wordボタンを「応募用Word」に変更し、適用中の賞・書式を表示する。
- [ ] 既存の `submissionFormat` と `resolveSubmissionLayout` の経路を保ち、本文へ改行やタグを追加しない。
- [ ] 既存のルビなしDOCX出力を確認する。

### Task 4: 総合検証

**Files:**
- No production changes unless a test exposes a scoped regression.

- [ ] 既存テストと新規テストを実行する。
- [ ] `npm run build` を実行する。
- [ ] `git diff --check` と変更ファイル一覧を確認する。
