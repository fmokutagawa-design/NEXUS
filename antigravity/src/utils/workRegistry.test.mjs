import assert from 'node:assert/strict';
import { createWorkRegistration, manuscriptCandidateScore, validateWorkRegistration } from './workRegistry.js';

const work = createWorkRegistration('作品A', 'manuscripts/revision.nexus');
assert.equal(validateWorkRegistration(work), true);
assert.equal(work.kind, 'work');
assert.equal(work.title, '作品A');
assert.ok(work.workId);
assert.equal(validateWorkRegistration({ ...work, workId: '' }), false);
assert.ok(manuscriptCandidateScore({ kind: 'file', name: 'PMNE(+)本文第1稿.txt', handle: '/PMNE(+)/PMNE(+)本文第1稿.txt' }, 'PMNE(+)') > 100);
assert.ok(manuscriptCandidateScore({ kind: 'file', name: 'PMNE(+)改訂版全体設定.txt', handle: '/PMNE(+)/PMNE(+)改訂版全体設定.txt' }, 'PMNE(+)') < 0);
assert.ok(manuscriptCandidateScore({ kind: 'file', name: '# 闇バイト周りの詳細設定書.txt', handle: '/CF/# 闇バイト周りの詳細設定書.txt' }, 'CF') < 0);
console.log('Work registry tests passed');
