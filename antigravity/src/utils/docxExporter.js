import JSZip from 'jszip';
import { downloadBlob } from './epubExporter.js';
import { parseRubyTokens } from './rubyParser.js';

/**
 * DOCX Exporter for Antigravity
 * JSZipのみで .docx を生成（追加ライブラリ不要）
 *
 * DOCX = ZIP containing XML files (Open XML format)
 */

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeWordFontName(fontName) {
  if (!fontName || fontName === 'inherit' || fontName.includes('--font-mincho')) return '游明朝';
  if (fontName.includes('--font-gothic')) return 'メイリオ';
  if (fontName.includes('--font-hand')) return '游明朝';
  const first = fontName.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return first || '游明朝';
}

/**
 * テキスト行をOpenXMLのパラグラフに変換
 */
function textToDocxParagraphs(text, fontName, fontSizePt) {
  const baseHalfPoints = Math.max(2, Math.round(fontSizePt * 2));
  const rubyHalfPoints = Math.max(2, Math.round(baseHalfPoints / 2));
  const lines = text.split('\n');
  const paragraphs = [];

  for (const line of lines) {
    if (line.trim() === '') {
      paragraphs.push(
        `<w:p><w:pPr><w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr></w:pPr></w:p>`
      );
      continue;
    }

    let processedLine = line;
    // リンク記法 [[target|label]] または [[target]] を除去
    processedLine = processedLine.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
    processedLine = processedLine.replace(/\[\[([^\]]+)\]\]/g, '$1');
    processedLine = processedLine.replace(/［［([^］]+)］］/g, '$1');
    // 青空文庫タグ除去
    processedLine = processedLine.replace(/［＃[^］]*］/g, '');
    // フォントタグ除去
    processedLine = processedLine.replace(/\{font[:：][^}]*\}/g, '').replace(/\{\/font\}/g, '');
    // Markdown太字除去
    processedLine = processedLine.replace(/\*\*([^*]+)\*\*/g, '$1');

    // ルビ処理 — ルビがある場合はOpenXMLのrubyマークアップを使用
    const rubyTokens = parseRubyTokens(processedLine);
    const hasRuby = rubyTokens.some(token => typeof token !== 'string');

    if (hasRuby) {
      const parts = [];
      for (const token of rubyTokens) {
        if (typeof token === 'string') {
          if (!token) continue;
          parts.push(
            `<w:r><w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr>` +
            `<w:t xml:space="preserve">${escapeXml(token)}</w:t></w:r>`
          );
          continue;
        }
        parts.push(
          `<w:ruby>` +
          `<w:rubyPr><w:rubyAlign w:val="distributeSpace"/>` +
          `<w:hps w:val="${rubyHalfPoints}"/><w:hpsRaise w:val="${baseHalfPoints}"/><w:hpsBaseText w:val="${baseHalfPoints}"/></w:rubyPr>` +
          `<w:rubyBase><w:r><w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr>` +
          `<w:t>${escapeXml(token.base)}</w:t></w:r></w:rubyBase>` +
          `<w:rt><w:r><w:rPr><w:rFonts w:eastAsia="${fontName}"/><w:sz w:val="${rubyHalfPoints}"/></w:rPr>` +
          `<w:t>${escapeXml(token.ruby)}</w:t></w:r></w:rt>` +
          `</w:ruby>`
        );
      }
      if (parts.length === 0) {
        parts.push(
          `<w:r><w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr>` +
          `<w:t xml:space="preserve"></w:t></w:r>`
        );
      }

      const indent = processedLine.startsWith('　') ? '' : '';
      paragraphs.push(
        `<w:p><w:pPr>` +
        indent +
        `<w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr></w:pPr>` +
        parts.join('') +
        `</w:p>`
      );
    } else {
      // 通常テキスト行
      // 原文の行頭全角空白を保持するため、Word側の段落字下げは重ねない。
      const indent = '';
      paragraphs.push(
        `<w:p><w:pPr>${indent}<w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr></w:pPr>` +
        `<w:r><w:rPr><w:rFonts w:eastAsia="${fontName}"/></w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(processedLine)}</w:t></w:r></w:p>`
      );
    }
  }

  return paragraphs.join('\n');
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;
}

function relsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;
}

function footerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText>PAGE \\* MERGEFORMAT</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;
}

function stylesXml(fontName, fontSizePt, linePitchTwips) {
  const halfPoints = Math.round(fontSizePt * 2);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="${fontName}" w:eastAsia="${fontName}" w:hAnsi="${fontName}"/>
      <w:sz w:val="${halfPoints}"/>
      <w:szCs w:val="${halfPoints}"/>
      <w:lang w:val="en-US" w:eastAsia="ja-JP"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:line="${linePitchTwips}" w:lineRule="exact"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:line="${linePitchTwips}" w:lineRule="exact"/></w:pPr>
  </w:style>
</w:styles>`;
}

function settingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:compat>
    <w:useFELayout/>
  </w:compat>
  <w:defaultTabStop w:val="840"/>
</w:settings>`;
}

function mmToTwips(mm) {
  return Math.round(Number(mm) * 56.6929133858);
}

function documentXml(bodyContent, layout) {
  const { isVertical, pageSize, orientation, margins, charsPerLine, linesPerPage, pageNumberStart, headerTwips, footerTwips, columnSpaceTwips } = layout;
  const pageDims = {
    'A4': { w: 11906, h: 16838 },
    'B5': { w: 9979, h: 14175 },
    'A5': { w: 8392, h: 11906 },
  }[pageSize] || { w: 11906, h: 16838 };

  const isLandscape = orientation === 'landscape';
  const pgW = isLandscape ? pageDims.h : pageDims.w;
  const pgH = isLandscape ? pageDims.w : pageDims.h;
  const orientAttr = isLandscape ? ' w:orient="landscape"' : '';
  const marginTwips = {
    top: mmToTwips(margins.top),
    right: mmToTwips(margins.right),
    bottom: mmToTwips(margins.bottom),
    left: mmToTwips(margins.left),
  };
  const usableWidth = pgW - marginTwips.left - marginTwips.right;
  const usableHeight = pgH - marginTwips.top - marginTwips.bottom;
  const linePitchTwips = layout.linePitchTwips || Math.max(1, Math.round((isVertical ? usableWidth : usableHeight) / linesPerPage));

  // 縦書き: textDirection="tbRl"
  const textDir = isVertical ? '<w:textDirection w:val="tbRl"/>' : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
${bodyContent}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgSz w:w="${pgW}" w:h="${pgH}"${orientAttr}/>
      <w:pgMar w:top="${marginTwips.top}" w:right="${marginTwips.right}" w:bottom="${marginTwips.bottom}" w:left="${marginTwips.left}"
               w:header="${headerTwips || 720}" w:footer="${footerTwips || 720}"/>
      ${textDir}
      <w:pgNumType w:start="${pageNumberStart}"/>
      <w:cols w:space="${columnSpaceTwips || 720}"/>
      <w:docGrid w:type="linesAndChars" w:linePitch="${linePitchTwips}"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

/**
 * DOCX生成メイン関数
 */
export async function generateDocx({
  content = '',
  isVertical = true,
  fontName = '游明朝',
  pageSize = 'A4',
  orientation = 'portrait',
  charsPerLine = 20,
  linesPerPage = 20,
  fontSizePt = 12,
  lineHeight = 1.5,
  margins = { top: 20, right: 20, bottom: 20, left: 20 },
  pageNumberStart = 1,
  linePitchTwips = null,
  headerTwips = null,
  footerTwips = null,
  columnSpaceTwips = null,
}) {
  const zip = new JSZip();
  fontName = normalizeWordFontName(fontName);

  zip.file('[Content_Types].xml', contentTypesXml());
  zip.file('_rels/.rels', relsXml());
  zip.file('word/_rels/document.xml.rels', documentRelsXml());
  const pageDims = {
    A4: { w: 11906, h: 16838 }, B5: { w: 9979, h: 14175 }, A5: { w: 8392, h: 11906 }
  }[pageSize] || { w: 11906, h: 16838 };
  const pgW = orientation === 'landscape' ? pageDims.h : pageDims.w;
  const pgH = orientation === 'landscape' ? pageDims.w : pageDims.h;
  const usableCharAxis = isVertical
    ? pgH - mmToTwips(margins.top) - mmToTwips(margins.bottom)
    : pgW - mmToTwips(margins.left) - mmToTwips(margins.right);
  const desiredCharPitchPt = usableCharAxis / 20 / charsPerLine;
  const effectiveFontSizePt = Math.min(fontSizePt, desiredCharPitchPt);
  const layout = { isVertical, pageSize, orientation, charsPerLine, linesPerPage, fontSizePt: effectiveFontSizePt, lineHeight, margins, pageNumberStart, linePitchTwips, headerTwips, footerTwips, columnSpaceTwips };
  const bodyParagraphs = textToDocxParagraphs(content, fontName, effectiveFontSizePt);

  zip.file('word/document.xml', documentXml(bodyParagraphs, layout));
  const usableCrossAxis = isVertical
    ? pgW - mmToTwips(margins.left) - mmToTwips(margins.right)
    : pgH - mmToTwips(margins.top) - mmToTwips(margins.bottom);
  const resolvedLinePitchTwips = linePitchTwips || Math.max(1, Math.round(usableCrossAxis / linesPerPage));

  zip.file('word/styles.xml', stylesXml(fontName, effectiveFontSizePt, resolvedLinePitchTwips));
  zip.file('word/settings.xml', settingsXml());
  zip.file('word/footer1.xml', footerXml());

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return blob;
}

export { downloadBlob };
