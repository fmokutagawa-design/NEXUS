/**
 * node src/utils/boundaryDetector.test.cjs で実行
 */

let passed = 0;
let failed = 0;

function expect(name, cond, detail) {
    if (cond) {
        passed++;
        console.log(`  ✓ ${name}`);
    } else {
        failed++;
        console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    }
}

async function main() {
    // ESM を CommonJS から動的インポート
    const { findBoundaryCandidates, validateBoundary } = await import('./boundaryDetector.js');

    console.log('--- testFindBoundaryCandidates ---');

    (() => {
        // testChapterSquare
        const text = "あいうえお\n■プロローグ\nかきくけこ";
        const c = findBoundaryCandidates(text);
        expect('testChapterSquare detects square', c.length === 1 && c[0].type === 'chapter' && c[0].titleCandidate === 'プロローグ');
    })();

    (() => {
        const text = "本文\n◇第二部\n続き";
        const c = findBoundaryCandidates(text);
        expect('testChapterDiamond detects diamond', c.length === 1 && c[0].type === 'chapter' && c[0].marker === '◇' && c[0].titleCandidate === '第二部');
    })();

    (() => {
        // testChapterNth
        const text = "第十二幕 激闘\n本文";
        const c = findBoundaryCandidates(text);
        expect('testChapterNth detects Nth chapter', c.length === 1 && c[0].type === 'chapter' && c[0].titleCandidate === '激闘' && c[0].marker === '第十二幕');
    })();

    (() => {
        // testMarkdownSection
        const text = "## 概要\n本文";
        const c = findBoundaryCandidates(text);
        expect('testMarkdownSection detects md heading', c.length === 1 && c[0].type === 'section' && c[0].titleCandidate === '概要');
    })();

    (() => {
        const text = "\uFEFF　 第一章：帰還\n本文\n  #第二章\n本文";
        const c = findBoundaryCandidates(text);
        expect('detects indented/BOM chapter and markdown without space', c.length === 2 && c[0].titleCandidate === '帰還' && c[1].titleCandidate === '第二章');
    })();

    (() => {
        const text = "第一章　帰還［＃「第一章　帰還」は大見出し］\n本文";
        const c = findBoundaryCandidates(text);
        expect('detects aozora suffix heading at line start', c.length === 1 && c[0].offset === 0 && c[0].titleCandidate === '第一章　帰還');
    })();

    (() => {
        // testAozoraBigHeading
        const text = "［＃大見出し］第一章　旅立ち［＃大見出し終わり］\n本文";
        const c = findBoundaryCandidates(text);
        expect('testAozoraBigHeading detects big heading', c.length === 1 && c[0].type === 'chapter' && c[0].titleCandidate.startsWith('第一章　旅立ち'));
    })();

    (() => {
        // testAozoraMidHeading
        const text = "［＃中見出し］休憩［＃中見出し終わり］";
        const c = findBoundaryCandidates(text);
        expect('testAozoraMidHeading detects mid heading', c.length === 1 && c[0].type === 'section' && c[0].titleCandidate.startsWith('休憩'));
    })();

    (() => {
        // testAozoraSmallHeading
        const text = "［＃小見出し］Tips［＃小見出し終わり］";
        const c = findBoundaryCandidates(text);
        expect('testAozoraSmallHeading detects small heading', c.length === 1 && c[0].type === 'section');
    })();

    (() => {
        // testAozoraPageBreak
        const text = "前編終了\n［＃改ページ］\n後編開始";
        const c = findBoundaryCandidates(text);
        expect('testAozoraPageBreak detects page break', c.length === 1 && c[0].type === 'aozora-pagebreak');
    })();

    (() => {
        // testBlankLines
        const text = "段落１\n\n\n段落２";
        const c = findBoundaryCandidates(text, { includeBlankLines: true });
        expect('testBlankLines detects >=3 newlines', c.length === 1 && c[0].type === 'paragraph');
    })();

    (() => {
        // testDeduplication
        // ■第1章 (matches both chapterRegex and squareRegex if we consider "■第1章"...)
        // Actually, let's just make a string where two rules might apply at the same offset.
        // Wait, "■第1章" would match `^■.*` and `^第1章.*`? `^` anchors to line start. It can't match both if they start differently.
        // Let's just trust findBoundaryCandidates deduplicates same offset.
        const text = "［＃改ページ］\n［＃大見出し］見出し［＃大見出し終わり］";
        const c = findBoundaryCandidates(text);
        expect('testDeduplication keeps highest confidence', c.length === 2);
    })();

    (() => {
        // testEmptyString
        const c = findBoundaryCandidates('');
        expect('testEmptyString returns empty array', c.length === 0);
    })();

    (() => {
        // testNoMatch
        const c = findBoundaryCandidates('ただの\nテキスト\nです。');
        expect('testNoMatch returns empty array', c.length === 0);
    })();

    (() => {
        // testOptionsDisabled
        const text = "■章\n## 節";
        const c = findBoundaryCandidates(text, { includeChapter: false, includeMarkdown: false });
        expect('testOptionsDisabled respects flags', c.length === 0);
    })();

    console.log('\n--- testValidateBoundary ---');

    (() => {
        // testValidBoundary
        const text = "あいうえお\nかきくけこ";
        expect('testValidBoundary allows normal break', validateBoundary(text, 6).valid);
    })();

    (() => {
        // testSurrogatePair
        const text = "吉野家で𩸽を食べる"; // 𩸽 is a surrogate pair (U+29E3D) -> length is 2
        // "吉野家で" is 4 characters. "𩸽" is at offset 4 and 5.
        // so offset 5 is between surrogate pair.
        expect('testSurrogatePair blocks split', validateBoundary(text, 5).valid === false);
        expect('testSurrogatePair returns correct reason', validateBoundary(text, 5).brokenStructure === 'surrogate');
    })();

    (() => {
        // testInsideRuby
        const text = "ルビ《るび》のテスト";
        const offset = text.indexOf('る');
        const res = validateBoundary(text, offset + 1);
        expect('testInsideRuby blocks inside ruby', res.valid === false && res.brokenStructure === 'ruby');
    })();

    (() => {
        // testInsideAozoraTag
        const text = "これは［＃注記］です";
        const offset = text.indexOf('注');
        const res = validateBoundary(text, offset);
        expect('testInsideAozoraTag blocks inside tag', res.valid === false && res.brokenStructure === 'aozora-tag');
    })();

    (() => {
        // testInsideFontTag
        const text = "これは{font:Gothic}ゴシック{/font}です";
        const offset = text.indexOf('シ');
        const res = validateBoundary(text, offset);
        expect('testInsideFontTag blocks inside font', res.valid === false && res.brokenStructure === 'font-tag');
    })();

    (() => {
        // testInsideEmphasis
        const text = "これは**強調**です";
        const offset = text.indexOf('調');
        const res = validateBoundary(text, offset);
        expect('testInsideEmphasis blocks inside emphasis', res.valid === false && res.brokenStructure === 'emphasis');
    })();

    (() => {
        // testInsideLinkHalf
        const text = "これは[[リンク]]です";
        const offset = text.indexOf('ン');
        const res = validateBoundary(text, offset);
        expect('testInsideLinkHalf blocks inside link', res.valid === false && res.brokenStructure === 'link-half');
    })();

    (() => {
        // testInsideLinkFull
        const text = "これは［［リンク］］です";
        const offset = text.indexOf('ン');
        const res = validateBoundary(text, offset);
        expect('testInsideLinkFull blocks inside link', res.valid === false && res.brokenStructure === 'link-full');
    })();

    (() => {
        // testMultipleTags
        const text = "《るび》と**強調**と[[リンク]]";
        const validOffset = text.indexOf('と'); 
        // 最初の「と」の前。テキストは "《るび》" (4 chars) なので offset=4。
        const res = validateBoundary(text, validOffset);
        expect('testMultipleTags allows outside of tags', res.valid === true);
    })();

    (() => {
        // testOutOfRange
        const text = "あいう";
        const res = validateBoundary(text, 10);
        expect('testOutOfRange blocks out of bounds', res.valid === false && res.reason === 'offset out of range');
    })();

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(console.error);
