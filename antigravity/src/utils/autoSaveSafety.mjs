import { sameFileTarget } from './readerEditSession.mjs';

export function isAutoSaveJobCurrent(job, activeFileHandle, currentText, writeBlocked = false) {
  if (writeBlocked) return false;
  if (!job?.fileHandle) return false;
  return sameFileTarget(job.fileHandle, activeFileHandle) && job.text === currentText;
}
