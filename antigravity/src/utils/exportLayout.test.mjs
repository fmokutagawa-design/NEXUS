import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { resolveSubmissionLayout, orientedPageMm } from './submissionLayout.js';
import { generateDocx } from './docxExporter.js';

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
assert.match(stylesXml, /w:sz w:val="18"/);

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
