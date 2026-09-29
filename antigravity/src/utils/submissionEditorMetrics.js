export function calculateSubmissionEditorMetrics({ viewportHeight, requestedFontSize, charsPerLine, linesPerPage }) {
  const chars = Math.max(1, Number(charsPerLine) || 40);
  const lines = Math.max(1, Number(linesPerPage) || 30);
  // タイトルバー、下部タブ、スクロールバーの分を除き、40字がほぼ一画面に収まる。
  const usableHeight = Math.max(320, Number(viewportHeight) - 95);
  const cell = Math.max(16, Math.floor(usableHeight / chars));
  const fontSize = Math.max(12, Math.min(Number(requestedFontSize) || 18, Math.floor(cell * 0.8)));
  return {
    cell,
    fontSize,
    pageSpan: cell * lines,
    gridHeight: cell * chars,
  };
}
