const assert = require('node:assert/strict');
const test = require('node:test');
const { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createNativeJapaneseRunner } = require('./nativeJapaneseRunner.cjs');

function executable(file, body) {
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

function fixture(t, { slow = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nexus-native-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const binDir = path.join(root, 'bin');
  const dicDir = path.join(root, 'dic');
  mkdirSync(binDir);
  mkdirSync(dicDir);
  executable(path.join(binDir, 'mecab'), slow
    ? 'sleep 2'
    : `cat >/dev/null
printf '彼\\t名詞,代名詞,一般,*,*,*,彼,カレ,カレ\\nは\\t助詞,係助詞,*,*,*,*,は,ハ,ワ\\n走っ\\t動詞,自立,*,*,五段・ラ行,連用タ接続,走る,ハシッ,ハシッ\\nた\\t助動詞,*,*,*,特殊・タ,基本形,た,タ,タ\\n。\\t記号,句点,*,*,*,*,。,。,。\\nEOS\\n'`);
  executable(path.join(binDir, 'cabocha'), `cat >/dev/null
printf '* 0 1D 0/1 0.0\\n彼\\t名詞,代名詞\\nは\\t助詞,係助詞\\n* 1 -1D 0/1 0.0\\n走っ\\t動詞,自立\\nた\\t助動詞\\n。\\t記号,句点\\nEOS\\n'`);
  return { root, binDir, dicDir };
}

test('returns hash, parsed structure and request identity', async (t) => {
  const { binDir, dicDir } = fixture(t);
  const runner = createNativeJapaneseRunner({ binDir, dicDir, timeoutMs: 1000 });
  const text = '彼は走った。';
  const result = await runner.analyze({ text, requestId: 'r1' });
  assert.equal(result.status, 'ok');
  assert.equal(result.requestId, 'r1');
  assert.equal(result.textHash, createHash('sha256').update(text).digest('hex'));
  assert.equal(result.morphemes.length, 5);
  assert.equal(result.chunks.length, 2);
  assert.equal(result.analysis.maxDependencyDistance, 1);
});

test('missing installation rejects without touching source files', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nexus-native-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runner = createNativeJapaneseRunner({ binDir: path.join(root, 'bin'), dicDir: path.join(root, 'dic') });
  await assert.rejects(runner.analyze({ text: 'x', requestId: 'r2' }), /not-installed/);
});

test('timeout kills the child and rejects predictably', async (t) => {
  const { binDir, dicDir } = fixture(t, { slow: true });
  const runner = createNativeJapaneseRunner({ binDir, dicDir, timeoutMs: 30 });
  await assert.rejects(runner.analyze({ text: '彼は走った。', requestId: 'r3' }), /timeout/);
});

test('malformed analyzer output rejects and text is never a shell command', async (t) => {
  const { root, binDir, dicDir } = fixture(t);
  executable(path.join(binDir, 'cabocha'), "cat >/dev/null; echo EOS");
  const runner = createNativeJapaneseRunner({ binDir, dicDir, timeoutMs: 1000 });
  await assert.rejects(runner.analyze({ text: `彼は走った。; touch ${path.join(root, 'pwned')}`, requestId: 'r4' }), /invalid-output/);
  assert.equal(require('node:fs').existsSync(path.join(root, 'pwned')), false);
});
