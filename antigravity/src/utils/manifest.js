/**
 * manifest.js
 * 
 * 分割された作品（Segmented Work）の管理情報を扱うユーティリティ。
 * [作品名]/manifest.json として保存される。
 */

import { fileSystem } from './fileSystem.js';

/**
 * @typedef {Object} WorkSegment
 * @property {string} id          - 固有ID（順序を入れ替えても不変）
 * @property {string} file        - ファイル名（manifest.json からの相対パス）
 * @property {string} displayName - 表示名（章タイトルなど）
 */

/**
 * @typedef {Object} WorkManifest
 * @property {number} version     - フォーマットバージョン
 * @property {string} title       - 作品タイトル
 * @property {string} lastModified- 最終更新日時
 * @property {WorkSegment[]} segments - セグメントのリスト（この順序で連結される）
 */

export const MANIFEST_VERSION = 1;
export const normalizeManifestFileName = value => String(value || '').normalize('NFC');

export function findSegmentEntry(entries, fileName) {
    const normalizedTarget = normalizeManifestFileName(fileName);
    return (entries || []).find(entry => normalizeManifestFileName(entry.name) === normalizedTarget);
}

/**
 * 空のマニフェストを作成する。
 */
export function createEmptyManifest(title = 'Untitled') {
    return {
        version: MANIFEST_VERSION,
        title,
        lastModified: new Date().toISOString(),
        segments: []
    };
}

/**
 * SplitPlan からマニフェストを生成する。
 */
export function createManifestFromSplitPlan(plan) {
    return {
        version: MANIFEST_VERSION,
        title: plan.baseName,
        lastModified: new Date().toISOString(),
        segments: plan.segments.map((seg, i) => ({
            id: `seg-${Date.now()}-${i}`,
            file: seg.proposedFileName, // 衝突解決済みの名前が望ましい
            displayName: seg.displayName
        }))
    };
}

/**
 * セグメントを結合するためのテキストを取得する（シミュレーション）。
 * 実際には各ファイルを読み込む必要がある。
 */
export function getConcatenatedFileName(manifest) {
    return manifest.segments.map(s => s.file);
}

/**
 * マニフェストのバリデーション。
 */
export function validateManifest(json) {
    if (!json || typeof json !== 'object') return false;
    if (json.version !== MANIFEST_VERSION) return false;
    if (!Array.isArray(json.segments)) return false;
    const ids = new Set();
    const files = new Set();
    for (const segment of json.segments) {
        if (!segment || typeof segment !== 'object') return false;
        if (typeof segment.id !== 'string' || !segment.id.trim()) return false;
        if (typeof segment.file !== 'string' || !segment.file.trim()) return false;
        // セグメントは .nexus 直下または segments/ 直下の「ファイル名」に限定する。
        // 絶対パスや親ディレクトリ参照は、誤読込と意図しないアクセスを防ぐため拒否する。
        if (segment.file.includes('/') || segment.file.includes('\\') || segment.file === '.' || segment.file === '..') return false;
        const normalizedFile = normalizeManifestFileName(segment.file);
        if (ids.has(segment.id) || files.has(normalizedFile)) return false;
        ids.add(segment.id);
        files.add(normalizedFile);
    }
    return true;
}

export class SegmentLoadError extends Error {
    constructor(failures, cause) {
        const names = failures.map(f => f.file).join('、');
        super(`作品の構成ファイルを読み込めませんでした: ${names}`, { cause });
        this.name = 'SegmentLoadError';
        this.failures = failures;
    }
}

/**
 * manifest.json をディレクトリに書き出す。
 * @param {FileSystemDirectoryHandle|Object} dirHandle - .nexus フォルダのハンドル
 * @param {WorkManifest} manifest - マニフェストオブジェクト
 */
export async function writeManifest(dirHandle, manifest) {
    const json = JSON.stringify(manifest, null, 2);
    await fileSystem.createFile(dirHandle, 'manifest.json', json);
}

/**
 * ディレクトリから manifest.json を読み込む。
 * @param {FileSystemDirectoryHandle|Object} dirHandle - .nexus フォルダのハンドル
 * @returns {WorkManifest|null} パース済みマニフェスト。読めなければ null。
 */
export async function readManifest(dirHandle) {
    try {
        const entries = await fileSystem.readDirectory(dirHandle);
        const manifestEntry = entries.find(e => e.name === 'manifest.json' && e.kind === 'file');
        if (!manifestEntry) return null;

        const text = await fileSystem.readFile(manifestEntry.handle || manifestEntry);
        const parsed = JSON.parse(text);
        if (!validateManifest(parsed)) return null;
        return parsed;
    } catch (e) {
        console.warn('[manifest] readManifest failed:', e);
        return null;
    }
}

/**
 * マニフェストの segments 順にファイルを読み込み、テキスト配列を返す。
 * @param {FileSystemDirectoryHandle|Object} dirHandle - .nexus フォルダのハンドル
 * @param {WorkManifest} manifest - マニフェストオブジェクト
 * @returns {Promise<Array<{id: string, file: string, displayName: string, text: string}>>}
 */
export async function loadSegmentTexts(dirHandle, manifest) {
    const results = [];
    const failures = [];
    
    try {
        // segments/ サブフォルダのエントリを事前に一度だけ取得する
        const rootEntries = await fileSystem.readDirectory(dirHandle);
        const segDir = rootEntries.find(e => e.name === 'segments' && e.kind === 'directory');
        const segDirHandle = segDir ? (segDir.handle || segDir) : dirHandle;
        const segEntries = segDir ? await fileSystem.readDirectory(segDirHandle) : [];
        // 現行の分割形式は .nexus 直下、旧形式は segments/ 配下に章を置く。
        // 移行途中で両方が存在する作品もあるため、片方だけに限定しない。
        const candidateEntries = [
            ...rootEntries.filter(entry => entry.kind === 'file'),
            ...segEntries.filter(entry => entry.kind === 'file'),
        ];

        const BATCH_SIZE = 3; // 小規模な並列数（指示書に基づき 3 件）

        // バッチ処理で読み込みを実行（指示書に基づき制限付き並列）
        for (let i = 0; i < manifest.segments.length; i += BATCH_SIZE) {
            const batch = manifest.segments.slice(i, i + BATCH_SIZE);
            
            const batchResults = await Promise.all(
                batch.map(async (seg) => {
                    try {
                        // macOSでは同じ見た目の濁点付き文字がNFC/NFDの別文字列で
                        // 返るため、ファイル名をUnicode正規化して照合する。
                        const entry = findSegmentEntry(candidateEntries, seg.file);
                        if (!entry) {
                            console.warn(`[manifest] segment file not found: ${seg.file}`);
                            failures.push({ file: seg.file, reason: 'not-found' });
                            return null;
                        }
                        const text = await fileSystem.readFile(entry.handle || entry);
                        return { ...seg, text };
                    } catch (e) {
                        console.warn(`[manifest] failed to read segment ${seg.file}:`, e);
                        failures.push({ file: seg.file, reason: 'read-failed', error: e });
                        return null;
                    }
                })
            );
            
            results.push(...batchResults.filter(Boolean));
            
            // IPC 通信の合間にイベントループを解放する
            if (i + BATCH_SIZE < manifest.segments.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

    } catch (e) {
        console.error('[manifest] loadSegmentTexts critical failure:', e);
        throw new SegmentLoadError(
            manifest.segments.map(seg => ({ file: seg.file, reason: 'directory-read-failed' })),
            e
        );
    }

    // 一部だけ欠けた作品を正常扱いしない。検索・結合・書き出しで章が
    // 黙って消えることを防ぐため、呼び出し側に必ず失敗を伝える。
    if (failures.length > 0) throw new SegmentLoadError(failures);

    return results;
}
