import { normalizeManifestFileName } from './manifest.js';

function fileNameFromHandle(fileHandle) {
  if (!fileHandle) return '';
  const path = typeof fileHandle === 'string'
    ? fileHandle
    : (fileHandle.handle || fileHandle.path || fileHandle.name || '');
  return String(path).split(/[/\\]/).pop() || '';
}

export function getChapterNavigation(chapters = [], activeFileHandle = null) {
  const activeFileName = normalizeManifestFileName(fileNameFromHandle(activeFileHandle));
  const currentIndex = chapters.findIndex(chapter => (
    normalizeManifestFileName(chapter?.file) === activeFileName
  ));

  if (currentIndex < 0) {
    return { currentIndex: -1, current: null, previous: null, next: null };
  }

  return {
    currentIndex,
    current: chapters[currentIndex],
    previous: chapters[currentIndex - 1] || null,
    next: chapters[currentIndex + 1] || null,
  };
}
