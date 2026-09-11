import { fileSystem, isNative } from './fileSystem.js';

export const WORK_REGISTRY_VERSION = 1;
export const WORKSPACE_REGISTRY_FILE = 'nexus-workspace.json';

const normalizePath = value => String(value || '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');
const pathOf = value => normalizePath(typeof value === 'string' ? value : (value?.handle || value?.path || ''));
const basename = value => normalizePath(value).split('/').filter(Boolean).pop() || '';

export function validateWorkRegistration(value) {
  return Boolean(value
    && value.version === WORK_REGISTRY_VERSION
    && typeof value.workId === 'string' && value.workId.trim()
    && typeof value.title === 'string' && value.title.trim()
    && value.kind === 'work');
}

export function createWorkRegistration(title, currentManuscriptPath = '') {
  return {
    version: WORK_REGISTRY_VERSION,
    kind: 'work',
    workId: globalThis.crypto?.randomUUID?.() || `work-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: String(title || '名称未設定の作品').trim(),
    currentManuscriptPath: normalizePath(currentManuscriptPath),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * manuscript/.nexus から作品ルートを推定する。
 * manuscripts/archive/backup 配下なら、その分類フォルダの一つ上を作品ルートとする。
 * それ以外は .nexus 原稿フォルダの親を作品ルートとする。
 */
export async function resolveWorkRoot(manuscriptFolder, projectHandle) {
  const manuscriptPath = pathOf(manuscriptFolder);
  const relativePath = normalizePath(manuscriptFolder?.path || manuscriptFolder?.name);
  const source = manuscriptPath || relativePath;
  const parts = source.split('/').filter(Boolean);
  const containerNames = new Set(['manuscripts', 'archive', 'archives', 'backup', 'backups', 'old']);
  const containerIndex = parts.map(p => p.toLowerCase()).findLastIndex(p => containerNames.has(p));
  const rootParts = containerIndex > 0 ? parts.slice(0, containerIndex) : parts.slice(0, -1);
  const rootPath = `${source.startsWith('/') ? '/' : ''}${rootParts.join('/')}`;

  if (isNative && manuscriptPath) {
    return {
      handle: { handle: rootPath, path: rootPath, name: basename(rootPath), kind: 'directory' },
      path: rootPath,
      title: basename(rootPath),
      manuscriptPath,
    };
  }

  const relativeParts = relativePath.split('/').filter(Boolean);
  const relativeContainerIndex = relativeParts.map(p => p.toLowerCase()).findLastIndex(p => containerNames.has(p));
  const workParts = relativeContainerIndex > 0 ? relativeParts.slice(0, relativeContainerIndex) : relativeParts.slice(0, -1);
  let handle = projectHandle;
  for (const part of workParts) {
    if (!handle?.getDirectoryHandle) throw new Error('作品フォルダを特定できません');
    handle = await handle.getDirectoryHandle(part);
  }
  return { handle, path: workParts.join('/'), title: workParts.at(-1) || projectHandle?.name || '作品', manuscriptPath: relativePath };
}

export async function readWorkRegistration(workRootHandle) {
  try {
    if (isNative) {
      const rootPath = pathOf(workRootHandle);
      if (!rootPath) return null;
      const separator = rootPath.includes('\\') ? '\\' : '/';
      const filePath = `${rootPath}${separator}.nexus${separator}work.json`;
      const parsed = JSON.parse(await fileSystem.readFile({ handle: filePath, path: filePath, name: 'work.json', kind: 'file' }));
      return validateWorkRegistration(parsed) ? parsed : null;
    }
    let nexusDir;
    if (workRootHandle?.getDirectoryHandle) {
      nexusDir = await workRootHandle.getDirectoryHandle('.nexus');
    } else {
      const entries = await fileSystem.readDirectory(workRootHandle);
      nexusDir = entries.find(entry => entry.kind === 'directory' && entry.name === '.nexus');
      if (!nexusDir) return null;
    }
    const entries = await fileSystem.readDirectory(nexusDir.handle || nexusDir);
    const entry = entries.find(item => item.kind === 'file' && item.name === 'work.json');
    if (!entry) return null;
    const parsed = JSON.parse(await fileSystem.readFile(entry.handle || entry));
    return validateWorkRegistration(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readWorkspaceRegistrations(workspaceHandle) {
  try {
    const entries = await fileSystem.readDirectory(workspaceHandle);
    const entry = entries.find(item => item.kind === 'file' && item.name === WORKSPACE_REGISTRY_FILE);
    if (!entry) return [];
    const parsed = JSON.parse(await fileSystem.readFile(entry.handle || entry));
    return Array.isArray(parsed?.works) ? parsed.works.filter(validateWorkRegistration) : [];
  } catch {
    return [];
  }
}

async function addToWorkspaceIndex(workspaceHandle, registration, workRoot) {
  if (!workspaceHandle) return;
  const previous = await readWorkspaceRegistrations(workspaceHandle);
  const rootPath = pathOf(workRoot.handle || workRoot) || normalizePath(workRoot.path);
  const indexed = { ...registration, rootPath };
  const works = [...previous.filter(item => item.workId !== registration.workId && item.rootPath !== rootPath), indexed];
  const entries = await fileSystem.readDirectory(workspaceHandle);
  const existing = entries.find(item => item.kind === 'file' && item.name === WORKSPACE_REGISTRY_FILE);
  const json = JSON.stringify({ version: 1, works }, null, 2);
  if (existing) await fileSystem.writeFile(existing.handle || existing, json);
  else await fileSystem.createFile(workspaceHandle, WORKSPACE_REGISTRY_FILE, json);
}

export async function setCurrentManuscript(workRoot, workspaceHandle, targetPath) {
  const existing = await readWorkRegistration(workRoot.handle || workRoot);
  if (!existing) throw new Error('作品登録情報が見つかりません');
  const updated = { ...existing, currentManuscriptPath: normalizePath(targetPath), updatedAt: new Date().toISOString() };
  if (isNative) {
    const rootPath = pathOf(workRoot.handle || workRoot);
    const separator = rootPath.includes('\\') ? '\\' : '/';
    const filePath = `${rootPath}${separator}.nexus${separator}work.json`;
    await fileSystem.writeFile({ handle: filePath, path: filePath, name: 'work.json', kind: 'file' }, JSON.stringify(updated, null, 2));
  } else {
    const nexusDir = await (workRoot.handle || workRoot).getDirectoryHandle('.nexus');
    const fileHandle = await nexusDir.getFileHandle('work.json');
    await fileSystem.writeFile(fileHandle, JSON.stringify(updated, null, 2));
  }
  await addToWorkspaceIndex(workspaceHandle, updated, workRoot);
  return updated;
}

export function manuscriptCandidateScore(item, workTitle = '') {
  const name = String(item?.name || '').normalize('NFC');
  const path = normalizePath(item?.handle || item?.path);
  const lowerPath = path.toLowerCase();
  if (item?.kind === 'directory' && name.endsWith('.nexus')) {
    return 200 + (lowerPath.includes('/manuscripts/') ? 100 : 0) - (lowerPath.includes('/archive/') ? 150 : 0);
  }
  if (item?.kind !== 'file' || !/\.(txt|md)$/i.test(name)) return -1000;
  if (/(設定|プロット|資料|指示|修正案|キャラクター|キャラ|台詞|年表|時系列|データベース|まとめ|メモ|議論)/.test(name)) return -500;
  let score = 0;
  if (lowerPath.includes('/manuscripts/')) score += 120;
  if (lowerPath.includes('/archive/') || lowerPath.includes('/旧原稿/')) score -= 160;
  if (/(本文|本原稿|原稿|清書|草稿|第\d+稿)/.test(name)) score += 100;
  if (/第[0-9一二三四五六七八九十]+[部章]/.test(name)) score += 45;
  const normalizedTitle = String(workTitle || '').normalize('NFC').trim();
  if (normalizedTitle && name.includes(normalizedTitle)) score += 35;
  return score;
}

export function indexedWorkRoot(entry) {
  const rootPath = normalizePath(entry?.rootPath);
  return { handle: { handle: rootPath, path: rootPath, name: basename(rootPath), kind: 'directory' }, path: rootPath, title: entry?.title || basename(rootPath) };
}

export async function registerWork(workRoot, title, currentManuscriptPath, workspaceHandle = null) {
  const existing = await readWorkRegistration(workRoot.handle || workRoot);
  const registration = existing || createWorkRegistration(title || workRoot.title, currentManuscriptPath || workRoot.manuscriptPath);
  if (!existing) {
    const nexusDir = await fileSystem.createFolder(workRoot.handle || workRoot, '.nexus');
    await fileSystem.createFile(nexusDir, 'work.json', JSON.stringify(registration, null, 2));
  }
  await addToWorkspaceIndex(workspaceHandle, registration, workRoot);
  return registration;
}
