import assert from 'node:assert/strict';
import { calculateSubmissionGrid } from './submissionGrid.js';

const grid = calculateSubmissionGrid({
  pageWidthMm: 297,
  pageHeightMm: 210,
  margins: { top: 30, right: 30, bottom: 30, left: 30 },
  charsPerLine: 40,
  linesPerPage: 30,
});

assert.equal(grid.columnPitchMm, 7.9);
assert.equal(grid.rowPitchMm, 3.75);
assert.equal(grid.contentHeightPx, grid.rowPitchPx * 40);
assert.equal(grid.contentWidthPx, grid.columnPitchPx * 30);

console.log('Submission grid tests passed');
