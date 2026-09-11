import assert from 'node:assert/strict';
import literaryPrizes, { getFollowingDeadlineInfo, getNextDeadlineInfo, refreshKnownPrizeDeadlines } from './literaryPrizes.js';

const yasei = literaryPrizes.find(prize => prize.id === 'yasei');
const matsumoto = literaryPrizes.find(prize => prize.id === 'matsumoto');
const reference = new Date('2026-08-02T12:00:00+09:00');

assert.deepEqual(getNextDeadlineInfo(yasei, reference)?.dateString, '2026-08-28');
assert.equal(getNextDeadlineInfo(yasei, reference)?.isEstimated, false);
assert.deepEqual(getFollowingDeadlineInfo(yasei, reference)?.dateString, '2027-08-28');
assert.equal(getFollowingDeadlineInfo(yasei, reference)?.isEstimated, true);
assert.deepEqual(getNextDeadlineInfo(matsumoto, reference)?.dateString, '2026-09-30');
assert.equal(getNextDeadlineInfo(matsumoto, reference)?.isEstimated, false);
const migrated = refreshKnownPrizeDeadlines([
  { prizeId: 'yasei', deadline: '2026-10-28', deadlineIsEstimated: true },
  { prizeId: 'matsumoto', deadline: '2026-10-28', deadlineIsEstimated: true },
  { prizeId: 'yasei', deadline: '2026-09-01', deadlineIsEstimated: false },
  { prizeId: 'yasei', deadline: '2027-08-28', deadlineIsEstimated: true, deadlineSelection: 'chosen' },
  { prizeId: 'yasei', deadline: '2027-08-28', deadlineIsEstimated: true },
], reference);
assert.deepEqual(migrated.map(item => item.deadline), ['2026-08-28', '2026-09-30', '2026-09-01', '2027-08-28', '2027-08-28']);
assert.equal(migrated[4].deadlineSelection, 'chosen');
assert.deepEqual(migrated.map(item => item.deadlineIsEstimated), [false, false, false, true, true]);
console.log('Literary prize deadline tests passed');
