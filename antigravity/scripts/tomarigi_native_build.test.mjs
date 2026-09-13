import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(scriptsDir, 'build_tomarigi_native.sh');
const diagnosticScript = path.join(scriptsDir, 'diagnose_tomarigi_native.sh');
const archives = ['mecab-0.996.tar.gz', 'mecab-ipadic-2.7.0-20070610.tar.gz', 'CRF++-0.58.tar.gz', 'cabocha-0.69.tar.bz2'];

function run(script, args = [], options = {}) {
  return spawnSync('/bin/sh', [script, ...args], { encoding: 'utf8', ...options });
}

function executable(file, contents) {
  writeFileSync(file, `#!/bin/sh\n${contents}\n`);
  chmodSync(file, 0o755);
}

function tempRoot(prefix) {
  return realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function diagnosticEnv(t, architecture) {
  const fakeBin = tempRoot('tomarigi-uname-test-');
  t.after(() => rmSync(fakeBin, { recursive: true, force: true }));
  executable(path.join(fakeBin, 'uname'), `printf '%s\\n' '${architecture}'`);
  return { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` };
}

function makeSource(root) {
  const source = path.join(root, 'source');
  mkdirSync(source);
  for (const archive of archives) writeFileSync(path.join(source, archive), `original:${archive}`);
  return source;
}

function makeDiagnosticInstall(t, overrides = {}) {
  const install = mkdtempSync(path.join(os.tmpdir(), 'tomarigi-diagnose-test-'));
  t.after(() => rmSync(install, { recursive: true, force: true }));
  const bin = path.join(install, 'bin');
  const dic = path.join(install, 'lib', 'mecab', 'dic', 'ipadic');
  mkdirSync(bin, { recursive: true });
  mkdirSync(dic, { recursive: true });
  writeFileSync(path.join(dic, 'dicrc'), 'config-charset = UTF-8\n');
  executable(path.join(bin, 'mecab'), overrides.mecab ?? `
case "\${1-}" in
  --version) echo 'mecab of 0.996' ;;
  -D) echo 'filename:\t${dic}/sys.dic'; echo 'version:\t102'; echo 'charset:\tUTF-8'; echo 'type:\t0'; echo 'size:\t392126'; echo 'left size:\t1316'; echo 'right size:\t1316'; exit 1 ;;
  *) cat; echo EOS ;;
esac`);
  executable(path.join(bin, 'crf_test'), overrides.crf ?? "echo 'CRF++ of 0.58'; exit 255");
  executable(path.join(bin, 'cabocha'), overrides.cabocha ?? `
if [ "\${1-}" = '--version' ]; then echo 'cabocha of 0.69'; exit 0; fi
[ "\${2-}" = '-d' ] && [ "\${3-}" = '${dic}' ] || exit 64
cat >/dev/null
printf '* 0 1D 0/1 0.000000\\n太郎は\\t名詞,固有名詞\\n* 1 -1D 0/1 0.000000\\n走った。\\t動詞\\nEOS\\n'`);
  return install;
}

test('build rejects lexical dot segments and resolved root or home aliases before mutation', (t) => {
  const root = tempRoot('tomarigi-build-path-test-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = makeSource(root);
  for (const unsafe of [
    `${root}/./install`, `${root}/child/../install`, `${root}/../${path.basename(root)}/install`,
    '/tmp/..', `${os.homedir()}/../${path.basename(os.homedir())}`,
  ]) {
    const result = run(buildScript, [source, unsafe]);
    assert.notEqual(result.status, 0, `expected rejection for ${unsafe}`);
    assert.match(result.stderr, /unsafe install directory|dot segment/i);
  }
});

test('build rejects overlap, symlink ancestry, missing parent, and every existing target', (t) => {
  const root = tempRoot('tomarigi-build-safety-test-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = makeSource(root);
  const realParent = path.join(root, 'real-parent');
  mkdirSync(realParent);
  const symlinkParent = path.join(root, 'linked-parent');
  symlinkSync(realParent, symlinkParent);
  const fileTarget = path.join(root, 'file-target');
  writeFileSync(fileTarget, 'keep');
  const danglingTarget = path.join(root, 'dangling-target');
  symlinkSync(path.join(root, 'missing'), danglingTarget);
  for (const unsafe of [
    path.join(source, 'install'), path.join(symlinkParent, 'install'),
    path.join(root, 'missing-parent', 'install'), fileTarget, danglingTarget,
  ]) {
    const result = run(buildScript, [source, unsafe]);
    assert.notEqual(result.status, 0, `expected rejection for ${unsafe}`);
  }
  assert.equal(readFileSync(fileTarget, 'utf8'), 'keep');
});

test('atomic mkdir loses an occupied-target race without removing the winner', (t) => {
  const root = tempRoot('tomarigi-build-race-test-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = makeSource(root);
  const install = path.join(root, 'install');
  const fakeBin = path.join(root, 'bin');
  mkdirSync(fakeBin);
  executable(path.join(fakeBin, 'node'), `mkdir '${install}'; printf winner > '${install}/keep.txt'; exit 0`);
  const result = run(buildScript, [source, install], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(install, 'keep.txt'), 'utf8'), 'winner');
});

test('build verifies controlled staged copies and extracts those same copies', (t) => {
  const root = tempRoot('tomarigi-build-stage-test-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = makeSource(root);
  const install = path.join(root, 'install');
  const fakeBin = path.join(root, 'bin');
  const log = path.join(root, 'log');
  mkdirSync(fakeBin);
  executable(path.join(fakeBin, 'node'), `
stage=$2
[ "$stage" != '${source}' ] || exit 80
for name in ${archives.map((name) => `'${name}'`).join(' ')}; do
  [ "$(cat "$stage/$name")" = "original:$name" ] || exit 81
  printf 'changed:%s' "$name" > '${source}/'$name
done`);
  executable(path.join(fakeBin, 'tar'), `
archive=''
for arg do case "$arg" in *.tar.gz|*.tar.bz2) archive=$arg;; esac; done
case "$archive" in '${source}'/*) exit 82;; esac
case "$(cat "$archive")" in original:*) ;; *) exit 83;; esac
printf '%s\n' "$archive" >> '${log}'
case "$archive" in *cabocha-0.69.tar.bz2) exit 77;; esac
exit 0`);
  const result = run(buildScript, [source, install], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
  assert.equal(result.status, 77, result.stderr);
  const extracted = readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(extracted.length, 4);
  assert.deepEqual(extracted.map((entry) => path.basename(entry)), archives);
  for (const entry of extracted) assert.notEqual(path.dirname(entry), source);
  assert.equal(readFileSync(path.join(source, archives[0]), 'utf8'), `changed:${archives[0]}`);
  assert.equal(existsSync(install), false);
});

test('failed cleanup preserves a replacement directory it did not create', (t) => {
  const root = tempRoot('tomarigi-build-cleanup-test-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = makeSource(root);
  const install = path.join(root, 'install');
  const displaced = path.join(root, 'displaced');
  const fakeBin = path.join(root, 'bin');
  mkdirSync(fakeBin);
  executable(path.join(fakeBin, 'node'), 'exit 0');
  executable(path.join(fakeBin, 'tar'), `
mv '${install}' '${displaced}'
mkdir '${install}'
printf replacement > '${install}/keep.txt'
exit 79`);
  const result = run(buildScript, [source, install], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
  assert.equal(result.status, 79, result.stderr);
  assert.equal(readFileSync(path.join(install, 'keep.txt'), 'utf8'), 'replacement');
});

test('diagnostic accepts exact versions, successful probes, and only documented CRF status 255', (t) => {
  const good = makeDiagnosticInstall(t);
  const result = run(diagnosticScript, [good], { env: diagnosticEnv(t, 'x86_64') });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /architecture: x86_64 \(supported\)/);
  const badCases = [
    { mecab: "echo 'mecab of 0.9969'" },
    { crf: "echo 'CRF++ of 0.58'; exit 1" },
    { crf: "echo 'prefix CRF++ of 0.58'; exit 255" },
    { cabocha: "echo 'cabocha of 0.690'" },
    { mecab: "[ \"\${1-}\" = --version ] && echo 'mecab of 0.996' && exit 0; echo 'charset:\tUTF-8'; exit 1" },
    { mecab: `[ "\${1-}" = --version ] && echo 'mecab of 0.996' && exit 0; printf 'filename:\\t${path.join(good, 'lib', 'mecab', 'dic', 'ipadic', 'sys.dic')}\\nversion:\\t102\\ncharset:\\tUTF-8\\ntype:\\t0\\nsize:\\t392126\\nleft size:\\t1316\\nright size:\\t1316\\n'; exit 2` },
    { cabocha: "[ \"\${1-}\" = --version ] && echo 'cabocha of 0.69' && exit 0; exit 1" },
  ];
  for (const overrides of badCases) {
    const install = makeDiagnosticInstall(t, overrides);
    const failed = run(diagnosticScript, [install]);
    assert.notEqual(failed.status, 0, `expected failure for ${JSON.stringify(overrides)}`);
  }
});

test('diagnostic reports arm64 and other architectures as unverified', (t) => {
  for (const architecture of ['arm64', 'riscv64']) {
    const install = makeDiagnosticInstall(t);
    const result = run(diagnosticScript, [install], { env: diagnosticEnv(t, architecture) });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`architecture: ${architecture} \\(unverified\\)`));
  }
});

test('diagnostic fails cleanly for an incomplete installation', (t) => {
  const install = mkdtempSync(path.join(os.tmpdir(), 'tomarigi-incomplete-test-'));
  t.after(() => rmSync(install, { recursive: true, force: true }));
  const result = run(diagnosticScript, [install]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing executable/i);
});
