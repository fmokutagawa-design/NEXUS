import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchSignature, isCurrentSearchResponse } from './searchResultFreshness.mjs';

test('results belong only to the query and options that produced them', () => {
  const oldSearch = createSearchSignature('漣は黙った', { isRegex: false, caseSensitive: false, txtOnly: true });
  const nextSearch = createSearchSignature('自動ドアが閉まり', { isRegex: false, caseSensitive: false, txtOnly: true });
  assert.notEqual(oldSearch, nextSearch);
  assert.equal(isCurrentSearchResponse({ responseId: 1, latestId: 1, responseSignature: oldSearch, currentSignature: nextSearch }), false);
});

test('an older asynchronous response cannot replace a newer search', () => {
  const signature = createSearchSignature('検索語', { isRegex: false, caseSensitive: false, txtOnly: true });
  assert.equal(isCurrentSearchResponse({ responseId: 4, latestId: 5, responseSignature: signature, currentSignature: signature }), false);
  assert.equal(isCurrentSearchResponse({ responseId: 5, latestId: 5, responseSignature: signature, currentSignature: signature }), true);
});

test('changing a search option invalidates existing results', () => {
  const before = createSearchSignature('abc', { isRegex: false, caseSensitive: false, txtOnly: true });
  const after = createSearchSignature('abc', { isRegex: false, caseSensitive: true, txtOnly: true });
  assert.notEqual(before, after);
});
