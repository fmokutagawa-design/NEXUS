const assert = require('node:assert/strict');
const test = require('node:test');
const { parseMecab, parseCabocha, analyzeStructure } = require('./nativeJapaneseParser.cjs');

test('parses MeCab features and UTF-16 offsets', () => {
  const text = '😀彼は走った。';
  const output = [
    '😀\t記号,一般,*,*,*,*,😀,*,*',
    '彼\t名詞,代名詞,一般,*,*,*,彼,カレ,カレ',
    'は\t助詞,係助詞,*,*,*,*,は,ハ,ワ',
    '走っ\t動詞,自立,*,*,五段・ラ行,連用タ接続,走る,ハシッ,ハシッ',
    'た\t助動詞,*,*,*,特殊・タ,基本形,た,タ,タ',
    '。\t記号,句点,*,*,*,*,。,。,。',
    'EOS',
  ].join('\n');
  const result = parseMecab(text, output);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.morphemes.map(({ surface, start, end }) => [surface, start, end]), [
    ['😀', 0, 2], ['彼', 2, 3], ['は', 3, 4], ['走っ', 4, 6], ['た', 6, 7], ['。', 7, 8],
  ]);
  assert.equal(result.morphemes[3].base, '走る');
  assert.equal(result.morphemes[3].pos, '動詞');
});

test('parses CaboCha chunks and dependency links', () => {
  const text = '彼は走った。';
  const output = [
    '* 0 1D 0/1 0.000000',
    '彼\t名詞,代名詞,一般,*,*,*,彼,カレ,カレ',
    'は\t助詞,係助詞,*,*,*,*,は,ハ,ワ',
    '* 1 -1D 0/1 0.000000',
    '走っ\t動詞,自立,*,*,五段・ラ行,連用タ接続,走る,ハシッ,ハシッ',
    'た\t助動詞,*,*,*,特殊・タ,基本形,た,タ,タ',
    '。\t記号,句点,*,*,*,*,。,。,。',
    'EOS',
  ].join('\r\n');
  const parsed = parseCabocha(text, output);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.chunks.map(({ start, end, link }) => [start, end, link]), [[0, 2, 1], [2, 6, -1]]);
  assert.equal(parsed.morphemes.length, 5);
  assert.equal(analyzeStructure(text, parsed.morphemes, parsed.chunks).maxDependencyDistance, 1);
});

test('surrogate pairs do not shift later CaboCha offsets', () => {
  const parsed = parseCabocha('😀相性。', '* 0 -1D 0/1 0.0\n😀\t記号,一般\n相性\t名詞,一般\n。\t記号,句点\nEOS\n');
  assert.deepEqual(parsed.morphemes.map(({ start, end }) => [start, end]), [[0, 2], [2, 4], [4, 5]]);
  assert.deepEqual([parsed.chunks[0].start, parsed.chunks[0].end], [0, 5]);
});

test('malformed output returns errors instead of throwing', () => {
  for (const output of ['', 'EOS', '* broken\nEOS', '* 0 2D 0/1 0.0\n不一致\t名詞\nEOS', '* 1 -1D 0/1 0.0\n彼\t名詞\nEOS']) {
    assert.doesNotThrow(() => parseCabocha('彼', output));
    assert.ok(parseCabocha('彼', output).errors.length > 0);
  }
});

test('structure findings are advisory and honor threshold boundaries', () => {
  const chunks = [
    { index: 0, start: 0, end: 1, link: 5 },
    { index: 1, start: 1, end: 2, link: 1 },
    { index: 2, start: 2, end: 3, link: -1 },
  ];
  const result = analyzeStructure('abcdef', [], chunks, { dependencyDistance: 4 });
  assert.equal(result.maxDependencyDistance, 5);
  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.findings[0], {
    start: 0, end: 1, ruleId: 'tomarigi-native/long-dependency', severity: 1,
  });
  assert.equal('suggested' in result.findings[0], false);
  assert.equal('fix' in result.findings[0], false);
});
