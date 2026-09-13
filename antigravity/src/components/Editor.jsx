import React, { useRef, useImperativeHandle, forwardRef, useMemo, useEffect, useCallback, useLayoutEffect, useState } from 'react';
import '../index.css';
// ★ 約物フィルターを無効化したい場合、この import をコメントアウトしてください
import { toVerticalDisplay, fromVerticalDisplay } from '../utils/verticalPunctuation';
import { useUndoHistory } from '../hooks/useUndoHistory';
import { useClipboardHistory } from '../hooks/useClipboardHistory';
import { perfNow, perfLog, perfMeasure } from '../utils/perfProbe';
import PositionWorker from '../utils/positionWorker?worker';
import { textToDocument, documentToText, updateDocument } from '../utils/documentModel';
import { cleanRuby, compressBlankLines, convertToFullWidth } from '../utils/formatText';
import {
  cleanVerticalContentWidth,
  measureDetachedCleanVerticalWidth,
} from '../utils/cleanEditorGeometry.mjs';


/**
 * Editor Component
 * 「見た目の1文字＝1マス」を物理的に強制する究極の安定化エディタ。
 */

// --- 禁則処理の文字セット ---
// ★ エディタでは無効化（プレビューで禁則処理を適用）
// アンダーレイ座標が break-all/anywhere の単純折り返しと同期するため
const KINSOKU_ENABLED = false;

// 行頭禁止 (Gyoto): これらの文字で行を始めてはいけない
const GYOTO_CHARS = new Set([
  '、', '。', '，', '．', '！', '？', '!', '?', '‼', '⁇', '⁈', '⁉',
  '）', ']', '｝', '〉', '》', '｣', '』', '】', '〕', "\u201D", "\u2019", '」',
  'っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'ッ', 'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ',
  'ゝ', 'ゞ', '々', 'ー',
  // 約物フィルターの縦書き専用字形も登録
  '︙', '︱',
]);

// 行末禁止 (Gyomatsu): これらの文字で行を終えてはいけない
const GYOMATSU_CHARS = new Set([
  '（', '［', '｛', '〈', '《', '｢', '『', '【', '〔', "\u201C", "\u2018", '「', '[',
]);

// ぶら下げ (Hanging): 行末からはみ出してもOK
const HANGING_CHARS = new Set(['、', '。', '，', '．']);

const toEditorDisplay = (text, isVertical, showWhitespace) => {
  const converted = isVertical ? toVerticalDisplay(text) : text;
  return showWhitespace ? converted.replace(/ /g, '␠').replace(/　/g, '□') : converted;
};

const fromEditorDisplay = (text, isVertical, showWhitespace) => {
  const restoredSpaces = showWhitespace ? text.replace(/␠/g, ' ').replace(/□/g, '　') : text;
  return isVertical ? fromVerticalDisplay(restoredSpaces) : restoredSpaces;
};

/**
 * 禁則処理付きの文字位置計算
 * CSS lineBreak: strict と同じルールを JS で再現し、
 * グリッド座標とテキスト折り返しを完全に同期させる。
 */
function computeCharPositions(charArray, maxPerLine) {
  const positions = new Array(charArray.length);
  let line = 0;
  let pos = 0;
  let allowHanging = false;

  for (let i = 0; i < charArray.length; i++) {
    const char = charArray[i];

    if (char === '\n') {
      positions[i] = null;
      line++;
      pos = 0;
      allowHanging = false;
      continue;
    }

    // 通常の折り返し（ぶら下げ許可時はスキップ）
    if (pos >= maxPerLine && !allowHanging) {
      line++;
      pos = 0;
    }

    // ぶら下げ文字の配置
    if (allowHanging && pos >= maxPerLine) {
      positions[i] = { line, pos };
      line++;
      pos = 0;
      allowHanging = false;
      continue;
    }

    allowHanging = false;

    // 文字を配置
    positions[i] = { line, pos };
    pos++;

    // 禁則処理: 行末に達したら次の文字をチェック
    if (KINSOKU_ENABLED && pos >= maxPerLine && i + 1 < charArray.length && charArray[i + 1] !== '\n') {
      const nextChar = charArray[i + 1];

      // 1. ぶら下げ: 。、は行末からはみ出してもOK
      if (HANGING_CHARS.has(nextChar)) {
        allowHanging = true;
        continue;
      }

      // 2. 行頭禁止 (追い出し): 次の文字が行頭に来れない → 現在の文字を次の行に送る
      if (GYOTO_CHARS.has(nextChar)) {
        pos--;
        line++;
        positions[i] = { line, pos: 0 };
        pos = 1;
        continue;
      }

      // 3. 行末禁止: 現在の文字が行末に来れない → 次の行に送る
      if (GYOMATSU_CHARS.has(char)) {
        pos--;
        line++;
        positions[i] = { line, pos: 0 };
        pos = 1;
        continue;
      }
    }
  }

  return { positions, totalLines: line + 1 };
}

/**
 * 軽量版: 行数だけを計算（座標配列を生成しない）
 * metrics の gridW/gridH 計算用。Array.from() による配列生成を回避。
 */
function computeTotalLines(text, maxPerLine) {
  if (!text || maxPerLine <= 0) return 1;
  let line = 0;
  let pos = 0;
  for (const char of text) {
    if (char === '\n') { line++; pos = 0; continue; }
    if (pos >= maxPerLine) { line++; pos = 0; }
    pos++;
  }
  return line + 1;
}


import ReactDOM from 'react-dom';

const Editor = forwardRef(({ value, onChange, onCursorStats, settings, onInsertRuby, onInsertLink, onSearchRequested, onLaunchAI, ghostText, setGhostText, corrections = [], onImageDrop, fileId = '' }, ref) => {
  const textareaRef = useRef(null);
  const [editorContextMenu, setEditorContextMenu] = React.useState(null);

  // ★ IME（日本語入力）変換中フラグ
  // composition 中は React の state 更新をスキップし、IME バッファを破壊しない
  const isComposingRef = useRef(false);
  const compositionTextRef = useRef(null); // composition 開始前のテキストを保持

  // ★ パフォーマンス根治: ローカルテキスト状態
  // Lazy initialization to avoid expensive parsing on every render
  const localDocumentRef = useRef(null);
  if (!localDocumentRef.current) localDocumentRef.current = textToDocument(value);

  const localTextRef = useRef(null);
  if (!localTextRef.current) localTextRef.current = documentToText(localDocumentRef.current);

  const [debouncedDocument, setDebouncedDocument] = useState(localDocumentRef.current);

  const appNotifyTimerRef = useRef(null);
  const debouncedDocTimerRef = useRef(null);

  // ★ エコー抑制: 直近打鍵の時刻を記録する。打鍵直後は value prop の
  //    外部変更ハンドラをスキップする（往復自己エコーでカーソルが飛ぶのを防ぐ）。
  //    ユーザーが最後に打鍵してから ECHO_SUPPRESS_MS だけは外部 value を無視する。
  const lastLocalMutationTsRef = useRef(0);
  const ECHO_SUPPRESS_MS = 1500;

  const scheduleDebouncedDocumentUpdate = useCallback((newDoc) => {
    if (debouncedDocTimerRef.current) clearTimeout(debouncedDocTimerRef.current);
    debouncedDocTimerRef.current = setTimeout(() => {
      setDebouncedDocument(newDoc);
      debouncedDocTimerRef.current = null;
    }, 800);
  }, []);

  // ★ applyText: 外部からのテキスト差し替え窓口（DOM 直接操作）
  //    呼び出し元の責任: onChange は applyText の外で明示的に呼ぶこと
  //    IME 変換中は何もしない（バッファ破壊防止）
  const applyText = useCallback((newValue, cursorPos = null) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (isComposingRef.current) return;

    if (appNotifyTimerRef.current) {
      clearTimeout(appNotifyTimerRef.current);
      appNotifyTimerRef.current = null;
    }
    if (debouncedDocTimerRef.current) {
      clearTimeout(debouncedDocTimerRef.current);
      debouncedDocTimerRef.current = null;
    }

    const displayed = toEditorDisplay(newValue, settings.isVertical, settings.showWhitespace);
    // 同一内容なら DOM を書き換えない（カーソル保持）
    if (ta.value !== displayed) {
      ta.value = displayed;
    }

    if (cursorPos != null) {
      ta.setSelectionRange(cursorPos, cursorPos);
    }

    const newDoc = updateDocument(localDocumentRef.current, newValue, cursorPos ?? 0);
    localDocumentRef.current = newDoc;
    localTextRef.current = newValue;
    lastLocalMutationTsRef.current = Date.now();

    scheduleDebouncedDocumentUpdate(newDoc);
  }, [settings.isVertical, settings.showWhitespace, scheduleDebouncedDocumentUpdate]);

  // ★ 外部からの value 変更（フォーマット適用・AI補完・検索置換等）への同期
  //    注意：打鍵 → Editor内で localTextRef 更新 → onChange(restored) → App側 setText
  //    → App debouncedText → editorValue が更新 → ここに戻ってくる という往復がある。
  //    この往復でtextareaを書き換えるとカーソルが飛ぶので、次の条件で全部無視する：
  //      1. value === localTextRef.current（完全一致＝単なるエコー）
  //      2. value === prev（変化なし）
  //      3. 直近 ECHO_SUPPRESS_MS 以内に打鍵があった（App 側で serializeNote 等により
  //         微小に変わった値が返ってくる可能性 — その間は打鍵優先）
  //    ファイル切替は [fileId] の useEffect が別途扱う。
  const prevValueRef2 = useRef(value);
  useEffect(() => {
    const prev = prevValueRef2.current;
    prevValueRef2.current = value;
    if (value === localTextRef.current) return;
    if (value === prev) return;
    // IME変換中は絶対に外部書換しない（applyText 側でもガードするが、ここで即弾く）
    if (isComposingRef.current) return;
    // 直近打鍵中ならエコーとみなし無視
    const sinceLastMutation = Date.now() - lastLocalMutationTsRef.current;
    if (sinceLastMutation < ECHO_SUPPRESS_MS) return;
    // ★ fuzzy エコー判定：App.jsx の serializeNote/parseNote ラウンドトリップは
    //    本文末尾に余分な改行や METADATA ブロック、メタデータ名前行(＃ ...)が
    //    付着する既知バグがあるため、完全一致にならない。
    //    local = value の先頭 prefix なら、差分は末尾に追加されただけ＝エコー扱い。
    const local = localTextRef.current;
    if (local && value.length >= local.length && value.startsWith(local)) {
      const tail = value.slice(local.length);
      // 許容されるテイルパターン（1つでも当てはまればエコー扱い）：
      //   a) 空白・改行のみ
      //   b) METADATA Sentinelタグを含む
      //   c) 空白・改行の後に # or ＃ で始まる行 + 任意の続きのみ
      //      （parseNoteが name header "＃ xxx" を body に誤混入する既知バグへの対処）
      const isWhitespaceOnly = /^\s*$/.test(tail);
      const containsMetadata = /[［\[]\s*\/?\s*METADATA\s*[］\]]/.test(tail);
      const isMetaNameTail = /^\s*[#＃][^\n]*\n?$/.test(tail);
      if (isWhitespaceOnly || containsMetadata || isMetaNameTail) {
        return;
      }
    }
    // value と localTextRef が本当に食い違っている（＝外部からの強制書換）
    applyText(value);
  }, [value, applyText]);

  // Undo/Redo 用のコールバック（applyText + onChange）
  const undoRedoCallbackRef = useRef(null);
  const undoRedoCallback = useCallback((newText) => {
    if (undoRedoCallbackRef.current) undoRedoCallbackRef.current(newText);
  }, []);

  const { initHistory, pushHistory, undo, redo, handleKeyDown: undoKeyDown, pendingCursor: pendingCursorRef, currentCursor: currentCursorRef } = useUndoHistory(undoRedoCallback);

  undoRedoCallbackRef.current = (newText) => {
    const pos = (pendingCursorRef && pendingCursorRef.current) || null;
    if (pendingCursorRef) pendingCursorRef.current = null;
    applyText(newText, pos);
    onChange(newText); // Undo/Redo 結果を App に即時通知
  };
  // --- クリップボード履歴 ---
  const { clipboardHistory, addToClipboard } = useClipboardHistory();

  const nextCursorPos = useRef(null);

  // 初回マウント/ファイル切替時のみ計算する defaultValue 用の値
  const initialDisplayValue = useMemo(() => {
    const text = documentToText(localDocumentRef.current);
    return toEditorDisplay(text, settings.isVertical, settings.showWhitespace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ファイル切替時: localText・undo履歴・debounce タイマーを確実にリセット
  useEffect(() => {
    // ① 即座に textarea を表示（UIをアンブロック）
    localTextRef.current = value;
    prevValueRef2.current = value;
    lastLocalMutationTsRef.current = 0;

    if (textareaRef.current) {
      const displayed = toEditorDisplay(value, settings.isVertical, settings.showWhitespace);
      textareaRef.current.value = displayed;
      textareaRef.current.setSelectionRange(0, 0);
    }

    if (appNotifyTimerRef.current) clearTimeout(appNotifyTimerRef.current);
    if (debouncedDocTimerRef.current) clearTimeout(debouncedDocTimerRef.current);
    nextCursorPos.current = null;

    // ② 重いパース処理は非同期で実行
    const parseTimer = setTimeout(() => {
      const t0 = perfNow();
      const newDoc = textToDocument(value);
      localDocumentRef.current = newDoc;
      setDebouncedDocument(newDoc);
      initHistory(value);
      perfMeasure('Editor.fileId.asyncParse', t0, { length: value.length });
    }, 0);

    return () => clearTimeout(parseTimer);
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 空白表示の切替は本文を変更せず、表示用の記号だけを更新する。
  useEffect(() => {
    if (isComposingRef.current || !textareaRef.current) return;
    const displayed = toEditorDisplay(localTextRef.current, settings.isVertical, settings.showWhitespace);
    textareaRef.current.value = displayed;
  }, [settings.isVertical, settings.showWhitespace]);

  // React再レンダリング直後にカーソル位置を復元（useLayoutEffectでペイント前に実行）
  // ★ IME 変換中はカーソル復元をスキップ（変換カーソルを破壊しないため）
  useLayoutEffect(() => {
    const totalT0 = perfNow();

    if (isComposingRef.current) {
      perfMeasure('Editor.selectionRestore.skipped.composing', totalT0);
      return;
    }

    if (pendingCursorRef && pendingCursorRef.current != null && textareaRef.current) {
      const t0 = perfNow();
      const pos = pendingCursorRef.current;
      pendingCursorRef.current = null;
      textareaRef.current.setSelectionRange(pos, pos);
      perfMeasure('Editor.selectionRestore.pendingCursor', t0, { pos });
      perfMeasure('Editor.selectionRestore.total', totalT0, { kind: 'pendingCursor' });
      return;
    }

    if (nextCursorPos.current != null && textareaRef.current) {
      const t0 = perfNow();
      const pos = nextCursorPos.current;
      nextCursorPos.current = null;
      textareaRef.current.setSelectionRange(pos, pos);
      perfMeasure('Editor.selectionRestore.nextCursor', t0, { pos });
      perfMeasure('Editor.selectionRestore.total', totalT0, { kind: 'nextCursor' });
      return;
    }

    perfMeasure('Editor.selectionRestore.total', totalT0, { kind: 'noop' });
  });

  // Context Menu Close Handler
  useEffect(() => {
    const close = () => setEditorContextMenu(null);
    if (editorContextMenu) {
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [editorContextMenu]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (appNotifyTimerRef.current) clearTimeout(appNotifyTimerRef.current);
    };
  }, []);

  // ファイル切替時にdebouncedValueをリセットし、Worker の古い計算結果が適用されないようにする。
  // ① charPositionsCache を即座に空にして前ファイルの着色を消去
  // ② positionsReqIdRef をインクリメントして飛行中の Worker 結果を無効化
  // ③ debouncedValue を新ファイルの内容で上書き（Worker が正しいテキストで再計算するように）
  // localText ではなく value を参照（fileId useEffect で setLocalText が走る前に読む可能性があるため）
  useEffect(() => {
    positionsReqIdRef.current += 1;
    lineCountReqIdRef.current += 1;
    setCharPositionsCache({ positions: [], charArray: [], utf16ToCharIdx: new Map() });
    // setDebouncedValue(value) -> debouncedDocument 側で処理されるため削除
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ファイル切替・縦横切替時の初期スクロール（文頭＝縦書き右端へ）
  useEffect(() => {
    const container = textareaRef.current?.closest('.editor-container');
    if (!container) return;
    if (settings.isVertical) {
      let attempts = 0;
      const tryScroll = () => {
        if (container.scrollWidth > container.clientWidth) {
          container.scrollLeft = container.scrollWidth;
        } else if (attempts < 10) {
          attempts++;
          setTimeout(tryScroll, 50);
        }
      };
      setTimeout(tryScroll, 50);
    } else {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
  }, [fileId, settings.isVertical]);


  // Array.from は大規模文字列で極めて重い（GC負荷が高い）ため、
  // 配列を生成せずにコードポイント数を数える軽量版を使用する。
  // upTo が指定された場合はそのインデックスまで数える（substring生成を回避）
  const countCodePoints = (str, upTo = Infinity) => {
    if (!str) return 0;
    let count = 0;
    const limit = Math.min(str.length, upTo);
    for (let i = 0; i < limit; i++) {
      count++;
      const code = str.charCodeAt(i);
      if (0xD800 <= code && code <= 0xDBFF) i++; // サロゲートペア
    }
    return count;
  };

  const splitString = (str) => Array.from(str || "");

  // --- パフォーマンス最適化: ハイライト用デバウンス（ローカルテキストベース）---
  // ★ 大規模テキスト（10万字超）では座標キャッシュ・ハイライト系の
  //    useEffect を全部スキップする。
  //    42万字規模では全文座標配列の生成・保持・再レンダリングが
  //    ブラウザ・React の両方を破綻させるため、highlights を諦めて
  //    打鍵だけを軽くする方針。
  const MASSIVE_TEXT_THRESHOLD = 100000; // 10万字まで着色を維持（章分割運用を前提とした実用的なしきい値）
  const isMassiveText = useMemo(() => {
    return debouncedDocument.reduce((acc, p) => acc + p.text.length, 0) > MASSIVE_TEXT_THRESHOLD;
  }, [debouncedDocument]);
  const isMassiveTextRef = useRef(isMassiveText);
  useEffect(() => { isMassiveTextRef.current = isMassiveText; }, [isMassiveText]);

  // debouncedValue state は廃止し、debouncedDocument から派生する memo に変更
  const debouncedText = useMemo(() => documentToText(debouncedDocument), [debouncedDocument]);
  const debouncePrevLenRef = useRef(debouncedText.length);
  useEffect(() => { debouncePrevLenRef.current = debouncedText.length; }, [debouncedText]);

  // --- 1a. ベース寸法（設定のみ依存、valueに依存しない） ---
  const baseMetrics = useMemo(() => {
    const fontSize = parseInt(settings.fontSize) || 18;
    const isManuscript = settings.paperStyle === 'grid';
    const lineHeightRatio = isManuscript
      ? (settings.lineHeight || 1.65)
      : (settings.charSpacing || 1.4);
    const cell = Math.floor(fontSize * lineHeightRatio);
    const PADDING = 10;

    let maxPerLine;
    if (settings.isVertical) {
      const winH = window.innerHeight;
      const availableH = winH - (PADDING * 2) - 28 - 40;
      maxPerLine = settings.charsPerLine || Math.floor(availableH / cell);
      if (maxPerLine < 5) maxPerLine = 20;
    } else {
      const winW = window.innerWidth;
      const availableW = winW - 320 - (PADDING * 2);
      maxPerLine = settings.charsPerLine || Math.floor(availableW / cell);
      if (maxPerLine < 5) maxPerLine = 20;
    }

    return { fontSize, cell, maxPerLine, padding: PADDING, letterSpacing: cell - fontSize };
  }, [settings.fontSize, settings.lineHeight, settings.isVertical, settings.charsPerLine, settings.paperStyle, settings.charSpacing]);

  // --- 共有 Web Worker（lineCount / positions を1つのWorkerで処理） ---
  const workerRef = useRef(null);
  const lineCountReqIdRef = useRef(0);
  const positionsReqIdRef = useRef(0);

  // debouncedDocument を監視
  const debouncedDocumentRef = useRef(debouncedDocument);
  useEffect(() => { debouncedDocumentRef.current = debouncedDocument; }, [debouncedDocument]);

  // 段落キャッシュ
  const [paraPosCache, setParaPosCache] = useState(new Map());
  const paraPosCacheRef = useRef(paraPosCache);
  useEffect(() => { paraPosCacheRef.current = paraPosCache; }, [paraPosCache]);
  const paraPosReqIdRef = useRef(new Map());

  // バージョンカウンタ（deps に配列・Mapを入れずに再実行を制御する）
  const workerDispatchVersionRef = useRef(0);
  const [workerDispatchTick, setWorkerDispatchTick] = useState(0);
  const cacheComposeVersionRef = useRef(0);
  const [cacheComposeTick, setCacheComposeTick] = useState(0);

  // debouncedDocument または baseMetrics が変わったら Worker送信を起動
  useEffect(() => {
    workerDispatchVersionRef.current += 1;
    setWorkerDispatchTick(v => v + 1);
  }, [debouncedDocument, baseMetrics.maxPerLine]);

  // paraPosCache が更新されたら合成を起動
  useEffect(() => {
    cacheComposeVersionRef.current += 1;
    setCacheComposeTick(v => v + 1);
  }, [paraPosCache]);

  // ★ 段落メモ（composedSegCacheRef）
  //    key: paraId, value: { localPositions, charArray, utf16Lens, totalLines, maxPerLine }
  const composedSegCacheRef = useRef({ map: new Map(), maxPerLine: 0 });

  // ★ Worker 受信バッファ。
  //    大量の段落が短時間に返ってくる場合、受信ごとに setParaPosCache を呼ぶと
  //    React 更新が段落数ぶん連打される（11,000 回など）。
  //    rAF 単位でまとめて 1 回だけ setParaPosCache する。
  const paraRecvBufferRef = useRef([]);
  const paraRecvRafRef = useRef(0);
  const flushParaRecvBuffer = useCallback(() => {
    paraRecvRafRef.current = 0;
    const buffer = paraRecvBufferRef.current;
    if (buffer.length === 0) return;
    paraRecvBufferRef.current = [];
    setParaPosCache(prev => {
      const next = new Map(prev);
      for (const entry of buffer) {
        next.set(entry.paraId, entry.value);
      }
      return next;
    });
  }, []);

  const debouncedLineCount = useMemo(() => {
    if (!debouncedDocument || debouncedDocument.length === 0) return 10;
    // 大規模テキスト: paraPosCache を作らないが、幅の不足で右側が空白化するのを防ぐため、
    // 軽量な computeTotalLines ループで正確な行数を計算する（JS上で非常に高速）。
    if (isMassiveText) {
      const exactLines = computeTotalLines(localTextRef.current, baseMetrics.maxPerLine);
      return Math.max(exactLines, 10);
    }
    const cached = [...paraPosCache.values()];
    if (cached.length === 0) {
      // キャッシュが空の場合も、正確な行数を取得して幅を合わせる
      const exactLines = computeTotalLines(localTextRef.current, baseMetrics.maxPerLine);
      return Math.max(exactLines, 10);
    }
    const total = cached.reduce((sum, p) => sum + (p.totalLines || 1), 0);
    return Math.max(total, 10);
  }, [debouncedDocument, paraPosCache, baseMetrics.maxPerLine, isMassiveText]);

  const [charPositionsCache, setCharPositionsCache] = useState(
    () => ({ positions: [], charArray: [], utf16ToCharIdx: new Map() })
  );

  // Worker の初期化（マウント時に一度だけ）
  useEffect(() => {
    const worker = new PositionWorker();
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const t0 = perfNow();
      const { type, id } = e.data;
      if (type === 'lineCount') {
        perfMeasure('Editor.worker.onmessage.lineCount', t0, { id, totalLines: e.data.totalLines });
      } else if (type === 'positions' && id === positionsReqIdRef.current) {
        const { positions, charArray, utf16ToCharIdxEntries } = e.data;
        const utf16ToCharIdx = new Map(utf16ToCharIdxEntries);
        setCharPositionsCache({ positions, charArray, utf16ToCharIdx });
        perfMeasure('Editor.worker.onmessage.positions', t0, {
          id,
          positionsLen: positions.length,
          charArrayLen: charArray.length,
        });
      } else if (type === 'para_positions') {
        const { paraId } = e.data;
        const latestId = paraPosReqIdRef.current.get(paraId);
        if (id !== latestId) {
          perfMeasure('Editor.worker.onmessage.para_positions.stale', t0, { id, paraId, latestId });
          return;
        }
        const { positions, charArray, utf16ToCharIdxEntries, totalLines } = e.data;
        const utf16ToCharIdx = new Map(utf16ToCharIdxEntries);
        // rAF バッチングでまとめて 1 回の setState に集約
        paraRecvBufferRef.current.push({
          paraId,
          value: { positions, charArray, utf16ToCharIdx, totalLines },
        });
        if (paraRecvRafRef.current === 0) {
          paraRecvRafRef.current = requestAnimationFrame(flushParaRecvBuffer);
        }
        perfMeasure('Editor.worker.onmessage.para_positions', t0, {
          id,
          paraId,
          positionsLen: positions.length,
          charArrayLen: charArray.length,
          totalLines,
        });
      } else {
        perfMeasure('Editor.worker.onmessage.other', t0, { type, id });
      }
    };
    return () => {
      worker.terminate();
      if (paraRecvRafRef.current !== 0) {
        cancelAnimationFrame(paraRecvRafRef.current);
        paraRecvRafRef.current = 0;
      }
    };
  }, [flushParaRecvBuffer]);

  // グリッド寸法
  const metrics = useMemo(() => {
    const { fontSize, cell, maxPerLine, padding, letterSpacing } = baseMetrics;
    const totalLines = debouncedLineCount;
    let cols, rows, gridW, gridH;
    if (settings.isVertical) {
      rows = maxPerLine;
      cols = Math.max(totalLines, settings.linesPerPage || 10);
      gridH = rows * cell;
      gridW = cols * cell;
    } else {
      cols = maxPerLine;
      rows = Math.max(totalLines, settings.linesPerPage || 10);
      gridW = cols * cell;
      gridH = rows * cell;
    }
    return { fontSize, cell, cols, rows, gridW, gridH, padding, letterSpacing };
  }, [debouncedLineCount, baseMetrics, settings.isVertical, settings.linesPerPage]);

  // Worker送信（workerDispatchTick または debouncedDocument が変わるたびに実行）
  useEffect(() => {
    const doc = debouncedDocument; // パッチに従い直接参照
    if (!doc || doc.length === 0) {
      setParaPosCache(new Map());
      return;
    }
    if (!workerRef.current) return;

    const uncached = doc.filter(p => !paraPosCacheRef.current.has(p.id));
    if (uncached.length === 0) return;

    // ★ lineOffset は Worker に渡さない。
    //    段落ローカル座標で計算・キャッシュし、全文座標への変換は合成側で行う。
    //    これにより段落の並び替え・挿入で lineOffset が変わっても
    //    Worker キャッシュは再利用できる。

    const BATCH_SIZE = isMassiveTextRef.current ? 3 : 30;
    const BATCH_INTERVAL = isMassiveTextRef.current ? 200 : 50;
    let batchIndex = 0;
    const timer = setInterval(() => {
      const batch = uncached.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
      if (batch.length === 0) { clearInterval(timer); return; }

      const batchT0 = perfNow();
      perfLog('Editor.worker.dispatch.batch', {
        batchIndex,
        batchSize: batch.length,
        uncachedTotal: uncached.length,
        maxPerLine: baseMetrics.maxPerLine,
      });

      batch.forEach(para => {
        const reqId = (paraPosReqIdRef.current.get(para.id) || 0) + 1;
        paraPosReqIdRef.current.set(para.id, reqId);

        perfLog('Editor.worker.dispatch.single', {
          paraId: para.id,
          reqId,
          textLength: para.text.length,
        });

        workerRef.current.postMessage({
          type: 'para_positions',
          id: reqId,
          paraId: para.id,
          text: para.text,
          maxPerLine: baseMetrics.maxPerLine,
        });
      });
      batchIndex++;
    }, 50);

    return () => clearInterval(timer);
  }, [baseMetrics.maxPerLine, debouncedDocument]);

  // charPositionsCache 合成（cacheComposeTick または debouncedDocument が変わるたびに実行）
  useEffect(() => {
    const run = () => {
      const t0 = perfNow();
      const doc = debouncedDocument;
      if (!doc || doc.length === 0) {
        setCharPositionsCache({ positions: [], charArray: [], utf16ToCharIdx: new Map() });
        return;
      }

      // ★ 大規模テキスト: 合成をスキップして空キャッシュを維持。
      if (isMassiveTextRef.current) {
        setCharPositionsCache(prev => {
          if (prev.charArray.length === 0) return prev;
          return { positions: [], charArray: [], utf16ToCharIdx: new Map() };
        });
        perfMeasure('Editor.charPositionsCache.compose.skipped.massive', t0);
        return;
      }

      const cache = paraPosCache;
      const maxPerLine = baseMetrics.maxPerLine || 20;

      // maxPerLine が変わったら段落メモを破棄
      if (composedSegCacheRef.current.maxPerLine !== maxPerLine) {
        composedSegCacheRef.current = { map: new Map(), maxPerLine };
      }
      const segMap = composedSegCacheRef.current.map;

      // 段落メモを paraPosCache の最新内容で増補する
      const aliveIds = new Set();
      for (let paraIdx = 0; paraIdx < doc.length; paraIdx++) {
        const para = doc[paraIdx];
        aliveIds.add(para.id);
        const cached = cache.get(para.id);
        if (!cached) continue;
        const existing = segMap.get(para.id);
        if (existing && existing.source === cached) continue;

        const { positions, charArray, totalLines } = cached;
        const utf16Lens = new Uint8Array(charArray.length);
        for (let i = 0; i < charArray.length; i++) {
          utf16Lens[i] = charArray[i].codePointAt(0) > 0xFFFF ? 2 : 1;
        }
        segMap.set(para.id, {
          source: cached,
          localPositions: positions,
          charArray,
          utf16Lens,
          totalLines,
        });
      }

      // 生きていない paraId のエントリを掃除
      if (segMap.size > doc.length * 2) {
        for (const id of segMap.keys()) {
          if (!aliveIds.has(id)) segMap.delete(id);
        }
      }

      const allPositions = [];
      const allCharArray = [];
      const utf16ToCharIdx = new Map();
      let utf16Offset = 0;
      let lineOffset = 0;

      for (let paraIdx = 0; paraIdx < doc.length; paraIdx++) {
        const para = doc[paraIdx];
        const seg = segMap.get(para.id);

        if (seg) {
          const { localPositions, charArray, utf16Lens, totalLines } = seg;
          const len = charArray.length;
          for (let i = 0; i < len; i++) {
            const p = localPositions[i];
            allPositions.push(p == null ? null : { line: p.line + lineOffset, pos: p.pos });
            allCharArray.push(charArray[i]);
            const uLen = utf16Lens[i];
            const charIdx = allCharArray.length - 1;
            utf16ToCharIdx.set(utf16Offset, charIdx);
            if (uLen === 2) utf16ToCharIdx.set(utf16Offset + 1, charIdx);
            utf16Offset += uLen;
          }
          lineOffset += totalLines;
        } else {
          // 暫定表示
          const chars = [...para.text];
          for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const approxLine = lineOffset + Math.floor(i / maxPerLine);
            const approxPos = i % maxPerLine;
            allPositions.push({ line: approxLine, pos: approxPos });
            allCharArray.push(ch);
            const utf16Len = ch.codePointAt(0) > 0xFFFF ? 2 : 1;
            const charIdx = allCharArray.length - 1;
            utf16ToCharIdx.set(utf16Offset, charIdx);
            if (utf16Len === 2) utf16ToCharIdx.set(utf16Offset + 1, charIdx);
            utf16Offset += utf16Len;
          }
          lineOffset += Math.ceil(para.text.length / maxPerLine) || 1;
        }

        if (paraIdx < doc.length - 1) {
          allCharArray.push('\n');
          allPositions.push(null);
          utf16ToCharIdx.set(utf16Offset, allCharArray.length - 1);
          utf16Offset += 1;
        }
      }

      perfMeasure('Editor.charPositionsCache.compose.setCachePre', t0, {
        docLen: doc.length,
        paraCacheSize: cache.size,
        allCharArrayLen: allCharArray.length,
        allPositionsLen: allPositions.length,
      });
      setCharPositionsCache({ positions: allPositions, charArray: allCharArray, utf16ToCharIdx });
      perfMeasure('Editor.charPositionsCache.compose.total', t0);
    };

    const timer = setTimeout(run, 40);
    return () => clearTimeout(timer);
  }, [paraPosCache, debouncedDocument, baseMetrics.maxPerLine]);

  // --- 2. アンダーレイ（座標マップ）の生成（デバウンス） ---
  // ★ 大規模テキストではハイライトを自動停止（座標キャッシュを作らないため）
  const highlights = useMemo(() => {
    const t0 = perfNow();
    if (settings.editorSyntaxColors === false) {
      perfMeasure('Editor.highlights', t0, { kind: 'skipped (disabled)' });
      return [];
    }
    if (!debouncedText) {
      perfMeasure('Editor.highlights', t0, { kind: 'skipped (empty)' });
      return [];
    }
    if (isMassiveText) {
      perfMeasure('Editor.highlights', t0, { kind: 'skipped (massive)', len: debouncedText.length });
      return [];
    }
    const { cell } = baseMetrics;
    const { positions, utf16ToCharIdx } = charPositionsCache;
    const isVert = settings.isVertical;
 
    const patterns = [
      { type: 'link',         regex: /\[\[.*?\]\]|［［.*?］］/g, color: settings.syntaxColors?.link || '#2980b9' },
      { type: 'emphasis',     regex: /『.*?』/g,                  color: settings.syntaxColors?.emphasis || '#c0392b' },
      { type: 'conversation', regex: /「.*?」/g,                  color: settings.syntaxColors?.conversation || '#27ae60', isConversation: true },
      { type: 'ruby',         regex: /《.*?》/g,                  color: settings.syntaxColors?.ruby || '#e67e22' },
      { type: 'aozora',       regex: /［＃.*?］/g,                color: settings.syntaxColors?.aozora || '#8e44ad' },
      { type: 'bold',         regex: /\*\*.*?\*\*/g,             color: settings.syntaxColors?.emphasis || '#c0392b' },
    ];
 
    const list = [];
    patterns.forEach(({ type, regex, color, isConversation }) => {
      let match;
      while ((match = regex.exec(debouncedText)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        // substring(0, matchStart) を作らずにカウント
        const visualStart = utf16ToCharIdx.get(matchStart) ?? countCodePoints(debouncedText, matchStart);
        const visualLen = countCodePoints(match[0]);
        for (let i = 0; i < visualLen; i++) {
          const p = positions[visualStart + i];
          if (p) {
            const x = isVert ? -p.line * cell : (p.pos * cell);
            const y = isVert ? (p.pos * cell) : (p.line * cell);
            // key: type + match開始位置 + 文字オフセットで完全一意に
            list.push({ type, start: matchStart, end: matchEnd, x, y, color, isConversation: !!isConversation });
          }
        }
      }
    });
    perfMeasure('Editor.highlights', t0, { count: list.length, len: debouncedText.length });
    return list;
  }, [charPositionsCache, debouncedText, baseMetrics, settings.isVertical, settings.syntaxColors, settings.editorSyntaxColors]);

  // --- 3a. ゴーストテキスト座標計算 ---
  const ghostHighlights = useMemo(() => {
    const t0 = perfNow();
    if (!ghostText || !charPositionsCache.charArray.length) {
      perfMeasure('Editor.ghostHighlights', t0, { kind: 'skipped' });
      return [];
    }

    // ★ 全文再計算を廃止。charPositionsCache の末尾座標を起点に ghost 部分だけ計算する。
    const { cell, maxPerLine } = baseMetrics;
    const { positions: basePositions, charArray: baseCharArray } = charPositionsCache;

    // 末尾の有効座標（最後の非null）を取得して ghost の起点にする
    let lastLine = 0;
    let lastPos = 0;
    for (let i = basePositions.length - 1; i >= 0; i--) {
      const p = basePositions[i];
      if (p != null) { lastLine = p.line; lastPos = p.pos + 1; break; }
    }

    // ghost テキストを末尾から続けて座標計算（ghost 部分だけ）
    const ghostCharArray = splitString(ghostText);
    let line = lastLine;
    let pos = lastPos;
    const list = [];

    for (let i = 0; i < ghostCharArray.length; i++) {
      const ch = ghostCharArray[i];
      if (ch === '\n') { line++; pos = 0; continue; }
      if (pos >= maxPerLine) { line++; pos = 0; }
      const x = settings.isVertical ? -line * cell : (pos * cell);
      const y = settings.isVertical ? (pos * cell) : (line * cell);
      list.push({ x, y, char: ch, charIdx: baseCharArray.length + i });
      pos++;
    }
    perfMeasure('Editor.ghostHighlights', t0, { count: list.length });
    return list;
  }, [charPositionsCache, ghostText, baseMetrics, settings.isVertical]);

  // --- 3b. 校正ハイライト座標計算（デバウンス + キャッシュ共有） ---
  const correctionHighlights = useMemo(() => {
    const t0 = perfNow();
    if (!corrections || corrections.length === 0 || !debouncedText) {
      perfMeasure('Editor.correctionHighlights', t0, { kind: 'skipped' });
      return [];
    }
 
    const { charArray, positions, utf16ToCharIdx } = charPositionsCache;
    const { cell } = baseMetrics;
    const isVert = settings.isVertical;
 
    const list = [];
 
    corrections.forEach(corr => {
      if (!corr.original) return;
      let searchIndex = 0;
      let index = debouncedText.indexOf(corr.original, searchIndex);
 
      while (index !== -1) {
        const len = splitString(corr.original).length;
        // ★ splitString(preStr) は index 文字分の Array.from → utf16ToCharIdx でゼロコスト化
        const startCharIdx = utf16ToCharIdx.get(index) ?? countCodePoints(debouncedText.slice(0, index));
 
        for (let i = 0; i < len; i++) {
          const p = positions[startCharIdx + i];
          if (p) {
            const x = isVert ? -p.line * cell : (p.pos * cell);
            const y = isVert ? (p.pos * cell) : (p.line * cell);
            list.push({
              corrId: corr.id, matchIndex: index, charOffset: i,
              x, y,
              char: charArray[startCharIdx + i],
              color: 'red'
            });
          }
        }
        break;
      }
    });
 
    perfMeasure('Editor.correctionHighlights', t0, { count: list.length });
    return list;
  }, [debouncedText, corrections, charPositionsCache, baseMetrics, settings.isVertical]);



  // --- 3. 約物フィルター (縦書き時のみ — メモ化でローカルテキストベース) ---

  const handleChange = useCallback((e) => {
    const ta = e.target;
    const raw = ta.value;
    const restored = fromEditorDisplay(raw, settings.isVertical, settings.showWhitespace);
    const cursorPos = ta.selectionStart;
    // IME変換中に textarea.value を差し替えると未確定バッファが壊れ、
    // 変換候補の確定で全角スペースが混入する。
    if (settings.showWhitespace && !isComposingRef.current) {
      const displayed = toEditorDisplay(restored, settings.isVertical, true);
      // 通常入力では値は同じ。DOM再代入は縦書きレイアウトを揺らすため行わない。
      if (ta.value !== displayed) {
        ta.value = displayed;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    }

    const prevText = localTextRef.current;
    const newDoc = updateDocument(localDocumentRef.current, restored, cursorPos);

    localDocumentRef.current = newDoc;
    localTextRef.current = restored;
    lastLocalMutationTsRef.current = Date.now();

    if (!isComposingRef.current) {
      pushHistory(prevText, restored, cursorPos);
      if (currentCursorRef) currentCursorRef.current = cursorPos;
    }

    if (appNotifyTimerRef.current) clearTimeout(appNotifyTimerRef.current);
    appNotifyTimerRef.current = setTimeout(() => onChange(restored), 500);

    scheduleDebouncedDocumentUpdate(newDoc);
  }, [settings.isVertical, settings.showWhitespace, pushHistory, currentCursorRef, onChange, scheduleDebouncedDocumentUpdate]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    compositionTextRef.current = localTextRef.current;
  }, []);

  const handleCompositionEnd = useCallback((e) => {
    const ta = e.target;
    const raw = ta.value;
    const restored = fromEditorDisplay(raw, settings.isVertical, settings.showWhitespace);
    const cursorPos = ta.selectionStart;

    if (settings.showWhitespace) {
      const displayed = toEditorDisplay(restored, settings.isVertical, true);
      if (ta.value !== displayed) {
        ta.value = displayed;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    }

    isComposingRef.current = false;

    const beforeComposition = compositionTextRef.current ?? localTextRef.current;
    const newDoc = updateDocument(localDocumentRef.current, restored, cursorPos);

    localDocumentRef.current = newDoc;
    localTextRef.current = restored;
    lastLocalMutationTsRef.current = Date.now();

    pushHistory(beforeComposition, restored, cursorPos);
    if (currentCursorRef) currentCursorRef.current = cursorPos;

    if (appNotifyTimerRef.current) clearTimeout(appNotifyTimerRef.current);
    appNotifyTimerRef.current = setTimeout(() => onChange(restored), 500);

    scheduleDebouncedDocumentUpdate(newDoc);
    compositionTextRef.current = null;
  }, [settings.isVertical, pushHistory, currentCursorRef, onChange, scheduleDebouncedDocumentUpdate]);

  const handleCopy = useCallback((e) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    if (selected) {
      const original = fromEditorDisplay(selected, settings.isVertical, settings.showWhitespace);
      // クリップボード履歴に追加
      addToClipboard(original);
      if (settings.isVertical) {
        // clipboardData が使える場合は同期APIで書き込む
        if (e.clipboardData) {
          try {
            e.clipboardData.setData('text/plain', original);
            e.preventDefault();
          } catch (err) {
            // 別ウィンドウ等で clipboardData が無効な場合、非同期APIにフォールバック
            e.preventDefault();
            navigator.clipboard.writeText(original).catch(() => {});
          }
        } else {
          // clipboardData 自体がない場合
          e.preventDefault();
          navigator.clipboard.writeText(original).catch(() => {});
        }
      }
    }
  }, [settings.isVertical, addToClipboard]);

  const handleCut = useCallback((e) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    if (selected) {
      const original = fromEditorDisplay(selected, settings.isVertical, settings.showWhitespace);
      // クリップボード履歴に追加
      addToClipboard(original);
      if (settings.isVertical) {
        e.clipboardData.setData('text/plain', original);
        e.preventDefault();
        const cursorPos = textarea.selectionStart;
        const before = textarea.value.substring(0, cursorPos);
        const after = textarea.value.substring(textarea.selectionEnd);
      const newValue = fromEditorDisplay(before + after, true, settings.showWhitespace);
        pushHistory(localTextRef.current, newValue, cursorPos);
        applyText(newValue, cursorPos);
        appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
      }
    }
  }, [applyText, settings.isVertical, addToClipboard, pushHistory, onChange]);

  // --- 4. ハンドラ ---
  const handleCursor = () => {
    if (onCursorStats && textareaRef.current) {
      onCursorStats({
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
        total: localTextRef.current.length
      });
    }
  };

  const handleWheel = useCallback((e) => {
    if (!settings.isVertical) return;
    // Only convert vertical wheel → horizontal scroll
    // Let deltaX pass through to native browser scrolling
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const container = textareaRef.current?.closest('.editor-container');
      if (container) {
        container.scrollLeft -= e.deltaY;
        e.preventDefault();
      }
    }
  }, [settings.isVertical]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el && settings.isVertical) {
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, [settings.isVertical, handleWheel]);

  // ★ コンテナにスクロールバーを強制表示（縦書き・横書き両対応）
  useEffect(() => {
    const container = textareaRef.current?.closest('.editor-container');
    if (!container) return;

    // 親フレックスコンテナに合わせる
    container.style.height = '100%';

    if (settings.isVertical) {
      container.style.overflowX = 'scroll';
      container.style.overflowY = 'hidden';
    } else {
      container.style.overflowX = 'hidden';
      container.style.overflowY = 'scroll';
    }

    // -webkit-scrollbar 用の動的スタイルを注入
    const styleId = 'nexus-scrollbar-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const darkMode = document.body.classList.contains('dark-mode');
    const thumbColor = darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    const thumbHover = darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
    const trackColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const scrollbarCSS = `
      background: ${thumbColor} !important;
      border-radius: 7px !important;
      border: 2px solid transparent !important;
      background-clip: padding-box !important;
    `;
    styleEl.textContent = `
      .editor-container.vertical,
      .editor-container.horizontal {
        height: 100% !important;
      }
      .editor-container.vertical {
        overflow-x: scroll !important;
        overflow-y: hidden !important;
      }
      .editor-container.horizontal {
        overflow-y: scroll !important;
        overflow-x: hidden !important;
      }
      .editor-container::-webkit-scrollbar { width: 14px !important; height: 14px !important; }
      .editor-container::-webkit-scrollbar-track { background: ${trackColor} !important; }
      .editor-container::-webkit-scrollbar-thumb { ${scrollbarCSS} }
      .editor-container::-webkit-scrollbar-thumb:hover { background: ${thumbHover} !important; }
      
      .context-menu-item.has-submenu:hover > .format-submenu {
        display: block !important;
      }
    `;

    return () => {
      if (container) {
        container.style.overflowX = '';
        container.style.overflowY = '';
        container.style.height = '';
      }
    };
  }, [settings.isVertical]);

  const scrollToCaretPosition = useCallback((charIndex) => {
    const ta = textareaRef.current;
    const container = ta?.closest('.editor-container');
    if (!ta || !container) return;

    const isClean = settings.paperStyle === 'clean';

    if (isClean) {
      // 縦書き + overflow:hidden の textarea は内部スクロール値で
      // キャレット位置を取得できないため、実寸の不可視要素で測定する。
      const computed = window.getComputedStyle(ta);
      const mirror = document.createElement('div');
      const marker = document.createElement('span');
      mirror.setAttribute('aria-hidden', 'true');
      Object.assign(mirror.style, {
        position: 'fixed', left: '-20000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
        boxSizing: computed.boxSizing,
        width: `${ta.clientWidth}px`, height: `${ta.clientHeight}px`,
        padding: computed.padding, border: '0', whiteSpace: 'pre-wrap',
        overflowWrap: computed.overflowWrap, wordBreak: computed.wordBreak, lineBreak: computed.lineBreak,
        writingMode: computed.writingMode, textOrientation: computed.textOrientation, direction: computed.direction,
        fontFamily: computed.fontFamily, fontSize: computed.fontSize, fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle, lineHeight: computed.lineHeight, letterSpacing: computed.letterSpacing,
        textIndent: computed.textIndent,
      });
      mirror.append(document.createTextNode(localTextRef.current.slice(0, charIndex)));
      marker.textContent = '\u200b';
      mirror.append(marker);
      document.body.append(mirror);

      const mirrorRect = mirror.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      if (settings.isVertical) {
        const offsetFromRight = mirrorRect.right - markerRect.right;
        const target = -(offsetFromRight - container.clientWidth / 2);
        const min = -(container.scrollWidth - container.clientWidth);
        container.scrollLeft = Math.max(min, Math.min(0, target));
      } else {
        const offsetFromTop = markerRect.top - mirrorRect.top;
        container.scrollTop = Math.max(0, offsetFromTop - container.clientHeight / 2);
      }
      mirror.remove();
      return;
    }

    const { maxPerLine, cell, padding } = baseMetrics;
    const currentText = localTextRef.current;
    
    // ガード：テキストがまだ読み込まれていないか、インデックスが範囲外の場合は中断
    if (!currentText || charIndex > currentText.length + 100) {
      console.warn(`[Scroll] Aborting scroll. Text not ready or index out of range. Len: ${currentText?.length}, Target: ${charIndex}`);
      return;
    }

    const text = toEditorDisplay(currentText, settings.isVertical, settings.showWhitespace);

    let line = 0;
    let pos = 0;
    for (let i = 0; i < charIndex && i < text.length; i++) {
      if (text[i] === '\n') {
        line++;
        pos = 0;
      } else {
        if (pos >= maxPerLine) {
          line++;
          pos = 0;
        }
        pos++;
      }
    }

    if (settings.isVertical) {
      const caretOffsetFromRight = line * cell + padding;
      const viewCenter = container.clientWidth / 2;
      const targetScrollLeft = -(caretOffsetFromRight - viewCenter);
      const minScrollLeft = -(container.scrollWidth - container.clientWidth);
      const clampedScrollLeft = Math.max(minScrollLeft, Math.min(0, targetScrollLeft));
      container.scrollLeft = clampedScrollLeft;
    } else {
      const caretY = line * cell + padding;
      const viewCenter = container.clientHeight / 2;
      const targetScrollTop = Math.max(0, caretY - viewCenter);
      container.scrollTop = targetScrollTop;
    }
  }, [settings.isVertical, settings.paperStyle, baseMetrics]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    textarea: textareaRef.current,
    textareaRef,
    // Undo/Redo
    undo,
    redo,
    // クリップボード履歴
    clipboardHistory,
    // ★ テキスト挿入（Todoパネル・AI補完・スニペット挿入など）
    //    文書モデル化に対応した差分更新方式
    insertText: (text) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const rawVal = fromEditorDisplay(ta.value, settings.isVertical, settings.showWhitespace);
      const newValue = rawVal.substring(0, start) + text + rawVal.substring(end);
      const newCursor = start + splitString(text).length;
      pushHistory(localTextRef.current, newValue, newCursor);
      applyText(newValue, newCursor);
      appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
    },
    pasteFromHistory: (text) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const currentVal = ta.value;
      const rawVal = fromEditorDisplay(currentVal, settings.isVertical, settings.showWhitespace);
      const newValue = rawVal.substring(0, start) + text + rawVal.substring(end);
      const newCursor = start + text.length;
      pushHistory(localTextRef.current, newValue, newCursor);
      applyText(newValue, newCursor);
      appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
    },
    insertRuby: () => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const currentValue = ta.value;
      const rawValue = fromEditorDisplay(currentValue, settings.isVertical, settings.showWhitespace);
      const selectedText = rawValue.substring(start, end);
      const insertion = selectedText
        ? `${selectedText}《》`
        : '《》';
      const newValue = rawValue.substring(0, start) + insertion + rawValue.substring(end);
      const newCursor = start + (selectedText ? selectedText.length + 1 : 1);
      pushHistory(localTextRef.current, newValue, newCursor);
      applyText(newValue, newCursor);
      appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
      // useLayoutEffect だけでは縦書き時に復元されないことがあるため、明示的にフォーカス
      setTimeout(() => {
        const pos = start + (selectedText ? selectedText.length + 1 : 1);
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }, 0);
    },
    setCursorPosition: (position) => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(position, position);
      requestAnimationFrame(() => scrollToCaretPosition(position));
    },
    jumpToPosition: (start, end) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const selEnd = end != null ? end : start;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(start, selEnd);
      requestAnimationFrame(() => scrollToCaretPosition(start));
    },
    // ★ jumpToIndex: 検索結果ジャンプ（jumpToPositionの別名）
    //    App.jsx が editorRef.current?.jumpToIndex(index) で呼んでいるが未定義だったため追加
    jumpToIndex: (index) => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(index, index);
      requestAnimationFrame(() => scrollToCaretPosition(index));
    },
  }));

  const isCleanMode = settings.paperStyle === 'clean';
  const paperClass = isCleanMode ? 'paper-clean' :
    settings.paperStyle === 'grid' ? 'paper-manuscript' :
      settings.paperStyle === 'lined' ? 'paper-lined' : 'paper-plain';

  // フォントスタイル（メモ化 — レンダリングごとの新規オブジェクト生成を回避）
  // すべての用紙モードで設定画面の本文フォントを正とする。
  // 旧 cleanFontFamily は下部セレクトだけが優先される原因だった。
  const cleanFontFamily = settings.fontFamily || 'var(--font-mincho)';
  const fontStyle = useMemo(() => isCleanMode ? {
    fontFamily: `${cleanFontFamily}, serif`,
    letterSpacing: '0em',
    lineHeight: settings.isVertical ? 'normal' : '2.0',
    fontVariantLigatures: 'common-ligatures',
    fontKerning: 'auto',
    fontFeatureSettings: settings.isVertical
      ? '"kern" 1, "vert" 1, "vrt2" 1'
      : '"kern" 1',
  } : {
    fontFamily: `${settings.fontFamily || 'var(--font-mincho)'}, serif`,
    letterSpacing: `${metrics.letterSpacing}px`,
    lineHeight: `${metrics.cell}px`,
    fontVariantEastAsian: 'full-width',
    fontVariantLigatures: 'none',
    fontKerning: 'none',
    textAutospace: 'no-autospace',
    textSpacingTrim: 'space-all',
    fontFeatureSettings: settings.isVertical
      ? '"palt" 0, "halt" 0, "kern" 0, "vkrn" 0, "chws" 0, "liga" 0, "clig" 0, "calt" 0, "vert" 1, "vrt2" 1'
      : '"palt" 0, "halt" 0, "kern" 0, "vkrn" 0, "chws" 0, "liga" 0, "clig" 0, "calt" 0, "vert" 0, "vrt2" 0',
  }, [isCleanMode, cleanFontFamily, settings.isVertical, settings.fontFamily, metrics.letterSpacing, metrics.cell]);

  const cleanVerticalWidth = useMemo(() => {
    if (!isCleanMode || !settings.isVertical) return null;
    const fontSize = parseInt(settings.fontSize) || 16;
    const verticalChrome = 28 + 40;
    const verticalPadding = 80;
    return cleanVerticalContentWidth(debouncedText, {
      fontSize,
      contentHeight: Math.max(fontSize, window.innerHeight - verticalChrome - verticalPadding),
      horizontalPadding: 64,
    });
  }, [isCleanMode, settings.isVertical, settings.fontSize, debouncedText]);

  const [measuredCleanWidth, setMeasuredCleanWidth] = useState(null);
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !isCleanMode || !settings.isVertical) {
      setMeasuredCleanWidth(null);
      return;
    }

    const container = ta.closest('.editor-container');
    // 編集中の textarea 自体を縮めると、Chromium が横スクロール位置を
    // 文頭へクランプする。画面外の複製要素だけを使って組版幅を測る。
    const measured = measureDetachedCleanVerticalWidth({
      textarea: ta,
      containerClientWidth: container?.clientWidth,
      viewportWidth: window.innerWidth,
      appendTarget: document.body,
    });
    setMeasuredCleanWidth(measured);
  }, [isCleanMode, settings.isVertical, settings.fontSize, settings.fontFamily, debouncedText, fileId]);

  // ★ textarea の style オブジェクトをメモ化（キー入力ごとの新規オブジェクト生成を回避）
  const textareaStyle = useMemo(() => isCleanMode ? {
    fontSize: `${settings.fontSize || 16}px`,
    width: settings.isVertical
      ? `max(100%, ${measuredCleanWidth ?? cleanVerticalWidth}px)`
      : '100%',
    height: '100%',
    maxWidth: settings.isVertical ? 'none'
      : (settings.charsPerLine ? `${settings.charsPerLine * (parseInt(settings.fontSize) || 16) * 1.2 + 64}px` : 'none'),
    margin: settings.isVertical ? '0' : (settings.charsPerLine ? '0 auto' : '0'),
    padding: '40px 32px',
    textAlign: 'start',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    lineBreak: 'normal',
    writingMode: settings.isVertical ? 'vertical-rl' : 'horizontal-tb',
    textOrientation: settings.isVertical ? 'upright' : 'mixed',
    overflowY: settings.isVertical ? 'hidden' : 'scroll',
    overflowX: 'hidden',
    resize: 'none',
    background: 'transparent',
    direction: 'ltr',
    ...fontStyle
  } : {
    fontSize: `${metrics.fontSize}px`,
    '--cell': `${metrics.cell}px`,
    '--grid-w': `${metrics.gridW}px`,
    '--grid-h': `${metrics.gridH}px`,
    '--ls-half': `${Math.round(metrics.letterSpacing / 2)}px`,
    width: settings.isVertical
      ? `${metrics.gridW + (metrics.padding * 2) + metrics.cell + 2}px`
      : `${metrics.gridW + (metrics.padding * 2) + 2}px`,
    height: settings.isVertical
      ? `${metrics.gridH + (metrics.padding * 2) + 2}px`
      : `${metrics.gridH + (metrics.padding * 2) + metrics.cell + 2}px`,
    padding: `${metrics.padding}px`,
    textAlign: 'start',
    wordBreak: 'break-all',
    lineBreak: 'anywhere',
    textOrientation: settings.isVertical ? 'upright' : 'mixed',
    overflow: 'hidden',
    resize: 'none',
    ...fontStyle
  }, [isCleanMode, settings.fontSize, settings.isVertical, settings.charsPerLine, metrics, fontStyle, cleanVerticalWidth, measuredCleanWidth]);

  // --- メモ化: シンタックスハイライト要素 ---
  const highlightElements = useMemo(() => {
    if (settings.editorSyntaxColors === false || !highlights.length) return null;
    const cell = baseMetrics.cell;
    const isVert = settings.isVertical;
    // viewport フィルタリングは廃止。
    // スクロール位置と再計算タイミングのズレで「着色が半端・途中から消える」バグの原因だった。
    // HIGHLIGHT_CHAR_LIMIT(100000字)で大規模テキストはスキップ済みなのでフィルタ不要。
    return highlights.map((h, idx) => (
      <div key={`${h.type}-${h.start}-${h.end}-${h.x}-${h.y}-${idx}`} style={{
        position: 'absolute',
        right: isVert ? `${-h.x}px` : 'auto',
        left: isVert ? 'auto' : `${h.x}px`,
        top: `${h.y}px`,
        width: `${cell}px`,
        height: `${cell}px`,
        backgroundColor: h.color,
        opacity: h.isConversation ? 0.5 : 0.25,
        borderRadius: '2px'
      }} />
    ));
  }, [highlights, settings.isVertical, settings.editorSyntaxColors, baseMetrics.cell]);

  // --- ドラッグ&ドロップでの画像挿入 ---
  const handleDragOver = useCallback((e) => {
    // 画像ファイルのドラッグのみ受け入れる
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(async (e) => {
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(f => f.type.startsWith('image/'));
    if (!imageFile) return;

    e.preventDefault();

    // App.jsx から渡された onImageDrop で画像を保存
    if (onImageDrop) {
      const fileName = await onImageDrop(imageFile);
      if (fileName) {
        // カーソル位置に挿絵記法を挿入
        const ta = textareaRef.current;
        const pos = ta.selectionStart;
        const currentText = localTextRef.current;
        // 前後が改行されていない場合は改行で挟むなどの調整が可能（今回はシンプルに改行挟み）
        const insertion = `\n［＃挿絵（${fileName}）入る］\n`;
        const newValue = currentText.substring(0, pos) + insertion + currentText.substring(pos);
        const newCursor = pos + insertion.length;
        pushHistory(currentText, newValue, pos);
        applyText(newValue, newCursor);
        appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
      }
    }
  }, [applyText, pushHistory, onImageDrop, onChange]);

  return (
    <div lang="ja" className={`editor-container ${settings.isVertical ? 'vertical' : 'horizontal'} ${paperClass}`}>
      {/* Underlay: skip in clean mode (proportional fonts can't align character-by-character) */}
      {/* Underlay: skip in massive text mode（座標キャッシュを作らないため） */}
      {!isCleanMode && !isMassiveText && (
        <div className="editor-underlay" style={{
          // 下敷きの原点は textarea の本文開始位置と同じ padding に固定する。
          // 縦書き時に letter-spacing の半分を引くと、文字に対して着色だけが上へずれる。
          top: `${metrics.padding}px`,
          right: settings.isVertical ? `${metrics.padding}px` : 'auto',
          left: settings.isVertical ? 'auto' : `${metrics.padding}px`,
          writingMode: settings.isVertical ? 'vertical-rl' : 'horizontal-tb',
          ...fontStyle,
          fontSize: `${metrics.fontSize}px`,
        }}>
          {highlightElements}
          {/* Ghost Text Overlay */}
          {ghostHighlights.map((gh, idx) => (
            <div key={`ghost-${gh.charIdx}-${gh.x}-${gh.y}-${idx}`} style={{
              position: 'absolute',
              right: settings.isVertical ? `${-gh.x}px` : 'auto',
              left: settings.isVertical ? 'auto' : `${gh.x}px`,
              top: `${gh.y}px`,
              width: `${baseMetrics.cell}px`,
              height: `${baseMetrics.cell}px`,
              color: '#aaa',
              opacity: 0.6,
              pointerEvents: 'none',
              lineHeight: `${baseMetrics.cell}px`,
              fontSize: `${baseMetrics.fontSize}px`,
              fontFamily: fontStyle.fontFamily,
              writingMode: settings.isVertical ? 'vertical-rl' : 'horizontal-tb',
              ...fontStyle,
            }}>
              {gh.char}
            </div>
          ))}
          {/* Correction Highlights */}
          {correctionHighlights.map((ch, idx) => (
            <div key={`corr-${ch.corrId}-${ch.matchIndex}-${ch.charOffset}-${idx}`} style={{
              position: 'absolute',
              right: settings.isVertical ? `${-ch.x}px` : 'auto',
              left: settings.isVertical ? 'auto' : `${ch.x}px`,
              top: `${ch.y}px`,
              width: `${baseMetrics.cell}px`,
              height: `${baseMetrics.cell}px`,
              borderBottom: settings.isVertical ? 'none' : '2px wavy red',
              borderLeft: settings.isVertical ? '2px wavy red' : 'none',
              opacity: 0.7,
              pointerEvents: 'none',
            }} />
          ))}
        </div>
      )}

      <textarea
        lang="ja"
        ref={textareaRef}
        className={`native-grid-editor ${paperClass}`}
        defaultValue={initialDisplayValue}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onCopy={handleCopy}
        onCut={handleCut}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={(e) => {
          if (ghostText) {
            if (e.key === 'Tab') {
              e.preventDefault();
              // Accept Ghost Text（★ localOnChange → 差分更新）
              const ta = textareaRef.current;
              const start = ta.selectionStart;
              const val = fromEditorDisplay(ta.value, settings.isVertical, settings.showWhitespace);
              const newValue = val.slice(0, start) + ghostText + val.slice(start);
              const newCursor = start + ghostText.length;
              pushHistory(localTextRef.current, newValue, newCursor);
              applyText(newValue, newCursor);
              appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
              setGhostText('');
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setGhostText('');
              return;
            }
            // Any other key acts normally but clears ghost text (via App or here)
            // App.jsx effect clears it on text change.
            // But for navigation keys (Arrow), we might want to clear it too?
            // Request says "Any other keypress: clear ghost text."
            if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
              setGhostText('');
            }
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const ta = textareaRef.current;
            const selected = ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) : '';
            if (onSearchRequested) onSearchRequested(selected);
            return;
          }
          undoKeyDown(e);
        }}
        onScroll={handleCursor}
        onSelect={handleCursor}
        onClick={handleCursor}
        onKeyUp={(e) => {
          handleCursor(e);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const textarea = textareaRef.current;
          const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd;
          setEditorContextMenu({
            x: e.clientX,
            y: e.clientY,
            hasSelection
          });
        }}
        spellCheck={false}
        placeholder="ここから物語を紡ぎましょう..."
        style={textareaStyle}
      />
      {editorContextMenu && ReactDOM.createPortal(
        <div className="context-menu" style={{
          position: 'fixed',
          top: editorContextMenu.y,
          left: editorContextMenu.x,
          zIndex: 99999,
          overflow: 'visible'
        }} onClick={(e) => e.stopPropagation()}>
          <div className="context-menu-item" onClick={() => {
            if (onInsertRuby) onInsertRuby();
            setEditorContextMenu(null);
          }}>
            ルビ挿入
          </div>
          <div className="context-menu-item" onClick={() => {
            if (onInsertLink) onInsertLink();
            setEditorContextMenu(null);
          }}>
            🔗 リンク挿入
          </div>
          {editorContextMenu.hasSelection && (
            <>
              <div style={{ height: '1px', background: 'var(--border-color, #eee)', margin: '4px 0' }}></div>
              {/* Text formatting submenu */}
              <div className="context-menu-item has-submenu" style={{ position: 'relative', overflow: 'visible' }}>
                ✨ 文字整形 ▸
                <div className="format-submenu context-menu" style={{
                  display: 'none',
                  position: 'absolute',
                  left: '100%',
                  top: '-5px',
                  minWidth: '160px',
                  zIndex: 200000,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  backgroundColor: document.body.classList.contains('dark-mode') ? '#2c3e50' : '#ffffff',
                  border: '1px solid var(--border-color, #ccc)',
                  borderRadius: '4px',
                  padding: '4px 0'
                }}>
                  <div className="context-menu-item" onClick={() => {
                    const ta = textareaRef.current;
                    if (!ta) return;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const rawValue = fromEditorDisplay(ta.value, settings.isVertical, settings.showWhitespace);
                    const selected = rawValue.substring(start, end);
                    const cleaned = cleanRuby(selected);
                    const newValue = rawValue.substring(0, start) + cleaned + rawValue.substring(end);
                    const newCursor = start + cleaned.length;
                    pushHistory(localTextRef.current, newValue, start);
                    applyText(newValue, newCursor);
                    appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
                    setEditorContextMenu(null);
                  }}>
                    ルビを削除
                  </div>
                  <div className="context-menu-item" onClick={() => {
                    const ta = textareaRef.current;
                    if (!ta) return;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const rawValue = fromEditorDisplay(ta.value, settings.isVertical, settings.showWhitespace);
                    const selected = rawValue.substring(start, end);
                    const converted = convertToFullWidth(selected);
                    const newValue = rawValue.substring(0, start) + converted + rawValue.substring(end);
                    const newCursor = start + converted.length;
                    pushHistory(localTextRef.current, newValue, start);
                    applyText(newValue, newCursor);
                    appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
                    setEditorContextMenu(null);
                  }}>
                    半角を全角に
                  </div>
                  <div className="context-menu-item" onClick={() => {
                    const ta = textareaRef.current;
                    if (!ta) return;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const rawValue = fromEditorDisplay(ta.value, settings.isVertical, settings.showWhitespace);
                    const selected = rawValue.substring(start, end);
                    const compressed = compressBlankLines(selected);
                    const newValue = rawValue.substring(0, start) + compressed + rawValue.substring(end);
                    const newCursor = start + compressed.length;
                    pushHistory(localTextRef.current, newValue, start);
                    applyText(newValue, newCursor);
                    appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
                    setEditorContextMenu(null);
                  }}>
                    空行を整理
                  </div>
                </div>
              </div>
              <div style={{ height: '1px', background: 'var(--border-color, #eee)', margin: '4px 0' }}></div>
              <div className="context-menu-item" onClick={() => {
                const ta = textareaRef.current;
                if (ta) {
                  const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                  const original = fromEditorDisplay(selected, settings.isVertical, settings.showWhitespace);
                  addToClipboard(original);
                  navigator.clipboard.writeText(original).catch(() => {});
                  // テキストから選択部分を削除
                  const cursorPos = ta.selectionStart;
                  const before = ta.value.substring(0, cursorPos);
                  const after = ta.value.substring(ta.selectionEnd);
                  const newValue = fromEditorDisplay(before + after, settings.isVertical, settings.showWhitespace);
                  pushHistory(localTextRef.current, newValue, cursorPos);
                  applyText(newValue, cursorPos);
                  appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
                }
                setEditorContextMenu(null);
              }}>
                ✂️ 切り取り
              </div>
              <div className="context-menu-item" onClick={() => {
                const ta = textareaRef.current;
                if (ta) {
                  const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                  const original = fromEditorDisplay(selected, settings.isVertical, settings.showWhitespace);
                  addToClipboard(original);
                  navigator.clipboard.writeText(original).catch(() => {
                    document.execCommand('copy');
                  });
                }
                setEditorContextMenu(null);
              }}>
                📋 コピー
              </div>
            </>
          )}
          <div className="context-menu-item" onClick={() => {
            const ta = textareaRef.current;
            if (!ta) { setEditorContextMenu(null); return; }
            navigator.clipboard.readText().then(text => {
              if (!text) { setEditorContextMenu(null); return; }
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const currentVal = ta.value;
              const rawVal = fromEditorDisplay(currentVal, settings.isVertical, settings.showWhitespace);
              const newValue = rawVal.substring(0, start) + text + rawVal.substring(end);
              const newCursor = start + text.length;
              pushHistory(localTextRef.current, newValue, start);
              applyText(newValue, newCursor);
              appNotifyTimerRef.current = setTimeout(() => onChange(newValue), 500);
              addToClipboard(text);
              requestAnimationFrame(() => {
                ta.focus();
              });
            }).catch(() => {
              ta.focus();
            });
            setEditorContextMenu(null);
          }}>
            📌 貼り付け
          </div>
        </div>,
        document.body
      )}

    </div>
  );
});

Editor.displayName = 'Editor';
const MemoEditor = React.memo(Editor);
MemoEditor.displayName = 'Editor';
export default MemoEditor;
