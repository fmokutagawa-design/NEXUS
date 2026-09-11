import assert from 'node:assert/strict';
import {
  collectDirectTextFiles,
  formatAIEditRequest,
  normalizeDriveFolderUrl,
  sha256Hex,
} from './aiEditRequestManifest.mjs';

assert.equal(
  normalizeDriveFolderUrl('https://drive.google.com/drive/folders/1SGT7396szdedY3Q-rUhtjf7cyJQkyj8M?usp=drive_link'),
  'https://drive.google.com/drive/folders/1SGT7396szdedY3Q-rUhtjf7cyJQkyj8M',
);
assert.equal(normalizeDriveFolderUrl('https://example.com/folder'), '');

assert.notEqual(await sha256Hex(new TextEncoder().encode('本文')), await sha256Hex(new TextEncoder().encode('本文。')));

const direct = collectDirectTextFiles([
  { kind: 'file', name: '02.txt', handle: '/w/02.txt' },
  { kind: 'directory', name: 'old', children: [{ kind: 'file', name: 'old.txt', handle: '/w/old/old.txt' }] },
  { kind: 'file', name: 'notes.pdf', handle: '/w/notes.pdf' },
  { kind: 'file', name: '01.md', handle: '/w/01.md' },
]);
assert.deepEqual(direct.map(file => file.name), ['01.md', '02.txt']);

const request = formatAIEditRequest({
  scopeLabel: '複数ファイル',
  folderName: '最終4版',
  folderUrl: 'https://drive.google.com/drive/folders/abc123456789',
  generatedAt: '2026-09-08T10:00:00+09:00',
  instruction: '全文を精査してください。',
  files: [{ name: '01.txt', path: '/w/01.txt', characterCount: 10, modifiedAt: '2026-09-08T09:00:00+09:00', sha256: 'abc' }],
  includeLocalPaths: true,
});
assert.match(request, /01\.txt/);
assert.match(request, /SHA-256: abc/);
assert.match(request, /一つでも一致しない/);
assert.match(request, /書き込み直前/);
assert.match(request, /全文を精査してください/);

assert.throws(() => formatAIEditRequest({ files: [], instruction: '' }), /対象ファイル/);
assert.throws(() => formatAIEditRequest({ files: [
  { name: 'same.txt', sha256: 'a', characterCount: 1, modifiedAt: 'x' },
  { name: 'same.txt', sha256: 'b', characterCount: 1, modifiedAt: 'y' },
] }), /同名/);

console.log('aiEditRequestManifest: 9 passed');
