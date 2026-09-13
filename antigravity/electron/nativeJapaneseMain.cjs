'use strict';

const { createHash } = require('node:crypto');

function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function acceptNativeResult({ text, result }) {
  if (!result || result.textHash !== sha256(text)) return { status: 'stale', textHash: result?.textHash, findings: [] };
  return { ...result, status: result.status || 'ok', findings: result.findings || [] };
}

function classifyFailure(error) {
  const message = String(error?.message || error || '');
  if (message.startsWith('not-installed:')) return 'not-installed';
  if (message.startsWith('timeout:')) return 'timeout';
  return 'error';
}

function setupNativeJapaneseHandler({ ipcMain, runner }) {
  ipcMain.handle('native-japanese:analyze', async (_event, text, profile = {}) => {
    const source = typeof text === 'string' ? text : '';
    try {
      const result = await runner.analyze({
        text: source,
        requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        thresholds: profile?.thresholds || {},
      });
      return acceptNativeResult({ text: source, result });
    } catch (error) {
      return { status: classifyFailure(error), textHash: sha256(source), findings: [] };
    }
  });
}

module.exports = { acceptNativeResult, classifyFailure, setupNativeJapaneseHandler, sha256 };
