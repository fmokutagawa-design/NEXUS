import assert from 'node:assert/strict';
import literaryPrizes from '../data/literaryPrizes.js';
import { resolveSubmissionProfile } from './submissionProfile.js';

const savedBeforeTemplateUpgrade = {
  prizeId: 'matsumoto',
  editorFormat: { charsPerLine: 40, linesPerPage: 30 },
};

const profile = resolveSubmissionProfile(savedBeforeTemplateUpgrade, literaryPrizes);
assert.equal(profile.editorFormat.orientation, 'landscape');
assert.equal(profile.editorFormat.pageSize, 'A4');
assert.equal(profile.editorFormat.marginTopMm, 30);
assert.equal(profile.editorFormat.charsPerLine, 40);
assert.equal(profile.editorFormat.linesPerPage, 30);

console.log('Submission profile tests passed');
