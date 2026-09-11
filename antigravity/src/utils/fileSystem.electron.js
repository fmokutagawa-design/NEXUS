/**
 * fileSystem.electron.js
 * Electron (IPC via window.api) backend for fileSystem adapter.
 */

function pathSep(p) {
  return p.includes('\\') ? '\\' : '/';
}

function extractName(p) {
  return p.split('/').pop().split('\\').pop();
}

/**
 * Ensures we have a string path for Electron IPC.
 * Supports both raw path strings and handle objects.
 */
function toPath(h) {
  if (!h) return h;
  if (typeof h === 'string') return h;
  return h.handle || h.path || h;
}

export const electronFileSystem = {
  async openProjectDialog() {
    const path = await window.api.fs.selectFolder();
    if (!path) return null;
    return {
      handle: path,
      name: extractName(path),
      kind: 'directory'
    };
  },

  async readDirectory(dirHandle) {
    return await window.api.fs.readDirectory(toPath(dirHandle));
  },

  async getFileHandle(dirHandle, fileName, _options = { create: false }) {
    const dirPath = toPath(dirHandle);
    const separator = pathSep(dirPath);
    const filePath = `${dirPath}${separator}${fileName}`;
    return { handle: filePath, name: fileName, kind: 'file' };
  },

  async getFile(dirHandle, fileName) {
    const dirPath = toPath(dirHandle);
    const separator = pathSep(dirPath);
    const filePath = `${dirPath}${separator}${fileName}`;
    try {
      await window.api.fs.readFile(filePath);
      return { handle: filePath, name: fileName, kind: 'file' };
    } catch {
      return null;
    }
  },

  async getOrCreateFile(dirHandle, fileName) {
    const dirPath = toPath(dirHandle);
    const separator = pathSep(dirPath);
    const filePath = `${dirPath}${separator}${fileName}`;
    // Ensure file exists. V-1（空文字列 writeFile 拒否）に引っかからないよう、
    // 空ファイル作成は createFile 経由で行う（内部で allowEmpty:true を使う）。
    try {
      await window.api.fs.readFile(filePath);
    } catch {
      await window.api.fs.createFile(dirPath, fileName, '');
    }
    return { handle: filePath, name: fileName, kind: 'file' };
  },

  async readFile(fileHandle, options = {}) {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // クラウド同期アプリ未起動時のハング対策：5秒でタイムアウト
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CLOUD_SYNC_TIMEOUT')), 5000)
        );
        
        return await Promise.race([
          window.api.fs.readFile(toPath(fileHandle), options),
          timeoutPromise
        ]);
      } catch (error) {
        lastError = error;
        const isTimeout = error.message?.includes('ETIMEDOUT') || error.toString().includes('ETIMEDOUT');
        const isCloudTimeout = error.message === 'CLOUD_SYNC_TIMEOUT';

        if (isCloudTimeout) {
          throw new Error('CLOUD_SYNC_TIMEOUT'); // 呼び出し側で特殊処理するため即座に投げる
        }

        if (isTimeout && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  },

  async getFileFingerprint(fileHandle) {
    return await window.api.fs.getFileFingerprint(toPath(fileHandle));
  },

  async writeFile(fileHandle, content, options = {}) {
    return await window.api.fs.writeFile(toPath(fileHandle), content, options);
  },

  async createFile(parentHandle, fileName, content = '', options = {}) {
    const path = await window.api.fs.createFile(toPath(parentHandle), fileName, content, options);
    return { handle: path, name: extractName(path), kind: 'file' };
  },

  async createFolder(parentHandle, folderName) {
    const parentPath = toPath(parentHandle);
    await window.api.fs.createFolder(parentPath, folderName);

    const separator = pathSep(parentPath);
    const cleanParent = parentPath.endsWith(separator) ? parentPath.slice(0, -1) : parentPath;
    const cleanFolder = folderName.replace(/^[/\\]/, '');
    const constructedPath = `${cleanParent}${separator}${cleanFolder}`;

    return { handle: constructedPath, name: cleanFolder, kind: 'directory' };
  },

  async rename(handle, newName) {
    const oldPath = toPath(handle);
    const newPath = await window.api.fs.rename(oldPath, newName);
    return { handle: newPath, name: extractName(newPath), kind: handle.kind || 'file' };
  },

  async deleteEntry(handle) {
    return await window.api.fs.delete(toPath(handle));
  },

  async deleteEntryWithParent(handle, _parentHandle) {
    return this.deleteEntry(handle);
  },

  async moveFile(sourceHandle, targetDirHandle) {
    const oldPath = toPath(sourceHandle);
    const dirPath = toPath(targetDirHandle);

    let fileName;
    if (typeof oldPath === 'string') {
      const sep = pathSep(oldPath);
      fileName = oldPath.split(sep).pop();
    } else {
      fileName = sourceHandle.name;
    }

    if (fileName) {
      fileName = fileName.replace(/\\/g, '/').split('/').pop();
    }
    if (!fileName) throw new Error("Cannot determine filename for move");

    const separator = pathSep(dirPath);
    const cleanDirPath = dirPath.endsWith(separator) ? dirPath.slice(0, -1) : dirPath;
    const absoluteNewPath = `${cleanDirPath}${separator}${fileName}`;

    try {
      await window.api.fs.rename(oldPath, absoluteNewPath);
    } catch (e) {
      console.error("FS Rename Error args:", oldPath, "->", absoluteNewPath);
      throw e;
    }

    return {
      handle: absoluteNewPath,
      name: fileName,
      kind: sourceHandle.kind || 'file'
    };
  },

  async moveFileWithContext(sourceHandle, _sourceParentHandle, targetDirHandle) {
    return this.moveFile(sourceHandle, targetDirHandle);
  },

  async moveDirectoryWithContext(sourceHandle, _sourceParentHandle, targetDirHandle) {
    const sourcePath = toPath(sourceHandle);
    const targetPath = toPath(targetDirHandle);
    const separator = pathSep(targetPath);
    const name = extractName(sourcePath);
    await window.api.fs.rename(sourcePath, `${targetPath}${separator}${name}`);
    return { handle: `${targetPath}${separator}${name}`, name, kind: 'directory' };
  },

  async resolvePath(rootHandle, targetHandle) {
    const rootPath = toPath(rootHandle);
    const targetPath = toPath(targetHandle);

    const normalize = p => p.replace(/\\/g, '/');
    const rootNorm = normalize(rootPath).toLowerCase();
    const targetNorm = normalize(targetPath).toLowerCase();

    if (!targetNorm.startsWith(rootNorm)) {
      console.warn(`Path mismatch: ${rootNorm} vs ${targetNorm}`);
      return null;
    }

    const rootLen = normalize(rootPath).length;
    const relative = normalize(targetPath).substring(rootLen);

    return relative.split('/').filter(p => p.length > 0);
  },

  async getDirectoryHandleFromPath(rootHandle, pathParts) {
    const rootPath = toPath(rootHandle);
    const separator = pathSep(rootPath);
    const fullPath = [rootPath, ...pathParts].join(separator);
    const name = pathParts.length > 0 ? pathParts[pathParts.length - 1] : rootHandle.name;
    return { handle: fullPath, name: name, kind: 'directory' };
  },

  async showInExplorer(handle) {
    await window.api.fs.showInExplorer(toPath(handle));
  },

  async saveFile(defaultPath) {
    return await window.api.fs.saveFile(defaultPath);
  },
};
