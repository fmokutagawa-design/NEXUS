import React, { useState, useEffect } from 'react';
import { MATERIAL_TEMPLATES, AI_ORGANIZE_PROMPT } from '../constants/templates';
import { createFile } from '../utils/fileSystemUtils';
import { folderDisplayPriority, workLocationPriority } from '../utils/workManagement.mjs';

const MaterialsPanel = ({
    projectHandle,
    onOpenFile,
    onOpenInNewWindow,
    currentFile,
    currentFileContent,
    onRefresh,
    materialsTree = [],
    allMaterialFiles = [],
    availableTags = new Set(),
    isLoading = false,
    usageStats = {},
    onCreateFileWithTag,
    onBatchCopy
}) => {
    const [selectedTag, setSelectedTag] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState(new Set(['root']));
    const [showNewMenu, setShowNewMenu] = useState(false);
    const [sortMode, setSortMode] = useState('name'); // 'name' or 'frequency'
    const [manualTags, setManualTags] = useState(new Set()); // State for manually added tags
    const [selectedWork, setSelectedWork] = useState('');
    const [showFolderTree, setShowFolderTree] = useState(false);

    const projectPath = String(projectHandle?.handle || projectHandle?.path || projectHandle || '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');
    const filePath = file => String(file?.path || file?.handle || '').normalize('NFC').replace(/\\/g, '/');
    const workInfoFor = file => {
        const path = filePath(file);
        const relative = projectPath && path.startsWith(`${projectPath}/`) ? path.slice(projectPath.length + 1) : path;
        const parts = relative.split('/').filter(Boolean);
        const first = parts[0] || '';
        const projectName = projectPath.split('/').filter(Boolean).pop() || '現在の作品';
        const category = ['manuscripts', 'archive', 'materials', 'settings'].includes(first.toLowerCase());
        if (category && parts.length >= 3) {
            return { name: parts[1].replace(/\.nexus$/i, ''), path: `${projectPath}/${first}/${parts[1]}` };
        }
        if (parts.length > 1 && !category) return { name: first, path: `${projectPath}/${first}` };
        return { name: projectName, path: projectPath };
    };
    const workPathByName = new Map();
    allMaterialFiles.filter(file => file.kind === 'file').forEach(file => {
        const info = workInfoFor(file);
        if (info.name && !workPathByName.has(info.name)) workPathByName.set(info.name, info.path);
    });
    const workOptions = [...workPathByName.keys()].sort((a, b) => a.localeCompare(b, 'ja'));
    const workScopedFiles = selectedWork ? allMaterialFiles.filter(file => workInfoFor(file).name === selectedWork) : allMaterialFiles;
    const selectedWorkPath = selectedWork ? workPathByName.get(selectedWork) || projectPath : projectPath;
    const knowledgeFiles = workScopedFiles.filter(file => {
        if (file.kind !== 'file' || !/\.(txt|md)$/i.test(file.name || '')) return false;
        const path = filePath(file).toLowerCase();
        if (path.includes('/archive/') || path.includes('/manuscripts/') || path.includes('.nexus/')) return false;
        return !/(本文|本原稿|原稿|草稿|第\d+稿)/.test(file.name || '');
    });

    // Load manual tags from localStorage
    useEffect(() => {
        try {
            const savedTags = localStorage.getItem('novel-editor-manual-tags');
            if (savedTags) {
                setManualTags(new Set(JSON.parse(savedTags)));
            }
        } catch (e) {
            console.error('Failed to load manual tags:', e);
        }
    }, []);

    // 開いているファイルが属する作品を入口の初期値にする。
    useEffect(() => {
        if (selectedWork || !currentFile) return;
        const currentWork = workInfoFor(currentFile).name;
        if (workOptions.includes(currentWork)) setSelectedWork(currentWork);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFile, projectPath, allMaterialFiles.length]);

    const handleAddManualTag = () => {
        const tagName = prompt('新しいタグ名を入力してください:');
        if (tagName && tagName.trim()) {
            const newTag = tagName.trim();
            const updatedManualTags = new Set(manualTags);
            updatedManualTags.add(newTag);
            setManualTags(updatedManualTags);

            // Persist
            try {
                localStorage.setItem('novel-editor-manual-tags', JSON.stringify(Array.from(updatedManualTags)));
            } catch (e) { console.error(e); }
        }
    };

    // Combine file tags with manual tags
    const displayTags = new Set([...availableTags, ...manualTags]);

    // Expand root by default when tree loads
    useEffect(() => {
        if (materialsTree.length > 0) {
            const root = materialsTree[0];
            const rootPath = root?.name || 'root';
            const manuscript = root?.children?.find(item => item.kind === 'directory' && item.name?.toLowerCase() === 'manuscripts');
            setExpandedFolders(prev => new Set([
                ...prev,
                rootPath,
                ...(manuscript ? [`${rootPath}/${manuscript.name}`] : []),
            ]));
        }
    }, [materialsTree]);

    const handleCreateMaterial = async (type) => {
        if (!projectHandle) return;

        const template = MATERIAL_TEMPLATES[type];
        const name = prompt(`${template.name} の名前を入力してください: `);
        if (!name) return;

        try {
            const materialsHandle = await projectHandle.getDirectoryHandle('materials', { create: true });

            // Create subfolder based on type
            let targetHandle = materialsHandle;
            let subfolder = '';

            if (type === 'character') subfolder = 'characters';
            else if (type === 'world') subfolder = 'world';
            else if (type === 'item') subfolder = 'items';
            else if (type === 'plot') subfolder = 'plots';

            if (subfolder) {
                targetHandle = await materialsHandle.getDirectoryHandle(subfolder, { create: true });
            }

            const fileName = name.endsWith('.txt') ? name : `${name}.txt`;
            // Add a default tag based on type
            const contentWithTag = template.content + `\n\n#${type === 'character' ? '登場人物' : type === 'world' ? '世界観' : type === 'item' ? '用語' : 'プロット'} `;

            await createFile(targetHandle, fileName, contentWithTag);

            onRefresh(); // Refresh parent
            setShowNewMenu(false);
        } catch (error) {
            console.error('Failed to create material:', error);
            alert('作成に失敗しました。');
        }
    };

    const handleAIOrganize = () => {
        if (!currentFileContent) {
            alert('整理するファイルを開いてください。');
            return;
        }

        const prompt = AI_ORGANIZE_PROMPT + '\n' + currentFileContent;
        navigator.clipboard.writeText(prompt).then(() => {
            alert('📋 ChatGPT用のプロンプトをコピーしました！\n\nChatGPTに貼り付けて、結果をここに書き戻してください。');
        }).catch(() => {
            alert('コピーに失敗しました。');
        });
    };

    const handleTagClick = (tag) => {
        if (selectedTag === tag) {
            setSelectedTag(null);
        } else {
            setSelectedTag(tag);
        }
    };

    const handleInsertTag = (tag, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(tag + ' ').then(() => {
            // Show small feedback
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = '✅';
            setTimeout(() => btn.innerText = originalText, 1000);
        });
    };

    const toggleFolder = (path) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpandedFolders(newExpanded);
    };

    const sortItems = (items, pathPrefix) => {
        if (!items) return [];
        return [...items].sort((a, b) => {
            // Always directories first
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;

            if (a.kind === 'directory') {
                const priority = folderDisplayPriority(a.name) - folderDisplayPriority(b.name);
                if (priority !== 0) return priority;
            }

            if (sortMode === 'frequency' && a.kind === 'file') {
                const pathA = pathPrefix ? `${pathPrefix}/${a.name}` : a.name;
                const pathB = pathPrefix ? `${pathPrefix}/${b.name}` : b.name;
                const countA = usageStats[pathA] || 0;
                const countB = usageStats[pathB] || 0;
                if (countA !== countB) return countB - countA;
            }
            return a.name.localeCompare(b.name);
        });
    };

    const renderTree = (items, pathPrefix = '') => {
        const sortedItems = sortItems(items, pathPrefix);
        return sortedItems.map((item) => {
            const currentPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;

            if (item.kind === 'directory') {
                // If filtering by tag, check if this folder contains matching files
                if (selectedTag) {
                    return null;
                }

                const isExpanded = expandedFolders.has(currentPath);
                return (
                    <div key={currentPath} className="material-folder">
                        <div
                            className="material-folder-header"
                            onClick={() => toggleFolder(currentPath)}
                        >
                            <span className="folder-icon">{isExpanded ? '📂' : '📁'}</span>
                            <span className="folder-name">{item.name}</span>
                        </div>
                        {isExpanded && (
                            <div className="folder-children">
                                {item.children && renderTree(item.children, currentPath)}
                            </div>
                        )}
                    </div>
                );
            } else {
                // File
                if (selectedTag) {
                    // Check if file metadata contains the tag (in either 'tags' or '作品')
                    const fileData = allMaterialFiles.find(f => f.name === item.name && (f.path === currentPath || f.path.endsWith(currentPath)));
                    if (!fileData || !fileData.metadata) {
                        return null;
                    }

                    // Check tags array
                    const hasCategoryTag = fileData.metadata.tags && fileData.metadata.tags.includes(selectedTag);

                    // Check 作品 field
                    const hasWorkTag = fileData.metadata.作品 && fileData.metadata.作品.split(',').map(t => t.trim()).includes(selectedTag);

                    if (!hasCategoryTag && !hasWorkTag) {
                        return null;
                    }
                }

                return (
                    <div
                        key={currentPath}
                        className={`material-file ${currentFile?.name === item.name ? 'active' : ''}`}
                        onClick={() => onOpenFile(item.handle, item.name)}
                        style={{ display: 'flex', alignItems: 'center' }}
                    >
                        <span className="file-icon">📄</span>
                        <span className="file-name" style={{ flex: 1 }}>{item.name}</span>
                        {onOpenInNewWindow && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenInNewWindow(item.handle);
                                }}
                                title="新しいウィンドウで開く"
                                style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: '5px', opacity: 0.7, fontSize: '0.8rem' }}
                            >
                                ↗️
                            </button>
                        )}
                    </div>
                );
            }
        });
    };

    const renderFilteredList = () => {
        const filtered = knowledgeFiles.filter(file => {
            if (selectedTag === 'unset') {
                const noTags = !file.metadata?.tags || file.metadata.tags.length === 0;
                const noWork = !file.metadata?.作品 || !file.metadata.作品.trim();
                return noTags && noWork;
            }
            if (!file.metadata) return false;

            // Check tags array
            const hasCategoryTag = file.metadata.tags && file.metadata.tags.includes(selectedTag);

            // Check 作品 field
            const hasWorkTag = file.metadata.作品 && file.metadata.作品.split(',').map(t => t.trim()).includes(selectedTag);

            return hasCategoryTag || hasWorkTag;
        });

        filtered.sort((a, b) => {
            const locationPriority = workLocationPriority(a.path) - workLocationPriority(b.path);
            if (locationPriority !== 0) return locationPriority;
            if (sortMode === 'frequency') {
                const countA = usageStats[a.path] || 0;
                const countB = usageStats[b.path] || 0;
                if (countA !== countB) return countB - countA;
            }
            return a.name.localeCompare(b.name);
        });

        return filtered.map(file => (
            <div
                key={file.path}
                className={`material-file ${currentFile?.name === file.name ? 'active' : ''}`}
                onClick={() => onOpenFile(file.handle, file.name)}
                style={{ display: 'flex', alignItems: 'center' }}
            >
                <span className="file-icon">📄</span>
                <span className="file-name" style={{ flex: 1 }}>{file.name}</span>
                <span className="file-path-hint" style={{ marginRight: '5px' }}>{file.path.split('/').slice(0, -1).join('/')}</span>
                {onOpenInNewWindow && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenInNewWindow(file.handle);
                        }}
                        title="新しいウィンドウで開く"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7 }}
                    >
                        ↗️
                    </button>
                )}
            </div>
        ));
    };

    return (
        <div className="materials-panel">
            <div className="materials-header">
                <h3>📚 資料・知識</h3>
                <div className="materials-actions">
                    <button
                        className="sort-btn"
                        onClick={() => setSortMode(sortMode === 'name' ? 'frequency' : 'name')}
                        title={sortMode === 'name' ? '使用頻度順に切り替え' : '名前順に切り替え'}
                        style={{ marginRight: '8px', padding: '4px 8px', fontSize: '0.8rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {sortMode === 'name' ? '🔤 名前順' : '📊 頻度順'}
                    </button>
                    <button onClick={() => setShowFolderTree(value => !value)} title="従来のフォルダツリー表示" style={{ padding: '4px 8px', fontSize: '0.8rem', background: showFolderTree ? 'var(--bg-secondary)' : 'none', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>
                        {showFolderTree ? '作品別表示' : 'フォルダ表示'}
                    </button>
                    <button
                        className="new-material-btn"
                        onClick={() => setShowNewMenu(!showNewMenu)}
                    >
                        ＋ 新規作成
                    </button>
                    <button
                        className="ai-organize-btn"
                        onClick={handleAIOrganize}
                        title="AI整理プロンプトをコピー"
                    >
                        ✨ AI整理
                    </button>
                    <button
                        className="ai-link-btn"
                        onClick={() => window.open('https://chatgpt.com/', '_blank')}
                        title="ChatGPTを開く"
                        style={{
                            marginLeft: '4px',
                            padding: '4px 8px',
                            fontSize: '0.8rem',
                            background: 'none',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        ↗️
                    </button>
                </div>

                {showNewMenu && (
                    <div className="template-menu">
                        {Object.entries(MATERIAL_TEMPLATES).map(([key, template]) => (
                            <div
                                key={key}
                                className="template-item"
                                onClick={() => handleCreateMaterial(key)}
                            >
                                <span className="template-icon">{template.icon}</span>
                                <span className="template-name">{template.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ margin: '12px', padding: '14px 16px', display: 'grid', gridTemplateColumns: 'minmax(260px, 1.35fr) minmax(260px, 1fr)', gap: '14px', border: '1px solid #c7d2fe', borderRadius: '12px', background: 'linear-gradient(135deg, #f5f7ff, #fbf7ff)', color: '#29244a' }}>
                <div>
                    <div style={{ fontSize: '17px', fontWeight: 800 }}>作品の「どこに書いたか」を探す</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: 1.65, color: '#5d5875' }}>
                        人物名・地名・固有用語を本文、設定、プロットから高速検索します。見つけた箇所は出典と行番号付きで、ChatGPTやClaudeへ渡す一つの相談資料にできます。
                    </div>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '10px', fontSize: '11px', color: '#6d28d9' }}><span>✓ 全文を毎回読まない</span><span>✓ 旧稿・重複を区別</span><span>✓ AIなしで検索</span></div>
                </div>
                <div style={{ padding: '11px', borderRadius: '9px', background: 'rgba(255,255,255,.8)', border: '1px solid #ddd6fe' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '11px', fontWeight: 700 }}>検索する作品</label>
                    <select value={selectedWork} onChange={event => { setSelectedWork(event.target.value); setSelectedTag(null); }} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #aaa', borderRadius: '6px' }}>
                        <option value="">全作品を横断</option>
                        {workOptions.map(work => <option key={work} value={work}>{work}</option>)}
                    </select>
                    <button onClick={() => window.api?.invoke?.('window:openKnowledge', selectedWorkPath)} disabled={!selectedWorkPath} style={{ width: '100%', marginTop: '8px', padding: '9px 12px', border: 'none', borderRadius: '7px', background: '#6d28d9', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: selectedWorkPath ? 'pointer' : 'default' }}>
                        🗂️ 資料棚・全文検索を開く
                    </button>
                    <div style={{ marginTop: '6px', fontSize: '10px', color: '#777' }}>
                        {selectedWork ? `「${selectedWork}」の資料を、作品・年代・新旧・保存場所から探せます` : '全作品の資料を、作品・年代・新旧・保存場所から探せます'}。本文中の語句による全文検索も同じ画面です。
                    </div>
                </div>
            </div>

            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '12px' }}>{selectedWork ? `${selectedWork} の資料` : '全作品の資料'}</strong>
                <span style={{ fontSize: '11px', color: '#777' }}>{knowledgeFiles.length}件</span>
            </div>

            {/* Tag Cloud */}
            {(displayTags.size > 0) && (
                <div className="tags-container">
                    <div className="tags-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>タグ ({displayTags.size})</span>
                            <button
                                className="add-tag-btn"
                                onClick={handleAddManualTag}
                                title="タグを手動追加"
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    color: 'var(--accent-color)'
                                }}
                            >
                                ＋
                            </button>
                        </div>
                        {selectedTag && (
                            <button
                                className="clear-filter-btn"
                                onClick={() => setSelectedTag(null)}
                                title="フィルタをクリア"
                            >
                                ✕ クリア
                            </button>
                        )}
                    </div>
                    <div className="tags-list">
                        {/* Unset Tag Alert */}
                        {(() => {
                            const unsetCount = knowledgeFiles.filter(f => {
                                const noTags = !f.metadata?.tags || f.metadata.tags.length === 0;
                                const noWork = !f.metadata?.作品 || !f.metadata.作品.trim();
                                return noTags && noWork;
                            }).length;
                            if (unsetCount === 0) return null;
                            return (
                                <span
                                    className={`tag-chip warning ${selectedTag === 'unset' ? 'active' : ''}`}
                                    onClick={() => handleTagClick('unset')}
                                    title="タグが設定されていないファイル"
                                    style={{ borderColor: '#ffb74d', color: '#f57c00', backgroundColor: selectedTag === 'unset' ? '#fff3e0' : 'transparent' }}
                                >
                                    ⚠️ 未設定 <span className="tag-count">({unsetCount})</span>
                                </span>
                            );
                        })()}

                        {Array.from(displayTags).map(tag => {
                            // Count files with this tag (check both tags and 作品)
                            const fileCount = knowledgeFiles.filter(f => {
                                if (!f.metadata) return false;
                                const hasCategoryTag = f.metadata.tags && f.metadata.tags.includes(tag);
                                const hasWorkTag = f.metadata.作品 && f.metadata.作品.split(',').map(t => t.trim()).includes(tag);
                                return hasCategoryTag || hasWorkTag;
                            }).length;

                            return (
                                <span
                                    key={tag}
                                    className={`tag-chip ${selectedTag === tag ? 'active' : ''}`}
                                    onClick={() => handleTagClick(tag)}
                                    title={`クリックで絞り込み (${fileCount}件)`}
                                >
                                    {tag} <span className="tag-count">({fileCount})</span>
                                    {/* Action Buttons */}
                                    <div className="tag-actions" style={{ display: 'inline-flex', marginLeft: '4px', gap: '2px' }}>
                                        {/* New: Create File with this Tag */}
                                        <button
                                            className="tag-action-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCreateFileWithTag(tag);
                                            }}
                                            title={`「${tag}」タグ付きで新規ファイル作成`}
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            ➕
                                        </button>

                                        {/* Existing: Copy Tag to Clipboard */}
                                        <button
                                            className="tag-action-btn"
                                            onClick={(e) => handleInsertTag(tag, e)}
                                            title="タグをコピー"
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            📋
                                        </button>
                                    </div>
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="materials-list">
                {isLoading ? (
                    <div className="loading">読み込み中...</div>
                ) : selectedTag ? (
                    <div className="filtered-view">
                        <div className="filter-header">
                            <span>🏷️ {selectedTag === 'unset' ? '⚠️ 未設定' : selectedTag} の検索結果: {
                                selectedTag === 'unset'
                                    ? knowledgeFiles.filter(f => {
                                        const noTags = !f.metadata?.tags || f.metadata.tags.length === 0;
                                        const noWork = !f.metadata?.作品 || !f.metadata.作品.trim();
                                        return noTags && noWork;
                                    }).length
                                    : knowledgeFiles.filter(f => {
                                        if (!f.metadata) return false;
                                        const hasCategoryTag = f.metadata.tags && f.metadata.tags.includes(selectedTag);
                                        const hasWorkTag = f.metadata.作品 && f.metadata.作品.split(',').map(t => t.trim()).includes(selectedTag);
                                        return hasCategoryTag || hasWorkTag;
                                    }).length
                            }件</span>
                            {/* New: Batch Copy Button */}
                            <button
                                onClick={() => {
                                    const filteredFiles = selectedTag === 'unset'
                                        ? knowledgeFiles.filter(f => {
                                            const noTags = !f.metadata?.tags || f.metadata.tags.length === 0;
                                            const noWork = !f.metadata?.作品 || !f.metadata.作品.trim();
                                            return noTags && noWork;
                                        })
                                        : knowledgeFiles.filter(f => {
                                            if (!f.metadata) return false;
                                            const hasCategoryTag = f.metadata.tags && f.metadata.tags.includes(selectedTag);
                                            const hasWorkTag = f.metadata.作品 && f.metadata.作品.split(',').map(t => t.trim()).includes(selectedTag);
                                            return hasCategoryTag || hasWorkTag;
                                        });
                                    onBatchCopy(filteredFiles);
                                }}
                                title="表示中の全ファイルの内容をクリップボードにコピー"
                                style={{
                                    marginLeft: 'auto',
                                    padding: '2px 8px',
                                    fontSize: '0.8rem',
                                    border: '1px solid var(--accent-color)',
                                    borderRadius: '4px',
                                    background: 'white',
                                    color: 'var(--accent-color)',
                                    cursor: 'pointer'
                                }}
                            >
                                📋 全てコピー
                            </button>
                        </div>
                        {renderFilteredList()}
                    </div>
                ) : showFolderTree && materialsTree.length > 0 ? (
                    renderTree(materialsTree)
                ) : knowledgeFiles.length > 0 ? (
                    <div className="filtered-view">{knowledgeFiles
                        .slice()
                        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))
                        .map(file => (
                            <div key={filePath(file)} className={`material-file ${currentFile?.name === file.name ? 'active' : ''}`} onClick={() => onOpenFile(file.handle || file, file.name)} style={{ display: 'flex', alignItems: 'center' }}>
                                <span className="file-icon">📄</span>
                                <span className="file-name" style={{ flex: 1 }}>{file.name}</span>
                                <span className="file-path-hint">{workInfoFor(file).name}</span>
                            </div>
                        ))}</div>
                ) : (
                    <div className="empty-state">
                        資料がありません。<br />
                        「新規作成」から作成してください。
                    </div>
                )}
            </div>
        </div>
    );
};

export default MaterialsPanel;
