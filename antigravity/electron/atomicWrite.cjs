/**
 * atomicWrite.cjs
 *
 * 原稿を破壊しないためのファイル書き込み実装。
 *
 * 書き込み手順：
 *   1. 同ディレクトリの一時ファイルに書く
 *   2. fsync で OS バッファを物理ディスクへ flush
 *   3. 読み直してチェックサムが期待値と一致することを確認
 *   4. fs.rename で本来のパスへ置換（POSIX atomic rename）
 *   5. 親ディレクトリを fsync（rename を確定）
 *
 * これにより、書き込み中にプロセスが異常終了しても、
 * 本来のファイルは「元のまま」か「新しい内容」のどちらかで、
 * 半端な内容になることは構造的にない。
 *
 * 参照: 設計書 B §2.1
 */

const { promises: fsp } = require('fs');
const { open } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

/**
 * ValidationError: 書き込み前のペイロード検証に失敗したとき投げる。
 * 呼び出し側はこれを catch して、原稿を守る選択肢をユーザーに提示できる。
 */
class ValidationError extends Error {
    constructor(code, message, context = {}) {
        super(`[${code}] ${message}`);
        this.name = 'ValidationError';
        this.code = code;
        this.context = context;
    }
}

class ConflictError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'ConflictError';
        this.code = 'EXTERNAL_MODIFICATION';
        this.context = context;
    }
}

/**
 * ShrinkClassification: ファイルサイズの変化を分類する。
 *
 * - 'normal': 縮小なし、または微小
 * - 'moderate-shrink': 50% 以上の縮小（静かに追加スナップショットを取る契機）
 * - 'extreme-shrink': 95% 以上の縮小（ユーザー確認ダイアログを出す契機）
 *
 * 現状は呼び出し側でこの分類を使って判断する。
 * このモジュール自体は extreme-shrink でも throw しない（上位の判断を待つ）。
 */
function classifyShrink(previousLength, newLength) {
    if (previousLength == null || previousLength === 0) return 'normal';
    const ratio = newLength / previousLength;
    if (ratio < 0.05) return 'extreme-shrink';
    if (ratio < 0.5) return 'moderate-shrink';
    return 'normal';
}

function sha256(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function sha256Buffer(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * ペイロードの事前検証。
 *
 * options:
 *   allowEmpty: 新規空ファイル作成時に true を指定すると V-1 を通す
 *   previousLength: 現状のファイル長（extreme-shrink チェック用、任意）
 *   strictShrink: true なら extreme-shrink でも throw する（デフォルト false）
 */
function validateTextPayload(content, options = {}) {
    // V-2: 型検証
    if (typeof content !== 'string') {
        throw new ValidationError('V-2', `content is not a string: ${typeof content}`);
    }

    // V-1: 空文字列禁止（allowEmpty フラグで迂回可能）
    if (!options.allowEmpty && content.length === 0) {
        throw new ValidationError(
            'V-1',
            'refusing to write empty string; pass allowEmpty:true for new-file creation'
        );
    }

    // V-4: NULL 文字の検出
    if (content.indexOf('\u0000') !== -1) {
        throw new ValidationError('V-4', 'NULL character detected in content');
    }

    // V-3: 異常短縮の判定（情報として返すだけ、throw するのは strictShrink のみ）
    let shrinkClass = 'normal';
    if (options.previousLength != null) {
        shrinkClass = classifyShrink(options.previousLength, content.length);
        if (options.strictShrink && shrinkClass === 'extreme-shrink') {
            throw new ValidationError(
                'V-3b',
                `extreme shrink: ${options.previousLength} -> ${content.length} (>95% reduction)`,
                { previousLength: options.previousLength, newLength: content.length }
            );
        }
    }

    return { shrinkClass };
}

/**
 * 一時ファイル名を作る。同じディレクトリに配置するのが重要（atomic rename のため）。
 * cross-device な tempdir を使うと rename が EXDEV で失敗する。
 */
function tempPathFor(targetPath) {
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    // ピリオド始まりで .tmp を含めて、ディレクトリ一覧で見ても「一時ファイル」と判別可能に
    return path.join(dir, `.${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`);
}

/**
 * 親ディレクトリを fsync する。
 * rename した事実を物理ディスクに確定させる。macOS では F_FULLFSYNC までは呼ばない
 * （強すぎる。通常の fsync で十分）。
 */
async function fsyncDir(dirPath) {
    let dirFh;
    try {
        dirFh = await open(dirPath, 'r');
        await dirFh.sync();
    } catch (err) {
        // 一部の FS（例: Windows の特定構成）では dir fsync が失敗するが、
        // データそのものは rename で守られているので致命ではない。ログだけ残す。
        if (err.code !== 'EPERM' && err.code !== 'EINVAL') {
            throw err;
        }
    } finally {
        if (dirFh) {
            try { await dirFh.close(); } catch { /* noop */ }
        }
    }
}

/**
 * テキストファイルの atomic write。
 *
 * filePath: 書き込み先の絶対パス
 * content:  書き込む文字列
 * options:
 *   allowEmpty: true で空文字列書き込みを許可（新規作成時のみ想定）
 *   strictShrink: true で 95% 超縮小を拒否する
 *
 * returns: { hash, shrinkClass, bytes }
 * throws:  ValidationError / システムエラー
 */
async function atomicWriteTextFile(filePath, content, options = {}) {
    const { projectRoot, disableJournal } = options;
    let journal = null;
    if (projectRoot && !disableJournal) {
        try { journal = require('./journal.cjs'); } catch { /* noop */ }
    }

    const contentHash = typeof content === 'string' ? sha256(content) : null;

    // 1. 事前検証
    let previousLength;
    const hasExpectedContent = Object.prototype.hasOwnProperty.call(options, 'expectedContent');
    let expectedHash = null;
    if (typeof options.expectedContent === 'string') {
        expectedHash = sha256(options.expectedContent);
    }
    try {
        const stat = await fsp.stat(filePath);
        // ファイルサイズをバイト単位で取り、粗い指標として使う
        // （UTF-8 なので厳密な文字数ではないが、extreme-shrink 判定には十分）
        previousLength = stat.size;
        if (expectedHash) {
            const currentContent = await fsp.readFile(filePath, 'utf8');
            const currentHash = sha256(currentContent);
            if (currentHash !== expectedHash && currentHash !== contentHash) {
                throw new ConflictError('file was modified outside NEXUS', {
                    filePath,
                    expectedHash,
                    currentHash,
                });
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        if (hasExpectedContent) {
            throw new ConflictError('file was deleted outside NEXUS', {
                filePath,
                expectedHash,
                currentHash: null,
            });
        }
        // ファイルが存在しない：新規作成として扱う
        previousLength = null;
    }

    let validation;
    try {
        validation = validateTextPayload(content, {
            allowEmpty: options.allowEmpty,
            previousLength,
            strictShrink: options.strictShrink,
        });
    } catch (err) {
        if (journal && err instanceof ValidationError) {
            await journal.recordJournal(projectRoot, {
                ts: new Date().toISOString(),
                op: 'atomic.write.validation_rejected',
                path: filePath,
                code: err.code,
                reason: err.message,
            });
        }
        throw err;
    }

    // 2. 書き込み
    const contentBytes = Buffer.byteLength(content, 'utf8');

    if (journal) {
        await journal.recordJournal(projectRoot, {
            ts: new Date().toISOString(),
            op: 'atomic.write.begin',
            path: filePath,
            expectedHash: contentHash,
            bytes: contentBytes,
        });
    }

    const tmpPath = tempPathFor(filePath);
    let fh;
    let phase = 'open/write';

    try {
        fh = await open(tmpPath, 'w');
        await fh.writeFile(content, 'utf8');
        await fh.sync();
        await fh.close();
        fh = null;

        // 3. 読み直してチェックサム検証
        phase = 'readback';
        const readBack = await fsp.readFile(tmpPath, 'utf8');
        const readBackHash = sha256(readBack);
        if (readBackHash !== contentHash) {
            throw new Error(
                `atomic write readback mismatch: expected ${contentHash}, got ${readBackHash}`
            );
        }

        // 4. atomic rename
        phase = 'rename';
        if (expectedHash) {
            const latestContent = await fsp.readFile(filePath, 'utf8');
            const latestHash = sha256(latestContent);
            if (latestHash !== expectedHash && latestHash !== contentHash) {
                throw new ConflictError('file changed while NEXUS was saving', {
                    filePath,
                    expectedHash,
                    currentHash: latestHash,
                });
            }
        }
        await fsp.rename(tmpPath, filePath);

        // 5. 親ディレクトリ fsync
        phase = 'fsyncDir';
        await fsyncDir(path.dirname(filePath));

        if (journal) {
            await journal.recordJournal(projectRoot, {
                ts: new Date().toISOString(),
                op: 'atomic.write.success',
                path: filePath,
                hash: contentHash,
                bytes: contentBytes,
                shrinkClass: validation.shrinkClass,
            });
        }

        return {
            hash: contentHash,
            shrinkClass: validation.shrinkClass,
            bytes: contentBytes,
        };
    } catch (err) {
        // 失敗時の後始末：一時ファイルを掃除する（本番ファイルは触らない）
        if (fh) {
            try { await fh.close(); } catch { /* noop */ }
        }
        try { await fsp.unlink(tmpPath); } catch { /* noop */ }
        
        if (journal) {
            await journal.recordJournal(projectRoot, {
                ts: new Date().toISOString(),
                op: 'atomic.write.fail',
                path: filePath,
                error: String(err),
                phase,
            });
        }
        
        throw err;
    }
}

/**
 * バイナリ版の atomic write（画像等）。
 * 空文字列ガード等は不要なので単純。
 */
async function atomicWriteBinaryFile(filePath, buffer, options = {}) {
    const { projectRoot, disableJournal } = options;
    let journal = null;
    if (projectRoot && !disableJournal) {
        try { journal = require('./journal.cjs'); } catch { /* noop */ }
    }

    if (!Buffer.isBuffer(buffer)) {
        throw new ValidationError('V-2', `content is not a Buffer: ${typeof buffer}`);
    }
    if (buffer.length === 0) {
        // 空バイナリは禁止ではないが警告扱い。許可するケースがあれば呼び出し側で対処
        throw new ValidationError('V-1', 'refusing to write empty binary file');
    }

    const expectedHash = sha256Buffer(buffer);
    const tmpPath = tempPathFor(filePath);
    let fh;
    let phase = 'open/write';

    try {
        fh = await open(tmpPath, 'w');
        await fh.writeFile(buffer);
        await fh.sync();
        await fh.close();
        fh = null;

        phase = 'readback';
        const readBack = await fsp.readFile(tmpPath);
        const readBackHash = sha256Buffer(readBack);
        if (readBackHash !== expectedHash) {
            throw new Error(
                `atomic write readback mismatch: expected ${expectedHash}, got ${readBackHash}`
            );
        }

        phase = 'rename';
        await fsp.rename(tmpPath, filePath);
        
        phase = 'fsyncDir';
        await fsyncDir(path.dirname(filePath));

        if (journal) {
            await journal.recordJournal(projectRoot, {
                ts: new Date().toISOString(),
                op: 'atomic.write.binary.success',
                path: filePath,
                hash: expectedHash,
                bytes: buffer.length,
            });
        }

        return {
            hash: expectedHash,
            bytes: buffer.length,
        };
    } catch (err) {
        if (fh) {
            try { await fh.close(); } catch { /* noop */ }
        }
        try { await fsp.unlink(tmpPath); } catch { /* noop */ }
        
        if (journal) {
            await journal.recordJournal(projectRoot, {
                ts: new Date().toISOString(),
                op: 'atomic.write.binary.fail',
                path: filePath,
                error: String(err),
                phase,
            });
        }

        throw err;
    }
}

/**
 * 起動時のお掃除：前回クラッシュで残った .tmp.* ファイルを消す。
 * NEXUS 起動時に1回呼ぶ想定。対象はプロジェクトフォルダ配下の全ディレクトリを再帰スキャン。
 *
 * 本番ファイル（tmp でないもの）には絶対に触らないため、これが誤動作しても原稿は無事。
 */
async function cleanupOrphanedTempFiles(rootDir, options = {}) {
    const maxAgeMs = options.maxAgeMs ?? (60 * 60 * 1000); // 1時間以上古いものだけ
    const now = Date.now();
    let removedCount = 0;

    async function walk(dir) {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // node_modules と .git はスキップ
                if (entry.name === 'node_modules' || entry.name === '.git') continue;
                await walk(full);
            } else if (entry.isFile()) {
                // atomicWrite の一時ファイル名パターン
                // パターン: .{basename}.tmp.{pid}.{timestamp}.{rand}
                if (!/\.tmp\.\d+\.\d+\.[a-z0-9]+$/.test(entry.name)) continue;
                try {
                    const stat = await fsp.stat(full);
                    if (now - stat.mtimeMs > maxAgeMs) {
                        await fsp.unlink(full);
                        removedCount++;
                    }
                } catch { /* noop */ }
            }
        }
    }

    await walk(rootDir);
    return removedCount;
}

module.exports = {
    atomicWriteTextFile,
    atomicWriteBinaryFile,
    validateTextPayload,
    classifyShrink,
    cleanupOrphanedTempFiles,
    ValidationError,
    ConflictError,
};
