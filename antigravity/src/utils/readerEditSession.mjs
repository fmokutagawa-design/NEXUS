export function assessReaderEdit({ baselineText = '', currentText = '', hasTarget = false }) {
  const hasChanges = currentText !== baselineText;
  if (!hasChanges) return { hasChanges: false, canSave: false, reason: 'NO_CHANGES' };
  if (!hasTarget) return { hasChanges: true, canSave: false, reason: 'MISSING_TARGET' };
  return { hasChanges: true, canSave: true, reason: null };
}

export function displayFileName(fileHandle, fallback = '') {
  if (fileHandle && typeof fileHandle === 'object' && fileHandle.name) return fileHandle.name;
  const raw = typeof fileHandle === 'string' ? fileHandle : fallback;
  return String(raw || '').split(/[/\\]/).pop() || '保存先不明';
}

function targetPath(target) {
  if (!target) return '';
  if (typeof target === 'string') return target.replace(/\\/g, '/');
  if (typeof target.handle === 'string') return target.handle.replace(/\\/g, '/');
  if (typeof target.path === 'string') return target.path.replace(/\\/g, '/');
  return '';
}

export function sameFileTarget(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftPath = targetPath(left);
  const rightPath = targetPath(right);
  return Boolean(leftPath && rightPath && leftPath === rightPath);
}
