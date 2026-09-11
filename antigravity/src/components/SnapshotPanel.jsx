import React, { useState, useEffect, useCallback } from 'react';
import {
    getSnapshots,
    clearSnapshots,
    getSnapshotGroups,
    deleteSnapshotGroups,
    getLocalStorageBreakdown,
} from '../utils/snapshotStore';

const SnapshotPanel = ({ filePath, currentText, onRestore, showToast, onSaveNow }) => {
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [previewId, setPreviewId] = useState(null);
    const [diffView, setDiffView] = useState(null);
    const [storageInfo, setStorageInfo] = useState({ snapshotBytes: 0, draftBytes: 0, otherBytes: 0, totalBytes: 0 });
    const [showManager, setShowManager] = useState(false);
    const [snapshotGroups, setSnapshotGroups] = useState([]);
    const [selectedPaths, setSelectedPaths] = useState(() => new Set());
    const [managerFilter, setManagerFilter] = useState('all');
    const [openedAt] = useState(() => Date.now());

    const calculateStorageUsage = () => {
        return getLocalStorageBreakdown();
    };

    const loadManager = useCallback(async () => {
        setSnapshotGroups(await getSnapshotGroups());
        setStorageInfo(calculateStorageUsage());
    }, []);

    const openManager = async () => {
        await loadManager();
        setShowManager(true);
    };

    const handleDeleteSelected = async () => {
        const selected = snapshotGroups.filter(group => selectedPaths.has(group.filePath));
        if (selected.length === 0) return;
        const count = selected.reduce((sum, group) => sum + group.count, 0);
        const bytes = selected.reduce((sum, group) => sum + group.bytes, 0);
        const confirmed = window.confirm(
            `${selected.length}ファイル、${count}件（${formatBytes(bytes)}）のスナップショットを削除します。\n原稿ファイル本体は削除されません。`
        );
        if (!confirmed) return;
        const removed = await deleteSnapshotGroups(selected.map(group => group.filePath));
        setSelectedPaths(new Set());
        await loadManager();
        await loadSnapshots();
        if (showToast) showToast(`${removed.snapshotCount}件のスナップショットを削除しました`);
    };

    const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const loadSnapshots = useCallback(async () => {
        if (!filePath) {
            setSnapshots([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const list = await getSnapshots(filePath);
            setSnapshots(list);
            setStorageInfo(calculateStorageUsage());
        } catch (e) {
            console.error('Failed to load snapshots:', e);
            setSnapshots([]);
        }
        setLoading(false);
    }, [filePath]);

    useEffect(() => {
        loadSnapshots();
    }, [loadSnapshots]);

    const handlePreview = (snapshot) => {
        if (previewId === snapshot.id) {
            setPreviewId(null);
            setDiffView(null);
            return;
        }
        setPreviewId(snapshot.id);
        // 簡易diff: 行単位で比較
        const currentLines = (currentText || '').split('\n');
        const snapshotLines = (snapshot.content || '').split('\n');
        const maxLen = Math.max(currentLines.length, snapshotLines.length);
        const diffs = [];
        for (let i = 0; i < maxLen; i++) {
            const cur = currentLines[i] || '';
            const snap = snapshotLines[i] || '';
            if (cur !== snap) {
                diffs.push({ line: i + 1, current: cur, snapshot: snap });
            }
        }
        setDiffView({ snapshotId: snapshot.id, diffs, totalDiffs: diffs.length });
    };

    const handleRestore = (snapshot) => {
        if (onRestore) {
            onRestore(snapshot.content, snapshot);
            if (showToast) showToast(`${formatTime(snapshot.timestamp)} の状態に復元しました`);
            setPreviewId(null);
            setDiffView(null);
        }
    };

    const handleClear = async () => {
        if (!filePath) return;
        try {
            await clearSnapshots(filePath);
            setSnapshots([]);
            setStorageInfo(calculateStorageUsage());
            if (showToast) showToast('履歴をクリアしました');
        } catch (e) {
            console.error('Failed to clear snapshots:', e);
        }
    };

    const formatTime = (ts) => {
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ' ' +
            d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    };

    const formatAgo = (ts) => {
        const diff = openedAt - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'たった今';
        if (mins < 60) return `${mins}分前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}時間前`;
        const days = Math.floor(hours / 24);
        return `${days}日前`;
    };

    const oldBoundary = openedAt - (30 * 24 * 60 * 60 * 1000);
    const visibleGroups = snapshotGroups.filter(group => {
        if (managerFilter === 'old') return group.newestAt && group.newestAt < oldBoundary;
        if (managerFilter === 'current') return group.filePath === filePath;
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-secondary)',
                fontSize: '13px',
                fontWeight: 'bold'
            }}>
                <span>📸 {showManager ? '全体のスナップショット管理' : 'スナップショット'}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {!showManager && onSaveNow && currentText && (
                        <button
                            disabled={currentText.length > 100000}
                            title={currentText.length > 100000 ? '10万字を超える本文は現在の保存方式ではスナップショットにできません' : '現在の本文をスナップショットに保存'}
                            onClick={async () => {
                                await onSaveNow();
                                await loadSnapshots();
                                if (showToast) showToast('スナップショットを保存しました');
                            }}
                            style={{ border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: currentText.length > 100000 ? 'not-allowed' : 'pointer' }}
                        >
                            今すぐ保存
                        </button>
                    )}
                    <button
                        onClick={() => { if (showManager) setShowManager(false); else openManager(); }}
                        style={{ border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}
                    >
                        {showManager ? '現在のファイルへ戻る' : '全体を管理'}
                    </button>
                {!showManager && snapshots.length > 0 && (
                    <button
                        onClick={handleClear}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)'
                        }}
                    >
                        🗑 全削除
                    </button>
                )}
                </div>
            </div>

            {showManager ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    <div style={{ padding: '10px', marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '11px', lineHeight: 1.7 }}>
                        <strong>削除されるのはNEXUS内部の復元履歴だけです。原稿ファイル本体には触れません。</strong><br />
                        スナップショット {formatBytes(storageInfo.snapshotBytes)} ／ 復元用の現在本文 {formatBytes(storageInfo.draftBytes)} ／ 設定・その他 {formatBytes(storageInfo.otherBytes)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <select value={managerFilter} onChange={event => setManagerFilter(event.target.value)}>
                            <option value="all">すべて</option>
                            <option value="old">最終保存が30日以上前</option>
                            <option value="current">現在のファイル</option>
                        </select>
                        <button onClick={() => setSelectedPaths(new Set(visibleGroups.map(group => group.filePath)))}>表示中をすべて選択</button>
                        <button onClick={() => setSelectedPaths(new Set())}>選択解除</button>
                        <button disabled={selectedPaths.size === 0} onClick={handleDeleteSelected} style={{ color: '#b42318' }}>
                            選択した履歴を削除（{selectedPaths.size}）
                        </button>
                    </div>
                    {visibleGroups.length === 0 ? <p style={{ color: '#888', fontSize: '12px' }}>該当するスナップショットはありません。</p> : visibleGroups.map(group => {
                        const selected = selectedPaths.has(group.filePath);
                        const name = group.filePath.split(/[/\\]/).pop() || group.filePath;
                        return <label key={group.storageKey} style={{ display: 'flex', gap: '10px', padding: '10px', marginBottom: '7px', border: `1px solid ${selected ? 'var(--accent-color,#3498db)' : 'var(--border-color)'}`, borderRadius: '6px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selected} onChange={() => setSelectedPaths(previous => {
                                const next = new Set(previous);
                                if (next.has(group.filePath)) next.delete(group.filePath); else next.add(group.filePath);
                                return next;
                            })} />
                            <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                    <strong style={{ overflowWrap: 'anywhere' }}>{name}</strong>
                                    {group.filePath === filePath && <span style={{ color: '#176b3a', fontWeight: 700 }}>使用中</span>}
                                </span>
                                <span style={{ display: 'block', color: '#777', fontSize: '10px', overflowWrap: 'anywhere', marginTop: '3px' }}>{group.filePath}</span>
                                <span style={{ display: 'block', color: '#777', fontSize: '10px', marginTop: '3px' }}>{group.count}件・{formatBytes(group.bytes)}・最終 {group.newestAt ? formatTime(group.newestAt) : '不明'}</span>
                            </span>
                        </label>;
                    })}
                </div>
            ) : !filePath ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
                    ファイルを開いてください
                </div>
            ) : loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
                    読み込み中...
                </div>
            ) : snapshots.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
                    スナップショットはまだありません。<br />
                    <span style={{ fontSize: '11px' }}>5分ごと、または大きな変更時に自動保存されます。</span>
                    {currentText?.length > 100000 && <><br /><span style={{ color: '#b42318', fontSize: '11px' }}>この本文は10万字を超えるため、現在の方式では保存対象外です。</span></>}
                </div>
            ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                        {snapshots.length}件の履歴
                    </div>
                    {snapshots.map((snap) => (
                        <div key={snap.id} style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            marginBottom: '6px',
                            backgroundColor: previewId === snap.id ? 'var(--bg-tertiary, #f0f0f0)' : 'var(--bg-card, #fff)',
                            overflow: 'hidden'
                        }}>
                            <div
                                onClick={() => handlePreview(snap)}
                                style={{
                                    padding: '8px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '12px'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{formatTime(snap.timestamp)}</div>
                                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                                        {formatAgo(snap.timestamp)} · {snap.charCount || snap.content?.length || 0}文字
                                    </div>
                                </div>
                                <span style={{ fontSize: '10px', color: '#aaa' }}>
                                    {previewId === snap.id ? '▼' : '▶'}
                                </span>
                            </div>

                            {previewId === snap.id && diffView && diffView.snapshotId === snap.id && (
                                <div style={{
                                    borderTop: '1px solid var(--border-color)',
                                    padding: '8px 10px',
                                    fontSize: '11px'
                                }}>
                                    {diffView.totalDiffs === 0 ? (
                                        <div style={{ color: '#888', textAlign: 'center' }}>現在のテキストと同一です</div>
                                    ) : (
                                        <>
                                            <div style={{ color: '#888', marginBottom: '6px' }}>
                                                {diffView.totalDiffs}行の差分
                                            </div>
                                            <div style={{
                                                maxHeight: '150px',
                                                overflowY: 'auto',
                                                backgroundColor: 'var(--bg-secondary, #f9f9f9)',
                                                borderRadius: '4px',
                                                padding: '4px',
                                                fontFamily: 'monospace',
                                                fontSize: '10px',
                                                lineHeight: '1.5'
                                            }}>
                                                {diffView.diffs.slice(0, 20).map((d, i) => (
                                                    <div key={i} style={{ marginBottom: '4px' }}>
                                                        <div style={{ color: '#999' }}>L{d.line}:</div>
                                                        {d.snapshot && (
                                                            <div style={{ color: '#c0392b', paddingLeft: '8px' }}>
                                                                - {d.snapshot.substring(0, 60)}{d.snapshot.length > 60 ? '...' : ''}
                                                            </div>
                                                        )}
                                                        {d.current && (
                                                            <div style={{ color: '#27ae60', paddingLeft: '8px' }}>
                                                                + {d.current.substring(0, 60)}{d.current.length > 60 ? '...' : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {diffView.diffs.length > 20 && (
                                                    <div style={{ color: '#888', textAlign: 'center' }}>
                                                        ...他 {diffView.diffs.length - 20} 行
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleRestore(snap)}
                                                style={{
                                                    marginTop: '8px',
                                                    width: '100%',
                                                    padding: '6px',
                                                    backgroundColor: 'var(--accent-color, #3498db)',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                ↩ この状態に復元
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ストレージ使用量 */}
            <div style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border-color, #eee)',
                fontSize: '10px',
                color: '#888',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
            }}>
                <span>📦 履歴: {formatBytes(storageInfo.snapshotBytes)}</span>
                <span>内部データ全体: {formatBytes(storageInfo.totalBytes)}</span>
                {!showManager && storageInfo.snapshotBytes > 0 && <button onClick={openManager} style={{ fontSize: '10px' }}>内訳・削除</button>}
            </div>
        </div>
    );
};

export default SnapshotPanel;
