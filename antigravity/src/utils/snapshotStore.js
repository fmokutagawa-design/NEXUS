/**
 * snapshotStore.js
 * 
 * localStorage を使ったスナップショット保存。
 * ファイルごとに最大50世代保持（FIFO）。
 * 同期的に動作するのでハングしない。
 */

const MAX_SNAPSHOTS = 50;
const LS_PREFIX = 'nexus-snap-';

function makeKey(filePath) {
    try {
        return LS_PREFIX + btoa(unescape(encodeURIComponent(filePath))).replace(/=/g, '');
    } catch {
        return LS_PREFIX + filePath.replace(/[^a-zA-Z0-9]/g, '_');
    }
}

function readList(filePath) {
    try {
        const raw = localStorage.getItem(makeKey(filePath));
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function writeList(filePath, list) {
    try {
        localStorage.setItem(makeKey(filePath), JSON.stringify(list));
    } catch (e) {
        // localStorage full — trim to 10
        console.warn('localStorage full, trimming snapshots:', e.message);
        try {
            localStorage.setItem(makeKey(filePath), JSON.stringify(list.slice(-10)));
        } catch { /* give up */ }
    }
}

// ★ snapshot は localStorage に 全文 × 最大50世代 を保存する。
//    42万字 × 50世代 = 最大21MB、しかも localStorage は同期 API。
//    JSON.stringify → setItem の間、メインスレッドがブロックされる。
//    大規模テキストではスキップする。
const SNAPSHOT_CHAR_LIMIT = 100000;

function storageEntryBytes(key, value) {
    return (String(key || '').length + String(value || '').length) * 2;
}

export async function getSnapshotGroups() {
    const groups = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(LS_PREFIX)) continue;
            const raw = localStorage.getItem(key) || '[]';
            let snapshots;
            try { snapshots = JSON.parse(raw); } catch { snapshots = []; }
            if (!Array.isArray(snapshots) || snapshots.length === 0) continue;
            const timestamps = snapshots.map(item => Number(item.timestamp) || 0).filter(Boolean);
            groups.push({
                storageKey: key,
                filePath: snapshots[0]?.filePath || '保存元不明',
                count: snapshots.length,
                bytes: storageEntryBytes(key, raw),
                oldestAt: timestamps.length ? Math.min(...timestamps) : null,
                newestAt: timestamps.length ? Math.max(...timestamps) : null,
            });
        }
    } catch (error) {
        console.warn('Failed to enumerate snapshots:', error);
    }
    return groups.sort((a, b) => a.filePath.localeCompare(b.filePath, 'ja'));
}

export async function deleteSnapshotGroups(filePaths) {
    const targets = new Set(filePaths || []);
    const groups = await getSnapshotGroups();
    const selected = groups.filter(group => targets.has(group.filePath));
    selected.forEach(group => localStorage.removeItem(group.storageKey));
    return {
        groupCount: selected.length,
        snapshotCount: selected.reduce((sum, group) => sum + group.count, 0),
        bytes: selected.reduce((sum, group) => sum + group.bytes, 0),
    };
}

export function getLocalStorageBreakdown() {
    const result = { snapshotBytes: 0, draftBytes: 0, otherBytes: 0, totalBytes: 0 };
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key) || '';
            const bytes = storageEntryBytes(key, value);
            result.totalBytes += bytes;
            if (key?.startsWith(LS_PREFIX)) result.snapshotBytes += bytes;
            else if (key === 'novel-editor-text') result.draftBytes += bytes;
            else result.otherBytes += bytes;
        }
    } catch (error) {
        console.warn('Failed to calculate local storage usage:', error);
    }
    return result;
}

export async function saveSnapshot(filePath, content, charCount) {
    if (content && content.length > SNAPSHOT_CHAR_LIMIT) {
        // 大規模テキストは localStorage に載せない
        return;
    }
    const list = readList(filePath);
    list.push({
        id: Date.now(),
        filePath,
        content,
        charCount,
        timestamp: Date.now()
    });
    if (list.length > MAX_SNAPSHOTS) {
        list.splice(0, list.length - MAX_SNAPSHOTS);
    }
    writeList(filePath, list);
}

export async function getSnapshots(filePath) {
    const list = readList(filePath);
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
}

export async function clearSnapshots(filePath) {
    try {
        localStorage.removeItem(makeKey(filePath));
    } catch { /* ignore */ }
}
