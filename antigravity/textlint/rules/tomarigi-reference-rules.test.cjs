const assert = require('node:assert/strict');
const { test } = require('node:test');
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
