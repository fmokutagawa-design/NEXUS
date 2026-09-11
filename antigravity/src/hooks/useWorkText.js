import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fileSystem, isNative } from '../utils/fileSystem';
import { normalizeManifestFileName, readManifest, loadSegmentTexts } from '../utils/manifest';

/**
 * @typedef {Object} OffsetEntry
 * @property {string} segmentId - セグメントID
 * @property {string} file - ファイル名
 * @property {string} displayName - 表示名
 * @property {number} globalStart - 連結テキスト内の開始位置
 * @property {number} globalEnd - 連結テキスト内の終了位置
 * @property {number} length - セグメントの文字数
 */

/**
 * useWorkText
 *
 * .nexus フォルダ内のファイルを開いている場合に、
 * manifest 順で全章を連結したテキストと offset map を提供する。
 *
 * @param {Object} params
 * @param {*} params.activeFileHandle - 現在開いているファイルのハンドル
 * @param {*} params.projectHandle - プロジェクトルートのハンドル
 * @param {string} params.currentText - 現在エディタに表示されているテキスト
 * @returns {Object}
 */
export function useWorkText({ activeFileHandle, projectHandle, currentText }) {
  const [isNexusFile, setIsNexusFile] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [workTitle, setWorkTitle] = useState('');
  const lastNexusPath = useRef('');
  const currentTextRef = useRef(currentText);
  const [rawSegments, setRawSegments] = useState([]); // ディスクから読んだ生データ
  const [currentFileName, setCurrentFileName] = useState('');
  const [loadFailures, setLoadFailures] = useState([]);

  // currentText が変わるたびに ref を更新（レンダリングは発生しない）
  useEffect(() => {
    currentTextRef.current = currentText;
  }, [currentText]);

  /**
   * activeFileHandle のパスから .nexus フォルダを検出する
   */
  const detectNexusFolder = useCallback(() => {
    if (!activeFileHandle) return { isNexus: false, nexusPath: '', currentFileName: '' };

    let filePath = '';
    if (typeof activeFileHandle === 'string') {
      filePath = activeFileHandle;
    } else if (activeFileHandle.handle) {
      filePath = typeof activeFileHandle.handle === 'string' ? activeFileHandle.handle : '';
    } else if (activeFileHandle.path) {
      filePath = activeFileHandle.path;
    }

    if (!filePath) return { isNexus: false, nexusPath: '', currentFileName: '' };

    // パスに .nexus/ が含まれているか確認
    const nexusMatch = filePath.match(/^(.+\.nexus)[/\\]/);
    if (!nexusMatch) return { isNexus: false, nexusPath: '', currentFileName: '' };

    const nexusPath = nexusMatch[1];
    const currentFileName = filePath.split(/[/\\]/).pop();

    return { isNexus: true, nexusPath, currentFileName };
  }, [activeFileHandle]);

  /**
   * manifest を読み込み、全セグメントを連結する
   */
  const loadWork = useCallback(async () => {
    const { isNexus, nexusPath, currentFileName } = detectNexusFolder();

    if (!isNexus) {
      setIsNexusFile(false);
      setRawSegments([]);
      setCurrentFileName('');
      setManifest(null);
      setWorkTitle('');
      setLoadFailures([]);
      lastNexusPath.current = '';
      return;
    }

    setIsNexusFile(true);
    setIsLoading(true);
    setLoadFailures([]);

    try {
      let nexusDirHandle;
      if (isNative) {
        nexusDirHandle = { handle: nexusPath, name: nexusPath.split(/[/\\]/).pop(), kind: 'directory' };
      } else {
        // Web API: projectHandle から .nexus フォルダを辿る
        const nexusFolderName = nexusPath.split(/[/\\]/).pop();
        const entries = await fileSystem.readDirectory(projectHandle);
        const nexusEntry = entries.find(e => e.name === nexusFolderName && e.kind === 'directory');
        if (!nexusEntry) {
          console.warn('[useWorkText] .nexus folder not found in project');
          setIsLoading(false);
          return;
        }
        nexusDirHandle = nexusEntry.handle || nexusEntry;
      }

      // manifest 読み込み
      const mf = await readManifest(nexusDirHandle);
      if (!mf) {
        console.warn('[useWorkText] manifest.json not found or invalid');
        setLoadFailures([{ file: 'manifest.json', reason: 'not-found-or-invalid' }]);
        setIsLoading(false);
        return;
      }

      setManifest(mf);
      setWorkTitle(mf.title || '');

      // 全セグメントのテキストを読み込み（ディスクから）
      const segments = await loadSegmentTexts(nexusDirHandle, mf);

      // 生データを保存（currentText との合成は useMemo で行う）
      setRawSegments(segments);
      setCurrentFileName(currentFileName);
      lastNexusPath.current = nexusPath;
    } catch (e) {
      console.error('[useWorkText] failed to load work:', e);
      setLoadFailures(Array.isArray(e?.failures) ? e.failures : [{ file: 'manifest.json', reason: e?.message || 'read-failed' }]);
    } finally {
      setIsLoading(false);
    }
  }, [detectNexusFolder, projectHandle]);

  // activeFileHandle が変わったら再読み込み
  useEffect(() => {
    loadWork();
  }, [loadWork]);

  /**
   * rawSegments + currentText から連結テキストと offset map を生成する。
   * currentText が変わるたびにメモリ上で差し替えるだけなので軽い。
   */
  const { computedWorkText, computedOffsetMap } = useMemo(() => {
    if (!rawSegments.length) {
      return { computedWorkText: '', computedOffsetMap: [] };
    }

    // 現在編集中のファイルは Ref から最新（またはデバウンス済み）を取得して差し替え
    const segmentsWithCurrent = rawSegments.map(seg => {
      if (normalizeManifestFileName(seg.file) === normalizeManifestFileName(currentFileName)) {
        return { ...seg, text: currentTextRef.current };
      }
      return seg;
    });

    // 連結テキストと offset map を生成
    let concatenated = '';
    const offsets = [];
    const separator = '\n';

    for (let i = 0; i < segmentsWithCurrent.length; i++) {
      const seg = segmentsWithCurrent[i];
      const globalStart = concatenated.length;

      concatenated += seg.text;

      offsets.push({
        segmentId: seg.id,
        file: seg.file,
        displayName: seg.displayName,
        globalStart,
        globalEnd: concatenated.length,
        length: seg.text.length,
      });

      if (i < segmentsWithCurrent.length - 1) {
        concatenated += separator;
      }
    }

    return { computedWorkText: concatenated, computedOffsetMap: offsets };
  }, [rawSegments, currentFileName, currentText]); // currentText (debounced) が変わったタイミングで再計算する

  /**
   * 連結テキスト内の位置から、元のセグメントファイルとローカル位置を逆引きする。
   * 指示書 I（ジャンプ機能）で使用する。
   *
   * @param {number} globalOffset - 連結テキスト内の文字位置
   * @returns {{ file: string, segmentId: string, localOffset: number } | null}
   */
  const resolveOffset = useCallback((globalOffset) => {
    for (const entry of computedOffsetMap) {
      if (globalOffset >= entry.globalStart && globalOffset < entry.globalEnd) {
        return {
          file: entry.file,
          segmentId: entry.segmentId,
          displayName: entry.displayName,
          localOffset: globalOffset - entry.globalStart,
          nexusPath: lastNexusPath.current,
        };
      }
    }
    // 末尾の場合は最後のセグメント
    if (computedOffsetMap.length > 0) {
      const last = computedOffsetMap[computedOffsetMap.length - 1];
      return {
        file: last.file,
        segmentId: last.segmentId,
        displayName: last.displayName,
        localOffset: last.length,
        nexusPath: lastNexusPath.current,
      };
    }
    return null;
  }, [computedOffsetMap]);

  const getLatestWorkText = useCallback((latestCurrentText) => {
    if (!rawSegments.length) return latestCurrentText ?? currentTextRef.current;
    return rawSegments.map(seg => normalizeManifestFileName(seg.file) === normalizeManifestFileName(currentFileName)
      ? (latestCurrentText ?? currentTextRef.current)
      : seg.text
    ).join('\n');
  }, [rawSegments, currentFileName]);

  const chapterStatuses = useMemo(() => {
    const loaded = new Map(rawSegments.map(segment => [normalizeManifestFileName(segment.file), segment]));
    const failed = new Map(loadFailures.map(failure => [normalizeManifestFileName(failure.file), failure]));
    return (manifest?.segments || []).map(segment => {
      const normalized = normalizeManifestFileName(segment.file);
      const loadedSegment = loaded.get(normalized);
      const failure = failed.get(normalized);
      return {
        ...segment,
        status: failure ? 'error' : loadedSegment ? 'loaded' : isLoading ? 'loading' : 'missing',
        characters: loadedSegment?.text?.length ?? 0,
        reason: failure?.reason || '',
      };
    });
  }, [manifest, rawSegments, loadFailures, isLoading]);

  return {
    isNexusFile,    // 現在のファイルが .nexus 内かどうか
    workText: computedWorkText,       // 連結テキスト（全章）
    workTitle,      // 作品タイトル
    offsetMap: computedOffsetMap,      // offset map 配列
    manifest,       // manifest オブジェクト
    isLoading,      // 読み込み中フラグ
    resolveOffset,  // globalOffset → { file, localOffset } 変換関数
    reloadWork: loadWork, // 手動再読み込み
    getLatestWorkText,
    loadFailures,
    chapterStatuses,
  };
}
