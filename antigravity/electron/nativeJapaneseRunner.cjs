'use strict';

const { createHash } = require('node:crypto');
const { accessSync, constants } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseMecab, parseCabocha, analyzeStructure } = require('./nativeJapaneseParser.cjs');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function runAnalyzer(command, args, text, { timeoutMs, maxOutputBytes }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`timeout: ${path.basename(command)}`));
    }, timeoutMs);
    const collect = (kind, chunk) => {
      const value = chunk.toString('utf8');
      if (kind === 'stdout') stdout += value; else stderr += value;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error(`output-limit: ${path.basename(command)}`));
      }
    };
    child.stdout.on('data', (chunk) => collect('stdout', chunk));
    child.stderr.on('data', (chunk) => collect('stderr', chunk));
    child.on('error', (error) => finish(new Error(`not-installed: ${error.message}`)));
    child.on('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error(`analyzer-failed: ${path.basename(command)} code=${code} signal=${signal || 'none'} ${stderr.trim()}`));
        return;
      }
      finish(null, stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(text, 'utf8');
  });
}

function createNativeJapaneseRunner({
  binDir,
  dicDir,
  timeoutMs = 15000,
  maxOutputBytes = 32 * 1024 * 1024,
} = {}) {
  const mecabPath = path.join(String(binDir || ''), 'mecab');
  const cabochaPath = path.join(String(binDir || ''), 'cabocha');
  const safeTimeout = Math.max(1, Number(timeoutMs) || 15000);
  const safeOutputLimit = Math.max(1024, Number(maxOutputBytes) || 32 * 1024 * 1024);

  return {
    async analyze({ text, requestId, thresholds = {} } = {}) {
      if (typeof text !== 'string') throw new TypeError('text must be a string');
      try {
        accessSync(mecabPath, constants.X_OK);
        accessSync(cabochaPath, constants.X_OK);
        accessSync(String(dicDir || ''), constants.R_OK);
      } catch {
        throw new Error('not-installed: native Japanese analyzer');
      }
      const [mecabOutput, cabochaOutput] = await Promise.all([
        runAnalyzer(mecabPath, ['-d', dicDir], text, { timeoutMs: safeTimeout, maxOutputBytes: safeOutputLimit }),
        runAnalyzer(cabochaPath, ['-f1', '-d', dicDir], text, { timeoutMs: safeTimeout, maxOutputBytes: safeOutputLimit }),
      ]);
      const mecab = parseMecab(text, mecabOutput);
      const cabocha = parseCabocha(text, cabochaOutput);
      if (mecab.errors.length || cabocha.errors.length) {
        throw new Error(`invalid-output: ${[...mecab.errors, ...cabocha.errors].join('; ')}`);
      }
      const analysis = analyzeStructure(text, mecab.morphemes, cabocha.chunks, thresholds);
      return {
        status: 'ok',
        requestId: requestId == null ? null : String(requestId),
        textHash: sha256(text),
        morphemes: mecab.morphemes,
        chunks: cabocha.chunks,
        analysis,
        findings: analysis.findings,
      };
    },
  };
}

module.exports = { createNativeJapaneseRunner, sha256 };
