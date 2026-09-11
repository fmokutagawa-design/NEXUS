const normalizePath = value => String(value || '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');

export function workLocationPriority(value) {
  const segments = normalizePath(value).toLowerCase().split('/').filter(Boolean);
  if (segments.includes('manuscripts')) return 0;
  if (segments.some(segment => ['archive', 'archives', 'archived', 'backup', 'backups', 'old'].includes(segment))) return 2;
  return 1;
}

export function folderDisplayPriority(name) {
  const normalized = String(name || '').normalize('NFC').toLowerCase();
  if (normalized === 'manuscripts') return 0;
  if (['archive', 'archives', 'archived', 'backup', 'backups', 'old'].includes(normalized)) return 2;
  return 1;
}

export function resolveMergedWorkId(workId, profiles = {}) {
  let current = workId;
  const visited = new Set([current]);
  while (profiles[current]?.mergedInto) {
    const next = profiles[current].mergedInto;
    if (!next || visited.has(next)) return workId;
    visited.add(next);
    current = next;
  }
  return current;
}
