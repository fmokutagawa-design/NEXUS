const assert = require('node:assert/strict');
const { keepMessageForDialogue } = require('./dialogueFilter.cjs');

const text = '地の文。「何時も唯、食べれる。」地の文。';
const inside = text.indexOf('何時');

assert.equal(keepMessageForDialogue({ ruleId: 'preset-japanese/no-dropping-the-ra', message: 'ら抜き', index: inside }, text, true), false);
assert.equal(keepMessageForDialogue({ ruleId: 'prh', message: '表記', index: inside }, text, true), true);
assert.equal(keepMessageForDialogue({ ruleId: 'nexus-integrated-rules', message: '【NEXUS統合校正】【対象:こにちは】修正案: こんにちは', index: inside }, text, true), true);
assert.equal(keepMessageForDialogue({ ruleId: 'preset-japanese/no-dropping-the-ra', message: 'ら抜き', index: 0 }, text, true), true);
console.log('dialogue filter tests passed');
