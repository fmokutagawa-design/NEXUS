import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSearchJump } from './searchJump.mjs';

test('relocates a result whose line moved after an earlier edit', () => {
  const text = '追加行\n一行目\nここに検索語があります\n末尾';
  const result = resolveSearchJump(text, {
    line: 1,
    expectedLine: 'ここに検索語があります',
    query: '検索語',
    matchedText: '検索語',
    column: 3,
  });
  assert.equal(result.status, 'found');
  assert.equal(text.slice(result.start, result.end), '検索語');
  assert.equal(result.start, text.indexOf('検索語'));
});

test('uses nearby context when the original line was edited', () => {
  const text = '前文\n少し変わった、検索語があります\n別の検索語です';
  const result = resolveSearchJump(text, {
    line: 1,
    expectedLine: 'ここに検索語があります',
    query: '検索語',
    matchedText: '検索語',
    column: 3,
  });
  assert.equal(result.status, 'found');
  assert.equal(result.start, text.indexOf('検索語'));
});

test('returns stale immediately when the searched text no longer exists', () => {
  assert.deepEqual(resolveSearchJump('修正済みです', {
    line: 0,
    expectedLine: 'ここに検索語があります',
    query: '検索語',
    matchedText: '検索語',
    column: 3,
  }), { status: 'stale' });
});

test('supports a regular expression and selects the actual current match', () => {
  const text = '番号 ABC-123 を確認';
  const result = resolveSearchJump(text, {
    line: 0,
    expectedLine: text,
    query: '[A-Z]+-\\d+',
    isRegex: true,
    caseSensitive: true,
  });
  assert.equal(text.slice(result.start, result.end), 'ABC-123');
});
