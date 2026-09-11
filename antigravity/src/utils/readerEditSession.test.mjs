import assert from 'node:assert/strict';
import { assessReaderEdit, sameFileTarget } from './readerEditSession.mjs';

assert.deepEqual(
  assessReaderEdit({ baselineText: '変更前', currentText: '変更後', hasTarget: true }),
  { hasChanges: true, canSave: true, reason: null },
  '対象がある変更は確認後に保存できる'
);

assert.deepEqual(
  assessReaderEdit({ baselineText: '同じ本文', currentText: '同じ本文', hasTarget: true }),
  { hasChanges: false, canSave: false, reason: 'NO_CHANGES' },
  '変更がなければファイルを書き込まない'
);

assert.deepEqual(
  assessReaderEdit({ baselineText: '変更前', currentText: '変更後', hasTarget: false }),
  { hasChanges: true, canSave: false, reason: 'MISSING_TARGET' },
  '保存対象を特定できない変更は保存させない'
);

assert.equal(
  sameFileTarget('/作品/第五章.txt', '/作品/序章.txt'),
  false,
  '別の章を開いた後は古い編集セッションへ保存しない'
);
assert.equal(
  sameFileTarget('/作品/第五章.txt', { handle: '/作品/第五章.txt' }),
  true,
  '同じ保存先の文字列パスとハンドル表現を同一視する'
);

console.log('readerEditSession: 5 passed');
