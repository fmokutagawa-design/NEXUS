import { useEffect, useRef } from 'react';
import { fileSystem } from '../utils/fileSystem';
import { saveSnapshot } from '../utils/snapshotStore';
import { perfNow, perfMeasure } from '../utils/perfProbe';
import { isAutoSaveJobCurrent } from '../utils/autoSaveSafety.mjs';
import { sameFileTarget } from '../utils/readerEditSession.mjs';
import { assessSaveEligibility } from '../utils/saveSafety.mjs';

/**
 * useAutoSave
 * 
 * Handles auto-saving to active file in project mode,
 * periodic snapshot creation, and nexus-project.json loading.
 */
export function useAutoSave({
  text,
  debouncedText,
  isProjectMode,
  activeFileHandle,
  projectHandle,
  setLastSaved,
  lastSavedTextRef,
  setProjectSettings,
  activeFileHandleRef,
  debouncedTextRef,
  settings, // 追加
  showToast,
  externalConflictRef,
  onExternalConflict,
  baselineFileHandleRef,
  saveReviewGateRef,
}) {
  // Auto-save to active file in project mode
  // ★ debouncedText は Editor(500ms) + App(500ms) で既に約1秒遅延済み
  //    さらに setTimeout を挟んで節電する。
  //    スロットル方式: debouncedText 変更で即保存、ただし前回から規定時間未満ならスキップ
  //
  //    旧仕様は 1 秒スロットルだったが、42万字クラスのファイルだと
  //    IPC 経由の writeFile 自体が数百ms〜数秒かかり、打鍵のたびに
  //    IPC キューが詰まってメインスレッドが長時間ブロックされる。
  //    このため「十分な休憩」を与える長いスロットルに変更する。
  const lastSaveTimeRef = useRef(0);
  useEffect(() => {
    if (!isProjectMode || !activeFileHandle || debouncedText === undefined) return;
    if (externalConflictRef?.current) return;
    if (!assessSaveEligibility({
      activeFileHandle,
      baselineFileHandle: baselineFileHandleRef?.current,
      reviewGate: saveReviewGateRef?.current,
    }).allowed) return;
    // ★ 安全策: 空文字列での保存を禁止（ファイル消失防止）
    if (!debouncedText || debouncedText.length === 0) return;
    // ★ 同一内容なら保存しない（無駄な I/O 回避）
    if (debouncedText === lastSavedTextRef.current) return;

    // 保存対象と本文を一組で固定する。ファイル切替後にRefを個別に読むと、
    // 別章のハンドルと本文が混ざる可能性がある。
    const saveJob = {
      fileHandle: activeFileHandle,
      text: debouncedText,
      expectedContent: lastSavedTextRef.current,
    };

    // ★ ファイルサイズに応じてスロットルを変える。
    //    大きいファイルは I/O コストが高く、またクラッシュ復旧も手動で再読込すれば済む。
    //    10万字超: 10秒、20万字超: 20秒、それ以外: 5秒
    const len = debouncedText.length;
    let throttleMs;
    if (len > 200000) throttleMs = 20000;
    else if (len > 100000) throttleMs = 10000;
    else throttleMs = 5000;

    const now = Date.now();
    const elapsed = now - lastSaveTimeRef.current;

    const doSave = async () => {
      const tStart = perfNow();
      if (!isAutoSaveJobCurrent(saveJob, activeFileHandleRef.current, debouncedTextRef.current)) {
        perfMeasure('useAutoSave.doSave', tStart, { ok: false, skipped: 'stale-job' });
        return;
      }

      try {
        // ジャーナリング設定を反映
        const options = {
          disableJournal: settings?.enableJournaling === false,
          expectedContent: saveJob.expectedContent,
        };

        await fileSystem.writeFile(saveJob.fileHandle, saveJob.text, options);
        if (sameFileTarget(saveJob.fileHandle, activeFileHandleRef.current)) {
          setLastSaved(new Date());
          lastSavedTextRef.current = saveJob.text;
        }
        lastSaveTimeRef.current = Date.now();
        perfMeasure('useAutoSave.doSave', tStart, {
          ok: true,
          textLength: saveJob.text.length,
          throttleMs,
          elapsed,
        });
      } catch (error) {
        perfMeasure('useAutoSave.doSave', tStart, {
          ok: false,
          textLength: saveJob.text.length,
          throttleMs,
          elapsed,
          error: String(error),
        });
        console.error('Failed to auto-save:', error);
        if (String(error?.message || error).includes('EXTERNAL_MODIFICATION')) {
          if (externalConflictRef) externalConflictRef.current = true;
          try {
            const externalText = await fileSystem.readFile(saveJob.fileHandle);
            onExternalConflict?.({ fileHandle: saveJob.fileHandle, nexusText: saveJob.text, externalText });
          } catch (readError) {
            console.error('Failed to read externally updated file:', readError);
          }
          showToast('🚨 外部更新を検知したため、自動保存を停止しました。NEXUSの本文は画面内に保持しています。');
        } else {
          showToast('⚠️ 自動保存に失敗しました');
        }
      }
    };

    if (elapsed >= throttleMs) {
      // 前回保存から規定時間経過 → 即保存
      doSave();
    } else {
      // 前回保存から規定時間未満 → 残り時間後に保存
      const timer = setTimeout(doSave, throttleMs - elapsed);
      return () => clearTimeout(timer);
    }
  }, [debouncedText, isProjectMode, activeFileHandle, setLastSaved, lastSavedTextRef, showToast, activeFileHandleRef, debouncedTextRef, settings?.enableJournaling, externalConflictRef, onExternalConflict, baselineFileHandleRef, saveReviewGateRef]);

  // Auto-snapshot: 5分間隔 or 500文字以上の変更で自動スナップショット
  const lastSnapshotRef = useRef({ text: '', time: 0 });

  useEffect(() => {
    if (!isProjectMode || !activeFileHandle || !debouncedText) return;

    const filePath = typeof activeFileHandle === 'string'
      ? activeFileHandle
      : (activeFileHandle.handle || activeFileHandle.name || 'unknown');

    const INTERVAL = 5 * 60 * 1000; // 5分
    const CHAR_THRESHOLD = 500;

    const timer = setInterval(() => {
      const now = Date.now();
      const lastText = lastSnapshotRef.current.text;
      const lastTime = lastSnapshotRef.current.time;

      // Bug G, H 対策: closure の debouncedText ではなく Ref の最新値を使う
      const currentText = debouncedTextRef.current;
      if (!currentText) return;

      const charDiff = Math.abs(currentText.length - lastText.length);
      const timeDiff = now - lastTime;

      if (timeDiff >= INTERVAL || charDiff >= CHAR_THRESHOLD) {
        if (currentText !== lastText) {
          const snapT0 = perfNow();
          saveSnapshot(filePath, currentText, currentText.length)
            .then(() => {
              perfMeasure('useAutoSave.snapshot.tick', snapT0, { len: currentText.length });
            })
            .catch(e => {
              perfMeasure('useAutoSave.snapshot.tick.fail', snapT0, { error: String(e) });
              console.warn('Snapshot save failed:', e);
            });
          lastSnapshotRef.current = { text: currentText, time: now };
        }
      }
    }, 30000); // 30秒ごとにチェック

    return () => clearInterval(timer);
  }, [debouncedText, isProjectMode, activeFileHandle, debouncedTextRef]);

  // ファイル切替時にスナップショットの基準をリセット＋初回保存
  useEffect(() => {
    lastSnapshotRef.current = { text: text || '', time: Date.now() };
    if (isProjectMode && activeFileHandle && text) {
      const fp = typeof activeFileHandle === 'string'
        ? activeFileHandle
        : (activeFileHandle.handle || activeFileHandle.name || '');
      if (fp) {
        saveSnapshot(fp, text, text.length).catch(e =>
          console.warn('Initial snapshot failed:', e)
        );
      }
    }
  }, [activeFileHandle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load nexus-project.json when project opens
  useEffect(() => {
    if (!projectHandle) return;
    (async () => {
      try {
        const settingsHandle = await fileSystem.getFile(projectHandle, 'nexus-project.json');
        if (settingsHandle) {
          const content = await fileSystem.readFile(settingsHandle);
          const parsed = JSON.parse(content);
          setProjectSettings(prev => ({ ...prev, ...parsed }));
        }
      } catch {
        console.log('nexus-project.json not found, will create on first settings save');
      }
    })();
  }, [projectHandle, setProjectSettings]);
}
