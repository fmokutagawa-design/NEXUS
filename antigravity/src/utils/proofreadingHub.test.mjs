import { strict as assert } from 'node:assert';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mergeProofreadingResults, proofreadingResultsToXml } from './proofreadingHub.mjs';
import { createLinter, loadTextlintrc } from 'textlint';
import { TextlintLintableRuleDescriptor } from '@textlint/kernel';

const text = 'することができる。大切です。';
const textlint = [{
    ruleId: 'nexus-integrated-rules',
    message: '【NEXUS統合校正】冗長です (Rule: LT_REDUNDANT)',
    index: 0, severity: 1, fix: { range: [0, 9], text: 'できる' }
}, { ruleId: 'prh', message: '表記を確認', index: 10, severity: 1 }];
const backend = [{
    original: 'することができる', suggested: 'できる', reason: '冗長な表現です',
    start: 0, engine: 'NEXUS', rule_id: 'nexus/redundancy'
}];

const merged = mergeProofreadingResults(text, textlint, backend);
assert.equal(merged.length, 2);
assert.deepEqual(merged[0].engines, ['LanguageTool', 'NEXUS']);
assert.equal(merged[0].confidence, '高');
assert.equal(merged[1].engine, 'prh表記辞書');
assert.match(proofreadingResultsToXml(merged), /【高｜LanguageTool＋NEXUS】/);

const tomarigiSuggestion = mergeProofreadingResults('ものである。', [{
    ruleId: 'nexus-integrated-rules', message: '【トマリギ】冗長な文末表現です。修正案: 省略を検討', index: 0
}], []);
assert.equal(tomarigiSuggestion[0].engine, 'Tomarigi相当');
assert.equal(tomarigiSuggestion[0].suggested, '省略を検討');

const require = createRequire(import.meta.url);
const descriptor = await loadTextlintrc({ configFilePath: path.resolve('.textlintrc.js') });
descriptor.rule.ruleDescriptorList.push(new TextlintLintableRuleDescriptor({
    ruleId: 'nexus-integrated-rules',
    rule: require('../../textlint/rules/nexus-integrated-rules.js'),
    options: true
}));
const linter = createLinter({ descriptor });
const lintResult = await linter.lintText(
    ' これは,文章。猫。犬。空。といえないこともない。確認確認。したがって。自身がない。これはそれであの話だ。読んで置く。話す事がある。、誤り。読み、書き、考え、振り返った。こにちは。',
    'document.txt'
);
const messages = lintResult.messages.map(message => message.message);
assert(messages.some(message => message.includes('日本語文中の半角カンマ')));
assert(messages.some(message => message.includes('日本語段落の行頭')));
assert(messages.some(message => message.includes('冗長な文末表現')));
assert(messages.some(message => message.includes('【トマリギ】同じ語')));
assert(messages.some(message => message.includes('体言止めが3文連続')));
assert(messages.some(message => message.includes('SITAGATTE_END')));
assert(messages.some(message => message.includes('(Rule: JISINN)')));
assert(messages.some(message => message.includes('一文で指示詞が3回')));
assert(messages.some(message => message.includes('補助動詞「置く」')));
assert(messages.some(message => message.includes('形式名詞「事」')));
assert(messages.some(message => message.includes('読点の位置が不自然')));
assert(messages.some(message => message.includes('連用形で終わる節が3回連続')));
const literalSuggestionMessage = lintResult.messages.find(message => message.message.includes('(Rule: KONITIHA)'));
const literalSuggestion = mergeProofreadingResults(text, literalSuggestionMessage ? [literalSuggestionMessage] : [], []);
assert(literalSuggestionMessage);
assert(literalSuggestion[0].message.includes('修正案: こんにちは'));
assert.equal(literalSuggestion[0].suggested, 'こんにちは');
const cleanResult = await linter.lintText('彼は大切な本を静かに読んだ。空は青かった。', 'clean.txt');
assert(!cleanResult.messages.some(message => /【RedPen】|【トマリギ】/.test(message.message)));
assert(!cleanResult.messages.some(message => message.ruleId === 'prh'));
const openingResult = await linter.lintText('何時も唯そう思う。', 'opening.txt');
const openingFixes = openingResult.messages.filter(message => message.ruleId === 'prh').map(message => message.fix?.text);
assert(openingFixes.includes('いつも'));
assert(openingFixes.includes('ただ'));
const readableResult = await linter.lintText('いつもただそう思う。', 'readable.txt');
assert(!readableResult.messages.some(message => message.ruleId === 'prh'));
console.log('proofreadingHub tests passed');
