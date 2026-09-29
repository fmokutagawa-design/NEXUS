export function getSubmissionPageStatus(pageCount, pageLimit) {
  if (!pageLimit) return null;
  const min = Number(pageLimit.min) || 0;
  const max = Number(pageLimit.max) || 0;
  if (max > 0 && pageCount > max) {
    const delta = pageCount - max;
    return { state: 'over', delta, label: `上限まで${delta}ページ超過` };
  }
  if (min > 0 && pageCount < min) {
    const delta = min - pageCount;
    return { state: 'under', delta, label: `下限まであと${delta}ページ` };
  }
  return { state: 'within', delta: 0, label: '応募範囲内' };
}
