import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
const {
  saveSnapshot,
  getSnapshotGroups,
  deleteSnapshotGroups,
} = await import('./snapshotStore.js');

await saveSnapshot('/作品/第1版/第一章.txt', '旧本文', 3);
await saveSnapshot('/作品/第1版/第一章.txt', '旧本文2', 4);
await saveSnapshot('/作品/第5版/第一章.txt', '現本文', 3);

const groups = await getSnapshotGroups();
assert.equal(groups.length, 2, '全ファイルの履歴をパス別に集計する');
assert.deepEqual(
  groups.map(group => ({ filePath: group.filePath, count: group.count })),
  [
    { filePath: '/作品/第1版/第一章.txt', count: 2 },
    { filePath: '/作品/第5版/第一章.txt', count: 1 },
  ]
);
assert.ok(groups.every(group => group.bytes > 0), '各グループの使用量を返す');

const removed = await deleteSnapshotGroups(['/作品/第1版/第一章.txt']);
assert.equal(removed.groupCount, 1);
assert.equal(removed.snapshotCount, 2);
assert.deepEqual((await getSnapshotGroups()).map(group => group.filePath), ['/作品/第5版/第一章.txt']);

console.log('snapshotStore: 7 passed');
