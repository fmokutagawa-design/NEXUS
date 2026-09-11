import { generateEpub, downloadBlob } from '../utils/epubExporter';
import { generateDocx, downloadBlob as downloadDocxBlob } from '../utils/docxExporter';
import { applyFormat } from '../utils/formatText';
import { resolveSubmissionLayout } from '../utils/submissionLayout';

export function useExport(text, setText, activeFileHandle, projectHandle, settings, allMaterialFiles, showToast, activeTab, setActiveTab, workTextData = null, submissionFormat = null) {
  const getExportTitle = () => {
    if (workTextData?.isNexusFile && workTextData?.workTitle) return workTextData.workTitle;
    const activeName = typeof activeFileHandle === 'string'
      ? activeFileHandle.split(/[/\\]/).pop()
      : activeFileHandle?.name;
    return activeName?.replace(/\.[^/.]+$/, '') || '原稿';
  };

  const getExportText = () => (
    workTextData?.isNexusFile && workTextData?.getLatestWorkText
      ? workTextData.getLatestWorkText(text)
      : text
  );

  const handleFormat = (type) => {
    const result = applyFormat(text, type);
    if (result !== null) {
      setText(result);
    }
  };

  const handleEpubExport = async (pName, materials) => {
    if (!materials || materials.length === 0) {
      alert('エクスポートするファイルがありません');
      return;
    }
    try {
      const title = pName || 'Untitled';
      const author = '著者名'; // TODO: 設定から取得
      const epubFiles = materials
        .filter(f => f.name.endsWith('.txt') || f.name.endsWith('.md'))
        .filter(f => !f.name.startsWith('.'))
        .map(f => ({ name: f.name, content: f.body || f.content || '' }));

      if (epubFiles.length === 0) {
        alert('テキストファイルが見つかりません');
        return;
      }

      const blob = await generateEpub({
        title,
        author,
        files: epubFiles,
        isVertical: settings.isVertical !== false,
        projectHandle
      });
      downloadBlob(blob, `${title}.epub`);
      if (showToast) showToast('EPUBを書き出しました');
    } catch (err) {
      console.error('EPUB export failed:', err);
      alert('EPUB書き出しに失敗しました: ' + err.message);
    }
  };

  const handleDocxExport = async () => {
    try {
      const fileName = getExportTitle();
      const exportText = getExportText();
      const format = submissionFormat || {};
      const layout = resolveSubmissionLayout({ ...settings, ...format });
      const blob = await generateDocx({
        title: fileName,
        content: exportText,
        ...layout,
      });
      downloadDocxBlob(blob, `${fileName}.docx`);
      if (showToast) showToast('Word(.docx)を書き出しました');
    } catch (err) {
      console.error('DOCX export failed:', err);
      if (showToast) showToast('DOCX書き出しに失敗しました: ' + err.message, 'error');
      else alert('DOCX書き出しに失敗しました: ' + err.message);
    }
  };

  const handleMergedTextExport = () => {
    try {
      if (!workTextData?.isNexusFile) {
        if (showToast) showToast('章分割された作品を開いてから実行してください。', 'error');
        return;
      }
      if (workTextData.isLoading) {
        if (showToast) showToast('全章を読み込み中です。完了してからもう一度お試しください。', 'error');
        return;
      }
      if (!workTextData.manifest || !workTextData.offsetMap?.length) {
        if (showToast) showToast('作品の構成を確認できないため、結合を中止しました。', 'error');
        return;
      }

      const exportText = getExportText();
      const fileName = `${getExportTitle()}_結合版.txt`;
      const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, fileName);
      if (showToast) showToast(`${workTextData.offsetMap.length}章を順番どおり結合して書き出しました。`);
    } catch (err) {
      console.error('Merged text export failed:', err);
      if (showToast) showToast('結合TXTの書き出しに失敗しました: ' + err.message, 'error');
    }
  };

  const handlePrint = () => {
    const runPreviewPrint = () => {
      if (workTextData?.isNexusFile) {
        window.dispatchEvent(new CustomEvent('nexus:print-full-work'));
        return;
      }
      const button = document.getElementById('preview-print-button');
      if (button) button.click();
      else if (showToast) showToast('印刷用プレビューを準備できませんでした。もう一度お試しください。', 'error');
    };
    if (activeTab !== 'preview') {
      const confirmPrint = window.confirm("原稿全体を印刷（PDF化）するにはプレビュー画面を使用します。\nプレビュー画面に切り替えて印刷しますか？");
      if (confirmPrint) {
        let fallbackTimer;
        const onReady = () => {
          window.removeEventListener('nexus:preview-ready', onReady);
          clearTimeout(fallbackTimer);
          runPreviewPrint();
        };
        window.addEventListener('nexus:preview-ready', onReady, { once: true });
        setActiveTab('preview');
        fallbackTimer = setTimeout(onReady, 10000);
      }
    } else {
      runPreviewPrint();
    }
  };

  return { handleFormat, handleEpubExport, handleDocxExport, handleMergedTextExport, handlePrint };
}
