import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

const FileTreeItem = ({ name, type, level, isActive, onClick, onContextMenu, children, fileCount, pinned, draggable, onDragStart, onDrop }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isDragOver, setIsDragOver] = useState(false);
    const isFolder = type === 'directory';

    const handleDragOver = (e) => {
        if (!isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        if (!isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        if (!isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        // internal drop
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (onDrop) {
                onDrop(data, { name, type, level }); // Pass target info. Ideally we need handle.
                // But this component doesn't have handle directly accessible in props? 
                // Wait, renderTree (line 181) maps items but doesn't pass 'handle' to FileTreeItem.
                // It passes key, name, type.
                // Item handle is in `items` loop but not passed to Component props explicitly except via implicit closure if used?
                // `onClick` uses `item.handle`. 
                // I need to pass `handle` to FileTreeItem.
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="tree-item">
            <div
                className={`tree-item-content ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
                style={{ paddingLeft: `${level * 16 + 8}px`, border: isDragOver ? '2px dashed #4CAF50' : 'none' }}
                onClick={onClick}
                onContextMenu={(e) => onContextMenu(e, type)}
                title={name} // Show full name on hover
                draggable={draggable}
                onDragStart={onDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isFolder && (
                    <span
                        className="tree-expand-icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                    >
                        {isExpanded ? '▼' : '▶'}
                    </span>
                )}
                {!isFolder && <span className="tree-expand-icon"></span>}
                <span className="tree-icon">{isFolder ? '📁' : '📄'}</span>
                <span className="tree-label" title={name}>{name}</span>
                {isFolder && fileCount !== undefined && fileCount > 0 && (
                    <span className="tree-count" title={`${fileCount}ファイル`}>{fileCount}件</span>
                )}
                {pinned && <span className="tree-pin" title="上部に固定">📌</span>}
            </div>
            {isFolder && isExpanded && children && (
                <div className="tree-children">{children}</div>
            )}
        </div>
    );
};

const countFiles = (items) => {
    if (!items) return 0;
    let count = 0;
    for (const item of items) {
        if (item.kind === 'file') {
            count++;
        } else if (item.children) {
            count += countFiles(item.children);
        }
    }
    return count;
};

const FileTree = ({ tree, activeFile, projectKey, onFileSelect, onCreateFile, onCreateFolder, onRequestCreateFile, onRequestCreateFolder, onOpenReference, onOpenInNewWindow, onShowInFinder, onRename, onDelete, onDuplicate, onMergeFile, onMove, onArchiveVersion }) => {
    const [contextMenu, setContextMenu] = useState(null);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [renameTarget, setRenameTarget] = useState(null); // { handle, type, oldName }
    const [pinnedItems, setPinnedItems] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`nexus-tree-pins:${projectKey || 'default'}`) || '[]'); }
        catch { return []; }
    });
    const storageKey = `nexus-tree-pins:${projectKey || 'default'}`;
    const [loadedPinKey, setLoadedPinKey] = useState(storageKey);

    useEffect(() => {
        if (loadedPinKey !== storageKey) return;
        try { localStorage.setItem(storageKey, JSON.stringify(pinnedItems)); }
        catch (error) { console.warn('ファイルツリー固定設定を保存できません:', error); }
    }, [pinnedItems, loadedPinKey, storageKey]);

    useEffect(() => {
        try { setPinnedItems(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
        catch { setPinnedItems([]); }
        setLoadedPinKey(storageKey);
    }, [storageKey]);

    const itemKey = (item) => {
        const kind = item.kind || item.itemType;
        const handle = item.handle ?? item.itemHandle;
        return `${kind}:${typeof handle === 'string' ? handle : (handle?.name || item.name)}`;
    };
    const togglePin = () => {
        const key = itemKey(contextMenu);
        setPinnedItems((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
        handleCloseContextMenu();
    };

    const handleContextMenu = (e, itemType, itemHandle, parentHandle, itemName) => {
        e.preventDefault();
        e.stopPropagation();

        const menuWidth = 220;
        const menuHeight = 320;

        let x = e.clientX;
        let y = e.clientY;

        // 右端からはみ出す場合、左側に表示
        if (x + menuWidth > window.innerWidth) {
            x = window.innerWidth - menuWidth - 10;
        }
        // 下端からはみ出す場合、上に詰める
        if (y + menuHeight > window.innerHeight) {
            y = window.innerHeight - menuHeight - 10;
        }
        // 上端を超えないように
        if (y < 10) y = 10;

        setContextMenu({
            x,
            y,
            itemType,
            itemHandle,
            parentHandle,
            itemName
        });
    };

    const handleBackgroundContextMenu = (e) => {
        e.preventDefault();
        // Background context menu (Root)
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            itemType: 'root',
            itemHandle: null,
            parentHandle: null,
            itemName: 'Project Root'
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleCreateFile = () => {
        const targetFolder = (contextMenu.itemType === 'file' || contextMenu.itemType === 'root')
            ? contextMenu.parentHandle
            : contextMenu.itemHandle;

        // Use Modal in parent instead of prompt (Browser/Electron support)
        // Use Modal in parent
        if (onRequestCreateFile) {
            onRequestCreateFile(targetFolder);
        } else {
            console.warn('onRequestCreateFile prop missing in FileTree');
        }
        handleCloseContextMenu();
    };

    const handleCreateFolder = () => {
        const targetFolder = (contextMenu.itemType === 'file' || contextMenu.itemType === 'root')
            ? contextMenu.parentHandle
            : contextMenu.itemHandle;

        if (onRequestCreateFolder) {
            onRequestCreateFolder(targetFolder);
        } else {
            console.warn('onRequestCreateFolder prop missing in FileTree');
        }
        handleCloseContextMenu();
    };

    const handleOpenRef = () => {
        if (onOpenReference && contextMenu.itemHandle) {
            onOpenReference(contextMenu.itemHandle);
        }
        handleCloseContextMenu();
    };

    const handleOpenNewWindow = () => {
        if (onOpenInNewWindow && contextMenu.itemHandle) {
            onOpenInNewWindow(contextMenu.itemHandle);
        }
        handleCloseContextMenu();
    };

    const handleRename = async () => {
        const itemType = contextMenu.itemType;
        const oldName = contextMenu.itemName || contextMenu.itemHandle.name;
        setRenameTarget({ handle: contextMenu.itemHandle, type: itemType, oldName });
        setRenameValue(oldName);
        setShowRenameDialog(true);
        handleCloseContextMenu();
    };

    const handleDuplicate = async () => {
        if (onDuplicate && contextMenu.itemHandle) {
            await onDuplicate(contextMenu.itemHandle, contextMenu.itemType);
        }
        handleCloseContextMenu();
    };

    const confirmRename = async () => {
        if (renameValue && renameTarget) {
            if (renameValue !== renameTarget.oldName) {
                if (onRename) {
                    await onRename(renameTarget.handle, renameValue, renameTarget.type);
                }
            }
        }
        setShowRenameDialog(false);
        setRenameTarget(null);
    };

    const handleDelete = async () => {
        const itemType = contextMenu.itemType;
        const itemName = contextMenu.itemName || contextMenu.itemHandle.name;

        // Pass handle and type (App.jsx handleDelete expects handle object but Electron passes path string)
        // We pass the handle as is. 
        // Note: App.jsx handleDelete accesses handle.name on line 949?
        // Yes: const itemName = handle.name;
        // In Electron handle is string. handle.name is undefined.
        // We need to fix App.jsx handleDelete too or wrap the handle here?
        // OR App.jsx should handle string handles.
        // Since onRename passes handle, and App.jsx handleRename uses handle directly for Electron rename...
        // Wait, App.jsx `handleDelete` uses `handle.name`. Failing there too?
        // Yes likely.

        // I will fix FileTree first to use itemName from context menu for display.
        // But for props passing... FileTree passes handle.

        const confirmed = confirm(`${itemType === 'directory' ? 'フォルダ' : 'ファイル'} "${itemName}" を削除しますか？\n\nこの操作は取り消せません。`);

        if (confirmed && onDelete) {
            // We pass the handle. App.jsx must handle it.
            // Check App.jsx compatibility separately.
            await onDelete(contextMenu.itemHandle, itemType, contextMenu.parentHandle);
        }
        handleCloseContextMenu();
    };

    const handleDragStart = (e, item) => {
        console.log('Drag Start:', item);
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'file',
            name: item.name,
            path: typeof item.handle === 'string' ? item.handle : undefined,
            content: `Linked File: ${item.name}`
        }));
        e.dataTransfer.effectAllowed = 'all';
    };

    const renderTree = (items, level = 0, parentHandle = null) => {
        if (!items || !Array.isArray(items) || items.length === 0) return null;

        // プロジェクト名のルート行を含むツリーでは、実ファイルは level 1 になる。
        // 固定項目は各階層の先頭へ寄せることで、見えているツリーの上部に確実に出す。
        const orderedItems = [...items].sort((a, b) =>
            Number(pinnedItems.includes(itemKey(b))) - Number(pinnedItems.includes(itemKey(a)))
        );

        return orderedItems.map((item, index) => {
            const fileCount = item.kind === 'directory' ? countFiles(item.children) : undefined;

            const handleItemDrop = (sourceData, targetItemInfo) => {
                if (sourceData.type === 'file' && targetItemInfo.handle) {
                    if (onMove) {
                        onMove(sourceData.name, targetItemInfo.handle);
                    }
                }
            };

            return (
                <FileTreeItem
                    key={`${item.name}-${index}`}
                    name={item.name}
                    type={item.kind}
                    level={level}
                    isActive={activeFile === item.handle}
                    onClick={() => item.kind === 'file' && onFileSelect(item.handle)}
                    onContextMenu={(e, type) => handleContextMenu(e, type, item.handle, parentHandle, item.name)}
                    fileCount={fileCount}
                    pinned={pinnedItems.includes(itemKey(item))}
                    draggable={item.kind === 'file'}
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDrop={(sourceData, targetInfo) => handleItemDrop(sourceData, { ...targetInfo, handle: item.handle })}
                >
                    {item.children && renderTree(item.children, level + 1, item.handle)}
                </FileTreeItem>
            );
        });
    };

    const [showMergeDialog, setShowMergeDialog] = useState(false);
    const [mergeTarget, setMergeTarget] = useState('');

    const handleMergeFile = () => {
        setShowMergeDialog(true);
        handleCloseContextMenu();
    };

    const confirmMerge = async () => {
        if (!mergeTarget || !contextMenu.itemHandle) return;

        // Find target handle from tree (we need a helper to find handle by name or traverse)
        // Since we only have the name in select, we need to map back to handle.
        // Actually, let's just pass the mergeTarget (name) to the parent handler and let it resolve.
        // OR better: Flatten the tree to get all file candidates for the dropdown.

        if (onMergeFile) {
            await onMergeFile(contextMenu.itemHandle, mergeTarget, contextMenu.parentHandle); // pass source handle and target name (or handle if we can find it)
        }
        setShowMergeDialog(false);
        setMergeTarget('');
    };

    // Helper to flatten tree for dropdown
    const getAllFiles = (nodes) => {
        let files = [];
        if (!nodes) return [];
        for (const node of nodes) {
            if (node.kind === 'file') {
                files.push(node);
            } else if (node.children) {
                files = [...files, ...getAllFiles(node.children)];
            }
        }
        return files;
    };

    const allFiles = getAllFiles(tree);

    // ... (rest of component, context menu)

    return (
        <>
            <div className="file-tree" onClick={handleCloseContextMenu} onContextMenu={handleBackgroundContextMenu} style={{ minHeight: '100%' }}>
                {renderTree(tree)}
            </div>
            {contextMenu && ReactDOM.createPortal(
                <div
                    className="context-menu"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 99999,
                        minWidth: '200px',
                        maxWidth: '280px'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {(contextMenu.itemType === 'directory' || contextMenu.itemType === 'root') && (
                        <>
                            <div className="context-menu-item" onClick={handleCreateFile}>
                                📄 新規ファイル作成
                            </div>
                            <div className="context-menu-item" onClick={handleCreateFolder}>
                                📁 新規フォルダ作成
                            </div>
                        </>
                    )}

                    {contextMenu.itemType === 'directory' && (
                        <>
                            {onShowInFinder && (
                                <div className="context-menu-item" onClick={() => {
                                    onShowInFinder(contextMenu.itemHandle);
                                    handleCloseContextMenu();
                                }}>
                                    📂 Finderで表示
                                </div>
                            )}
                            <div className="context-menu-item" onClick={handleRename}>
                                ✏️ 名前を変更
                            </div>
                            <div className="context-menu-item" onClick={togglePin}>
                                {pinnedItems.includes(itemKey(contextMenu)) ? '📍 固定を解除' : '📌 ツリー上部に固定'}
                            </div>
                            {onMove && (
                                <div className="context-menu-item" onClick={() => {
                                    onMove(contextMenu.itemHandle, contextMenu.itemType);
                                    handleCloseContextMenu();
                                }}>
                                    🚚 移動
                                </div>
                            )}
                            {onArchiveVersion && (
                                <div className="context-menu-item" onClick={async () => {
                                    await onArchiveVersion(contextMenu.itemHandle, contextMenu.itemType);
                                    handleCloseContextMenu();
                                }}>
                                    🗄️ フォルダごとversion_archiveへ移動
                                </div>
                            )}
                            <div className="context-menu-item" onClick={handleDelete} style={{ color: '#d32f2f' }}>
                                🗑️ 削除
                            </div>
                        </>
                    )}
                    {contextMenu.itemType === 'file' && (
                        <>
                            <div className="context-menu-item" onClick={handleCreateFile}>
                                📄 新規ファイル作成
                            </div>
                            <div className="context-menu-item" onClick={handleCreateFolder}>
                                📁 新規フォルダ作成
                            </div>
                            <div style={{ padding: '0', height: '1px', background: '#eee', margin: '4px 0' }}></div>
                            <div className="context-menu-item" onClick={() => {
                                onFileSelect(contextMenu.itemHandle);
                                handleCloseContextMenu();
                            }}>
                                📝 編集する
                            </div>
                            <div className="context-menu-item" onClick={handleMergeFile}>
                                🔗 別のファイルに結合
                            </div>
                            <div className="context-menu-item" onClick={handleOpenNewWindow}>
                                🪟 新しいウィンドウで開く
                            </div>
                            {onShowInFinder && (
                                <div className="context-menu-item" onClick={() => {
                                    onShowInFinder(contextMenu.itemHandle);
                                    handleCloseContextMenu();
                                }}>
                                    📂 Finderで表示
                                </div>
                            )}
                            <div className="context-menu-item" onClick={handleRename}>
                                ✏️ 名前を変更
                            </div>
                            <div className="context-menu-item" onClick={togglePin}>
                                {pinnedItems.includes(itemKey(contextMenu)) ? '📍 固定を解除' : '📌 ツリー上部に固定'}
                            </div>
                            <div className="context-menu-item" onClick={handleDuplicate}>
                                📑 複製 (別名保存)
                            </div>
                            {onArchiveVersion && (
                                <div className="context-menu-item" onClick={async () => {
                                    await onArchiveVersion(contextMenu.itemHandle, contextMenu.itemType);
                                    handleCloseContextMenu();
                                }}>
                                    🗄️ version_archiveへ移動
                                </div>
                            )}
                            <div className="context-menu-item" onClick={handleDelete} style={{ color: '#d32f2f' }}>
                                🗑️ 削除
                            </div>
                        </>
                    )}
                </div>,
                document.body
            )}

            {showMergeDialog && contextMenu?.itemHandle && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="modal-content" style={{
                        background: 'white', padding: '20px', borderRadius: '8px', minWidth: '300px', maxWidth: '500px'
                    }}>
                        <h3>ファイルの結合</h3>
                        <p>「{contextMenu.itemHandle.name}」の内容を、以下のファイルの後ろに結合しますか？</p>
                        <p style={{ fontSize: '0.8rem', color: '#666' }}>※ 結合後、「{contextMenu.itemHandle.name}」は削除されます。</p>

                        <div style={{ margin: '15px 0' }}>
                            <label>結合先ファイル:</label>
                            <select
                                value={mergeTarget}
                                onChange={e => setMergeTarget(e.target.value)}
                                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                            >
                                <option value="">(選択してください)</option>
                                <option value="" disabled>---</option>
                                {allFiles
                                    .filter(f => f.name !== contextMenu.itemHandle.name) // Exclude self
                                    .map(f => (
                                        <option key={f.name} value={f.name}>{f.name}</option>
                                    ))
                                }
                            </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setShowMergeDialog(false)}>キャンセル</button>
                            <button
                                onClick={confirmMerge}
                                disabled={!mergeTarget}
                                style={{ background: '#4CAF50', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px' }}
                            >
                                結合する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRenameDialog && renameTarget && ReactDOM.createPortal(
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="modal-content" style={{
                        background: 'white', padding: '20px', borderRadius: '8px', minWidth: '300px'
                    }}>
                        <h3>名前の変更</h3>
                        <div style={{ margin: '15px 0' }}>
                            <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' }}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229) return;
                                    if (e.key === 'Enter') confirmRename();
                                    if (e.key === 'Escape') {
                                        setShowRenameDialog(false);
                                        setRenameTarget(null);
                                    }
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => {
                                setShowRenameDialog(false);
                                setRenameTarget(null);
                            }}>キャンセル</button>
                            <button
                                onClick={confirmRename}
                                disabled={!renameValue || renameValue === renameTarget.oldName}
                                style={{ background: '#2196f3', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px' }}
                            >
                                変更
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default FileTree;
