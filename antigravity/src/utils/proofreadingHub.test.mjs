import { strict as assert } from 'node:assert';
import path from 'node:path';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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

const advisoryId = 'tomarigi/homonym-reference';
const advisoryInput = {
    ruleId: advisoryId, index: 0, severity: 1,
    message: '【トマリギ】【対象:相性】同音候補があります。参考候補: 愛称',
};
const correctionInput = {
    ruleId: 'prh', index: 0, severity: 1, message: '表記を確認',
    fix: { range: [0, 2], text: '愛称' },
};
test('reference identity survives classification without fix or suggested properties', () => {
    const [issue] = mergeProofreadingResults('相性', [advisoryInput]);
    assert.equal(issue.ruleId, advisoryId);
    assert.equal(issue.advisory, true);
    assert.equal(issue.confidence, '参考');
    assert(!('fix' in issue) && !('suggested' in issue) && !('suggestions' in issue));
});
test('advisory XML omits suggested entirely', () => {
    const xml = proofreadingResultsToXml(mergeProofreadingResults('相性', [advisoryInput]));
    assert.doesNotMatch(xml, /<suggested\b/);
    assert.match(xml, /参考候補: 愛称/);
});
test('the existing UI parser cannot pair an advisory target with a later correction', () => {
    // Execute the consuming UI's actual regex without importing React or altering
    // editor code. Its wildcard spans records if a correction lacks suggested.
    const uiSource = readFileSync(new URL('../components/AIAssistant.jsx', import.meta.url), 'utf8');
    const literal = uiSource.match(/const regex = (\/<correction[^\n]+);/)[1];
    const lastSlash = literal.lastIndexOf('/');
    const parser = new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
    const issues = mergeProofreadingResults('相性。何時も', [advisoryInput, {
        ...correctionInput, index: 3, fix: { range: [3, 6], text: 'いつも' },
    }]);
    const xml = proofreadingResultsToXml(issues);
    const parsed = [...xml.matchAll(parser)];
    assert.deepEqual(parsed.map(match => [match[2].trim(), match[3].trim()]), [['何時も', 'いつも']]);
    assert.match(xml, /<advisory\b/);
    assert.doesNotMatch(proofreadingResultsToXml([issues[0]]), /<correction\b|<suggested\b/);
});
for (const [order, inputs] of [
    ['advisory first', [advisoryInput, correctionInput]],
    ['corrective first', [correctionInput, advisoryInput]],
]) {
    test(`overlapping results remain separate: ${order}`, () => {
        const issues = mergeProofreadingResults('相性', inputs);
        assert.equal(issues.length, 2);
        const advisory = issues.find(issue => issue.ruleId === advisoryId);
        assert(advisory);
        assert(!('suggested' in advisory) && !('suggestions' in advisory));
        assert.deepEqual(advisory.ruleIds, [advisoryId]);
        assert.equal(issues.find(issue => issue.ruleId === 'prh').suggested, '愛称');
        assert.equal((proofreadingResultsToXml(issues).match(/<suggested>/g) || []).length, 1);
    });
}
test('backend suggestions also cannot be inherited by overlapping advisories', () => {
    const issues = mergeProofreadingResults('相性', [advisoryInput], [{
        start: 0, original: '相性', suggested: '愛称', reason: '確認', rule_id: 'nexus/style',
    }]);
    assert.equal(issues.length, 2);
    assert(!('suggested' in issues.find(issue => issue.ruleId === advisoryId)));
});

// Only substitute Electron registration, which cannot run inside plain Node.
// The registered handler uses the real descriptor, tokenizer, rules and filters.
let proofread;
const originalLoad = Module._load;
try {
    Module._load = function(id, ...args) {
        if (id === 'electron') return { ipcMain: { handle(channel, handler) {
            assert.equal(channel, 'textlint:proofread');
            proofread = handler;
        } } };
        return originalLoad.call(this, id, ...args);
    };
    require('../../electron/textlintMain.cjs').setupTextlintHandlers();
} finally {
    Module._load = originalLoad;
}
test('IPC normalizes advisory ID, strips marker, and omits prohibited fields', async () => {
    const results = await proofread(null, '彼との相性を確認した。');
    const reference = results.find(issue => issue.ruleId === advisoryId);
    assert(reference, 'expected fine-grained homonym advisory from real textlint');
    assert.equal(reference.index, 3);
    assert(!('fix' in reference) && !('suggested' in reference));
    assert.doesNotMatch(reference.message, /NEXUS_ADVISORY/);
    assert.match(reference.message, /【対象:相性】/);
    const [issue] = mergeProofreadingResults('彼との相性を確認した。', [reference]);
    assert.equal(issue.original, '相性');
    assert.doesNotMatch(proofreadingResultsToXml([issue]), /<suggested/);
});
for (const [text, start, end] of [['😀相性', 2, 4], ['𠮷田との相性', 5, 7]]) {
    test(`IPC and advisory XML preserve UTF-16 offsets: ${text}`, async () => {
        const results = await proofread(null, text);
        const reference = results.find(issue => issue.ruleId === advisoryId);
        assert(reference, 'expected homonym advisory after a supplementary character');
        assert.equal(reference.index, start);
        assert(!('fix' in reference) && !('suggested' in reference));
        const [issue] = mergeProofreadingResults(text, [reference]);
        assert.deepEqual([issue.start, issue.end, issue.original], [start, end, '相性']);
        const xml = proofreadingResultsToXml([issue]);
        assert(xml.includes(`start="${start}" end="${end}"`));
        assert.doesNotMatch(xml, /<suggested\b|<correction\b/);
        assert(!(await proofread(null, text, { whitelist: ['相性'] })).some(item => item.ruleId === advisoryId));
    });
}
test('IPC whitelist and fine/outer disabled IDs retain exact and prefix behavior', async () => {
    for (const profile of [
        { whitelist: ['愛称'] }, { whitelist: ['愛'] },
        ...[advisoryId, 'tomarigi/*', 'nexus-integrated-rules', 'nexus-integrated*'].map(id => ({ disabled_rules: [id] })),
    ]) {
        const results = await proofread(null, '愛称', profile);
        assert(!results.some(issue => issue.ruleId === advisoryId), JSON.stringify(profile));
    }
    const unaffected = await proofread(null, '愛称', { disabled_rules: ['tomarigi/kanji-level'] });
    assert(unaffected.some(issue => issue.ruleId === advisoryId));
    const prh = await proofread(null, '何時も', { disabled_rules: ['nexus-integrated-rules'] });
    assert(prh.some(issue => issue.ruleId === 'prh' && issue.fix?.text === 'いつも'));
    assert(!(await proofread(null, '何時も', { disabled_rules: ['prh'] })).some(issue => issue.ruleId === 'prh'));
});
test('IPC kanji opt-in is explicit, request-local, and disabled_rules wins', async () => {
    const id = 'tomarigi/kanji-level';
    const profiles = [{}, { enabled_rules: [id] }, {}, { enabled_rules: ['tomarigi/*'] },
        { enabled_rules: [id], disabled_rules: [id] },
        { enabled_rules: [id], disabled_rules: ['nexus-integrated-rules'] },
        { enabled_rules: [id], whitelist: ['丐'] }];
    const results = await Promise.all(profiles.map(profile => proofread(null, '丐', profile)));
    assert.deepEqual(results.map(items => items.some(item => item.ruleId === id)), [false, true, false, false, false, false, false]);
    assert(results.flat().every(issue => !('fix' in issue) && !('suggested' in issue)));
});

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
// This remains a clean fixture for the legacy style rules. Dictionary references
// are not errors and may legitimately occur in correctly written prose.
assert(!cleanResult.messages.some(message => /【RedPen】|【トマリギ】/.test(message.message) && !message.message.startsWith('【NEXUS_ADVISORY:')));
assert(!cleanResult.messages.some(message => message.ruleId === 'prh'));
const openingResult = await linter.lintText('何時も唯そう思う。', 'opening.txt');
const openingFixes = openingResult.messages.filter(message => message.ruleId === 'prh').map(message => message.fix?.text);
assert(openingFixes.includes('いつも'));
assert(openingFixes.includes('ただ'));
const readableResult = await linter.lintText('いつもただそう思う。', 'readable.txt');
assert(!readableResult.messages.some(message => message.ruleId === 'prh'));
console.log('proofreadingHub tests passed');
