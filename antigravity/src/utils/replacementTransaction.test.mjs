import assert from 'node:assert/strict';
import { executeReplacementTransaction } from './replacementTransaction.mjs';

const change = {
  path: '/作品/第一章.txt',
  name: '第一章.txt',
  before: '彼は訊く。訊いた。',
  after: '彼は聞く。聞いた。',
  count: 2,
};

{
  const writes = [];
  await assert.rejects(
    executeReplacementTransaction({
      changes: [change],
      conflictActive: true,
      readFile: async () => change.before,
      writeFile: async (...args) => writes.push(args),
    }),
    /外部編集との競合/,
  );
  assert.equal(writes.length, 0, '競合中は一文字も書き込まない');
}

{
  let diskText = change.before;
  const phases = [];
  let synchronized = null;
  const result = await executeReplacementTransaction({
    changes: [change],
    activeFilePath: change.path,
    conflictActive: false,
    setInProgress: value => phases.push(value),
    readFile: async () => diskText,
    writeFile: async (path, content, options) => {
      assert.equal(path, change.path);
      assert.equal(options.expectedContent, change.before);
      diskText = content;
      return { ok: true };
    },
    syncActiveFile: async applied => { synchronized = applied; },
  });

  assert.equal(diskText, '彼は聞く。聞いた。');
  assert.deepEqual(synchronized, change, '保存済みの正確な本文をエディタへ同期する');
  assert.deepEqual(phases, [true, false], '置換中だけ自動保存を停止する');
  assert.equal(result.total, 2);
}

{
  let reads = 0;
  await assert.rejects(
    executeReplacementTransaction({
      changes: [change],
      conflictActive: false,
      readFile: async () => (++reads === 1 ? change.before : '壊れた本文'),
      writeFile: async () => ({ ok: true }),
    }),
    /保存後内容が一致しません/,
  );
}

{
  const second = { ...change, path: '/作品/第二章.txt', name: '第二章.txt' };
  const writes = [];
  await assert.rejects(
    executeReplacementTransaction({
      changes: [change, second],
      conflictActive: false,
      readFile: async path => path === second.path ? '外部で更新済み' : change.before,
      writeFile: async path => { writes.push(path); return { ok: true }; },
    }),
    /プレビュー後に更新/,
  );
  assert.deepEqual(writes, [], '一件でも事前照合に失敗したら全ファイルを書き込まない');
}

{
  const second = { ...change, path: '/作品/第二章.txt', name: '第二章.txt' };
  const disk = new Map([[change.path, change.before], [second.path, second.before]]);
  const calls = [];
  await assert.rejects(
    executeReplacementTransaction({
      changes: [change, second],
      conflictActive: false,
      readFile: async path => disk.get(path),
      writeFile: async (path, content, options) => {
        calls.push({ path, content, expectedContent: options.expectedContent });
        if (path === second.path) throw new Error('書込み失敗');
        assert.equal(disk.get(path), options.expectedContent, '現在内容が期待値と一致するときだけ書く');
        disk.set(path, content);
        return { ok: true };
      },
    }),
    /書込み失敗/,
  );
  assert.equal(disk.get(change.path), change.before, '途中失敗時は先に置換したファイルを元へ戻す');
  assert.deepEqual(calls.at(-1), {
    path: change.path,
    content: change.before,
    expectedContent: change.after,
  }, 'ロールバックは自分が書いた置換後本文を期待値として実行する');
}

console.log('replacementTransaction: 5 passed');
