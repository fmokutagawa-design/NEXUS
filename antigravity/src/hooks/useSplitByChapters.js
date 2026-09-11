import { useState, useCallback } from 'react';
import { fileSystem, isNative } from '../utils/fileSystem';
import {
    createSplitPlan,
    removeSegment,
    rebuildSegmentContents,
    updateDisplayName,
    resolveFileNameCollision,
} from '../utils/splitByChapters';
import { createManifestFromSplitPlan, writeManifest } from '../utils/manifest';

/**
 * 分割を実行する。
 */
async function performSplit({ plan, activeFileHandle, projectHandle, sourceText, useNexusFolder = true }) {
    // Step 1: ディレクトリ特定
    let parentDirHandle;
    let nexusDirHandle = null;
    let targetDirHandle;
    if (isNative) {
        const filePath = typeof activeFileHandle === 'string'
            ? activeFileHandle
            : (activeFileHandle.handle || activeFileHandle.path);
        if (typeof filePath !== 'string') {
            throw new Error('cannot determine file path in native mode');
        }
        const sep = filePath.includes('\\') ? '\\' : '/';
        const parentPath = filePath.substring(0, filePath.lastIndexOf(sep));
        parentDirHandle = { handle: parentPath, name: parentPath.split(sep).pop(), kind: 'directory' };
    } else {
        // Web API Mode
        try {
            const pathParts = await fileSystem.resolvePath(projectHandle, activeFileHandle);
            if (pathParts && pathParts.length > 0) {
                pathParts.pop();
                parentDirHandle = await fileSystem.getDirectoryHandleFromPath(projectHandle, pathParts);
            } else {
                parentDirHandle = projectHandle;
            }
        } catch {
            parentDirHandle = projectHandle;
        }
    }

    // Step 2: バックアップ作成
    let backupDirHandle;
    try {
        backupDirHandle = await fileSystem.createFolder(parentDirHandle, '.backup');
    } catch (e) {
        if (isNative) {
            const pPath = parentDirHandle.handle || parentDirHandle.path || parentDirHandle;
            const sep = pPath.includes('\\') ? '\\' : '/';
            const cleanP = pPath.endsWith(sep) ? pPath.slice(0, -1) : pPath;
            backupDirHandle = { handle: `${cleanP}${sep}.backup`, name: '.backup', kind: 'directory' };
        } else {
            throw e;
        }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFileName = `${plan.baseName}_original_${ts}${plan.extension}`;
    await fileSystem.createFile(backupDirHandle, backupFileName, sourceText);

    // Step 2.5: .nexus フォルダ作成（オプション）
    targetDirHandle = parentDirHandle; // デフォルトはフラット出力

    // 既存 .nexus フォルダの上書き確認
    if (useNexusFolder) {
        const nexusFolderName = `${plan.baseName}.nexus`;
        try {
            const existingEntries = await fileSystem.readDirectory(parentDirHandle);
            const existing = (existingEntries || []).find(
                e => e.name === nexusFolderName && e.kind === 'directory'
            );
            if (existing) {
                const ok = typeof window !== 'undefined' && window.confirm(
                    `"${nexusFolderName}" フォルダが既に存在します。上書きしますか？\n（既存の manifest.json は上書きされます）`
                );
                if (!ok) {
                    return { createdCount: 0, backupPath: '', cancelled: true };
                }
            }
        } catch {
            // readDirectory 失敗は無視（フォルダが存在しないケース）
        }
    }

    if (useNexusFolder) {
        const nexusFolderName = `${plan.baseName}.nexus`;

        // .nexus フォルダ作成
        try {
            nexusDirHandle = await fileSystem.createFolder(parentDirHandle, nexusFolderName);
        } catch (e) {
            if (isNative) {
                const pPath = parentDirHandle.handle || parentDirHandle.path || parentDirHandle;
                const sep = pPath.includes('\\') ? '\\' : '/';
                const cleanP = pPath.endsWith(sep) ? pPath.slice(0, -1) : pPath;
                nexusDirHandle = { handle: `${cleanP}${sep}${nexusFolderName}`, name: nexusFolderName, kind: 'directory' };
            } else {
                throw new Error(`フォルダ "${nexusFolderName}" の作成に失敗: ${e.message}`);
            }
        }

        // archive/ サブフォルダ作成（元ファイルの移動先）
        let archiveDirHandle;
        try {
            archiveDirHandle = await fileSystem.createFolder(nexusDirHandle, 'archive');
        } catch (e) {
            if (isNative) {
                const nPath = nexusDirHandle.handle || nexusDirHandle.path || nexusDirHandle;
                const sep = nPath.includes('\\') ? '\\' : '/';
                archiveDirHandle = { handle: `${nPath}${sep}archive`, name: 'archive', kind: 'directory' };
            } else {
                throw new Error(`archive フォルダの作成に失敗: ${e.message}`);
            }
        }

        // バックアップを archive/ に保存
        try {
            await fileSystem.createFile(archiveDirHandle, backupFileName, sourceText);
        } catch (e) {
            console.warn('[split] archive copy failed, backup remains in .backup/', e);
        }

        // 分割ファイルは .nexus フォルダの直下に置く（階層を深くしない）
        targetDirHandle = nexusDirHandle;
    }

    // Step 3: 既存ファイル一覧を取得して衝突チェック
    const existingEntries = await fileSystem.readDirectory(targetDirHandle);
    const existingNames = (existingEntries || [])
        .filter(e => e.kind === 'file')
        .map(e => e.name);

    // Step 4: 新ファイル群を作成
    const createdHandles = [];
    const createdSegments = [];
    try {
        for (const segment of plan.segments) {
            const targetName = resolveFileNameCollision(segment.proposedFileName, existingNames);
            const targetHandle = await fileSystem.createFile(targetDirHandle, targetName, segment.content);
            createdHandles.push(targetHandle);
            createdSegments.push({ ...segment, proposedFileName: targetName });
            existingNames.push(targetName);
        }

        // manifest には衝突解決後の「実際に作成した名前」を記録する。
        if (useNexusFolder && nexusDirHandle) {
            const manifest = createManifestFromSplitPlan({ ...plan, segments: createdSegments });
            await writeManifest(nexusDirHandle, manifest);
        }
    } catch (err) {
        // Step 5: ロールバック
        console.error('[split] error, rolling back:', err);
        for (const h of createdHandles) {
            try {
                if (isNative) {
                    await fileSystem.deleteEntry(h);
                } else {
                    await fileSystem.deleteEntryWithParent(h, targetDirHandle);
                }
            } catch (e) {
                console.warn('[split] rollback delete failed for', h, e);
            }
        }
        throw err;
    }

    return { createdCount: createdHandles.length, backupPath: backupFileName, cancelled: false };
}

/**
 * useSplitByChapters
 *
 * 章ごと分割機能のフック。
 * - モーダルの開閉管理
 * - 現在の計画 (SplitPlan) を保持
 * - 分割実行（バックアップ → 新ファイル作成 → ロールバック）
 */
export function useSplitByChapters({
    activeFileHandle,   // 現在開いているファイル
    text,               // そのファイルの本文
    projectHandle,      // プロジェクトルート
    refreshMaterials,   // 再読み込み
    showToast,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [plan, setPlan] = useState(null);
    const [sourceText, setSourceText] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [useNexusFolder, setUseNexusFolder] = useState(true);

    const openModal = useCallback(() => {
        if (!activeFileHandle || !text) {
            showToast('ファイルが開かれていません');
            return;
        }
        const fileName = typeof activeFileHandle === 'string'
            ? activeFileHandle.split(/[/\\]/).pop()
            : (activeFileHandle.name || 'untitled.txt');
        const newPlan = createSplitPlan(text, fileName);
        setSourceText(text);
        setPlan(newPlan);
        setIsOpen(true);
    }, [activeFileHandle, text, showToast]);

    const closeModal = useCallback(() => {
        setIsOpen(false);
        setPlan(null);
        setSourceText('');
    }, []);

    const handleRemoveSegment = useCallback((index) => {
        if (!plan) return;
        let next = removeSegment(plan, index);
        next = rebuildSegmentContents(next, sourceText);
        setPlan(next);
    }, [plan, sourceText]);

    const handleRenameSegment = useCallback((index, newName) => {
        if (!plan) return;
        setPlan(updateDisplayName(plan, index, newName));
    }, [plan]);

    const executeSplit = useCallback(async () => {
        if (!plan || !activeFileHandle || !projectHandle) return;
        setIsExecuting(true);

        try {
            const result = await performSplit({ plan, activeFileHandle, projectHandle, sourceText, useNexusFolder });
            if (result.cancelled) return;
            showToast(`${result.createdCount} ファイルに分割しました`);
            if (refreshMaterials) {
                await refreshMaterials();
            }
            closeModal();
        } catch (e) {
            console.error('[split] failed:', e);
            showToast(`分割に失敗しました: ${e.message}`);
        } finally {
            setIsExecuting(false);
        }
    }, [plan, activeFileHandle, projectHandle, sourceText, showToast, refreshMaterials, closeModal, useNexusFolder]);

    return {
        isOpen,
        plan,
        isExecuting,
        useNexusFolder,
        setUseNexusFolder,
        openModal,
        closeModal,
        handleRemoveSegment,
        handleRenameSegment,
        executeSplit,
    };
}
