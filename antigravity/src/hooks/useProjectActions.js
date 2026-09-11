import { useState, useEffect, useCallback } from 'react';
import { fileSystem, isNative } from '../utils/fileSystem';
import { saveProjectHandle, clearProjectHandle } from '../utils/indexedDBUtils';
import { parseNote, serializeNote } from '../utils/metadataParser';

/**
 * useProjectActions
 *
 * Project-level CRUD operations: open, create, rename, move, delete projects and files/folders,
 * plus project replace, card creation, navigation, reference panel control, and auto-organize.
 */
export function useProjectActions({
  text,
  setText,
  projectHandle,
  setProjectHandle,
  fileTree,
  setFileTree,
  activeFileHandle,
  setActiveFileHandle,
  isProjectMode,
  setIsProjectMode,
  projectSettings,
  setProjectSettings,
  debouncedText,
  savedProjectHandle,
  setSavedProjectHandle,
  allMaterialFiles,
  refreshMaterials,
  showToast,
  requestConfirm,
  openInputModal,
  handleOpenFile,
  handlePopOutTab,
  editorRef,
  setActiveTab,
  setShowReference,
  setReferenceContent,
  setReferenceFileName,
  textRef, // 追加
  latestMetadataRef, // 追加
  lastSavedTextRef, // 追加
}) {
  // Save project settings helper
  const saveProjectSettings = useCallback(async (newSettings) => {
    const updated = { ...projectSettings, ...newSettings };
    setProjectSettings(updated);
    if (projectHandle) {
      try {
        const handle = await fileSystem.getOrCreateFile(projectHandle, 'nexus-project.json');
        await fileSystem.writeFile(handle, JSON.stringify(updated, null, 2));
      } catch (e) {
        console.warn('Could not save nexus-project.json:', e);
      }
    }
  }, [projectHandle, projectSettings, setProjectSettings]);

  // --- Auto-organize ---
  const autoOrganizeFile = useCallback(async (handle, metadata) => {
    if (!handle || !projectHandle) return handle;

    const type = metadata.種別 || "";
    const tags = metadata.tags || [];
    let targetFolder = "";

    const isCharacter = type === '登場人物' || tags.includes('Character') || tags.includes('キャラ');
    const isOrganization = type === '組織' || tags.includes('Organization') || tags.includes('組織');
    const isWorld = type === '世界観' || tags.includes('World') || tags.includes('世界');
    const isGadget = type === 'ガジェット' || tags.includes('Gadget');
    const isItem = type === '用語' || type === 'アイテム' || tags.includes('Item') || tags.includes('アイテム');
    const isLocation = type === '地理' || type === '場所' || tags.includes('Location') || tags.includes('地理') || tags.includes('場所');
    const isEvent = type === '事件' || type === 'イベント' || tags.includes('Event') || tags.includes('事件') || tags.includes('イベント');
    const isPlot = type === 'プロット' || tags.includes('Plot');
    const isTimeline = type === '時系列' || tags.includes('Timeline') || tags.includes('History') || tags.includes('年表');
    const isManuscript = type === '原稿' || tags.includes('Manuscript') || tags.includes('Draft');

    if (isCharacter) targetFolder = 'characters';
    else if (isOrganization) targetFolder = 'organizations';
    else if (isWorld) targetFolder = 'world';
    else if (isGadget) targetFolder = 'gadgets';
    else if (isItem) targetFolder = 'items';
    else if (isLocation) targetFolder = 'locations';
    else if (isEvent) targetFolder = 'events';
    else if (isPlot) targetFolder = 'plots';
    else if (isTimeline) targetFolder = 'timelines';
    else if (isManuscript) targetFolder = 'manuscripts';

    if (targetFolder) {
      try {
        const pathParts = await fileSystem.resolvePath(projectHandle, handle);
        if (pathParts) {
          const currentRoot = pathParts[0];

          let isInCorrectFolder = false;
          if (pathParts.length > 1) {
            isInCorrectFolder = (currentRoot === targetFolder);
          }

          if (!isInCorrectFolder) {
            console.log(`Auto-organizing: Moving ${handle.name} to ${targetFolder}`);

            const targetDirHandle = await fileSystem.createFolder(projectHandle, targetFolder);

            let sourceDirHandle = projectHandle;
            if (pathParts.length > 1) {
              const parentParts = pathParts.slice(0, -1);
              sourceDirHandle = await fileSystem.getDirectoryHandleFromPath(projectHandle, parentParts);
            }

            const newHandle = await fileSystem.moveFileWithContext(handle, sourceDirHandle, targetDirHandle);
            return newHandle;
          }
        } else {
          console.warn("Path resolution failed");
        }
      } catch (e) {
        console.error("Auto-organize failed", e);
        showToast(`自動移動エラー: ${e.message}`);
      }
    }
    return handle;
  }, [projectHandle, showToast]);

  // --- Project open/create ---
  const handleOpenProject = useCallback(async () => {
    if (!isNative && !window.showDirectoryPicker) {
      showToast('お使いのブラウザはフォルダ機能に対応していません。\nChrome、Edge、Operaをお使いください。');
      return;
    }

    try {
      const dirHandle = await fileSystem.openProjectDialog();
      if (!dirHandle) return;

      setProjectHandle(dirHandle);

      try {
        await saveProjectHandle(dirHandle);
      } catch (e) { console.warn("Could not save project handle to DB", e); }
    } catch (error) {
      console.error('Failed to open project:', error);
      showToast('プロジェクトフォルダを開けませんでした。');
    }
  }, [showToast, setProjectHandle]);

  const handleFileSelect = useCallback(async (fileHandle) => {
    try {
      const fileName = (typeof fileHandle === 'string')
        ? fileHandle.split(/[/\\]/).pop()
        : fileHandle.name;

      await handleOpenFile(fileHandle, fileName);
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }, [handleOpenFile]);

  const handleCreateNewProject = useCallback(async () => {
    if (!isNative && !window.showDirectoryPicker) {
      showToast('お使いのブラウザはフォルダ機能に対応していません。\nChrome、Edge、Operaをお使いください。');
      return;
    }

    const confirmed = await requestConfirm(
      '新規プロジェクト作成',
      '新規プロジェクトを作成します。\n\n' +
      '手順:\n' +
      '1. Finderで新しいフォルダを作成してください\n' +
      '2. 「OK」を押すと、そのフォルダを選択する画面が開きます\n' +
      '3. 作成したフォルダを選択してください\n' +
      '4. アプリが自動的に初期ファイルを作成します\n\n' +
      '続けますか？'
    );

    if (!confirmed) return;

    try {
      const dirHandle = await fileSystem.openProjectDialog();
      if (!dirHandle) return;

      const welcomeContent =
        '# 新規プロジェクトへようこそ\n\n' +
        'このフォルダがあなたの小説プロジェクトです。\n' +
        'サブフォルダを作成して章ごとに整理したり、\n' +
        '複数のテキストファイルを自由に管理できます。\n\n' +
        '左のファイルツリーから編集したいファイルを選択してください。\n' +
        'すべてのファイルは自動的に保存されます。';

      const welcomeFile = await fileSystem.createFile(dirHandle, 'はじめに.txt', welcomeContent);

      setProjectHandle(dirHandle);
      try {
        await saveProjectHandle(dirHandle);
      } catch (err) {
        console.warn("Could not save project handle to DB", err);
      }

      setActiveFileHandle(welcomeFile);
      setText(welcomeContent);

      showToast('プロジェクトを作成しました！\n「はじめに.txt」を開いています。');
    } catch (error) {
      console.error('Failed to create project:', error);
      showToast('プロジェクトの作成に失敗しました。');
    }
  }, [showToast, requestConfirm, setProjectHandle, setActiveFileHandle, setText]);

  const handleCreateFileInProject = useCallback(async (parentHandleArg, fileName, initialContent = null) => {
    console.log('handleCreateFileInProject CALLED', { parentHandleArg, fileName });
    const parentHandle = parentHandleArg || projectHandle;

    console.log("Create File Request:", { parentHandleArg, projectHandle, parentHandle, fileName });

    if (!projectHandle) {
      showToast("プロジェクトフォルダが開かれていません。");
      return;
    }

    try {
      let contentToWrite = '';
      if (initialContent !== null) {
        contentToWrite = initialContent;
      } else {
        try {
          const isRoot = (typeof projectHandle === 'string')
            ? (parentHandle === projectHandle || (parentHandle.handle && parentHandle.handle === projectHandle.handle))
            : (parentHandle === projectHandle || (parentHandle.isSameEntry && await parentHandle.isSameEntry(projectHandle)));

          if (!isRoot) {
            const folderName = parentHandle.name || (typeof parentHandle === 'string' ? parentHandle.split(/[/\\]/).pop() : '');
            const metadata = {
              tags: [folderName],
              種別: '',
              概要: '',
              importance: 3,
            };
            contentToWrite = serializeNote(`\n# ${fileName.replace(/\.txt$/, '')}\n\n`, metadata); // Bug C 修正: (body, metadata)
          } else {
            contentToWrite = '';
          }
        } catch (e) {
          console.warn("Folder tag auto-detect failed", e);
          contentToWrite = '';
        }
      }

      const newFile = await fileSystem.createFile(parentHandle, fileName, contentToWrite);

      const tree = await fileSystem.readDirectory(projectHandle);
      setFileTree(tree);

      if (isNative && newFile && newFile.handle) {
        return newFile.handle;
      }
      return newFile;
    } catch (error) {
      console.error('Failed to create file:', error);
      showToast(`ファイルの作成に失敗しました: ${error.message}`);
    }
  }, [projectHandle, showToast, setFileTree]);

  const handleCreateFolderInProject = useCallback(async (parentHandleArg, folderName) => {
    const parentHandle = parentHandleArg || projectHandle;
    try {
      await fileSystem.createFolder(parentHandle, folderName);
      const tree = await fileSystem.readDirectory(projectHandle);
      setFileTree(tree);
    } catch (error) {
      console.error('Failed to create folder:', error);
      showToast('フォルダの作成に失敗しました。');
    }
  }, [projectHandle, showToast, setFileTree]);

  // --- Reference panel ---
  const handleOpenReference = useCallback(async (fileHandle) => {
    try {
      const content = await fileSystem.readFile(fileHandle);
      setReferenceContent(content);
      setReferenceFileName(fileHandle.name);
      setShowReference(true);
    } catch (error) {
      console.error('Failed to read reference file:', error);
      showToast('参照ファイルの読み込みに失敗しました。');
    }
  }, [showToast, setReferenceContent, setReferenceFileName, setShowReference]);

  const handleOpenInNewWindow = useCallback(async (fileHandle) => {
    handlePopOutTab('editor', fileHandle);
  }, [handlePopOutTab]);

  const handleCloseReference = useCallback(() => {
    setShowReference(false);
    setReferenceContent('');
    setReferenceFileName('');
  }, [setShowReference, setReferenceContent, setReferenceFileName]);

  // --- Navigation ---
  const [pendingNavigation, setPendingNavigation] = useState(null);

  useEffect(() => {
    if (pendingNavigation && editorRef.current && debouncedText.includes(pendingNavigation.tag)) {
      const idx = debouncedText.indexOf(pendingNavigation.tag);
      if (idx !== -1) {
        editorRef.current.jumpToPosition(idx, idx + pendingNavigation.tag.length);
        setPendingNavigation(null);
      }
    }
  }, [debouncedText, pendingNavigation, editorRef]);

  const handleNavigate = useCallback(async (tag) => {
    if (!tag) return;

    const currentIdx = text.indexOf(tag);
    if (currentIdx !== -1) {
      if (editorRef.current) {
        setActiveTab('editor');
        editorRef.current.jumpToPosition(currentIdx, currentIdx + tag.length);
      }
      return;
    }

    if (!allMaterialFiles) return;

    const foundFile = allMaterialFiles.find(f => f.body && f.body.includes(tag));

    if (foundFile) {
      await handleOpenFile(foundFile);
      setPendingNavigation({ tag: tag, timestamp: Date.now() });
      setActiveTab('editor');
    } else {
      showToast(`タグ "${tag}" が見つかりませんでした。`);
    }
  }, [text, allMaterialFiles, handleOpenFile, editorRef, setActiveTab, showToast]);

  // --- Rename / Move / Delete ---
  const handleRename = useCallback(async (handle, newName, itemType) => {
    console.log('handleRename called', { handle, newName, itemType, projectHandle });
    try {
      if (isNative) {
        const projectPath = typeof projectHandle === 'string' ? projectHandle : projectHandle.handle;
        const targetPath = typeof handle === 'string' ? handle : handle.handle;

        console.log('Checking root rename:', { projectPath, targetPath, match: projectPath === targetPath });

        if (targetPath === projectPath) {
          const newHandle = await fileSystem.rename(projectHandle, newName);
          console.log('Renamed root result:', newHandle);
          if (newHandle) {
            setProjectHandle(newHandle);
            await saveProjectHandle(newHandle);
            showToast('プロジェクト名を変更しました。');
            return;
          }
        }

        await fileSystem.rename(handle, newName);
        await refreshMaterials();
      } else {
        showToast(
          'ファイル名の変更は技術的な制約により、現在サポートされていません。\n\n' +
          'デスクトップ版アプリをお使いください。'
        );
      }
    } catch (error) {
      console.error('Failed to rename:', error);
      showToast('名前の変更に失敗しました。');
    }
  }, [projectHandle, setProjectHandle, refreshMaterials, showToast]);

  const handleMoveItem = useCallback(async (source, target) => {
    console.log('handleMoveItem CALLED', { source, target });
    try {
      if (!projectHandle) return;

      let sourceHandle = source;
      const sourceName = (typeof source === 'string') ? source : source.name;

      if (typeof source === 'string') {
        const fileObj = allMaterialFiles.find(f => f.name === sourceName);
        if (fileObj) sourceHandle = fileObj.handle;
        else {
          console.error("Source file not found in registry:", sourceName);
          return;
        }
      }

      const targetHandle = target;

      const pathParts = await fileSystem.resolvePath(projectHandle, sourceHandle);
      let sourceParentHandle = projectHandle;

      if (pathParts && pathParts.length > 1) {
        const parentParts = pathParts.slice(0, -1);
        sourceParentHandle = await fileSystem.getDirectoryHandleFromPath(projectHandle, parentParts);
      }

      await fileSystem.moveFileWithContext(sourceHandle, sourceParentHandle, targetHandle);
      await refreshMaterials();

    } catch (e) {
      console.error("Move failed", e);
      showToast("移動に失敗しました: " + e.message);
    }
  }, [projectHandle, allMaterialFiles, refreshMaterials, showToast]);

  const handleArchiveVersion = useCallback(async (sourceHandle, itemType) => {
    if (!projectHandle || !sourceHandle) return false;
    try {
      const sourcePath = await fileSystem.resolvePath(projectHandle, sourceHandle);
      if (!sourcePath || sourcePath.length === 0) throw new Error('移動元を確認できません');
      const archiveHandle = await fileSystem.createFolder(projectHandle, 'version_archive');
      const sourceParent = sourcePath.length > 1
        ? await fileSystem.getDirectoryHandleFromPath(projectHandle, sourcePath.slice(0, -1))
        : projectHandle;
      if (itemType === 'directory' || sourceHandle?.kind === 'directory') {
        await fileSystem.moveDirectoryWithContext(sourceHandle, sourceParent, archiveHandle);
      } else {
        await fileSystem.moveFileWithContext(sourceHandle, sourceParent, archiveHandle);
      }
      await refreshMaterials();
      showToast('version_archiveへ移動しました。');
      return true;
    } catch (error) {
      console.error('Version archive move failed:', error);
      showToast(`version_archiveへの移動に失敗しました: ${error.message}`);
      return false;
    }
  }, [projectHandle, refreshMaterials, showToast]);

  const handleDelete = useCallback(async (handle, itemType, parentHandle) => {
    try {
      const itemName = (typeof handle === 'string')
        ? handle.split(/[/\\]/).pop()
        : handle.name;

      if (isNative && handle === projectHandle) {
        showToast('プロジェクトルート自体は削除できません。Finder/Explorerから削除してください。');
        return;
      }

      const confirmed = await requestConfirm("確認", `「${itemName}」を削除しますか？\nこの操作は取り消せません。`);
      if (!confirmed) return;

      if (isNative) {
        await fileSystem.deleteEntry(handle);
      } else {
        if (parentHandle) {
          await fileSystem.deleteEntryWithParent(handle, parentHandle);
        } else {
          showToast("ブラウザ版では親フォルダのコンテキストが必要です。");
          return;
        }
      }

      await refreshMaterials();
    } catch (error) {
      console.error('Failed to delete:', error);
      showToast('削除に失敗しました。');
    }
  }, [projectHandle, requestConfirm, refreshMaterials, showToast]);

  // --- Project Replace (Search & Replace across files) ---
  const handleProjectReplace = useCallback(async (changes) => {
    console.log("handleProjectReplace called with", changes);
    if (!changes || changes.length === 0) {
      showToast("変更対象がありません。");
      return;
    }

    const uniqueFiles = new Map();

    for (const change of changes) {
      if (!uniqueFiles.has(change.fileName)) {
        uniqueFiles.set(change.fileName, { handle: change.fileHandle, changes: [] });
      }
      uniqueFiles.get(change.fileName).changes.push(change);
    }

    let successFileCount = 0;
    let failFileCount = 0;
    let skipLineCount = 0;
    const errors = [];
    const debugMismatches = [];
    let firstMismatchDiff = '';

    for (const [fileName, fileData] of uniqueFiles) {
      try {
        const { handle, changes: fileChanges } = fileData;

        const fileObj = await fileSystem.readFile(handle);
        const content = (typeof fileObj === 'string') ? fileObj : await fileObj.text();
        const lines = content.split('\n');

        let modified = false;

        for (const change of fileChanges) {
          const currentLine = lines[change.lineIndex];
          const expectedLine = change.lineContent;

          const cleanCurrent = currentLine ? currentLine.replace(/\r$/, '') : '';
          const cleanExpected = expectedLine ? expectedLine.replace(/\r$/, '') : '';

          if (cleanCurrent !== cleanExpected) {
            const cleanNew = change.newContent ? change.newContent.replace(/\r$/, '') : '';
            if (cleanCurrent === cleanNew) {
              continue;
            }

            console.warn(`Mismatch in ${fileName} line ${change.lineIndex + 1}`);
            console.warn(`Exp: ${JSON.stringify(cleanExpected)}`);
            console.warn(`Got: ${JSON.stringify(cleanCurrent)}`);
            debugMismatches.push(`${fileName}:${change.lineIndex + 1}`);
            if (!firstMismatchDiff) {
              firstMismatchDiff = `\nFile: ${fileName}:${change.lineIndex + 1}\nExp: [${cleanExpected}]\nGot: [${cleanCurrent}]`;
            }
            skipLineCount++;
            continue;
          }

          if (lines[change.lineIndex] !== change.newContent) {
            lines[change.lineIndex] = change.newContent;
            modified = true;
          }
        }

        if (modified) {
          const newContent = lines.join('\n');
          await fileSystem.writeFile(handle, newContent);
          successFileCount++;

          if (activeFileHandle && activeFileHandle.name === fileName) {
            setText(newContent);
          }
        }

      } catch (err) {
        console.error(`Failed to replace in ${fileName}:`, err);
        failFileCount++;
        errors.push(`${fileName}: ${err.message}`);
      }
    }

    let msg = `置換完了: ${successFileCount} ファイルを更新しました。`;
    if (skipLineCount > 0) {
      msg += `\n⚠ 安全のため ${skipLineCount} 箇所の変更がスキップされました。`;
      msg += `\n(詳細: ${debugMismatches.join(', ')})`;
    }
    if (failFileCount > 0) msg += `\n❌ ${failFileCount} ファイルでエラーが発生しました。`;

    showToast(msg);
  }, [activeFileHandle, setText, showToast]);

  // --- Rename / Move Project ---
  const handleRenameProject = useCallback(async () => {
    if (!projectHandle) return;

    const currentName = typeof projectHandle === 'string'
      ? projectHandle.split(/[/\\]/).pop()
      : projectHandle.name;

    if (openInputModal) {
      openInputModal('プロジェクト名変更', 'プロジェクト名（フォルダ名）を変更しますか？', currentName, async (newName) => {
        if (!newName || newName === currentName) return;

        if (isNative) {
          try {
            const newHandle = await fileSystem.rename(projectHandle, newName);
            if (newHandle) {
              setProjectHandle(newHandle);
              await saveProjectHandle(newHandle);
              showToast('プロジェクト名を変更しました。');
            }
          } catch (e) {
            console.error(e);
            showToast('プロジェクト名の変更に失敗しました。');
          }
        } else {
          showToast('ブラウザ版ではプロジェクトフォルダのリネームはサポートされていません。', 'error');
        }
      });
      return;
    }

    const newName = window.prompt('プロジェクト名（フォルダ名）を変更しますか？', currentName);
    if (!newName || newName === currentName) return;

    if (isNative) {
      try {
        const newHandle = await fileSystem.rename(projectHandle, newName);
        if (newHandle) {
          setProjectHandle(newHandle);
          await saveProjectHandle(newHandle);
          showToast('プロジェクト名を変更しました。');
        }
      } catch (e) {
        console.error(e);
        showToast('名前の変更に失敗しました。');
      }
    } else {
      showToast('ブラウザ版ではプロジェクト（ルートフォルダ）の名前変更はサポートされていません。Finder/Explorerで直接変更して、再度開いてください。');
    }
  }, [projectHandle, setProjectHandle, openInputModal, showToast]);

  const handleMoveProject = useCallback(async () => {
    if (!isNative) {
      showToast('プロジェクトの移動はデスクトップ版のみ対応しています。');
      return;
    }
    if (!projectHandle) return;

    showToast('移動先のフォルダを選択してください。');
    const newParentPath = await fileSystem.openProjectDialog();
    if (!newParentPath) return;

    showToast("現在、移動機能は実装中のため使用できません。（フォルダをFinder/Explorerで移動させてください）");
  }, [projectHandle, showToast]);

  // --- Resume project ---
  const handleResumeProject = useCallback(async () => {
    if (!savedProjectHandle) return;

    try {
      if (isNative) {
        const projectPath = savedProjectHandle;

        setProjectHandle(projectPath);
        const tree = await fileSystem.readDirectory(projectPath);
        setFileTree(tree);
        setIsProjectMode(true);
        setSavedProjectHandle(null);
      } else {
        if (savedProjectHandle.requestPermission) {
          const permission = await savedProjectHandle.requestPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            setProjectHandle(savedProjectHandle);
            const tree = await fileSystem.readDirectory(savedProjectHandle);
            setFileTree(tree);
            setIsProjectMode(true);
            setSavedProjectHandle(null);
          } else {
            showToast('権限が許可されませんでした。');
          }
        } else {
          console.error("Invalid handle format", savedProjectHandle);
          showToast("プロジェクト情報の復元に失敗しました。再度フォルダを開いてください。");
          setSavedProjectHandle(null);
        }
      }
    } catch (error) {
      console.error('Failed to resume project:', error);
      showToast('プロジェクトの再開に失敗しました。');
      await clearProjectHandle();
      setSavedProjectHandle(null);
    }
  }, [savedProjectHandle, setProjectHandle, setFileTree, setIsProjectMode, setSavedProjectHandle, showToast]);

  // --- Card creation ---
  const handleCreateCard = useCallback(async (filename, content) => {
    if (!projectHandle) {
      showToast('プロジェクトが開かれていません');
      return;
    }

    try {
      const newHandle = await fileSystem.createFile(projectHandle, filename);
      await fileSystem.writeFile(newHandle, content);

      const { metadata } = parseNote(content);
      const organizedHandle = await autoOrganizeFile(newHandle, metadata);

      await refreshMaterials();
      setActiveFileHandle(organizedHandle);
      setText(content);
      showToast(`カード「${filename}」を作成しました`);

    } catch (e) {
      console.error("Card creation failed", e);
      showToast("作成に失敗しました: " + e.message);
    }
  }, [projectHandle, autoOrganizeFile, refreshMaterials, setActiveFileHandle, setText, showToast]);

  // --- Outline jump ---
  const handleOutlineJump = useCallback((lineIndex) => {
    if (!editorRef.current) return;
    const lines = text.split('\n');
    let pos = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    editorRef.current.setCursorPosition(pos);
  }, [text, editorRef]);

  // --- Open Link (auto-create if not found) ---
  const handleOpenLink = useCallback(async (linkTarget) => {
    try {
      if (!allMaterialFiles) {
        console.warn('allMaterialFiles is not available');
        return;
      }

      const normalizedTarget = linkTarget.trim();

      const targetFile = allMaterialFiles.find(f => {
        const nameWithoutExt = f.name.replace(/\.[^/.]+$/, "");
        return (
          f.name === normalizedTarget ||
          f.name === `${normalizedTarget}.txt` ||
          nameWithoutExt === normalizedTarget
        );
      });

      if (targetFile) {
        await handleOpenFile(targetFile.handle, targetFile.name);
      } else {
        if (await requestConfirm("確認", `「${linkTarget}」という資料は見つかりませんでした。\n新規作成して開きますか？`)) {
          try {
            let currentHandle = projectHandle;

            if (!currentHandle) {
              try {
                let sourcePath = null;
                if (activeFileHandle) {
                  sourcePath = typeof activeFileHandle === 'string' ? activeFileHandle : (activeFileHandle.handle || null);
                } else if (allMaterialFiles && allMaterialFiles.length > 0) {
                  const sample = allMaterialFiles[0];
                  sourcePath = typeof sample.handle === 'string' ? sample.handle : (sample.handle?.handle || null);
                }

                if (sourcePath) {
                  const pathSeparator = sourcePath.includes('\\') ? '\\' : '/';
                  const lastSepIndex = sourcePath.lastIndexOf(pathSeparator);
                  if (lastSepIndex > 0) {
                    const inferredPath = sourcePath.substring(0, lastSepIndex);
                    console.warn("ProjectHandle auto-recovered:", inferredPath);
                    currentHandle = inferredPath;
                    setProjectHandle(inferredPath);
                  }
                }
              } catch (e) {
                console.error("ProjectHandle recovery failed", e);
              }
            }

            if (!currentHandle) {
              console.error("ProjectHandle missing in handleOpenLink");
              showToast("リンク先のファイルを作成できませんでした。\n\n原因: プロジェクトフォルダが認識できていません。\n\n対策: サイドバーの「ファイル」タブからプロジェクトフォルダを開き直すか、現在のファイルを保存（Ctrl+S）した状態でリロードをお試しください。");
              return;
            }

            const fileName = normalizedTarget.endsWith('.txt') ? normalizedTarget : `${normalizedTarget}.txt`;
            const initialContent = `# ${normalizedTarget}\n\n`;
            const fileHandle = await fileSystem.createFile(currentHandle, fileName, initialContent);

            await refreshMaterials();
            await handleOpenFile(fileHandle, fileName);
            setActiveTab('editor');

          } catch (createError) {
            console.error("Failed to auto-create file:", createError);
            showToast("ファイルの作成に失敗しました: " + createError.message);
          }
        }
      }
    } catch (error) {
      console.error('Error in handleOpenLink:', error);
      showToast('リンクを開く際にエラーが発生しました。');
    }
  }, [allMaterialFiles, activeFileHandle, projectHandle, setProjectHandle, handleOpenFile, requestConfirm, refreshMaterials, setActiveTab, showToast]);

  // --- Create File With Tag ---
  const handleCreateFileWithTag = useCallback(async (tagName) => {
    if (!projectHandle) return;

    const createTaggedFile = async (finalName) => {
      try {
        const tagLower = tagName.toLowerCase();
        let rootFolderName = 'materials';
        let subfolderName = '';

        if (['プロット', 'Plot'].some(t => tagLower.includes(t.toLowerCase()))) {
          rootFolderName = 'plots';
        } else {
          if (['登場人物', 'Character', 'キャラ'].some(t => tagLower.includes(t.toLowerCase()))) subfolderName = 'characters';
          else if (['世界観', 'World', '世界'].some(t => tagLower.includes(t.toLowerCase()))) subfolderName = 'world';
          else if (['舞台', 'Location', '場所'].some(t => tagLower.includes(t.toLowerCase()))) subfolderName = 'locations';
          else if (['アイテム', 'Item', '道具'].some(t => tagLower.includes(t.toLowerCase()))) subfolderName = 'items';
          else if (['魔法', 'Magic', 'スキル'].some(t => tagLower.includes(t.toLowerCase()))) subfolderName = 'magic';
        }

        let targetDirHandle;
        try {
          targetDirHandle = await fileSystem.createFolder(projectHandle, rootFolderName);
          if (subfolderName) {
            targetDirHandle = await fileSystem.createFolder(targetDirHandle, subfolderName);
          }
        } catch (e) {
          console.warn("Could not navigate/create folder, using project root", e);
          targetDirHandle = projectHandle;
        }

        const content = `# ${finalName.replace('.txt', '')}\n\n#${tagName}\n`;
        const fileHandle = await fileSystem.createFile(targetDirHandle, finalName, content);

        await refreshMaterials();
        await handleFileSelect(fileHandle);
        showToast(`「${tagName}」のファイルを自動振り分けで作成しました`);
      } catch (e) {
        console.error(e);
        showToast('ファイルの作成に失敗しました: ' + e.message);
      }
    };

    if (openInputModal) {
      openInputModal('新規ファイル作成', `タグ「${tagName}」を持つ新規ファイルを作成します。\nファイル名を入力してください:`, '', (fileName) => {
        if (!fileName) return;
        const finalName = fileName.trim().endsWith('.txt') ? fileName.trim() : `${fileName.trim()}.txt`;
        createTaggedFile(finalName);
      });
      return;
    }

    const fileNamePrompt = window.prompt(`タグ「${tagName}」を持つ新規ファイルを作成します。\nファイル名を入力してください:`);
    if (!fileNamePrompt) return;
    const finalName = fileNamePrompt.trim().endsWith('.txt') ? fileNamePrompt.trim() : `${fileNamePrompt.trim()}.txt`;
    await createTaggedFile(finalName);
  }, [projectHandle, openInputModal, refreshMaterials, handleFileSelect, showToast]);

  // --- Metadata Update ---
  const handleMetadataUpdate = useCallback(async (newMetadata) => {
    if (!activeFileHandle) return;

    try {
      // Bug D 対策: State の text ではなく Ref の最新テキストを使用
      const { body } = parseNote(textRef.current);
      const newContent = serializeNote(body, newMetadata);

      await fileSystem.writeFile(activeFileHandle, newContent);

      const newHandle = await autoOrganizeFile(activeFileHandle, newMetadata);
      if (newHandle && newHandle !== activeFileHandle) {
        setActiveFileHandle(newHandle);
      }

      setText(newContent);
      lastSavedTextRef.current = newContent; // Bug D 対策
      latestMetadataRef.current = newMetadata; // Bug A 対策
      await refreshMaterials();
    } catch (e) {
      console.error("Metadata update failed:", e);
      showToast(`メタデータの更新に失敗しました: ${e.message}`);
    }
  }, [activeFileHandle, setActiveFileHandle, setText, textRef, latestMetadataRef, lastSavedTextRef, autoOrganizeFile, refreshMaterials, showToast]);

  const handleRefreshTree = useCallback(async () => {
    if (!projectHandle) return;
    try {
      const tree = await fileSystem.readDirectory(projectHandle);
      setFileTree(tree);
      await refreshMaterials();
    } catch (e) {
      console.error("Tree refresh failed:", e);
    }
  }, [projectHandle, setFileTree, refreshMaterials]);

  return {
    // Project settings
    saveProjectSettings,
    autoOrganizeFile,
    // Project CRUD
    handleOpenProject,
    handleFileSelect,
    handleCreateNewProject,
    handleCreateFileInProject,
    handleCreateFolderInProject,
    // Reference
    handleOpenReference,
    handleOpenInNewWindow,
    handleCloseReference,
    // Navigation
    handleNavigate,
    handleOutlineJump,
    // File tree operations
    handleRename,
    handleMoveItem,
    handleArchiveVersion,
    handleDelete,
    // Project-wide replace
    handleProjectReplace,
    // Project rename/move
    handleRenameProject,
    handleMoveProject,
    // Resume
    handleResumeProject,
    // Card
    handleCreateCard,
    // Links & tags
    handleOpenLink,
    handleCreateFileWithTag,
    // Metadata
    handleMetadataUpdate,
    // Refresh
    handleRefreshTree,
  };
}
