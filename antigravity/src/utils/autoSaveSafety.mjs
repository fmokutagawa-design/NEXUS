import { sameFileTarget } from './readerEditSession.mjs';

export function isAutoSaveJobCurrent(job, activeFileHandle, currentText) {
  if (!job?.fileHandle) return false;
  return sameFileTarget(job.fileHandle, activeFileHandle) && job.text === currentText;
}
