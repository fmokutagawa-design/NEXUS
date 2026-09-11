import assert from 'node:assert/strict';
import { buildConflictDiff } from './conflictDiff.mjs';

const parts = buildConflictDiff('第一段落\n\nNEXUSの文', '第一段落\n\nCodexの文');
assert.deepEqual(parts.map(({ type, text }) => ({ type, text })), [
  { type: 'unchanged', text: '第一段落\n\n' },
  { type: 'nexus', text: 'NEXUSの文' },
  { type: 'external', text: 'Codexの文' },
]);

assert.deepEqual(buildConflictDiff('同じ', '同じ'), [
  { type: 'unchanged', text: '同じ' },
]);

console.log('conflictDiff: 2 passed');
