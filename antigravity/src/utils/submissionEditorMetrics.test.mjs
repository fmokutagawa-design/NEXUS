import assert from 'node:assert/strict';
import { calculateSubmissionEditorMetrics } from './submissionEditorMetrics.js';

const metrics = calculateSubmissionEditorMetrics({
  viewportHeight: 1035,
  requestedFontSize: 31,
  charsPerLine: 40,
  linesPerPage: 30,
});

assert.equal(metrics.cell, 23);
assert.equal(metrics.fontSize, 18);
assert.equal(metrics.pageSpan, 690);
assert.equal(metrics.gridHeight, 920);

console.log('Submission editor metrics tests passed');
