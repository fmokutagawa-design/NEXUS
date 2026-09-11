import React from 'react';
import ReactDOM from 'react-dom';
import FileTree from './FileTree';

export function SidebarFilesTab({
  projectHandle,
  projectContextMenu,
  setProjectContextMenu,
  handleRenameProject,
  handleMoveProject,
  setProjectHandle,
  setFileTree,
  setActiveFileHandle,
  setText,
  setIsProjectMode,
  handleCreateNewProject,
  savedProjectHandle,
  handleResumeProject,
  handleOpenProject,
  setShowCardCreator,
  handleRefreshTree,
  isMaterialsLoading,
  fileTree,
  activeFileHandle,
  handleFileSelect,
  handleCreateFileInProject,
  handleCreateFolderInProject,
  setPendingCreateParent,
  setInputModalMode,
  setInputModalValue,
  setShowInputModal,
  handleOpenReference,
  handleOpenInNewWindow,
  handleRename,
  handleDelete,
  handleDuplicateFile,
  handleMoveItem,
  handleArchiveVersion,
  handleSaveFile,
  fileInputRef,
  debouncedText,
  showToast,
  handlePrint,
  openInputModal,
  handleLoadFile
}) {
  return (
    <>
      {projectHandle && (
        <div className="project-tree-container" style={{ display: 'flex', flexDirection: 'column' }}>
          {projectContextMenu && ReactDOM.createPortal(
            <>
              <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
                onClick={() => setProjectContextMenu(null)}
              />
              <div className="context-menu" style={{
                position: 'fixed',
                top: projectContextMenu.y,
                left: projectContextMenu.x,
                zIndex: 99999
              }}>
                <div className="context-menu-item" onClick={() => {
                  handleRenameProject();
                  setProjectContextMenu(null);
                }}>
                  ✏️ 名前を変更
                </div>
                <div className="context-menu-item" onClick={() => {
                  handleMoveProject();
                  setProjectContextMenu(null);
                }}>
                  🚚 移動
                </div>
                <div style={{ padding: '0', height: '1px', background: '#eee', margin: '4px 0' }}></div>
                <div className="context-menu-item" onClick={async () => {
                  setProjectHandle(null);
                  setFileTree([]);
                  setActiveFileHandle(null);
                  setText('');
                  setIsProjectMode(false);
                  setProjectContextMenu(null);
                }} style={{ color: '#d32f2f' }}>
                  ✖️ プロジェクトを閉じる
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
      )}

      {!projectHandle && (
        <div className="project-welcome-section" style={{ padding: '10px' }}>
          <button className="btn-open-project" onClick={handleCreateNewProject}>
            ✨ 新規プロジェクト作成
          </button>
          {savedProjectHandle && (
            <button
              className="btn-open-project"
              onClick={handleResumeProject}
              style={{ background: '#2196f3' }}
            >
              📂 {savedProjectHandle.name} を再開
            </button>
          )}
          <button
            className="btn-open-project"
            onClick={handleOpenProject}
            style={{ background: '#6c757d' }}
          >
            📂 フォルダを開く
          </button>
        </div>
      )}

      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '5px' }}>
          <button
            onClick={() => setShowCardCreator(true)}
            style={{
              flex: 1,
              padding: '6px',
              background: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: 'bold',
              fontSize: '13px'
            }}
          >
            cards 🃏 新規カード作成
          </button>
          {projectHandle && (
            <button
              onClick={handleRefreshTree}
              title="ファイルツリーを更新"
              style={{
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px'
              }}
            >
              🔄
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {projectHandle ? (
            isMaterialsLoading ? (
              <div style={{ padding: '1rem', color: '#666', fontSize: '0.85rem', textAlign: 'center' }}>
                読み込み中...
              </div>
            ) : fileTree.length > 0 ? (
              <FileTree
                tree={fileTree}
                projectKey={typeof projectHandle === 'string' ? projectHandle : projectHandle?.name}
                activeFile={activeFileHandle ? (activeFileHandle.handle || activeFileHandle) : null}
                onFileSelect={handleFileSelect}
                onCreateFile={handleCreateFileInProject}
                onCreateFolder={handleCreateFolderInProject}
                onRequestCreateFile={(parent) => {
                  setPendingCreateParent(parent);
                  setInputModalMode('create_file');
                  setInputModalValue('');
                  setShowInputModal(true);
                }}
                onRequestCreateFolder={(parent) => {
                  setPendingCreateParent(parent);
                  setInputModalMode('create_folder');
                  setInputModalValue('');
                  setShowInputModal(true);
                }}
                onOpenReference={handleOpenReference}
                onOpenInNewWindow={handleOpenInNewWindow}
                onShowInFinder={(handle) => {
                  if (window.api?.fs?.showInExplorer) {
                    const filePath = typeof handle === 'string' ? handle : handle.name;
                    window.api.fs.showInExplorer(filePath);
                  }
                }}
                onRename={handleRename}
                onDelete={handleDelete}
                onDuplicate={handleDuplicateFile}
                onMove={handleMoveItem}
                onArchiveVersion={handleArchiveVersion}
              />
            ) : (
              <div style={{ padding: '1rem', color: '#999', fontSize: '0.85rem', textAlign: 'center' }}>
                ファイルが見つかりません
              </div>
            )
          ) : (
            <div style={{ padding: '1rem', color: '#999', fontSize: '0.85rem', textAlign: 'center' }}>
              プロジェクトフォルダを開いてください
            </div>
          )}
        </div>
      </div>

      {/* Footer Area with File Actions - Refined Grid with Labels */}
      <div className="sidebar-footer">
        <div className="file-actions-grid">
          <button className="action-btn-compact" onClick={handleSaveFile} title="上書き保存">
            <span className="icon">💾</span>
            <span className="label">保存</span>
          </button>
          <button className="action-btn-compact" onClick={() => handleDuplicateFile()} title="別名で保存">
            <span className="icon">📑</span>
            <span className="label">別名</span>
          </button>
          <button className="action-btn-compact" onClick={() => fileInputRef.current?.click()} title="読込">
            <span className="icon">📂</span>
            <span className="label">読込</span>
          </button>
          <button className="action-btn-compact" onClick={() => {
            navigator.clipboard.writeText(debouncedText).then(() => showToast('コピーしました')).catch(e => console.error(e));
          }} title="本文をコピー">
            <span className="icon">📋</span>
            <span className="label">コピー</span>
          </button>

          <button className="action-btn-compact" onClick={handlePrint} title="印刷">
            <span className="icon">🖨️</span>
            <span className="label">印刷</span>
          </button>
          <button
            className="action-btn-compact"
            onClick={() => {
              openInputModal('新規ファイル', 'ファイル名...', '', async (fileName) => {
                if (fileName) {
                  const fullName = fileName.trim().endsWith('.txt') ? fileName.trim() : `${fileName.trim()}.txt`;
                  try {
                    const newFile = await handleCreateFileInProject(null, fullName);
                    if (newFile) await handleFileSelect(newFile);
                  } catch (err) { showToast("作成失敗: " + err.message); }
                }
              });
            }}
            title="新規ファイル"
          >
            <span className="icon">📄</span>
            <span className="label">新規</span>
          </button>
          <button
            className="action-btn-compact"
            onClick={() => {
              openInputModal('新規フォルダ', 'フォルダ名...', '', async (folderName) => {
                if (folderName) {
                  handleCreateFolderInProject(null, folderName.trim()).catch(err => showToast("作成失敗: " + err.message));
                }
              });
            }}
            title="新規フォルダ"
          >
            <span className="icon">📁</span>
            <span className="label">フォルダ</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLoadFile(file);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </>
  );
}
