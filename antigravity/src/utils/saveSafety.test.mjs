import assert from 'node:assert/strict';
import { assessSaveEligibility } from './saveSafety.mjs';

const prologue = '/work/01_prologue.txt';
const chapterFive = '/work/05_chapter.txt';

assert.deepEqual(
  assessSaveEligibility({ activeFileHandle: prologue, baselineFileHandle: prologue, reviewGate: null }),
  { allowed: true, reason: null },
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
