import { useRef, useCallback } from 'react';
import { saveTextFile, loadTextFile } from '../utils/fileUtils';
import { fileSystem, isNative } from '../utils/fileSystem';
import { parseNote } from '../utils/metadataParser';
import { findSegmentEntry, normalizeManifestFileName, readManifest, loadSegmentTexts } from '../utils/manifest';
import { assessSaveEligibility } from '../utils/saveSafety.mjs';

const sameFileName = (left, right) => normalizeManifestFileName(left) === normalizeManifestFileName(right);
const pathEndsWithFile = (path, fileName) => normalizeManifestFileName(path).endsWith(normalizeManifestFileName(fileName));

/**
 * useFileOperations
 * 
 * Handles single-file save/load/duplicate/update and batch operations.
 * Extracted from App.jsx to reduce component size.
 */
export function useFileOperations({
  text,
  setText,
  activeFileHandle,
  setActiveFileHandle,
  projectHandle,
  allMaterialFiles,
  refreshMaterials,
  setLastSaved,
  lastSavedTextRef,
  showToast,
  setFileTree,
  setActiveTab,
  autoOrganizeFile,
  handleCreateFileInProject,
  openInputModal,
  settings,
  editorRef,
  handleLaunchOneDrive,
  requestConfirm,
  latestMetadataRef,
  setDebouncedText,
  setCursorPosition,
  setIsProjectMode,
  saveProjectHandle,
  setProjectHandle,
  setUsageStats,
  activeFileHandleRef,
  externalConflictRef,
  onExternalConflict,
  baselineFileHandleRef,
  saveReviewGateRef,
  onSaveBlocked,
  onFileBaselineEstablished,
}) {
  const handleSaveFileRef = useRef(null);
  const isSavingRef = useRef(false);

  const handleSaveFile = useCallback(async () => {
    if (isSavingRef.current) return false;
    if (externalConflictRef?.current) {
      showToast('⚠️ 外部更新を検知しています。再読込するまで保存しません。');
      return false;
    }
    if (activeFileHandle && projectHandle) {
      const eligibility = assessSaveEligibility({
        activeFileHandle,
        baselineFileHandle: baselineFileHandleRef?.current,
        reviewGate: saveReviewGateRef?.current,
      });
      if (!eligibility.allowed) {
        onSaveBlocked?.(eligibility.reason);
        showToast(eligibility.reason === 'review-required'
          ? '⚠️ 復元内容の確認が終わるまで保存しません。'
          : '⚠️ この本文の保存先を安全に確認できないため、保存しません。');
        return false;
      }
    }
    isSavingRef.current = true;
    try {
      if (activeFileHandle && projectHandle) {
        const { metadata } = parseNote(text);
        const options = {
          disableJournal: settings?.enableJournaling === false,
          expectedContent: lastSavedTextRef.current,
        };
        await fileSystem.writeFile(activeFileHandle, text, options);

        // Trigger Auto-Organize
        const newHandle = await autoOrganizeFile(activeFileHandle, metadata);
        if (newHandle && (newHandle !== activeFileHandle)) {
          setActiveFileHandle(newHandle);
          await refreshMaterials();
        }
        setLastSaved(new Date());
        lastSavedTextRef.current = text;
        if (baselineFileHandleRef) baselineFileHandleRef.current = newHandle || activeFileHandle;
        showToast('💾 保存しました');
        return true;
      } else {
        // Fallback to download
        saveTextFile(text);
        return true;
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      if (String(error?.message || error).includes('EXTERNAL_MODIFICATION')) {
        if (externalConflictRef) externalConflictRef.current = true;
        try {
          const externalText = await fileSystem.readFile(activeFileHandle);
          onExternalConflict?.({ fileHandle: activeFileHandle, nexusText: text, externalText });
        } catch (readError) {
          console.error('Failed to read externally updated file:', readError);
        }
        showToast('🚨 Codexなどによる外部更新を検知しました。NEXUSからの保存を停止しました。');
      } else {
        showToast('ファイルの保存に失敗しました。');
      }
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [text, activeFileHandle, projectHandle, autoOrganizeFile, setActiveFileHandle, refreshMaterials, setLastSaved, lastSavedTextRef, showToast, settings?.enableJournaling, externalConflictRef, onExternalConflict, baselineFileHandleRef, saveReviewGateRef, onSaveBlocked]);

  // Keep ref in sync
  handleSaveFileRef.current = handleSaveFile;

  const handleUpdateFile = useCallback(async (handle, newContent) => {
    try {
      const options = { disableJournal: settings?.enableJournaling === false };
      await fileSystem.writeFile(handle, newContent, options);
      await refreshMaterials();

      // Bug K 対策: ブラウザ版のハンドル比較に対応
      const isSame = async (h1, h2) => {
        if (!h1 || !h2) return false;
        if (isNative) {
          const p1 = typeof h1 === 'string' ? h1 : h1.handle;
          const p2 = typeof h2 === 'string' ? h2 : h2.handle;
          return p1 === p2;
        }
        if (h1 === h2) return true;
        if (h1.isSameEntry) return await h1.isSameEntry(h2);
        return false;
      };

      if (await isSame(activeFileHandle, handle)) {
        setText(newContent);
        lastSavedTextRef.current = newContent; // 同期
      }
      return true;
    } catch (e) {
      console.error("Failed to update file:", e);
      return false;
    }
  }, [activeFileHandle, setText, refreshMaterials, lastSavedTextRef, settings?.enableJournaling]);

  const handleLoadFile = useCallback(async (file) => {
    try {
      const content = await loadTextFile(file);
      setText(content);
    } catch (error) {
      console.error('Failed to load file:', error);
      showToast('ファイルの読み込みに失敗しました。\n' + error.message);
    }
  }, [setText, showToast]);

  const handleOpenFile = useCallback(async (fileHandle, fileName, options = {}) => {
    try {
      let targetHandle = fileHandle;
      if (!targetHandle && fileName && allMaterialFiles) {
        const found = allMaterialFiles.find(f => sameFileName(f.name, fileName) || (f.handle && typeof f.handle === 'string' && pathEndsWithFile(f.handle, fileName)));
        if (found) {
          targetHandle = found.handle;
        } else {
          const foundTxt = allMaterialFiles.find(f => f.name === `${fileName}.txt`);
          if (foundTxt) targetHandle = foundTxt.handle;
        }
      }

      if (!targetHandle) {
        console.warn(`File not found: ${fileName} (handle is null)`);
        showToast(`ファイル "${fileName}" が見つかりませんでした。`);
        return;
      }

      // デバッグログ: 開こうとしている項目の詳細
      const name = fileName || (typeof targetHandle === 'string' ? targetHandle : targetHandle.name);
      console.log('[handleOpenFile] Opening:', { name, type: typeof targetHandle, targetHandle });

      // .nexus フォルダ（プロジェクト）の場合はプロジェクトを切り替える
      // 文字列パス（Electron）またはオブジェクト名から判定
      const cleanPath = typeof targetHandle === 'string' ? targetHandle.replace(/[/\\]$/, '') : '';
      const isNexusFolder = (cleanPath.toLowerCase().endsWith('.nexus')) || 
                            (name && name.toLowerCase().endsWith('.nexus'));

      if (isNexusFolder) {
          console.log('[handleOpenFile] Recognized as .nexus folder. Switching project...');
          try {
              if (setProjectHandle) setProjectHandle(targetHandle);
              if (saveProjectHandle) saveProjectHandle(targetHandle);
              if (setIsProjectMode) setIsProjectMode(true);
              const folderName = typeof targetHandle === 'string' ? targetHandle.split(/[/\\]/).pop() : targetHandle.name;
              showToast(`プロジェクト "${folderName}" を開きました。`);
              return;
          } catch (e) {
              console.error('[handleOpenFile] Failed to switch project:', e);
              // プロジェクト切り替え失敗時は続行せずエラー表示
              throw e; 
          }
      }

      // 通常のファイル読み込み
      const content = await fileSystem.readFile(targetHandle);
      if (externalConflictRef) externalConflictRef.current = false;
      if (activeFileHandleRef) activeFileHandleRef.current = targetHandle;
      setText(content);
      if (setDebouncedText) setDebouncedText(content);
      lastSavedTextRef.current = content;
      if (baselineFileHandleRef) baselineFileHandleRef.current = targetHandle;
      if (saveReviewGateRef) saveReviewGateRef.current = null;
      onFileBaselineEstablished?.();
      // Bug A 対策: ファイル読み込み時に最新メタデータを Ref に保持する
      const { metadata } = parseNote(content);
      if (latestMetadataRef) latestMetadataRef.current = metadata;
      setActiveFileHandle(targetHandle);
      setActiveTab('editor');

      try {
        const usageKey = `file_usage_${projectHandle ? (typeof projectHandle === 'string' ? projectHandle : projectHandle.name) : 'default'}`;
        let filePath = fileName;
        if (options.path) {
          filePath = options.path;
        } else {
          const matched = allMaterialFiles.find(f => sameFileName(f.name, fileName));
          if (matched) filePath = matched.path;
        }

        if (setUsageStats) {
          setUsageStats(prev => {
            const newStats = { ...prev, [filePath]: (prev[filePath] || 0) + 1 };
            localStorage.setItem(usageKey, JSON.stringify(newStats));
            return newStats;
          });
        }
      } catch (e) {
        console.error('Failed to track usage:', e);
      }

      if (options.position !== undefined && editorRef?.current) {
        setTimeout(() => {
          if (editorRef.current && editorRef.current.setCursorPosition) {
            editorRef.current.setCursorPosition(options.position);
          }
        }, 100);
      }
      return { fileHandle: targetHandle, fileName: name, content };
    } catch (error) {
      console.error('Failed to open file:', error);
      if (error.message === 'CLOUD_SYNC_TIMEOUT') {
        const launch = await requestConfirm(
          '同期タイムアウト',
          'OneDrive 等のクラウド同期が遅延している可能性があります。OneDrive を起動しますか？'
        );
        if (launch && handleLaunchOneDrive) {
          handleLaunchOneDrive();
        }
      } else {
        showToast(`ファイルを開けませんでした: ${error.message || error}`);
      }
    }
  }, [allMaterialFiles, projectHandle, showToast, setText, setDebouncedText, lastSavedTextRef, latestMetadataRef, setActiveFileHandle, setActiveTab, setUsageStats, editorRef, requestConfirm, handleLaunchOneDrive, setProjectHandle, saveProjectHandle, setIsProjectMode, activeFileHandleRef, externalConflictRef, baselineFileHandleRef, saveReviewGateRef, onFileBaselineEstablished]);

  const handleOpenSegmentFile = useCallback(async (fileName, localOffset, nexusPath = '') => {
    const normalizedNexusPath = String(nexusPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    // まず既存の allMaterialFiles から検索
    const found = allMaterialFiles?.find(f =>
      (sameFileName(f.name, fileName) || (f.handle && typeof f.handle === 'string' && pathEndsWithFile(f.handle, fileName))) &&
      (!normalizedNexusPath || String(f.handle || f.path || '').replace(/\\/g, '/').includes(`${normalizedNexusPath}/`))
    );

    if (found) {
      return await handleOpenFile(found.handle, fileName, { position: localOffset, path: found.path });
    } else {
      // フォールバック: .nexus/segments/ から直接読み込む
      try {
        const entries = await fileSystem.readDirectory(projectHandle);
        let loaded = false;
        const targetNexusName = normalizedNexusPath.split('/').pop();

        for (const entry of (entries || [])) {
          if (entry.kind === 'directory' && entry.name.endsWith('.nexus') && (!targetNexusName || entry.name === targetNexusName)) {
            const nexusDirHandle = entry.handle || entry;
            const nexusEntries = await fileSystem.readDirectory(nexusDirHandle);
            const segDir = nexusEntries.find(e => e.name === 'segments' && e.kind === 'directory');

            if (segDir) {
              const segDirHandle = segDir.handle || segDir;
              const segEntries = await fileSystem.readDirectory(segDirHandle);
              const targetFile = findSegmentEntry(segEntries, fileName);

              if (targetFile) {
                const fileHandle = targetFile.handle || targetFile;
                const opened = await handleOpenFile(fileHandle, fileName, { position: localOffset });
                loaded = true;
                return opened;
              }
            }
          }
        }

        if (!loaded) {
          showToast(`ファイル "${fileName}" が見つかりません`);
          return;
        }
      } catch (e) {
        console.error('[openSegmentFile] fallback failed:', e);
        showToast(`ファイルを開けませんでした: ${e.message}`);
        return;
      }
    }

  }, [handleOpenFile, allMaterialFiles, projectHandle, showToast]);


  const handleDuplicateFile = useCallback(async (handleToDup = activeFileHandle) => {
    if (!handleToDup) return;

    let contentToSave = text;
    if (handleToDup !== activeFileHandle) {
      try {
        contentToSave = await fileSystem.readFile(handleToDup);
      } catch (err) {
        console.error("Failed to read file for duplication", err);
      }
    }

    const currentName = typeof handleToDup === 'string'
      ? handleToDup.split(/[/\\]/).pop()
      : handleToDup.name;
    const extIndex = currentName.lastIndexOf('.');
    const baseName = extIndex !== -1 ? currentName.substring(0, extIndex) : currentName;
    const ext = extIndex !== -1 ? currentName.substring(extIndex) : '.txt';
    const defaultNewName = `${baseName}_copy${ext}`;

    try {
      if (isNative) {
        const currentPath = typeof handleToDup === 'string' ? handleToDup : null;
        let defaultPath = defaultNewName;
        if (currentPath) {
          const sep = currentPath.includes('\\') ? '\\' : '/';
          const parentDir = currentPath.substring(0, currentPath.lastIndexOf(sep));
          defaultPath = `${parentDir}${sep}${defaultNewName} `;
        }

        const newPath = await fileSystem.saveFile(defaultPath);
        if (!newPath) return; // Cancelled

        await fileSystem.writeFile(newPath, contentToSave, {
          disableJournal: settings?.enableJournaling === false
        });

        const projectPath = typeof projectHandle === 'string' ? projectHandle : projectHandle?.handle;
        if (projectPath) {
          await refreshMaterials();
        }

        // handleFileSelect equivalent
        const fileName = newPath.split(/[/\\]/).pop();
        await handleOpenFile(newPath, fileName);
        showToast(`「${fileName}」として保存しました。`);

      } else if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultNewName,
          types: [{
            description: 'Text Files',
            accept: { 'text/plain': ['.txt'] },
          }],
        });
        const writable = await handle.createWritable();
        // Bug L 修正: text ではなく contentToSave を使う
        await writable.write(contentToSave);
        await writable.close();

        setActiveFileHandle(handle);
        if (projectHandle) await refreshMaterials();
        showToast('保存しました。');
      } else {
        openInputModal('保存', '新しいファイル名を入力してください:', defaultNewName, async (newName) => {
          if (!newName) return;
          // Bug L 修正: text ではなく contentToSave を使う
          await handleCreateFileInProject(null, newName, contentToSave, {
            disableJournal: settings?.enableJournaling === false
          });
          showToast('プロジェクトルートに保存しました（ブラウザ制限のため場所指定不可）。');
        });
        return;
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        showToast('保存に失敗しました。');
      }
    }
  }, [text, activeFileHandle, projectHandle, refreshMaterials, showToast, handleOpenFile, handleCreateFileInProject, openInputModal, setActiveFileHandle]);

  const handleBatchCopy = useCallback(async (filesToCopy) => {
    if (!filesToCopy || filesToCopy.length === 0) return;

    let clipboardText = "以下の資料を参考にしてください:\n\n";

    for (const file of filesToCopy) {
      const body = file.body || file.content || "";
      clipboardText += `## Filename: ${file.name}\n${body}\n\n---\n\n`;
    }

    try {
      await navigator.clipboard.writeText(clipboardText);
      showToast(`${filesToCopy.length} 件のファイルをクリップボードにコピーしました！`);
    } catch (e) {
      console.error("Copy failed", e);
      showToast("コピーに失敗しました。");
    }
  }, [showToast]);

  const handleBatchExport = useCallback(async () => {
    if (!allMaterialFiles || allMaterialFiles.length === 0) {
      showToast('プロジェクトファイルがありません。');
      return;
    }
    try {
      // === manifest 検出: .nexus フォルダがあれば manifest 順で結合 ===
      let manifestMerged = null;
      try {
        if (projectHandle) {
          const entries = await fileSystem.readDirectory(projectHandle);
          const nexusFolders = (entries || []).filter(
            e => e.kind === 'directory' && e.name.endsWith('.nexus')
          );

          if (nexusFolders.length > 0) {
            // .nexus フォルダが見つかった場合、各フォルダの manifest を読む
            const allParts = [];
            let totalFiles = 0;

            for (const folder of nexusFolders) {
              const dirHandle = folder.handle || folder;
              const mf = await readManifest(dirHandle);
              if (!mf) continue;

              const segments = await loadSegmentTexts(dirHandle, mf);
              for (const seg of segments) {
                if (seg.text && seg.text.trim()) {
                  allParts.push(seg.text);
                  totalFiles++;
                }
              }
            }

            if (allParts.length > 0) {
              manifestMerged = {
                text: allParts.join('\n\n［＃改ページ］\n\n'),
                count: totalFiles,
              };
            }
          }
        }
      } catch (manifestErr) {
        console.error('[batchExport] manifest export aborted:', manifestErr);
        showToast(`作品の構成ファイルを確認できないため、書き出しを中止しました。${manifestErr.message ? ` ${manifestErr.message}` : ''}`, 'error');
        return;
      }

      // manifest から結合できた場合はそれを使う
      if (manifestMerged) {
        const merged = manifestMerged.text;
        const count = manifestMerged.count;

        if (isNative) {
          const defaultPath = (projectHandle?.handle || projectHandle || '') + '/exported.txt';
          const savePath = await fileSystem.saveFile(defaultPath);
          if (savePath) {
            await fileSystem.writeFile({ handle: savePath, name: 'exported.txt' }, merged, {
              disableJournal: settings?.enableJournaling === false
            });
            showToast(`${count}ファイルを manifest 順で結合して書き出しました。`);
          }
        } else {
          const blob = new Blob([merged], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'exported.txt';
          a.click();
          URL.revokeObjectURL(url);
          showToast(`${count}ファイルを manifest 順で結合して書き出しました。`);
        }
        return; // manifest 結合成功 → 従来ロジックをスキップ
      }

      // 原稿ファイルを収集
      const manuscriptFiles = allMaterialFiles.filter(f => {
        const type = f.metadata?.種別 || '';
        const name = f.name || '';
        const isManuscript = type === '原稿' || name.includes('原稿') || name.includes('本原稿');
        return isManuscript && name.endsWith('.txt');
      });
      const targetFiles = manuscriptFiles.length > 0 ? manuscriptFiles : allMaterialFiles.filter(f => (f.name || '').endsWith('.txt'));
      if (targetFiles.length === 0) {
        showToast('書き出し対象のファイルが見つかりません。');
        return;
      }
      // ファイル名順にソート
      targetFiles.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
      // 結合
      const parts = [];
      for (const file of targetFiles) {
        const content = file.body || file.content || '';
        if (content.trim()) {
          parts.push(content);
        }
      }
      const merged = parts.join('\n\n［＃改ページ］\n\n');
      // 保存
      if (isNative) {
        const defaultPath = (projectHandle?.handle || projectHandle || '') + '/exported.txt';
        const savePath = await fileSystem.saveFile(defaultPath);
        if (savePath) {
          await fileSystem.writeFile({ handle: savePath, name: 'exported.txt' }, merged, {
            disableJournal: settings?.enableJournaling === false
          });
          showToast(`${targetFiles.length}ファイルを結合して書き出しました。`);
        }
      } else {
        const blob = new Blob([merged], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exported.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast(`${targetFiles.length}ファイルを結合して書き出しました。`);
      }
    } catch (e) {
      console.error('Batch export failed:', e);
      showToast('一括書き出しに失敗しました: ' + e.message);
    }
  }, [allMaterialFiles, projectHandle, showToast]);


  return {
    handleSaveFile,
    handleSaveFileRef,
    handleUpdateFile,
    handleLoadFile,
    handleDuplicateFile,
    handleBatchCopy,
    handleBatchExport,
    handleOpenFile,
    handleOpenSegmentFile,
  };
}
