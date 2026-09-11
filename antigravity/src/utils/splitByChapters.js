/**
 * splitByChapters.js
 *
 * 章ごと分割のための純粋ロジック。
 * - 既存 boundaryDetector と組み合わせて、テキストから「分割計画」を作る
 * - ファイル名の衝突チェックとサニタイズ
 * - ロールバック用に計画全体を純粋データとして持つ
 */

import { findBoundaryCandidates } from './boundaryDetector.js';

/**
 * @typedef {Object} SplitSegment
 * @property {number} index          - 0 始まり
 * @property {number} startOffset    - 元テキスト内の開始 offset
 * @property {number} endOffset      - 元テキスト内の終了 offset（exclusive）
 * @property {string} content        - セグメント本文（startOffset〜endOffset のスライス）
 * @property {number} charCount      - content.length
 * @property {string} displayName    - 境界マーカーから抽出した章タイトル（編集可能）
 * @property {string} proposedFileName - 提案される新ファイル名（拡張子込み）
 * @property {string|null} markerType - 'chapter' | 'section' | 'paragraph' | null
 * @property {number} confidence     - 境界の信頼度（先頭セグメントは 1.0 固定）
 */

/**
 * @typedef {Object} SplitPlan
 * @property {string} sourceFileName    - 元ファイル名（拡張子込み）
 * @property {string} baseName          - 元ファイル名の拡張子を除いた部分
 * @property {string} extension         - ファイル拡張子（例: ".txt"）
 * @property {SplitSegment[]} segments  - 分割セグメント配列
 * @property {Object} stats             - 統計情報
 * @property {number} stats.totalChars  - 元テキスト総文字数
 * @property {number} stats.segmentCount- セグメント数
 */

/**
 * テキストから SplitPlan を作成する。
 *
 * @param {string} text - 元ファイルの全文
 * @param {string} sourceFileName - 元ファイル名（拡張子込み）
 * @param {Object} [options]
 * @param {boolean} [options.includeChapter=true]
 * @param {boolean} [options.includeMarkdown=true]
 * @param {boolean} [options.includeAozora=true]
 * @returns {SplitPlan}
 */
export function createSplitPlan(text, sourceFileName, options = {}) {
    const candidates = findBoundaryCandidates(text, options);

    const { baseName, extension } = splitFileName(sourceFileName);

    const effectiveBoundaries = candidates[0]?.offset === 0 ? [...candidates] : [
        {
            offset: 0,
            type: null,
            marker: '',
            titleCandidate: '',
            confidence: 1.0,
        },
        ...candidates,
    ];

    const segments = [];
    for (let i = 0; i < effectiveBoundaries.length; i++) {
        const b = effectiveBoundaries[i];
        const startOffset = b.offset;
        const endOffset = i + 1 < effectiveBoundaries.length
            ? effectiveBoundaries[i + 1].offset
            : text.length;

        const content = text.slice(startOffset, endOffset);
        const displayName = (b.titleCandidate || '').trim() || (i === 0 ? '冒頭' : `第${i}章`);
        const proposedFileName = buildProposedFileName(baseName, i + 1, displayName, extension);

        segments.push({
            index: i,
            startOffset,
            endOffset,
            content,
            charCount: content.length,
            displayName,
            proposedFileName,
            markerType: b.type,
            confidence: b.confidence,
        });
    }

    return {
        sourceFileName,
        baseName,
        extension,
        segments,
        stats: {
            totalChars: text.length,
            segmentCount: segments.length,
        },
    };
}

/**
 * 計画の特定セグメントを除外した新計画を作る（不変）。
 * 除外されたセグメントは、前のセグメントの末尾に統合される。
 *
 * @param {SplitPlan} plan
 * @param {number} indexToRemove - 除外するセグメントの index
 * @returns {SplitPlan}
 */
export function removeSegment(plan, indexToRemove) {
    if (indexToRemove === 0) {
        return plan;
    }
    const segments = plan.segments.filter((_, i) => i !== indexToRemove);
    const adjusted = segments.map((seg, newIdx) => {
        const startOffset = seg.startOffset;
        const endOffset = newIdx + 1 < segments.length
            ? segments[newIdx + 1].startOffset
            : plan.stats.totalChars;
        return {
            ...seg,
            index: newIdx,
            startOffset,
            endOffset,
        };
    });
    return {
        ...plan,
        segments: adjusted,
        stats: {
            ...plan.stats,
            segmentCount: adjusted.length,
        },
    };
}

/**
 * 計画内の全セグメントの content を、元テキストから再構築する。
 * removeSegment や updateDisplayName の後に呼ぶ。
 *
 * @param {SplitPlan} plan
 * @param {string} sourceText
 * @returns {SplitPlan}
 */
export function rebuildSegmentContents(plan, sourceText) {
    const segments = plan.segments.map((seg, i) => {
        const startOffset = seg.startOffset;
        const endOffset = i + 1 < plan.segments.length
            ? plan.segments[i + 1].startOffset
            : sourceText.length;
        const content = sourceText.slice(startOffset, endOffset);
        const proposedFileName = buildProposedFileName(
            plan.baseName,
            i + 1,
            seg.displayName,
            plan.extension
        );
        return {
            ...seg,
            index: i,
            startOffset,
            endOffset,
            content,
            charCount: content.length,
            proposedFileName,
        };
    });
    return {
        ...plan,
        segments,
        stats: {
            ...plan.stats,
            segmentCount: segments.length,
        },
    };
}

/**
 * セグメントの表示名（章タイトル）を更新する。
 *
 * @param {SplitPlan} plan
 * @param {number} index
 * @param {string} newDisplayName
 * @returns {SplitPlan}
 */
export function updateDisplayName(plan, index, newDisplayName) {
    const segments = plan.segments.map((seg, i) => {
        if (i !== index) return seg;
        const trimmed = newDisplayName.trim();
        const proposedFileName = buildProposedFileName(
            plan.baseName,
            i + 1,
            trimmed,
            plan.extension
        );
        return {
            ...seg,
            displayName: trimmed, // User can actually enter empty spaces which trim to empty, but sanitize covers that
            proposedFileName,
        };
    });
    return { ...plan, segments };
}

/**
 * ファイル名を baseName と extension に分ける。
 */
export function splitFileName(fileName) {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot <= 0) {
        return { baseName: fileName, extension: '.txt' };
    }
    return {
        baseName: fileName.slice(0, lastDot),
        extension: fileName.slice(lastDot),
    };
}

/**
 * 提案ファイル名を作る。
 */
export function buildProposedFileName(baseName, seq, title, extension) {
    const seqStr = String(seq).padStart(2, '0');
    const cleanTitle = sanitizeForFileName(title || '');
    const name = cleanTitle
        ? `${baseName}_${seqStr}_${cleanTitle}`
        : `${baseName}_${seqStr}`;
    return `${name}${extension}`;
}

/**
 * ファイル名に使えない文字をサニタイズする。
 */
export function sanitizeForFileName(s) {
    if (!s) return '';
    const forbidden = /[<>:"/\\|?*\x00-\x1f]/g;
    let cleaned = s.replace(forbidden, '_');
    cleaned = cleaned.replace(/ +/g, ' ');
    cleaned = cleaned.replace(/^[\s.]+|[\s.]+$/g, '');
    if (cleaned.length > 100) cleaned = cleaned.slice(0, 100);
    return cleaned;
}

/**
 * 既存ファイル名との衝突を検知し、必要なら _2、_3 などを付けて回避する。
 */
export function resolveFileNameCollision(proposedName, existingNames) {
    if (!existingNames.includes(proposedName)) return proposedName;
    const { baseName, extension } = splitFileName(proposedName);
    let n = 2;
    while (true) {
        const candidate = `${baseName}_${n}${extension}`;
        if (!existingNames.includes(candidate)) return candidate;
        n++;
        if (n > 999) throw new Error(`cannot resolve collision for ${proposedName}`);
    }
}

/**
 * 前後 400 字のプレビュー用コンテキストを取る。
 */
export function getContextAroundOffset(text, offset, windowSize = 400) {
    const before = text.slice(Math.max(0, offset - windowSize), offset);
    const after = text.slice(offset, Math.min(text.length, offset + windowSize));
    return { before, after };
}
