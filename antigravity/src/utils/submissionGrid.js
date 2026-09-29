const MM_TO_PX = 3.78;

export function calculateSubmissionGrid({ pageWidthMm, pageHeightMm, margins, charsPerLine, linesPerPage }) {
  const contentWidthMm = pageWidthMm - margins.left - margins.right;
  const contentHeightMm = pageHeightMm - margins.top - margins.bottom;
  const columnPitchMm = contentWidthMm / linesPerPage;
  const rowPitchMm = contentHeightMm / charsPerLine;
  const columnPitchPx = columnPitchMm * MM_TO_PX;
  const rowPitchPx = rowPitchMm * MM_TO_PX;

  return {
    columnPitchMm: Number(columnPitchMm.toFixed(4)),
    rowPitchMm: Number(rowPitchMm.toFixed(4)),
    columnPitchPx,
    rowPitchPx,
    contentWidthPx: columnPitchPx * linesPerPage,
    contentHeightPx: rowPitchPx * charsPerLine,
  };
}
