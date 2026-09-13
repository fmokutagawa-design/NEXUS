import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

function makeFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'tomarigi-native-sources-'));
  for (const filename of Object.keys(fixtureLock.archives)) {
    writeFileSync(path.join(directory, filename), '');
  }
  return directory;
}

{
  const validFixture = makeFixture();
  const result = verifyArchives(validFixture, fixtureLock);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.files.map((file) => file.name), Object.keys(fixtureLock.archives));
  assert.equal(result.files.every((file) => file.verified === true), true);
}

{
  const missingFixture = makeFixture();
  const missingArchive = path.join(missingFixture, 'mecab-0.996.tar.gz');
  rmSync(missingArchive);
  mkdirSync(missingArchive);
  const result = verifyArchives(missingFixture, fixtureLock);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /mecab-0\.996\.tar\.gz/);
  assert.match(result.errors[0], /missing/i);
}

{
  const modifiedFixture = makeFixture();
  writeFileSync(path.join(modifiedFixture, 'mecab-0.996.tar.gz'), 'modified');
  const result = verifyArchives(modifiedFixture, fixtureLock);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /mecab-0\.996\.tar\.gz/);
  assert.match(result.errors[0], /SHA-256/);
}

{
  const imported = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', `import(${JSON.stringify(pathToFileURL(scriptPath).href)})`],
    { encoding: 'utf8' },
  );
  assert.equal(imported, '');
}

{
  const emptyDirectory = mkdtempSync(path.join(tmpdir(), 'tomarigi-native-cli-'));
  const result = spawnSync(process.execPath, [scriptPath, emptyDirectory], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mecab-0\.996\.tar\.gz/);
  assert.match(result.stderr, /missing/i);
}

console.log('verify_tomarigi_native_sources: all tests passed');
