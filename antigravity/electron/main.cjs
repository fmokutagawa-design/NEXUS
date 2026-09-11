const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
    atomicWriteTextFile,
    atomicWriteBinaryFile,
    cleanupOrphanedTempFiles,
    ValidationError,
    ConflictError,
} = require('./atomicWrite.cjs');
const { setupTextlintHandlers } = require('./textlintMain.cjs');
const { setupProjectLexiconHandlers } = require('./projectLexicon.cjs');

const isDev = !app.isPackaged;

let bridgeProcess = null;

function startBridgeServer() {
    const isWin = process.platform === 'win32';
    const pythonCmd = isWin ? 'python' : 'python3';
    
    // プロジェクトルートからの相対パスでスクリプトを探す
    // 開発時はプロジェクト直下、ビルド後は resources 等を考慮
    const scriptRelativePath = 'nexus_backend/bridge_server.py';
    const possiblePaths = [
        path.join(__dirname, '..', scriptRelativePath), // 開発時
        path.join(__dirname, '..', '..', scriptRelativePath), // monorepo: antigravity の隣
        path.join(process.resourcesPath, scriptRelativePath), // ビルド後
        path.join(app.getAppPath(), scriptRelativePath) // その他
    ];

    let scriptPath = possiblePaths.find(p => fs.existsSync(p));

    if (!scriptPath) {
        // フォールバック：以前の固定パス（Mac用）
        const fallbackPath = '/Users/mokutagawa/Documents/nexus_projects/mem0/bridge_server.py';
        if (fs.existsSync(fallbackPath)) scriptPath = fallbackPath;
    }

    if (!scriptPath) {
        console.log('ℹ️ AI Bridge Server script not found. AI features will be disabled.');
        return;
    }

    console.log(`🚀 Starting AI Bridge Server (${pythonCmd})...`);
    console.log(`   Path: ${scriptPath}`);

    // インストール領域やソースツリーへDBを書かない。更新・再インストールでも残る
    // Electronのユーザーデータ領域に軽量索引を置く。
    const knowledgeDir = path.join(app.getPath('userData'), 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });
    const localDbPath = path.join(knowledgeDir, 'nexus_local.sqlite3');

    bridgeProcess = require('child_process').spawn(pythonCmd, [scriptPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', NEXUS_LOCAL_DB: localDbPath }
    });

    bridgeProcess.stdout.on('data', (data) => console.log(`[Python STDOUT] ${data}`));
    bridgeProcess.stderr.on('data', (data) => console.error(`[Python STDERR] ${data}`));
    bridgeProcess.on('error', (err) => console.error('❌ Failed to start AI Bridge Server process:', err.message));
    bridgeProcess.on('close', (code) => console.log(`[Python] Server process exited with code ${code}`));

    process.on('exit', () => {
        if (bridgeProcess) bridgeProcess.kill();
    });
}

// Mac用Editメニュー設定
const template = [
    ...(process.platform === 'darwin' ? [{
        label: app.name,
        submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
        ]
    }] : []),
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    }
];

function createWindow() {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    const win = new BrowserWindow({
        width: 1200,
        height: 900,
        backgroundColor: '#ffffff',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            zoomFactor: 1.1 // 10% larger UI
        },
        titleBarStyle: 'hiddenInset', // Mac-like title bar
    });

    // Renderer の非同期保存が完了するまで実際の終了を保留する。
    let closeApproved = false;
    let closeRequestPending = false;
    const closeReadyHandler = (event) => {
        if (event.sender !== win.webContents) return;
        closeApproved = true;
        closeRequestPending = false;
        win.close();
    };
    const closeCancelledHandler = (event) => {
        if (event.sender !== win.webContents) return;
        closeRequestPending = false;
    };
    ipcMain.on('app:close-ready', closeReadyHandler);
    ipcMain.on('app:close-cancelled', closeCancelledHandler);
    win.on('close', (event) => {
        if (closeApproved || win.webContents.isDestroyed()) return;
        event.preventDefault();
        if (!closeRequestPending) {
            closeRequestPending = true;
            win.webContents.send('app:request-close');
        }
    });
    win.on('closed', () => {
        ipcMain.removeListener('app:close-ready', closeReadyHandler);
        ipcMain.removeListener('app:close-cancelled', closeCancelledHandler);
    });

    // Customize new window behavior (window.open)
    win.webContents.setWindowOpenHandler(({ url }) => {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                parent: null, // Detach from main window to behave as a separate top-level window
                titleBarStyle: 'default',
                frame: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, 'preload.cjs'), // preload必須: window.api を新ウィンドウでも使えるように
                }
            }
        };
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

async function runStartupCleanup() {
    let settings = null;
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = await fs.promises.readFile(SETTINGS_FILE, 'utf-8');
            settings = JSON.parse(raw);
        }
    } catch (e) {
        console.warn('[startup] failed to read settings:', e.message);
        return;
    }

    if (!settings || !settings.projectPath) {
        console.log('[startup] no projectPath configured, skipping cleanup');
        return;
    }

    const projectRoot = typeof settings.projectPath === 'string'
        ? settings.projectPath
        : (settings.projectPath.handle || settings.projectPath.path);

    if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
        console.warn('[startup] projectPath is not a valid string:', settings.projectPath);
        return;
    }

    try {
        const stat = await fs.promises.stat(projectRoot);
        if (!stat.isDirectory()) {
            console.warn('[startup] projectPath is not a directory:', projectRoot);
            return;
        }
    } catch {
        console.warn('[startup] projectPath does not exist:', projectRoot);
        return;
    }

    const t0 = Date.now();
    const removedCount = await cleanupOrphanedTempFiles(projectRoot);
    const elapsed = Date.now() - t0;

    if (removedCount > 0) {
        console.log(
            `[startup] cleanup: removed ${removedCount} orphaned .tmp files ` +
            `from ${projectRoot} in ${elapsed}ms`
        );
    } else {
        console.log(`[startup] cleanup: no orphaned .tmp files (scanned in ${elapsed}ms)`);
    }
}

app.whenReady().then(() => {
    console.log('--- NEXUS Main Process Ready ---');
    setupTextlintHandlers();
    setupProjectLexiconHandlers();
    startBridgeServer();
    createWindow();

    // 知識管理ウィンドウのハンドラ
    ipcMain.handle('window:openKnowledge', async (_event, targetPath = '') => {
        console.log('IPC Request: window:openKnowledge');
        const win = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 900,
            minHeight: 650,
            resizable: true,
            maximizable: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.cjs'),
            },
            title: 'AI 知識ベース管理',
        });

        const query = `mode=knowledge&targetPath=${encodeURIComponent(String(targetPath || ''))}`;
        if (isDev) {
            win.loadURL(`http://localhost:5173?${query}`);
        } else {
            const indexPath = path.join(__dirname, '../dist/index.html');
            win.loadURL(`file://${indexPath}?${query}`);
        }
    });

    // ★ 起動時クリーンアップ：前回クラッシュで残った .tmp.* 残骸を削除
    //    fire-and-forget。UI 表示を止めない
    runStartupCleanup().catch(err => {
        console.warn('[startup] cleanup failed (non-fatal):', err.message);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (bridgeProcess) {
        bridgeProcess.kill();
        bridgeProcess = null;
    }
});

// --- IPC Handlers for File System ---

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

ipcMain.handle('dialog:save', async (event, defaultPath) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: defaultPath,
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (canceled) {
        return null;
    } else {
        return filePath;
    }
});

// Read Directory Structure (Asynchronous)
// ★ 再帰走査を非同期化し、メインプロセスのブロック（ETIMEDOUTの原因）を解消
async function readDirRecursive(dirPath) {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    // Filter out hidden files
    const validEntries = entries.filter(e => !e.name.startsWith('.'));

    const results = [];
    for (const entry of validEntries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push({
                name: entry.name,
                kind: 'directory',
                path: fullPath,
                handle: fullPath, // Use path as handle
                children: await readDirRecursive(fullPath)
            });
        } else {
            results.push({
                name: entry.name,
                kind: 'file',
                path: fullPath,
                handle: fullPath
            });
        }
    }
    return results;
}

// Read Directory Structure
ipcMain.handle('fs:readDirectory', async (event, dirPath) => {
    try {
        return await readDirRecursive(dirPath);
    } catch (e) {
        console.error('[fs:readDirectory] failed:', e);
        throw e;
    }
});

// Read File Content (Text)
// ★ 非同期・正規化対応版（ETIMEDOUT 対策）
ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
        // Unicode正規化（NFC）でパスを統一
        const normalizedPath = path.normalize(filePath).normalize('NFC');
        return await fs.promises.readFile(normalizedPath, 'utf-8');
    } catch (err) {
        // NFCで失敗したらNFDでリトライ（macOSファイルシステム対策）
        try {
            const nfdPath = filePath.normalize('NFD');
            return await fs.promises.readFile(nfdPath, 'utf-8');
        } catch (err2) {
            console.error('[fs:readFile] Critical failure:', filePath, err2.message);
            throw err2;
        }
    }
});

// Read File Content (Binary)
ipcMain.handle('fs:readFileBinary', async (event, filePath) => {
    try {
        const normalizedPath = path.normalize(filePath).normalize('NFC');
        return await fs.promises.readFile(normalizedPath);
    } catch (err) {
        try {
            const nfdPath = filePath.normalize('NFD');
            return await fs.promises.readFile(nfdPath);
        } catch (err2) {
            console.error('[fs:readFileBinary] Critical failure:', filePath, err2.message);
            throw err2;
        }
    }
});

ipcMain.handle('fs:getFileFingerprint', async (event, filePath) => {
    const normalizedPath = path.normalize(filePath).normalize('NFC');
    let resolvedPath = normalizedPath;
    try {
        await fs.promises.access(resolvedPath);
    } catch {
        resolvedPath = filePath.normalize('NFD');
    }
    const [bytes, stat] = await Promise.all([
        fs.promises.readFile(resolvedPath),
        fs.promises.stat(resolvedPath),
    ]);
    return {
        path: resolvedPath,
        name: path.basename(resolvedPath),
        size: bytes.length,
        characterCount: Array.from(bytes.toString('utf8')).length,
        modifiedAt: stat.mtime.toISOString(),
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
});

// Write File Content (Text)
// ★ atomic write 経由で書き込む。途中クラッシュで半端なファイルが残らない。
//    空文字列や NULL 文字は事前検証で弾く（原稿消失事故の防止）。
// ★ 呼び出し側が意図的に空ファイルを作りたい場合は fs:createFile を使う。
//    fs:writeFile は既存ファイルの更新を想定しており、空を書くのはまず不正。
ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
    try {
        const projectRoot = globalProjectRoot || path.dirname(filePath);
        await atomicWriteTextFile(filePath, content, { projectRoot, ...options });
        return { ok: true };
    } catch (err) {
        if (err instanceof ConflictError) {
            console.warn('[atomicWrite] external modification detected', { filePath });
            throw new Error(`EXTERNAL_MODIFICATION:${err.message}`);
        }
        if (err instanceof ValidationError) {
            // 原稿を守るために書き込みを拒否した場合は、呼び出し側が認識できる形で返す
            console.warn(`[atomicWrite] rejected: ${err.message}`, { filePath, code: err.code });
            throw new Error(`VALIDATION_FAILED:${err.code}:${err.message}`);
        }
        throw err;
    }
});

// Write File Content (Binary)
ipcMain.handle('fs:writeFileBinary', async (event, filePath, buffer, options = {}) => {
    try {
        const projectRoot = globalProjectRoot || path.dirname(filePath);
        await atomicWriteBinaryFile(filePath, Buffer.from(buffer), { projectRoot, ...options });
        return { ok: true };
    } catch (err) {
        if (err instanceof ValidationError) {
            console.warn(`[atomicWrite] binary rejected: ${err.message}`, { filePath });
            throw new Error(`VALIDATION_FAILED:${err.code}:${err.message}`);
        }
        throw err;
    }
});

// Create Folder
ipcMain.handle('fs:createFolder', async (event, parentPath, folderName) => {
    const fullPath = path.join(parentPath, folderName);
    try {
        await fs.promises.mkdir(fullPath, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
    return fullPath;
});

// Create File (Empty or with content)
// ★ 新規ファイル作成は atomic write を使うが、空文字列で作ることを許可する
//    （allowEmpty: true）。すでに同名ファイルがある場合の上書き時も同じ経路を通る。
ipcMain.handle('fs:createFile', async (event, parentPath, fileName, content = '', options = {}) => {
    // Ensure extension
    if (!fileName.includes('.')) fileName += '.txt'; // Default to txt if unspecified

    const fullPath = path.join(parentPath, fileName);
    try {
        const projectRoot = globalProjectRoot || parentPath;
        await atomicWriteTextFile(fullPath, content, { allowEmpty: true, projectRoot, ...options });
    } catch (err) {
        if (err instanceof ValidationError) {
            throw new Error(`VALIDATION_FAILED:${err.code}:${err.message}`);
        }
        throw err;
    }
    return fullPath;
});

// Rename
ipcMain.handle('fs:rename', async (event, oldPath, newNameOrPath) => {
    let newPath;
    if (path.isAbsolute(newNameOrPath)) {
        newPath = newNameOrPath;
    } else {
        const directory = path.dirname(oldPath);
        newPath = path.join(directory, newNameOrPath);
    }
    await fs.promises.rename(oldPath, newPath);
    return newPath;
});

// Delete (to trash ideally, but simple delete for now)
ipcMain.handle('fs:delete', async (event, targetPath) => {
    // Check if dir or file
    const stats = await fs.promises.stat(targetPath);
    if (stats.isDirectory()) {
        await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
        await fs.promises.unlink(targetPath);
    }
    return true;
});

// Grep (Global Search) — Cross-platform: Unix grep / Windows Node.js fallback
ipcMain.removeHandler('fs:grep');
ipcMain.handle('fs:grep', async (event, projectPath, query, options = {}) => {
    const targetPath = projectPath || globalProjectRoot;
    console.log(`[fs:grep] start search: "${query}" in "${targetPath}"`);
    if (!targetPath || !query) return [];
    
    const { useRegex = false, caseSensitive = false, extensions } = options;
    const pathMod = require('path');

    // Windows では grep コマンドがないので Node.js でファイルスキャンする
    if (process.platform === 'win32') {
        return await nodeGrep(targetPath, query, { useRegex, caseSensitive, extensions, pathMod });
    }

    // Unix: grep コマンドを使用（高速）
    const { spawn } = require('child_process');
    const args = ['-rnI'];
    if (Array.isArray(extensions) && extensions.length > 0) {
        for (const extension of extensions) args.push('--include', `*${extension}`);
    }
    if (!caseSensitive) args.push('-i');
    // 通常検索は文字列として扱い、記号を grep の正規表現に誤解釈させない。
    if (useRegex) args.push('-E');
    else args.push('-F');
    args.push(query, ".");

    return new Promise((resolve) => {
        const child = spawn('grep', args, { cwd: targetPath });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', data => stdout += data);
        child.stderr.on('data', data => stderr += data);
        
        child.on('close', (code) => {
            if (code !== 0 && code !== 1) {
                console.error(`[fs:grep] grep process exited with code ${code}: ${stderr}`);
                return resolve([]);
            }
            const results = stdout.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split(':');
                    if (parts.length < 3) return null;
                    const relPath = parts[0];
                    const lineIndex = parseInt(parts[1]) - 1;
                    const lineContent = parts.slice(2).join(':');
                    const fullPath = pathMod.resolve(targetPath, relPath);
                    const name = pathMod.basename(fullPath);
                    return { name, path: fullPath, lineIndex, lineContent };
                })
                .filter(res => res !== null);
            resolve(results);
        });
        child.on('error', (err) => {
            console.error('[fs:grep] spawn error:', err);
            resolve([]);
        });
    });
});

// Node.js による純粋なファイルスキャン（Windows 用フォールバック）
async function nodeGrep(dirPath, query, { useRegex, caseSensitive, extensions = [], pathMod }) {
    const fsPromises = require('fs').promises;
    const results = [];

    // テキストファイル拡張子（バイナリを除外）
    const textExts = new Set(['.txt', '.md', '.json', '.xml', '.yml', '.yaml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.csv', '.log']);

    // 検索パターンを構築
    let pattern;
    try {
        const flags = caseSensitive ? 'g' : 'gi';
        pattern = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegExp(query), flags);
    } catch (e) {
        console.error('[nodeGrep] Invalid regex:', e.message);
        return [];
    }

    // 再帰的にファイルを収集
    async function collectFiles(dir) {
        const files = [];
        try {
            const entries = await fsPromises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') && entry.name !== '.nexus' && !entry.name.endsWith('.nexus')) continue;
                const full = pathMod.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...await collectFiles(full));
                } else if (entry.isFile()) {
                    const ext = pathMod.extname(entry.name).toLowerCase();
                    if (textExts.has(ext) && (!extensions.length || extensions.includes(ext))) {
                        files.push(full);
                    }
                }
            }
        } catch (e) {
            // アクセス不可のディレクトリはスキップ
        }
        return files;
    }

    const files = await collectFiles(dirPath);
    console.log(`[nodeGrep] Scanning ${files.length} files...`);

    for (const filePath of files) {
        try {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (pattern.test(lines[i])) {
                    pattern.lastIndex = 0; // reset regex state
                    results.push({
                        name: pathMod.basename(filePath),
                        path: filePath,
                        lineIndex: i,
                        lineContent: lines[i]
                    });
                }
            }
        } catch (e) {
            // 読み取り不可のファイルはスキップ
        }
    }

    console.log(`[nodeGrep] Found ${results.length} matches`);
    return results;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// Show in Explorer
ipcMain.handle('fs:showInExplorer', async (event, path) => {
    shell.showItemInFolder(path);
});

// --- Persistence and Caching ---
const SETTINGS_FILE = path.join(app.getPath('userData'), 'user_settings.json');
const FONT_CACHE_FILE = path.join(app.getPath('userData'), 'font_cache.json');

let globalProjectRoot = null;

// Get Application Settings
ipcMain.handle('app:getSettings', async () => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const settings = JSON.parse(await fs.promises.readFile(SETTINGS_FILE, 'utf-8'));
            if (settings && settings.projectPath) {
                globalProjectRoot = typeof settings.projectPath === 'string'
                    ? settings.projectPath
                    : (settings.projectPath.handle || settings.projectPath.path);
            }
            return settings;
        }
    } catch (e) {
        console.error("Failed to read settings file", e);
    }
    return null;
});

// Save Application Settings
ipcMain.handle('app:saveSettings', async (event, settings) => {
    if (settings && settings.projectPath) {
        globalProjectRoot = typeof settings.projectPath === 'string'
            ? settings.projectPath
            : (settings.projectPath.handle || settings.projectPath.path);
    }
    try {
        await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error("Failed to save settings file", e);
        return false;
    }
});

// System Fonts with Persistent Cache
const { exec } = require('child_process');
let memoryFontCache = null;

// Background scan worker
const scanFontsInternal = () => new Promise((resolve, reject) => {
    const jxaScript = `
        ObjC.import("AppKit");
        var fm = $.NSFontManager.sharedFontManager;
        if (!fm) throw new Error("Could not get sharedFontManager");
        var fList = fm.availableFontFamilies;
        var res = [];
        for (var i = 0; i < fList.count; i++) {
            var fam = fList.objectAtIndex(i);
            if (!fam) continue;
            var members = fm.availableMembersOfFontFamily(fam);
            var mList = [];
            if (members && members.count) {
                for (var j = 0; j < members.count; j++) {
                    var m = members.objectAtIndex(j);
                    if (m && m.count >= 2) {
                        mList.push({ps: m.objectAtIndex(0).js, weight: m.objectAtIndex(1).js});
                    }
                }
            }
            res.push({family: fam.js, fonts: mList});
        }
        JSON.stringify(res);
    `.replace(/\n/g, ' ');

    exec(`osascript -l JavaScript -e '${jxaScript}'`, { maxBuffer: 15 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
            // Fallback to simple scan if JXA fails
            const fontList = require('font-list');
            fontList.getFonts({ maxBuffer: 10 * 1024 * 1024 })
                .then(fonts => {
                    const legacyData = fonts.map(f => {
                        const name = f.replace(/"/g, '');
                        return { family: name, fonts: [{ ps: name, weight: 'Regular' }] };
                    });
                    resolve(legacyData);
                })
                .catch(reject);
        } else {
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(e);
            }
        }
    });
});

ipcMain.handle('system:getFonts', async () => {
    // 1. Return memory cache immediately if available
    if (memoryFontCache) return memoryFontCache;

    // 2. Try to load from persistent cache file
    if (fs.existsSync(FONT_CACHE_FILE)) {
        try {
            const cached = JSON.parse(await fs.promises.readFile(FONT_CACHE_FILE, 'utf-8'));
            if (cached && cached.length > 0) {
                memoryFontCache = cached;
                // Kick off background scan to keep cache fresh without blocking
                console.log("Returning cached fonts, updating in background...");
                scanFontsInternal().then(freshData => {
                    memoryFontCache = freshData;
                    fs.promises.writeFile(FONT_CACHE_FILE, JSON.stringify(freshData), 'utf-8').catch(e => console.error('Font cache update failed:', e));
                }).catch(e => console.error("Background font scan failed", e));
                return cached;
            }
        } catch (e) {
            console.error("Failed to read font cache", e);
        }
    }

    // 3. No cache available, must block for initial scan
    try {
        const data = await scanFontsInternal();
        memoryFontCache = data;
        await fs.promises.writeFile(FONT_CACHE_FILE, JSON.stringify(data), 'utf-8');
        return data;
    } catch (e) {
        console.error("Initial font scan failed", e);
        return [];
    }
});
ipcMain.handle('system:launchApp', async (event, appPath) => {
    if (!appPath) return false;
    try {
        // macOS: /Applications/OneDrive.app etc.
        // shell.openPath is better for apps/files
        const error = await shell.openPath(appPath);
        if (error) {
            console.error('Failed to launch app:', appPath, error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Exception in system:launchApp:', appPath, e);
        return false;
    }
});
