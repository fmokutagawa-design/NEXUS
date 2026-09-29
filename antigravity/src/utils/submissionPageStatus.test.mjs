import assert from 'node:assert/strict';
import { getSubmissionPageStatus } from './submissionPageStatus.js';

assert.deepEqual(getSubmissionPageStatus(285, { min: 100, max: 200 }), {
  state: 'over', delta: 85, label: '上限まで85ページ超過',
});
assert.deepEqual(getSubmissionPageStatus(80, { min: 100, max: 200 }), {
  state: 'under', delta: 20, label: '下限まであと20ページ',
});
assert.deepEqual(getSubmissionPageStatus(150, { min: 100, max: 200 }), {
  state: 'within', delta: 0, label: '応募範囲内',
});

console.log('Submission page status tests passed');
