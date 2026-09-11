import React, { useMemo, useState } from 'react';

/**
 * ManuscriptPanel
 * プロジェクト内のファイル一覧を章として表示し、
 * 章選択・章分割操作を提供するサイドバーパネル。
 */
const ManuscriptPanel = ({
  allFiles = [],
  activeFile,
  onChapterSelect,
  onSplitDocument,
  onImportChapters,
  projectHandle,
}) => {
  const [showOtherDocuments, setShowOtherDocuments] = useState(false);
  const projectPath = String(projectHandle?.handle || projectHandle?.path || projectHandle || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const pathOf = f => String(typeof f === 'string' ? f : (f.path || f.handle || '')).replace(/\\/g, '/');
  const isManuscript = f => {
    const name = typeof f === 'string' ? f : (f.name || '');
    if (name.endsWith('.nexus')) return true;
    if (!/\.(txt|md)$/i.test(name)) return false;
    const path = pathOf(f).toLowerCase();
    if (/(設定|資料|プロット|人物|キャラ|用語|年表|メモ|指示)/.test(name)) return false;
    return path.includes('/manuscripts/') || /(本文|本原稿|原稿|草稿|第\d+稿|第[0-9一二三四五六七八九十]+[部章])/.test(name);
  };
  const candidateFiles = allFiles.filter(f => {
    const name = typeof f === 'string' ? f : (f.name || '');
    return (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.nexus'))
      && (showOtherDocuments || isManuscript(f));
  });
  const groups = useMemo(() => {
    const result = new Map();
    candidateFiles.forEach(file => {
      const path = pathOf(file);
      const relative = projectPath && path.startsWith(`${projectPath}/`) ? path.slice(projectPath.length + 1) : path;
      const parts = relative.split('/').filter(Boolean);
      const first = parts[0] || '現在の作品';
      const projectName = projectPath.split('/').filter(Boolean).pop() || '現在の作品';
      const groupName = parts.length <= 1 || ['manuscripts', 'archive', 'materials', 'settings'].includes(first.toLowerCase()) ? projectName : first;
      if (!result.has(groupName)) result.set(groupName, []);
      result.get(groupName).push(file);
    });
    return [...result.entries()].map(([name, files]) => ({
      name,
      files: files.sort((a, b) => pathOf(a).localeCompare(pathOf(b), 'ja')),
    })).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFiles, projectPath, showOtherDocuments]);

  const activeId = activeFile
    ? (typeof activeFile === 'string' ? activeFile : (activeFile.handle || activeFile.name || null))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '4px' }}>
        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>原稿管理</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onImportChapters && (
            <button
              onClick={onImportChapters}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid #888',
                borderRadius: '4px',
                color: 'var(--accent-color, #89b4fa)'
              }}
              title="バラバラのファイルを .nexus にまとめる"
            >
              作品化
            </button>
          )}
          {onSplitDocument && (
            <button
              onClick={onSplitDocument}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid #888',
                borderRadius: '4px',
              }}
              title="章ごとにファイル分割"
            >
              分割
            </button>
          )}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', fontSize: '11px', color: '#777' }}>
        <input type="checkbox" checked={showOtherDocuments} onChange={event => setShowOtherDocuments(event.target.checked)} />
        設定資料なども表示
      </label>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {groups.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#888', padding: '4px' }}>
            原稿として判別できるファイルがありません
          </div>
        ) : (
          groups.map(group => <section key={group.name} style={{ marginBottom: '10px' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '5px 6px', fontSize: '11px', fontWeight: 'bold', background: 'var(--bg-secondary, #f3f3f3)', borderRadius: '4px' }}>📖 {group.name} <span style={{ color: '#888', fontWeight: 'normal' }}>({group.files.length})</span></div>
            {group.files.map((f, i) => {
            const name = typeof f === 'string' ? f : (f.name || '');
            const handle = typeof f === 'string' ? f : (f.handle || f);
            const isActive = activeId && (
              activeId === (typeof handle === 'string' ? handle : (handle?.name || ''))
              || activeId === name
            );
            return (
              <div
                key={i}
                onClick={() => onChapterSelect && onChapterSelect(handle)}
                style={{
                  padding: '5px 8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  background: isActive ? 'rgba(100,140,255,0.2)' : 'transparent',
                  fontWeight: isActive ? 'bold' : 'normal',
                }}
              >
                {name}
              </div>
            );
            })}
          </section>)
        )}
      </div>
    </div>
  );
};

export default ManuscriptPanel;
