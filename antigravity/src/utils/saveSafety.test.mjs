import assert from 'node:assert/strict';
import { assessSaveEligibility, shouldClearExternalConflict } from './saveSafety.mjs';

const prologue = '/work/01_prologue.txt';
const chapterFive = '/work/05_chapter.txt';

assert.deepEqual(
  assessSaveEligibility({ activeFileHandle: prologue, baselineFileHandle: prologue, reviewGate: null }),
  { allowed: true, reason: null },
);

assert.equal(
  shouldClearExternalConflict({ conflictActive: true, currentFileHandle: prologue, targetFileHandle: prologue }),
  false,
  '競合中の同一ファイル再読込では保存停止を解除しない'
);
assert.equal(
  shouldClearExternalConflict({ conflictActive: true, currentFileHandle: prologue, targetFileHandle: chapterFive }),
  true,
  '別ファイルへ切り替えた場合だけ以前の競合状態を解除する'
);

assert.deepEqual(
  assessSaveEligibility({ activeFileHandle: prologue, baselineFileHandle: null, reviewGate: null }),
  { allowed: false, reason: 'missing-baseline-target' },
);

assert.deepEqual(
  assessSaveEligibility({ activeFileHandle: prologue, baselineFileHandle: chapterFive, reviewGate: null }),
  { allowed: false, reason: 'baseline-target-mismatch' },
);

assert.deepEqual(
  assessSaveEligibility({
    activeFileHandle: prologue,
    baselineFileHandle: prologue,
    reviewGate: { kind: 'snapshot-restore', fileHandle: prologue },
  }),
  { allowed: false, reason: 'review-required' },
);

console.log('saveSafety: 4 passed');
