const { contextBridge, ipcRenderer, webFrame } = require('electron');

const toPath = (p) => (p && typeof p === 'object' ? (p.handle || p.path || p) : p);

contextBridge.exposeInMainWorld('api', {
    fs: {
        selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
        saveFile: (defaultPath) => ipcRenderer.invoke('dialog:save', toPath(defaultPath)),
        readDirectory: (path) => ipcRenderer.invoke('fs:readDirectory', toPath(path)),
        readFile: (path) => ipcRenderer.invoke('fs:readFile', toPath(path)),
        readFileBinary: (path) => ipcRenderer.invoke('fs:readFileBinary', toPath(path)),
        getFileFingerprint: (path) => ipcRenderer.invoke('fs:getFileFingerprint', toPath(path)),
        writeFile: (path, content, options = {}) => ipcRenderer.invoke('fs:writeFile', toPath(path), content, options),
        writeFileBinary: (path, buffer, options = {}) => ipcRenderer.invoke('fs:writeFileBinary', toPath(path), buffer, options),
        createFolder: (parentPath, name) => ipcRenderer.invoke('fs:createFolder', toPath(parentPath), name),
        createFile: (parentPath, name, content, options = {}) => ipcRenderer.invoke('fs:createFile', toPath(parentPath), name, content, options),
        rename: (oldPath, newName) => ipcRenderer.invoke('fs:rename', toPath(oldPath), newName),
        delete: (path) => ipcRenderer.invoke('fs:delete', toPath(path)),
        showInExplorer: (path) => ipcRenderer.invoke('fs:showInExplorer', toPath(path)),
        grep: (path, query, options = {}) => ipcRenderer.invoke('fs:grep', toPath(path), query, options),
    },
    system: {
        getFonts: () => ipcRenderer.invoke('system:getFonts'),
        launchApp: (appPath) => ipcRenderer.invoke('system:launchApp', appPath)
    },
    textlint: {
        proofread: (text, profile = {}) => ipcRenderer.invoke('textlint:proofread', text, profile),
        scanProjectTerms: (targetPath) => ipcRenderer.invoke('proofreading:scanProjectTerms', toPath(targetPath)),
        saveProjectTerms: (targetPath, words) => ipcRenderer.invoke('proofreading:saveProjectTerms', toPath(targetPath), words)
    },
    // Generic invoke for settings/persistence
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    onCloseRequested: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('app:request-close', listener);
        return () => ipcRenderer.removeListener('app:request-close', listener);
    },
    closeReady: () => ipcRenderer.send('app:close-ready'),
    closeCancelled: () => ipcRenderer.send('app:close-cancelled'),
    // UIスケール用: webFrame.setZoomFactor でビューポート全体を正しくズーム
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
    isElectron: true
});
