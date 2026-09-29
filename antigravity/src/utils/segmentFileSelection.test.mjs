import assert from 'node:assert/strict';
import { selectJumpFile, selectSegmentFile } from './segmentFileSelection.mjs';

const root = '/works/星（ノチウ）に願いを_最終8版.nexus';
const name = '星（ノチウ）に願いを_最終8版_02_第一章.txt';
const nested = { name, handle: `${root}/文章修正版/${name}` };
const direct = { name, handle: `${root}/${name}` };

assert.equal(selectSegmentFile([nested, direct], name, root), direct);
assert.equal(selectSegmentFile([nested], name, root), undefined);
assert.equal(selectSegmentFile([{ name, handle: `${root}/segments/${name}` }], name, root)?.name, name);
assert.equal(selectJumpFile([nested, direct], name, direct.handle), direct);
assert.equal(selectJumpFile([nested], name, direct.handle), undefined);
assert.equal(selectJumpFile([
  { ...nested, path: `manuscripts/old.nexus/文章修正版/${name}` },
  { ...direct, path: `manuscripts/old.nexus/${name}` },
], name, direct.handle)?.handle, direct.handle);
console.log('Segment file selection tests passed');
