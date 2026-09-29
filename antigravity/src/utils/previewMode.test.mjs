import assert from 'node:assert/strict';
import { resolvePreviewMode } from './previewMode.js';

assert.equal(resolvePreviewMode({ paperStyle: 'grid' }), 'manuscript');
assert.equal(resolvePreviewMode({ paperStyle: 'manuscript' }), 'manuscript');
assert.equal(resolvePreviewMode({ paperStyle: 'plain' }), 'plain');
assert.equal(resolvePreviewMode({ paperStyle: 'lined' }), 'plain');

console.log('Preview mode tests passed');
