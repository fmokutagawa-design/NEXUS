import assert from 'node:assert/strict';
import { parseRubyTokens, rubyTokensToText } from './rubyParser.js';

const tokens = parseRubyTokens('前｜漢字《かんじ》後');
assert.deepEqual(tokens, [
  '前',
  { type: 'ruby', base: '漢字', ruby: 'かんじ' },
  '後',
]);

assert.deepEqual(parseRubyTokens('吾輩《わがはい》'), [
  { type: 'ruby', base: '吾輩', ruby: 'わがはい' },
]);

const source = '｜尤雲衢《ゆううんく》';
assert.equal(rubyTokensToText(parseRubyTokens(source)), '尤雲衢');
assert.equal(source, '｜尤雲衢《ゆううんく》');

console.log('Ruby parser tests passed');
