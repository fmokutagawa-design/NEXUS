/**
 * fileSystem.browser.js
 * Browser (File System Access API) backend for fileSystem adapter.
 */

async function scanDirectory(dirHandle) {
  const values = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (!entry.name.startsWith('.') && (entry.name.endsWith('.txt') || entry.name.endsWith('.md'))) {
        values.push({
          name: entry.name,
          kind: 'file',
          handle: entry
        });
      }
    } else if (entry.kind === 'directory') {
      if (!entry.name.startsWith('.')) {
        values.push({
          name: entry.name,
          kind: 'directory',
          handle: entry,
          children: await scanDirectory(entry)
        });
      }
    }
  }
  values.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
  return values;
}

export const browserFileSystem = {
  async openProjectDialog() {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      return handle;
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
      return null;
    }
  },

  async readDirectory(dirHandle) {
    return await scanDirectory(dirHandle);
  },

  async getFileHandle(dirHandle, fileName, options = { create: false }) {
    return await dirHandle.getFileHandle(fileName, options);
  },

  async getFile(dirHandle, fileName) {
    try {
      return await dirHandle.getFileHandle(fileName);
    } catch {
      return null;
    }
  },

  async getOrCreateFile(dirHandle, fileName) {
    return await dirHandle.getFileHandle(fileName, { create: true });
  },

  async readFile(fileHandle, options = {}) {
    const file = await fileHandle.getFile();
    if (options.length) {
      return await file.slice(0, options.length).text();
    }
    return await file.text();
  },

  async getFileFingerprint(fileHandle) {
    const file = await fileHandle.getFile();
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return {
      path: '',
      name: file.name,
      size: file.size,
      characterCount: Array.from(await file.text()).length,
      modifiedAt: new Date(file.lastModified).toISOString(),
      sha256,
    };
  },

  async writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  },

  async createFile(parentHandle, fileName, content = '') {
    const newHandle = await parentHandle.getFileHandle(fileName, { create: true });
    const writable = await newHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return newHandle;
  },

  async createFolder(parentHandle, folderName) {
    return await parentHandle.getDirectoryHandle(folderName, { create: true });
  },

  async rename(_handle, _newName) {
    alert("ブラウザ版ではリネームに対応していません");
    throw new Error("Rename not supported in browser");
  },

  async deleteEntry(_handle) {
    alert("ブラウザ版では直接削除に対応していません");
    throw new Error("Delete requires parent in browser");
  },

  async deleteEntryWithParent(handle, parentHandle) {
    if (!parentHandle || !parentHandle.removeEntry) {
      throw new Error("Invalid parent handle");
    }
    await parentHandle.removeEntry(handle.name, { recursive: true });
  },

  async moveFile(_sourceHandle, _targetDirHandle) {
    throw new Error("Browser move requires context (parent). Use moveFileWithContext.");
  },

  async moveFileWithContext(sourceHandle, sourceParentHandle, targetDirHandle) {
    const file = await sourceHandle.getFile();
    const content = await file.text();

    const newHandle = await targetDirHandle.getFileHandle(sourceHandle.name, { create: true });
    const writable = await newHandle.createWritable();
    await writable.write(content);
    await writable.close();

    await sourceParentHandle.removeEntry(sourceHandle.name);
    return newHandle;
  },

  async moveDirectoryWithContext() {
    throw new Error('ブラウザ版ではフォルダ移動に対応していません');
  },

  async resolvePath(rootHandle, targetHandle) {
    return await rootHandle.resolve(targetHandle);
  },

  async getDirectoryHandleFromPath(rootHandle, pathParts) {
    let current = rootHandle;
    for (const part of pathParts) {
      current = await current.getDirectoryHandle(part);
    }
    return current;
  },

  async showInExplorer(_handle) {
    alert('ブラウザ版ではFinder/エクスプローラーで表示できません。\nElectron版をお使いください。');
  },

  async saveFile(_defaultPath) {
    throw new Error("saveFile not supported in browser without showSaveFilePicker");
  },
};
