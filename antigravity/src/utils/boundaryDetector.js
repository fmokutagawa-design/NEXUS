/**
 * @typedef {Object} BoundaryCandidate
 * @property {number} offset
 * @property {'chapter' | 'section' | 'paragraph' | 'aozora-pagebreak'} type
 * @property {string} marker
 * @property {string} titleCandidate
 * @property {number} confidence
 */

/**
 * @typedef {Object} BoundaryDetectOptions
 * @property {boolean} [includeChapter=true]
 * @property {boolean} [includeMarkdown=true]
 * @property {boolean} [includeAozora=true]
 * @property {boolean} [includeBlankLines=false]
 */

/**
 * @param {string} text
 * @param {BoundaryDetectOptions} [options]
 * @returns {BoundaryCandidate[]}
 */
export function findBoundaryCandidates(text, options = {}) {
    const includeChapter = options.includeChapter ?? true;
    const includeMarkdown = options.includeMarkdown ?? true;
    const includeAozora = options.includeAozora ?? true;
    const includeBlankLines = options.includeBlankLines ?? false;

    /** @type {BoundaryCandidate[]} */
    const candidates = [];

    if (text.length === 0) return candidates;

    // Helper to add candidate and handle duplicates
    const addCandidate = (offset, type, marker, titleCandidate, confidence) => {
        candidates.push({ offset, type, marker, titleCandidate, confidence });
    };

    if (includeChapter) {
        // ■ / ◇ detector: 行頭（BOM・空白は許可）にある記号を章区切りとして扱う。
        let match;
        const symbolChapterRegex = /^[\uFEFF \t\u3000]*[■◇]+.*/gm;
        while ((match = symbolChapterRegex.exec(text)) !== null) {
            const offset = match.index;
            const fullLine = match[0];
            const markerMatch = fullLine.match(/[■◇]+/);
            const marker = markerMatch ? markerMatch[0] : '';
            const markerIndex = markerMatch ? markerMatch.index : 0;
            const titleCandidate = fullLine.substring(markerIndex + marker.length).trim();
            addCandidate(offset, 'chapter', marker, titleCandidate, 0.95);
        }

        // 第N章 detector
        const chapterRegex = /^[\uFEFF \t\u3000]*第[0-9０-９一二三四五六七八九十百千万零〇壱弐参]+[章話幕部篇編].*/gm;
        while ((match = chapterRegex.exec(text)) !== null) {
            const offset = match.index;
            const fullLine = match[0];
            const markerMatch = fullLine.match(/第[0-9０-９一二三四五六七八九十百千万零〇壱弐参]+[章話幕部篇編]/);
            const marker = markerMatch ? markerMatch[0] : '';
            const markerEnd = markerMatch ? markerMatch.index + marker.length : 0;
            const titleCandidate = fullLine.substring(markerEnd).replace(/^[\s\u3000:：―—-]+/, '').trim();
            addCandidate(offset, 'chapter', marker, titleCandidate, 0.9);
        }

        // 序章・終章などの特殊な章タイトル detector
        const specialChapterRegex = /^[\uFEFF \t\u3000]*(序章|終章|終局|幕間|あとがき|プロローグ|エピローグ|番外編).*/gm;
        while ((match = specialChapterRegex.exec(text)) !== null) {
            const offset = match.index;
            const fullLine = match[0];
            const markerMatch = fullLine.match(/(序章|終章|終局|幕間|あとがき|プロローグ|エピローグ|番外編)/);
            const marker = markerMatch ? markerMatch[0] : '';
            const markerEnd = markerMatch ? markerMatch.index + marker.length : 0;
            const titleCandidate = fullLine.substring(markerEnd).replace(/^[\s\u3000:：―—-]+/, '').trim();
            addCandidate(offset, 'chapter', marker, titleCandidate, 0.9);
        }
    }

    if (includeMarkdown) {
        const mdRegex = /^[\uFEFF \t\u3000]*[#＃]{1,6}[ \t\u3000]*\S.*/gm;
        let match;
        while ((match = mdRegex.exec(text)) !== null) {
            const offset = match.index;
            const fullLine = match[0];
            const m = fullLine.match(/[#＃]{1,6}/);
            const marker = m ? m[0] : '#';
            const markerEnd = m ? m.index + marker.length : 0;
            const titleCandidate = fullLine.substring(markerEnd).trim();
            addCandidate(offset, 'section', marker, titleCandidate, 0.85);
        }
    }

    if (includeAozora) {
        // aozora headings: non-greedy match.
        // Needs to capture heading content to isolate it. Wait.
        // It says: marker is the match itself, titleCandidate is from the end of the match to the end of the line.
        // 全角・半角角括弧の双方を許可する。
        const aozoraRegex = /(?:［|\[)＃(大|中|小)見出し(?:］|\])/g;
        let match;
        while ((match = aozoraRegex.exec(text)) !== null) {
            const offset = match.index;
            const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
            // 行末注記形式は下の suffix detector で行頭から分割する。
            if (text.slice(lineStart, offset).trim()) continue;
            const marker = match[0];
            const kind = match[1];
            
            // find end of line
            const nextNewline = text.indexOf('\n', offset);
            const endOfLine = nextNewline === -1 ? text.length : nextNewline;
            const titleCandidate = text.substring(offset + marker.length, endOfLine).trim();
            
            let type = 'section';
            let confidence = 0.75;
            if (kind === '大') {
                type = 'chapter';
                confidence = 0.95;
            } else if (kind === '中') {
                confidence = 0.85;
            }

            addCandidate(offset, type, marker, titleCandidate, confidence);
        }

        // 青空文庫で一般的な「見出し本文［＃「見出し本文」は大見出し］」形式。
        const aozoraSuffixRegex = /^([^\n\r]+?)［＃(?:「[^」]+」は)?(大|中|小)見出し］.*$/gm;
        while ((match = aozoraSuffixRegex.exec(text)) !== null) {
            const titleCandidate = match[1].trim();
            const kind = match[2];
            addCandidate(
                match.index,
                kind === '大' ? 'chapter' : 'section',
                `青空文庫${kind}見出し`,
                titleCandidate,
                kind === '大' ? 0.95 : kind === '中' ? 0.85 : 0.75
            );
        }

        // aozora page break
        const pageBreakRegex = /(?:［|\[)＃改ページ(?:］|\])/g;
        while ((match = pageBreakRegex.exec(text)) !== null) {
            addCandidate(match.index, 'aozora-pagebreak', match[0], '', 0.9);
        }
    }

    if (includeBlankLines) {
        const blankRegex = /\n{3,}/g;
        let match;
        while ((match = blankRegex.exec(text)) !== null) {
           // offset is right after the newlines
           const offset = match.index + match[0].length;
           addCandidate(offset, 'paragraph', match[0], '', 0.4);
        }
    }

    // Sort by offset ascending
    candidates.sort((a, b) => a.offset - b.offset);

    // Deduplicate same offset
    const result = [];
    for (const c of candidates) {
        if (result.length > 0) {
            const last = result[result.length - 1];
            if (last.offset === c.offset) {
                if (c.confidence > last.confidence) {
                    result[result.length - 1] = c;
                } else if (c.confidence === last.confidence) {
                    // Keep the first one, which is 'last'
                }
                continue;
            }
        }
        result.push(c);
    }

    return result;
}

/**
 * @param {string} text
 * @param {number} offset
 * @returns {{ valid: boolean, reason?: string, brokenStructure?: string }}
 */
export function validateBoundary(text, offset) {
    if (offset < 0 || offset > text.length) {
        return { valid: false, reason: 'offset out of range', brokenStructure: 'none' };
    }

    if (offset > 0 && offset < text.length) {
        const prev = text.charCodeAt(offset - 1);
        if (prev >= 0xD800 && prev <= 0xDBFF) {
            return {
                valid: false,
                reason: 'offset splits a surrogate pair',
                brokenStructure: 'surrogate',
            };
        }
    }

    let rubyOpen = 0;
    let aozoraOpen = 0;
    let fontOpen = 0;
    let emphasisOpen = false;
    let linkHalfOpen = 0;
    let linkFullOpen = 0;

    let i = 0;
    while (i < offset) {
        if (text.startsWith('{font:', i)) {
            const end = text.indexOf('}', i + 6);
            if (end !== -1 && end < offset) {
                fontOpen++;
                i = end + 1;
                continue;
            }
            i++;
            continue;
        }
        if (text.startsWith('{/font}', i)) {
            fontOpen = Math.max(0, fontOpen - 1);
            i += 7;
            continue;
        }
        if (text.startsWith('**', i)) {
            emphasisOpen = !emphasisOpen;
            i += 2;
            continue;
        }
        if (text.startsWith('［［', i)) {
            linkFullOpen++;
            i += 2;
            continue;
        }
        if (text.startsWith('］］', i)) {
            linkFullOpen = Math.max(0, linkFullOpen - 1);
            i += 2;
            continue;
        }
        if (text.startsWith('[[', i)) {
            linkHalfOpen++;
            i += 2;
            continue;
        }
        if (text.startsWith(']]', i)) {
            linkHalfOpen = Math.max(0, linkHalfOpen - 1);
            i += 2;
            continue;
        }
        const ch = text[i];
        if (ch === '《') { rubyOpen++; i++; continue; }
        if (ch === '》') { rubyOpen = Math.max(0, rubyOpen - 1); i++; continue; }
        if (text.startsWith('［＃', i) || text.startsWith('[＃', i)) { 
            aozoraOpen++; i += 2; continue; 
        }
        if ((ch === '］' || ch === ']') && aozoraOpen > 0) { aozoraOpen--; i++; continue; }
        i++;
    }

    if (rubyOpen > 0) return { valid: false, reason: 'inside ruby', brokenStructure: 'ruby' };
    if (aozoraOpen > 0) return { valid: false, reason: 'inside aozora tag', brokenStructure: 'aozora-tag' };
    if (fontOpen > 0) return { valid: false, reason: 'inside font tag', brokenStructure: 'font-tag' };
    if (emphasisOpen) return { valid: false, reason: 'inside emphasis', brokenStructure: 'emphasis' };
    if (linkHalfOpen > 0) return { valid: false, reason: 'inside half-width link', brokenStructure: 'link-half' };
    if (linkFullOpen > 0) return { valid: false, reason: 'inside full-width link', brokenStructure: 'link-full' };

    return { valid: true };
}
