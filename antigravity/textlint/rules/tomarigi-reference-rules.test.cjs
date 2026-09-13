const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getTokenizer } = require('kuromojin');
const { runTomarigiReferenceRules } = require('./tomarigi-reference-rules.cjs');

const token = (surface_form, reading, word_position = 1, pos_detail_1 = '一般') => ({
    surface_form, reading, word_position, pos: '名詞', pos_detail_1,
});
const homonym = 'tomarigi/homonym-reference';
const kanji = 'tomarigi/kanji-level';
const numeral = 'tomarigi/chinese-numeral';
const assertAdvisory = finding => {
    assert.deepEqual(Object.keys(finding).sort(), ['candidates', 'end', 'message', 'ruleId', 'start', 'target']);
    assert(!('fix' in finding) && !('suggested' in finding));
    assert.doesNotMatch(finding.message, /修正案:|置換|自動修正/);
};

test('homonyms require a matching reading and expose only advisory reference fields', () => {
    const tokens = Object.freeze([Object.freeze(token('相性', 'アイショウ', 4))]);
    const findings = runTomarigiReferenceRules('彼との相性を確認した。', tokens, { whitelist: [] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].ruleId, homonym);
    assert.deepEqual([findings[0].start, findings[0].end, findings[0].target], [3, 5, '相性']);
    assert.deepEqual(findings[0].candidates.map(item => item.text), ['愛称']);
    findings.forEach(assertAdvisory);
    assert.deepEqual(runTomarigiReferenceRules('相性', [token('相性', undefined)]), []);
    assert.deepEqual(runTomarigiReferenceRules('相性', [token('相性', 'ミチノヨミ')]), []);
    assert.deepEqual(runTomarigiReferenceRules('相性', []), []);
});

test('whitelist suppresses matching targets without mutating caller data', () => {
    const options = Object.freeze({ whitelist: Object.freeze(['愛称']) });
    assert.deepEqual(runTomarigiReferenceRules('愛称', [token('愛称', 'アイショウ')], options), []);
    assert.deepEqual(runTomarigiReferenceRules('愛称', [token('愛称', 'アイショウ')], { whitelist: ['愛'] }), []);
});

test('kanji-level requires explicit opt-in and only known non-common kanji are advisory', () => {
    const tokens = [token('丐', undefined)];
    for (const options of [{}, { enabled_rules: [] }, { enabled_rules: ['tomarigi/*'] }]) {
        assert.deepEqual(runTomarigiReferenceRules('丐', tokens, options), []);
    }
    const enabled = { enabled_rules: [kanji] };
    const findings = runTomarigiReferenceRules('丐', tokens, enabled);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].ruleId, kanji);
    findings.forEach(assertAdvisory);
    assert.deepEqual(runTomarigiReferenceRules('日', [token('日', undefined)], enabled), []);
    assert.deepEqual(runTomarigiReferenceRules('丐', tokens, { ...enabled, whitelist: ['丐'] }), []);
});

test('numerals require numeric POS and exclude idioms across token boundaries at that occurrence only', () => {
    const findings = runTomarigiReferenceRules('三', [token('三', 'サン', 1, '数')]);
    assert.equal(findings.filter(item => item.ruleId === numeral).length, 1);
    findings.forEach(assertAdvisory);
    assert(!runTomarigiReferenceRules('三', [token('三', 'サン')]).some(item => item.ruleId === numeral));
    assert(!runTomarigiReferenceRules('3', [token('3', 'サン', 1, '数')]).some(item => item.ruleId === numeral));
    const tokens = [token('一', 'イチ', 1, '数'), token('人', 'ニン', 2), token('一', 'イチ', 4, '数')];
    const numeric = runTomarigiReferenceRules('一人。一', tokens).filter(item => item.ruleId === numeral);
    assert.deepEqual(numeric.map(item => [item.start, item.target]), [[3, '一']]);
});

test('invalid token locations cannot produce misleading spans', () => {
    assert.deepEqual(runTomarigiReferenceRules('相性', [token('相性', 'アイショウ', 0)]), []);
    assert.deepEqual(runTomarigiReferenceRules('愛称', [token('相性', 'アイショウ')]), []);
    assert.deepEqual(runTomarigiReferenceRules('相性', [token('相性', 'アイショウ', 8)]), []);
});

for (const position of ['1', true, false, 1n, null, undefined, 0, -1, 1.5, NaN, Infinity, {}, [1]]) {
    test(`word_position rejects ${typeof position}:${String(position)} without coercion or throwing`, () => {
        assert.deepEqual(runTomarigiReferenceRules('相性', [{ ...token('相性', 'アイショウ'), word_position: position }]), []);
    });
}
for (const malformed of [null, undefined, 1n, '相性', true, 1, [], {}]) {
    test(`malformed token ${typeof malformed}:${String(malformed)} is ignored while valid tokens still work`, () => {
        const results = runTomarigiReferenceRules('相性', [malformed, token('相性', 'アイショウ')]);
        assert.equal(results.length, 1);
        assert.equal(results[0].ruleId, homonym);
    });
}

for (const [text, expected] of [
    ['😀相性', [[2, 4, '相性']]],
    ['𠮷田との相性', [[5, 7, '相性']]],
    ['😀相性。😀相性', [[2, 4, '相性'], [7, 9, '相性']]],
]) {
    test(`real tokenizer homonym offsets are UTF-16: ${text}`, async () => {
        const tokenizer = await getTokenizer();
        const tokens = Object.freeze(tokenizer.tokenize(text).map(item => Object.freeze(item)));
        const findings = runTomarigiReferenceRules(text, tokens).filter(item => item.ruleId === homonym);
        assert.deepEqual(findings.map(item => [item.start, item.end, item.target]), expected);
        findings.forEach(item => {
            assert.equal(text.slice(item.start, item.end), item.target);
            assertAdvisory(item);
        });
    });
}

test('real tokenizer kanji offsets remain UTF-16 after supplementary characters', async () => {
    const text = '😀丐';
    const tokenizer = await getTokenizer();
    const findings = runTomarigiReferenceRules(text, tokenizer.tokenize(text), { enabled_rules: [kanji] });
    assert.deepEqual(findings.map(item => [item.start, item.end, item.target, item.ruleId]), [[2, 3, '丐', kanji]]);
    findings.forEach(assertAdvisory);
});

test('real tokenizer numeral exception checks use UTF-16 positions after supplementary characters', async () => {
    const text = '😀一人。三';
    const tokenizer = await getTokenizer();
    const findings = runTomarigiReferenceRules(text, tokenizer.tokenize(text)).filter(item => item.ruleId === numeral);
    assert.deepEqual(findings.map(item => [item.start, item.end, item.target]), [[5, 6, '三']]);
    findings.forEach(assertAdvisory);
});
