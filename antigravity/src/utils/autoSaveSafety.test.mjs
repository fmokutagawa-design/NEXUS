import assert from 'node:assert/strict';
import { isAutoSaveJobCurrent } from './autoSaveSafety.mjs';

const fifth = '/作品/segments/第五章.txt';
const prologue = '/作品/segments/序章.txt';

assert.equal(isAutoSaveJobCurrent({ fileHandle: fifth, text: '第五章' }, fifth, '第五章'), true);
assert.equal(
  isAutoSaveJobCurrent({ fileHandle: fifth, text: '第五章' }, prologue, '第五章'),
  false,
  '別ファイルへ切り替えた保存予約は実行しない'
);
assert.equal(
  isAutoSaveJobCurrent({ fileHandle: fifth, text: '第五章・旧' }, fifth, '第五章・新'),
  false,
  '同じファイルでも古い本文の保存予約は実行しない'
);

console.log('autoSaveSafety: 3 passed');
