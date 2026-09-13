import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(scriptsDir, 'build_tomarigi_native.sh');
const diagnosticScript = path.join(scriptsDir, 'diagnose_tomarigi_native.sh');

function run(script, args = [], options = {}) {
  return spawnSync('/bin/sh', [script, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function executable(file, contents) {
  writeFileSync(file, `#!/bin/sh\n${contents}\n`);
  chmodSync(file, 0o755);
}

test('build rejects missing source and unsafe installation paths before changing them', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tomarigi-build-test-'));
  const occupied = path.join(root, 'occupied');
  mkdirSync(occupied);
  writeFileSync(path.join(occupied, 'keep.txt'), 'keep');

  try {
    const missing = run(buildScript, [path.join(root, 'missing'), path.join(root, 'install')]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /source directory/i);

    for (const unsafe of ['/', os.homedir(), occupied]) {
      const result = run(buildScript, [root, unsafe]);
      assert.notEqual(result.status, 0, `expected rejection for ${unsafe}`);
    }
    assert.equal(readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('diagnostic reports exact versions, UTF-8 IPA charset, and a Japanese dependency parse', () => {
  const install = mkdtempSync(path.join(os.tmpdir(), 'tomarigi-diagnose-test-'));
  const bin = path.join(install, 'bin');
  const dic = path.join(install, 'lib', 'mecab', 'dic', 'ipadic');
  mkdirSync(bin, { recursive: true });
  mkdirSync(dic, { recursive: true });
  writeFileSync(path.join(dic, 'dicrc'), 'config-charset = UTF-8\n');

  executable(path.join(bin, 'mecab'), `
case "\${1-}" in
  --version) echo 'mecab of 0.996' ;;
  -D) echo 'charset:\tUTF-8'; echo 'filename:\t${dic}/sys.dic'; exit 1 ;;
  *) cat; echo EOS ;;
esac`);
  executable(path.join(bin, 'crf_test'), "echo 'CRF++ of 0.58'; exit 255");
  executable(path.join(bin, 'cabocha'), `
if [ "\${1-}" = '--version' ]; then echo 'cabocha of 0.69'; exit 0; fi
[ "\${2-}" = '-d' ] && [ "\${3-}" = '${dic}' ] || exit 64
cat >/dev/null
printf '* 0 1D 0/1 0.000000\\n太郎は\\t名詞,固有名詞\\n* 1 -1D 0/1 0.000000\\n走った。\\t動詞\\nEOS\\n'`);

  try {
    const result = run(diagnosticScript, [install]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /mecab 0\.996/);
    assert.match(result.stdout, /CRF\+\+ 0\.58/);
    assert.match(result.stdout, /cabocha 0\.69/);
    assert.match(result.stdout, /charset: UTF-8/);
    assert.match(result.stdout, /太郎は/);
    assert.match(result.stdout, /\* 0 1D/);
  } finally {
    rmSync(install, { recursive: true, force: true });
  }
});

test('diagnostic fails cleanly for an incomplete installation', () => {
  const install = mkdtempSync(path.join(os.tmpdir(), 'tomarigi-incomplete-test-'));
  try {
    const result = run(diagnosticScript, [install]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing executable/i);
  } finally {
    rmSync(install, { recursive: true, force: true });
  }
});
