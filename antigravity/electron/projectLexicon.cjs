const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getTokenizer } = require('kuromojin');
const { atomicWriteTextFile } = require('./atomicWrite.cjs');

const EXCLUDED_DIRS = new Set(['.backup', 'backup', 'node_modules', 'パイロット版']);

function projectRootOf(inputPath) {
    let current = path.resolve(String(inputPath || ''));
    if (!current || current === path.parse(current).root) throw new Error('作品フォルダが指定されていません');
    if (fs.existsSync(current) && fs.statSync(current).isFile()) current = path.dirname(current);
    const parts = current.split(path.sep);
    const bundleIndex = parts.findIndex(part => part.endsWith('.nexus'));
    if (bundleIndex > 0) return parts.slice(0, bundleIndex).join(path.sep) || path.sep;
    return current;
}

function collectTextFiles(root, depth = 0) {
    if (depth > 3) return [];
    return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
        if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) return [];
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) return collectTextFiles(fullPath, depth + 1);
        return /\.(txt|md)$/i.test(entry.name) ? [fullPath] : [];
    });
}

const isSettingFile = filePath => /設定|資料|プロット|人物|用語|世界観/.test(path.basename(filePath));

function editDistance(left, right) {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
        let diagonal = row[0]; row[0] = i;
        for (let j = 1; j <= right.length; j++) {
            const above = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return row[right.length];
}

async function scanProjectTerms(inputPath) {
    const root = projectRootOf(inputPath);
    const tokenizer = await getTokenizer();
    const hashes = new Set();
    const terms = new Map();
    let duplicateFiles = 0;
    const files = collectTextFiles(root);

    for (const filePath of files) {
        const text = fs.readFileSync(filePath, 'utf8').normalize('NFC');
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        if (hashes.has(hash)) { duplicateFiles += 1; continue; }
        hashes.add(hash);
        const setting = isSettingFile(filePath);
        const seen = new Set();
        for (const token of await tokenizer.tokenize(text)) {
            const term = token.surface_form.normalize('NFC');
            const proper = token.pos_detail_1 === '固有名詞';
            const katakana = /^[ァ-ヶー]{3,}$/.test(term);
            if ((!proper && !katakana) || term.length < 2) continue;
            const item = terms.get(term) || { term, occurrences: 0, files: 0, settingOccurrences: 0, properOccurrences: 0 };
            item.occurrences += 1;
            if (!seen.has(term)) { item.files += 1; seen.add(term); }
            if (setting) item.settingOccurrences += 1;
            if (proper) item.properOccurrences += 1;
            terms.set(term, item);
        }
    }

    const candidates = [...terms.values()].filter(item => item.occurrences >= 2);
    for (const item of candidates) {
        const properRatio = item.properOccurrences / item.occurrences;
        item.status = item.settingOccurrences > 0 && item.files >= 2 && properRatio >= 0.5
            ? 'recommended'
            : item.files >= 2 && properRatio >= 0.5 ? 'review' : 'reference';
    }
    candidates.sort((a, b) => {
        const rank = { recommended: 0, review: 1, reference: 2 };
        return rank[a.status] - rank[b.status] || b.files - a.files || b.occurrences - a.occurrences;
    });
    const properCandidates = candidates.filter(item => item.status !== 'reference' && item.term.length <= 12);
    const variants = [];
    for (let i = 0; i < properCandidates.length; i++) {
        for (let j = i + 1; j < properCandidates.length; j++) {
            const left = properCandidates[i], right = properCandidates[j];
            if (Math.abs(left.term.length - right.term.length) > 1) continue;
            const sameScript = (/^[ァ-ヶー]+$/.test(left.term) && /^[ァ-ヶー]+$/.test(right.term))
                || (/^[一-龠々]+$/.test(left.term) && /^[一-龠々]+$/.test(right.term));
            // 頻出する別人物同士を表記揺れ扱いしない。片方が3回以下の
            // 稀な表記で、文字種も同じ場合だけ誤字候補にする。
            if (sameScript && Math.min(left.occurrences, right.occurrences) <= 3 && editDistance(left.term, right.term) === 1) {
                variants.push({ left: left.term, right: right.term, leftCount: left.occurrences, rightCount: right.occurrences });
            }
        }
    }
    variants.sort((a, b) => Math.min(b.leftCount, b.rightCount) - Math.min(a.leftCount, a.rightCount));
    return {
        root,
        stats: { scannedFiles: hashes.size, duplicateFiles, candidateTerms: candidates.length,
            recommended: candidates.filter(item => item.status === 'recommended').length,
            review: candidates.filter(item => item.status === 'review').length,
            variantPairs: variants.length },
        candidates,
        variants
    };
}

async function saveProjectTerms(inputPath, words) {
    const root = projectRootOf(inputPath);
    const configDir = path.join(root, '.nexus');
    const configPath = path.join(configDir, 'proofreading.json');
    fs.mkdirSync(configDir, { recursive: true });
    let profile = {};
    if (fs.existsSync(configPath)) {
        try { profile = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { profile = {}; }
    }
    profile.whitelist = [...new Set([...(profile.whitelist || []), ...(words || [])])].sort();
    await atomicWriteTextFile(configPath, JSON.stringify(profile, null, 2) + '\n');
    return { path: configPath, count: profile.whitelist.length };
}

function setupProjectLexiconHandlers() {
    ipcMain.handle('proofreading:scanProjectTerms', (_event, targetPath) => scanProjectTerms(targetPath));
    ipcMain.handle('proofreading:saveProjectTerms', (_event, targetPath, words) => saveProjectTerms(targetPath, words));
}

module.exports = { setupProjectLexiconHandlers, scanProjectTerms, saveProjectTerms, projectRootOf };
