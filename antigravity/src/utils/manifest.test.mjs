import assert from 'node:assert/strict';
import { findSegmentEntry, normalizeManifestFileName, validateManifest } from './manifest.js';

const nfd = '機動戦士ガンダム_06_ダカール.txt';
const nfc = '機動戦士ガンダム_06_ダカール.txt';
assert.notEqual(nfd, nfc);
assert.equal(normalizeManifestFileName(nfd), normalizeManifestFileName(nfc));
assert.equal(findSegmentEntry([{ name: nfd, kind: 'file' }], nfc)?.name, nfd);
assert.equal(validateManifest({ version: 1, segments: [
  { id: 'a', file: nfd },
  { id: 'b', file: nfc },
]}), false);
console.log('Manifest normalization tests passed');
