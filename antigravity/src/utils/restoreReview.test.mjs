import assert from 'node:assert/strict';
import { createRestoreReview } from './restoreReview.mjs';

const review = createRestoreReview({
  fileHandle: '/work/chapter.txt',
  fileName: 'chapter.txt',
  diskText: '現在の原稿',
  restoredText: '過去の原稿',
  snapshotTimestamp: 1000,
});

assert.equal(review.kind, 'snapshot-restore');
assert.equal(review.diskText, '現在の原稿');
assert.equal(review.restoredText, '過去の原稿');
assert.equal(review.fileHandle, '/work/chapter.txt');
assert.equal(review.hasChanges, true);

assert.throws(
  () => createRestoreReview({ fileHandle: null, diskText: 'a', restoredText: 'b' }),
  /保存先/,
);

console.log('restoreReview: 2 passed');
