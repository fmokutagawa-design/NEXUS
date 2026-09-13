import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyArchives } from './verify_tomarigi_native_sources.mjs';

const scriptPath = fileURLToPath(new URL('./verify_tomarigi_native_sources.mjs', import.meta.url));
const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const fixtureLock = {
  schemaVersion: 1,
  archives: {
    'mecab-0.996.tar.gz': emptySha256,
    'mecab-ipadic-2.7.0-20070610.tar.gz': emptySha256,
    'CRF++-0.58.tar.gz': emptySha256,
    'cabocha-0.69.tar.bz2': emptySha256,
  },
};

function makeTemp(t, prefix = 'tomarigi-native-sources-') {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function makeArchiveFixture(t, lock = fixtureLock) {
  const directory = makeTemp(t);
  for (const filename of Object.keys(lock.archives)) {
    writeFileSync(path.join(directory, filename), '');
  }
  return directory;
}

function makeScriptFixture(t, lockContents) {
  const root = makeTemp(t, 'tomarigi-native-script-');
  const scriptsDirectory = path.join(root, 'scripts');
  const nativeDirectory = path.join(root, 'native');
  mkdirSync(scriptsDirectory);
  mkdirSync(nativeDirectory);
  const script = path.join(scriptsDirectory, path.basename(scriptPath));
  cpSync(scriptPath, script);
  if (lockContents !== null) {
    writeFileSync(path.join(nativeDirectory, 'tomarigi-native-lock.json'), lockContents);
  }
  return { root, script };
}

test('verifies every archive whose SHA-256 matches', (t) => {
  const directory = makeArchiveFixture(t);
  const result = verifyArchives(directory, fixtureLock);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.files.map((file) => file.name), Object.keys(fixtureLock.archives));
  assert.equal(result.files.every((file) => file.verified === true), true);
});

test('reports a missing or unreadable archive without throwing', (t) => {
  const directory = makeArchiveFixture(t);
  const missingArchive = path.join(directory, 'mecab-0.996.tar.gz');
  rmSync(missingArchive);
  mkdirSync(missingArchive);
  const result = verifyArchives(directory, fixtureLock);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /mecab-0\.996\.tar\.gz/);
  assert.match(result.errors[0], /missing/i);
});

test('reports an archive SHA-256 mismatch', (t) => {
  const directory = makeArchiveFixture(t);
  writeFileSync(path.join(directory, 'mecab-0.996.tar.gz'), 'modified');
  const result = verifyArchives(directory, fixtureLock);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /mecab-0\.996\.tar\.gz/);
  assert.match(result.errors[0], /SHA-256/);
});

test('rejects empty, non-object, and malformed locks', (t) => {
  const directory = makeArchiveFixture(t);
  const invalidLocks = [null, '', [], {}, { schemaVersion: 1, archives: {} }];
  for (const lock of invalidLocks) {
    assert.deepEqual(verifyArchives(directory, lock), {
      ok: false,
      files: [],
      errors: ['Invalid Tomarigi native source lock.'],
    });
  }
});

test('rejects invalid SHA-256 formats', (t) => {
  const directory = makeTemp(t);
  const invalidHashes = ['', 'abc', 'G'.repeat(64), 'A'.repeat(64), `${'a'.repeat(64)}00`];
  for (const hash of invalidHashes) {
    const result = verifyArchives(directory, {
      schemaVersion: 1,
      archives: { 'archive.tar.gz': hash },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.files, []);
    assert.match(result.errors[0], /Invalid Tomarigi native source lock/);
  }
});

test('rejects archive names that are not basename-only', (t) => {
  const directory = makeTemp(t);
  for (const name of ['../archive.tar.gz', 'nested/archive.tar.gz', 'nested\\archive.tar.gz']) {
    const result = verifyArchives(directory, {
      schemaVersion: 1,
      archives: { [name]: emptySha256 },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.files, []);
    assert.match(result.errors[0], /Invalid Tomarigi native source lock/);
  }
});

test('rejects an archive symlink that escapes the source directory', (t) => {
  const directory = makeTemp(t);
  const outsideDirectory = makeTemp(t, 'tomarigi-native-outside-');
  const outsideArchive = path.join(outsideDirectory, 'archive.tar.gz');
  writeFileSync(outsideArchive, '');
  symlinkSync(outsideArchive, path.join(directory, 'archive.tar.gz'));
  const result = verifyArchives(directory, {
    schemaVersion: 1,
    archives: { 'archive.tar.gz': emptySha256 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.files[0].verified, false);
  assert.match(result.errors[0], /outside source directory/i);
});

test('a missing default lock returns the result contract and a controlled CLI diagnostic', async (t) => {
  const fixture = makeScriptFixture(t, null);
  const module = await import(`${pathToFileURL(fixture.script).href}?missing-lock`);
  const result = module.verifyArchives(fixture.root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.files, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /lock/i);
  const cli = spawnSync(process.execPath, [fixture.script, fixture.root], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /^error: .*lock/im);
  assert.doesNotMatch(cli.stderr, /\n\s+at /);
});

test('a malformed default lock returns the result contract and a controlled CLI diagnostic', async (t) => {
  const fixture = makeScriptFixture(t, '{not json');
  const module = await import(`${pathToFileURL(fixture.script).href}?malformed-lock`);
  const result = module.verifyArchives(fixture.root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.files, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /lock/i);
  const cli = spawnSync(process.execPath, [fixture.script, fixture.root], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /^error: .*lock/im);
  assert.doesNotMatch(cli.stderr, /\n\s+at /);
});

test('an unreadable default lock returns the result contract and a controlled CLI diagnostic', async (t) => {
  const fixture = makeScriptFixture(t, null);
  mkdirSync(path.join(fixture.root, 'native', 'tomarigi-native-lock.json'));
  const module = await import(`${pathToFileURL(fixture.script).href}?unreadable-lock`);
  const result = module.verifyArchives(fixture.root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.files, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /lock/i);
  const cli = spawnSync(process.execPath, [fixture.script, fixture.root], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /^error: .*lock/im);
  assert.doesNotMatch(cli.stderr, /\n\s+at /);
});

test('importing the module does not run the CLI', () => {
  const imported = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `import(${JSON.stringify(pathToFileURL(scriptPath).href)})`],
    { encoding: 'utf8' },
  );
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});

test('CLI reports a missing source directory argument without a stack trace', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^error: Source directory is required\.$/m);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test('CLI prints verified archives on success', (t) => {
  const fixture = makeScriptFixture(t, `${JSON.stringify(fixtureLock)}\n`);
  const archiveDirectory = path.join(fixture.root, 'archives');
  mkdirSync(archiveDirectory);
  for (const filename of Object.keys(fixtureLock.archives)) {
    writeFileSync(path.join(archiveDirectory, filename), '');
  }
  const result = spawnSync(process.execPath, [fixture.script, archiveDirectory], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^verified mecab-0\.996\.tar\.gz SHA-256 [a-f0-9]{64}$/m);
  assert.equal(result.stdout.trim().split('\n').length, 4);
});
