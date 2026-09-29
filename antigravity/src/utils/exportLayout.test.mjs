import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { resolveSubmissionLayout, orientedPageMm } from './submissionLayout.js';
import { generateDocx } from './docxExporter.js';
import literaryPrizes from '../data/literaryPrizes.js';

const defaultLayout = resolveSubmissionLayout({});
assert.equal(defaultLayout.orientation, 'portrait');
assert.deepEqual(defaultLayout.margins, { top: 12, right: 12, bottom: 12, left: 12 });

const matsumoto = literaryPrizes.find(prize => prize.id === 'matsumoto');
assert.deepEqual(matsumoto.editorFormat, {
  pageSize: 'A4', orientation: 'landscape', isVertical: true,
  charsPerLine: 40, linesPerPage: 30,
  marginTopMm: 30, marginRightMm: 30, marginBottomMm: 30, marginLeftMm: 30,
  fontFamily: 'ＭＳ 明朝', exportFontSizePt: 10.5, pageNumberStart: 0,
  linePitchTwips: 447, headerTwips: 851, footerTwips: 992, columnSpaceTwips: 425,
});
const matsumotoLayout = resolveSubmissionLayout({ ...matsumoto.editorFormat, isVertical: true });
assert.equal(matsumotoLayout.charsPerLine, 40);
assert.equal(matsumotoLayout.linesPerPage, 30);
assert.equal(matsumotoLayout.isVertical, true);
assert.equal(matsumotoLayout.orientation, 'landscape');
assert.deepEqual(matsumotoLayout.margins, { top: 30, right: 30, bottom: 30, left: 30 });
assert.equal(matsumotoLayout.linePitchTwips, 447);
assert.equal(matsumotoLayout.headerTwips, 851);
assert.equal(matsumotoLayout.footerTwips, 992);
assert.equal(matsumotoLayout.columnSpaceTwips, 425);

const layout = resolveSubmissionLayout({
  pageSize: 'B5',
  orientation: 'landscape',
  isVertical: true,
  charsPerLine: 40,
  linesPerPage: 30,
  fontFamily: "'YuMincho', serif",
  marginTopMm: 15,
  marginRightMm: 16,
  marginBottomMm: 17,
  marginLeftMm: 18,
});

assert.equal(layout.charsPerLine, 40);
assert.equal(layout.linesPerPage, 30);
assert.deepEqual(orientedPageMm(layout), { width: 250, height: 176 });
assert.deepEqual(layout.margins, { top: 15, right: 16, bottom: 17, left: 18 });

const blob = await generateDocx({ content: 'これは出力確認用の本文です。\n吾輩《わがはい》は猫である。', ...layout });
const zip = await JSZip.loadAsync(await blob.arrayBuffer());
const documentXml = await zip.file('word/document.xml').async('string');
const stylesXml = await zip.file('word/styles.xml').async('string');

assert.match(documentXml, /w:textDirection w:val="tbRl"/);
assert.match(documentXml, /w:pgSz[^>]+w:orient="landscape"/);
assert.match(documentXml, /w:pgMar w:top="850" w:right="907" w:bottom="964" w:left="1020"/);
assert.match(documentXml, /w:docGrid w:type="linesAndChars"/);
assert.match(documentXml, /<w:ruby>/);
assert.match(stylesXml, /w:sz w:val="20"/);
const footerXml = await zip.file('word/footer1.xml').async('string');
assert.match(footerXml, /PAGE \\\* MERGEFORMAT/);
assert.match(documentXml, /<w:footerReference w:type="default" r:id="rId3"\/>/);

const matsumotoBlob = await generateDocx({ content: '｜尤雲衢《ゆううんく》', ...matsumotoLayout });
const matsumotoZip = await JSZip.loadAsync(await matsumotoBlob.arrayBuffer());
const matsumotoDocumentXml = await matsumotoZip.file('word/document.xml').async('string');
const matsumotoStylesXml = await matsumotoZip.file('word/styles.xml').async('string');
assert.match(matsumotoDocumentXml, /w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/);
assert.match(matsumotoDocumentXml, /w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="1701"[\s\S]*w:header="851" w:footer="992"/);
assert.match(matsumotoDocumentXml, /w:textDirection w:val="tbRl"/);
assert.match(matsumotoDocumentXml, /<w:pgNumType w:start="0"\/>/);
assert.match(matsumotoDocumentXml, /<w:cols w:space="425"\/>/);
assert.match(matsumotoDocumentXml, /w:docGrid w:type="linesAndChars" w:linePitch="447"/);
assert.match(matsumotoDocumentXml, /<w:rubyBase>[\s\S]*尤雲衢/);
assert.match(matsumotoDocumentXml, /<w:rt>[\s\S]*ゆううんく/);
assert.match(matsumotoStylesXml, /w:rFonts w:ascii="ＭＳ 明朝" w:eastAsia="ＭＳ 明朝"/);
assert.match(matsumotoStylesXml, /w:sz w:val="21"/);

if (process.env.NEXUS_EXPORT_FIXTURE) {
  await writeFile(process.env.NEXUS_EXPORT_FIXTURE, Buffer.from(await blob.arrayBuffer()));
}
if (process.env.NEXUS_EXPORT_HORIZONTAL_FIXTURE) {
  const horizontalBlob = await generateDocx({
    content: 'NEXUS export layout test.',
    ...layout,
    isVertical: false,
    fontName: 'Liberation Serif',
  });
  await writeFile(process.env.NEXUS_EXPORT_HORIZONTAL_FIXTURE, Buffer.from(await horizontalBlob.arrayBuffer()));
}

console.log('Export layout tests passed');
