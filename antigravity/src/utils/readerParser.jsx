// utils/readerParser.jsx
import React from 'react';
import { resolveFontName } from './typesetting';

/* ====================================================
 * ブロックレベル解析
 * 行単位で青空文庫タグを処理し、構造化データを返す
 * ==================================================== */

const toHalf = (s) => s.replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

export function parseBlocks(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const blocks = [];

    let blockIndent = 0;
    let blockFont = null;

    // textOffset: 各行が全文テキストの何文字目から始まるかを追跡
    // （\n区切りなので行長+1ずつ累積する）
    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const originalLen = line.length;
        const lineOffset = currentOffset; // この行の全文オフセット（行頭）
        currentOffset += originalLen + 1; // 次の行へ（+1は\nの分）

        // --- 改ページ ---
        if (/^\s*-{5,}\s*$/.test(line) || /［＃改ページ］/.test(line)) {
            blocks.push({ type: 'break', textOffset: lineOffset });
            continue;
        }

        // --- ブロック終了 ---
        if (/［＃ここで字下げ終わり］/.test(line)) {
            blockIndent = 0;
            line = line.replace(/［＃ここで字下げ終わり］/g, '');
        }
        if (/［＃フォント終わり］|［＃ここでフォント終わり］/.test(line)) {
            blockFont = null;
            line = line.replace(/［＃フォント終わり］|［＃ここでフォント終わり］/g, '');
        }

        // --- ブロック開始 ---
        let m;
        if ((m = line.match(/［＃ここから([0-9０-９]+)字下げ］/))) {
            blockIndent = parseInt(toHalf(m[1]), 10);
            line = line.replace(m[0], '');
        }
        if ((m = line.match(/［＃ここからフォント[：:](.+?)］/))) {
            blockFont = resolveFontName(m[1].trim());
            line = line.replace(m[0], '');
        }

        // --- 行属性 ---
        let heading = null;
        let lineIndent = blockIndent;
        let lineFont = blockFont;
        let align = null;
        let isHeader = false;
        let headingMarker = '';

        // 見出し（■ / ◇ マーカー含む）
        // 原稿の字下げ（半角/全角空白・タブ・BOM）が見出し記号の前に
        // あっても、目次から章を落とさない。
        if (/^[\uFEFF \t\u3000]*[■◇]/.test(line)) {
            heading = 'chapter';
            isHeader = true;
            const markerMatch = line.match(/^[\uFEFF \t\u3000]*[■◇]+/);
            headingMarker = markerMatch ? markerMatch[0].trim() : '';
            line = line.replace(/^[\uFEFF \t\u3000]*[■◇]+\s*/, '');
            // 記号だけの行も章境界として残す。空の制御行として捨てない。
            if (line.length === 0) line = headingMarker;
        }
        if (/［＃大見出し］/.test(line)) {
            heading = 'large';
            isHeader = true;
            line = line.replace(/［＃大見出し］/g, '')
                       .replace(/［＃大見出し終わり］/g, '');
        } else if (/［＃中見出し］/.test(line)) {
            heading = 'medium';
            isHeader = true;
            line = line.replace(/［＃中見出し］/g, '')
                       .replace(/［＃中見出し終わり］/g, '');
        } else if (/［＃小見出し］/.test(line)) {
            heading = 'small';
            isHeader = true;
            line = line.replace(/［＃小見出し］/g, '')
                       .replace(/［＃小見出し終わり］/g, '');
        }

        // 中央揃え
        if (/［＃中央揃え］|［＃ページの左右中央］/.test(line)) {
            align = 'center';
            line = line.replace(/［＃中央揃え］|［＃ページの左右中央］/g, '');
        }

        // 行単位字下げ
        if ((m = line.match(/［＃([0-9０-９]+)字下げ］/))) {
            lineIndent = parseInt(toHalf(m[1]), 10);
            line = line.replace(m[0], '');
        }

        // 行単位フォント
        if ((m = line.match(/［＃フォント[：:](.+?)］/))) {
            lineFont = resolveFontName(m[1].trim());
            line = line.replace(m[0], '');
        }

        // 残タグ除去
        line = line.replace(/［＃[^］]*］/g, '');

        // 制御行だけだったらスキップ
        if (line.length === 0 && originalLen > 0) continue;

        // 元々の空行は段落として保持（段落間の余白）
        if (line.length === 0 && originalLen === 0) {
            blocks.push({
                type: 'paragraph',
                content: '',
                heading: null,
                isHeader: false,
                indent: blockIndent,
                font: blockFont,
                align: null,
                textOffset: lineOffset,
            });
            continue;
        }

        blocks.push({
            type: 'paragraph',
            content: line,
            heading,
            isHeader,
            indent: lineIndent,
            font: lineFont,
            align,
            textOffset: lineOffset,
        });
    }
    return blocks;
}

/* ====================================================
 * インラインレベル解析
 * 1行のテキストをパースし、ReactElement配列を返す
 * ルビ・インラインフォント・強調・傍点・リンク除去を処理
 * ==================================================== */

export function renderInline(text) {
    if (!text) return null;

    // Step 1: インラインフォントタグを処理
    //   {font:NAME}content{/font} → <span style>content</span>
    // ルビ等のパースはcontent部分にも適用する必要があるため、
    // まずセグメント分割してから各セグメントをインラインパース
    const segments = [];
    const fontRegex = /\{font[:：](.+?)\}([\s\S]*?)\{\/font\}/g;
    let lastIdx = 0;
    let fm;

    while ((fm = fontRegex.exec(text)) !== null) {
        if (fm.index > lastIdx) {
            segments.push({ text: text.slice(lastIdx, fm.index), font: null });
        }
        segments.push({ text: fm[2], font: resolveFontName(fm[1].trim()) });
        lastIdx = fontRegex.lastIndex;
    }
    if (lastIdx < text.length) {
        segments.push({ text: text.slice(lastIdx), font: null });
    }
    if (segments.length === 0) {
        segments.push({ text, font: null });
    }

    // Step 2: 各セグメントをインラインパース
    const result = [];
    let keyCounter = 0;

    for (const seg of segments) {
        const nodes = parseInlineTokens(seg.text, keyCounter);
        if (seg.font) {
            result.push(
                <span key={`font-${keyCounter++}`} style={{ fontFamily: seg.font }}>
                    {nodes}
                </span>
            );
        } else {
            result.push(...nodes);
        }
        keyCounter += nodes.length;
    }

    return result;
}

/**
 * インライントークンをパースしてReactElement配列を返す
 * 対応: ルビ、**強調**、[[リンク]]、傍点
 */
function parseInlineTokens(text, startKey = 0) {
    const elements = [];
    let key = startKey;

    // 統合正規表現: 出現順にマッチさせる
    // 1. ｜Base《Ruby》（標準ルビ）
    // 2. Kanji《Ruby》（簡易ルビ）
    // 3. **強調**
    // 4. [[リンク]] / ［［リンク］］
    const regex = /｜([^｜《]+)《([^》]+)》|([一-龠々〆ヵヶ\u3400-\u4DBF\u{20000}-\u{2A6DF}]+)《([^》]+)》|\*\*(.+?)\*\*|\[\[(.*?)\]\]|［［(.*?)］］/gu;

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // マッチ前のプレーンテキスト
        if (match.index > lastIndex) {
            elements.push(text.substring(lastIndex, match.index));
        }

        if (match[1] != null) {
            // 標準ルビ: ｜Base《Ruby》
            const base = match[1];
            const ruby = match[2];
            // 傍点判定: 読みが「・」の繰り返し or 「●」の繰り返し等
            if (/^[・●○◉]+$/.test(ruby) && ruby.length <= base.length * 2) {
                const dots = Array.from(base).map((char, ci) => (
                    <ruby key={`boten-${key++}-${ci}`} className="reader-boten">
                        {char}<rt>{'・'}</rt>
                    </ruby>
                ));
                elements.push(...dots);
            } else {
                elements.push(
                    <ruby key={`ruby-${key++}`}>
                        {base}<rt>{ruby}</rt>
                    </ruby>
                );
            }
        } else if (match[3] != null) {
            // 簡易ルビ: Kanji《Ruby》
            // 傍点判定: 読みが「・」の繰り返し or 「●」の繰り返し
            const base = match[3];
            const ruby = match[4];
            if (/^[・●○◉]{1,}$/.test(ruby) && ruby.length <= base.length * 2) {
                // 傍点として表示（1文字ずつルビ「・」を振る）
                const dots = Array.from(base).map((char, ci) => (
                    <ruby key={`boten-${key++}-${ci}`} className="reader-boten">
                        {char}<rt>{'・'}</rt>
                    </ruby>
                ));
                elements.push(...dots);
            } else {
                elements.push(
                    <ruby key={`ruby-${key++}`}>
                        {base}<rt>{ruby}</rt>
                    </ruby>
                );
            }
        } else if (match[5] != null) {
            // **強調**
            elements.push(
                <strong key={`strong-${key++}`}>{match[5]}</strong>
            );
        } else if (match[6] != null) {
            // [[リンク]] → プレーンテキスト
            elements.push(match[6]);
        } else if (match[7] != null) {
            // ［［リンク］］ → プレーンテキスト
            elements.push(match[7]);
        }

        lastIndex = regex.lastIndex;
    }

    // 残りのテキスト
    if (lastIndex < text.length) {
        elements.push(text.substring(lastIndex));
    }

    return elements;
}
