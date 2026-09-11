export function useCorrections(
  text,
  setText,
  corrections,
  setCorrections,
  editorRef,
  showToast,
  isProjectMode,
  setPendingAIContent,
  setInputModalMode,
  setInputModalValue,
  setShowInputModal
) {
  const handleAIInsert = async (insertedText, mode = 'current') => {
    if (mode === 'new-file') {
      if (!isProjectMode) {
        showToast('新規ファイルへの出力はプロジェクトモードでのみ可能です。', 'error');
        return;
      }
      setPendingAIContent(insertedText);
      setInputModalMode('ai_create_file');
      setInputModalValue('');
      setShowInputModal(true);
    } else if (mode === 'replace') {
      if (insertedText.original && insertedText.suggested) {
        // From correction
        const { start, end } = insertedText;
        if (Number.isInteger(start) && Number.isInteger(end) && text.slice(start, end) === insertedText.original) {
          setText(text.slice(0, start) + insertedText.suggested + text.slice(end));
          return true;
        } else if (!Number.isInteger(start) || !Number.isInteger(end)) {
          showToast('同じ表現が複数あり修正位置を特定できません。該当箇所へ移動して個別に修正してください。', 'error');
        } else {
          showToast('校正後に文章が変更されたため、この修正は適用できません。もう一度校正してください。', 'error');
        }
        return false;
      } else {
        // Simple replace at cursor (used for rewrite)
        editorRef.current?.insertText(insertedText);
      }
    } else if (mode === 'append') {
      // Append content appropriately (used for continue)
      const insertion = typeof insertedText === 'string' ? insertedText : (insertedText.suggested || '');
      setText(prev => prev.trimEnd() + insertion);
    } else if (mode === 'jump') {
      const { original, start, end } = insertedText;
      if (!original || !editorRef.current) return;

      if (Number.isInteger(start) && Number.isInteger(end) && text.slice(start, end) === original) {
        editorRef.current.jumpToPosition(start, end);
      } else {
        const first = text.indexOf(original);
        const second = first >= 0 ? text.indexOf(original, first + original.length) : -1;
        if (first >= 0 && second === -1) {
          editorRef.current.jumpToPosition(first, first + original.length);
        } else {
          showToast('指摘箇所を一意に特定できませんでした。', 'error');
        }
      }
    } else {
      if (editorRef.current) {
        editorRef.current.insertText(insertedText);
      } else {
        setText(prev => prev + '\n' + insertedText);
      }
    }
  };

  const handleApplyCorrection = (correction) => {
    const { start, end } = correction;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      showToast('同じ表現が複数あり修正位置を特定できません。該当箇所へ移動して個別に修正してください。', 'error');
      return;
    }
    if (text.slice(start, end) !== correction.original) {
      showToast('校正後に文章が変更されたため、この修正は適用できません。もう一度校正してください。', 'error');
      return;
    }
    const newText = text.slice(0, start) + correction.suggested + text.slice(end);
    setText(newText);
    setCorrections(prev => prev.filter(c => c.id !== correction.id));
    showToast('修正を適用しました');
  };

  const handleDiscardCorrection = (id) => {
    setCorrections(prev => prev.filter(c => c.id !== id));
  };

  const handleApplyAllCorrections = () => {
    let currentText = text;
    let appliedCount = 0;
    const remainingCorrections = [];
    // 後ろから適用すれば、前方にある指摘の文字位置は変化しない。
    const ordered = [...corrections].sort((a, b) => (b.start ?? -1) - (a.start ?? -1));
    ordered.forEach(c => {
      if (Number.isInteger(c.start) && Number.isInteger(c.end) && currentText.slice(c.start, c.end) === c.original) {
        currentText = currentText.slice(0, c.start) + c.suggested + currentText.slice(c.end);
        appliedCount++;
      } else {
        remainingCorrections.push(c);
      }
    });
    setText(currentText);
    setCorrections(remainingCorrections);
    if (remainingCorrections.length > 0) {
      showToast(`${appliedCount}件適用しましたが、${remainingCorrections.length}件は適用できませんでした。`);
    } else {
      showToast(`${appliedCount}件の修正をすべて適用しました`);
    }
  };

  return { handleAIInsert, handleApplyCorrection, handleDiscardCorrection, handleApplyAllCorrections };
}
