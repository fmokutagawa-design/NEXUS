import { displayFileName } from './readerEditSession.mjs';

export function createRestoreReview({ fileHandle, fileName, diskText = '', restoredText = '', snapshotTimestamp = null }) {
  if (!fileHandle) throw new Error('保存先ファイルを確認できません');
  return {
    kind: 'snapshot-restore',
    fileHandle,
    fileName: fileName || displayFileName(fileHandle),
    diskText,
    restoredText,
    snapshotTimestamp,
    hasChanges: diskText !== restoredText,
  };
}
