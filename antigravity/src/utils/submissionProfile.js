// 保存済み応募予定は、賞データ更新前のeditorFormatを持つことがある。
// 現行の賞テンプレートを土台にして、利用者が保存した値だけを上書きする。
export function resolveSubmissionProfile(submission, prizeCatalog = []) {
  if (!submission) return null;
  const prize = prizeCatalog.find(item => item.id === submission.prizeId);
  return {
    ...submission,
    editorFormat: {
      ...(prize?.editorFormat || {}),
      ...(submission.editorFormat || {}),
    },
    pageLimit: submission.pageLimit || prize?.pageLimit || null,
  };
}
