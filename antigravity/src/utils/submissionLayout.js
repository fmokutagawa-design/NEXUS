const PAGE_MM = Object.freeze({
  A4: { width: 210, height: 297 },
  B5: { width: 176, height: 250 },
  A5: { width: 148, height: 210 },
});

const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export function resolveSubmissionLayout(settings = {}) {
  const pageSize = PAGE_MM[settings.pageSize] ? settings.pageSize : 'A4';
  const orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  return {
    pageSize,
    orientation,
    isVertical: settings.isVertical !== false,
    charsPerLine: Math.max(1, Math.round(positiveNumber(settings.charsPerLine, 20))),
    linesPerPage: Math.max(1, Math.round(positiveNumber(settings.linesPerPage, 20))),
    fontName: settings.fontFamily,
    fontSizePt: positiveNumber(settings.exportFontSizePt, 12),
    lineHeight: positiveNumber(settings.lineHeight, 1.5),
    margins: {
      top: positiveNumber(settings.marginTopMm ?? settings.marginMm, 20),
      right: positiveNumber(settings.marginRightMm ?? settings.marginMm, 20),
      bottom: positiveNumber(settings.marginBottomMm ?? settings.marginMm, 20),
      left: positiveNumber(settings.marginLeftMm ?? settings.marginMm, 20),
    },
    page: PAGE_MM[pageSize],
  };
}

export function orientedPageMm(layout) {
  return layout.orientation === 'landscape'
    ? { width: layout.page.height, height: layout.page.width }
    : { ...layout.page };
}

export { PAGE_MM };
