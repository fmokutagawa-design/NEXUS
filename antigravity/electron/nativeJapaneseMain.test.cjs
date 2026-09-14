'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { acceptNativeResult, resolveNativeRoot, setupNativeJapaneseHandler, sha256 } = require('./nativeJapaneseMain.cjs');

test('uses a macOS install path without spaces', () => {
  assert.equal(resolveNativeRoot({ platform: 'darwin', homeDir: '/Users/test', appUserData: '/ignored' }), '/Users/test/Library/NEXUS/native-japanese');
  assert.equal(resolveNativeRoot({ platform: 'linux', homeDir: '/home/test', appUserData: '/data/NEXUS' }), '/data/NEXUS/native-japanese');
  assert.equal(resolveNativeRoot({ explicitRoot: '/custom/native', platform: 'darwin', homeDir: '/Users/test', appUserData: '/ignored' }), '/custom/native');
});

test('accepts only results for the current text', () => {
  assert.equal(acceptNativeResult({ text: 'new', result: { textHash: sha256('old') } }).status, 'stale');
  assert.deepEqual(acceptNativeResult({ text: 'new', result: { textHash: sha256('new'), findings: [] } }).findings, []);
});

test('maps unavailable and timeout failures without throwing', async () => {
  const handlers = new Map();
  setupNativeJapaneseHandler({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    runner: { analyze: async () => { throw new Error('not-installed: native Japanese analyzer'); } },
  });
  assert.equal((await handlers.get('native-japanese:analyze')(null, '本文')).status, 'not-installed');

  setupNativeJapaneseHandler({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    runner: { analyze: async () => { throw new Error('timeout: mecab'); } },
  });
  assert.equal((await handlers.get('native-japanese:analyze')(null, '本文')).status, 'timeout');
});

test('passes text through memory only and returns analyzer result', async () => {
  const handlers = new Map();
  let received;
  setupNativeJapaneseHandler({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    runner: { analyze: async (request) => { received = request; return { status: 'ok', textHash: sha256(request.text), findings: [] }; } },
  });
  const result = await handlers.get('native-japanese:analyze')(null, '秘密の本文', { thresholds: { longSentence: 120 } });
  assert.equal(received.text, '秘密の本文');
  assert.equal(received.thresholds.longSentence, 120);
  assert.equal(result.status, 'ok');
});
