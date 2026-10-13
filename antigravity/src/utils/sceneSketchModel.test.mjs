import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySketch, normalizeSketch, nextFrame, parseSketchResponse, exchangePrompt } from './sceneSketchModel.mjs';

test('blank scene is valid and contains an initial frame', () => {
  const scene = normalizeSketch(emptySketch());
  assert.equal(scene.frames.length, 1);
  assert.equal(scene.entities.length, 0);
});

test('a subsequent frame copies positions but not attack lines', () => {
  const scene = emptySketch();
  scene.frames[0].positions.a = { x: 100, y: 200, status: '立つ' };
  scene.frames[0].links = [{ from: 'a', to: 'b', kind: 'attack' }];
  const frame = nextFrame(scene, 0);
  frame.positions.a.x = 300;
  assert.equal(scene.frames[0].positions.a.x, 100);
  assert.deepEqual(frame.links, []);
});

test('unknown and malformed positions do not become real locations', () => {
  const scene = emptySketch();
  scene.entities.push({ id: 'a', name: 'A', kind: 'person' });
  scene.frames[0].positions = {
    a: { x: 1, y: 900, status: '移動' },
    invented: { x: 55, y: 99 },
    broken: { x: '??', y: 20 }
  };
  const normalized = normalizeSketch(scene);
  assert.deepEqual(Object.keys(normalized.frames[0].positions), ['a']);
  assert.equal(normalized.frames[0].positions.a.x, 10);
  assert.equal(normalized.frames[0].positions.a.y, 590);
});

test('duplicate entities and missing frames are rejected', () => {
  const scene = emptySketch();
  scene.entities = [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }];
  assert.throws(() => normalizeSketch(scene), /重複/);
  scene.entities = [];
  scene.frames = [];
  assert.throws(() => normalizeSketch(scene), /正しくありません/);
});

test('an imported proposal without a map retains the current background', () => {
  const current = emptySketch();
  current.background = 'data:image/png;base64,AA==';
  const proposal = emptySketch();
  proposal.title = '修正案';
  const restored = parseSketchResponse('```json\n' + JSON.stringify(proposal) + '\n```', current);
  assert.equal(restored.title, '修正案');
  assert.equal(restored.background, current.background);
});

test('ChatGPT exchange excludes huge embedded background images', () => {
  const scene = emptySketch();
  scene.background = 'data:image/png;base64,AA==';
  const prompt = exchangePrompt(scene, '場面メモ', 'diagram');
  assert.match(prompt, /場面メモ/);
  assert.doesNotMatch(prompt, /base64/);
});
