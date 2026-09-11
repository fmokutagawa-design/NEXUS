import { useEffect } from 'react';

export function useKeyboardShortcuts({
  onSearchRequested,
  isReaderOpen,
  onReaderSearchRequested,
  handleSaveFileRef,
  setShowReader,
  setInputModalMode,
  setInputModalValue,
  setShowInputModal
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (isReaderOpen) {
          if (onReaderSearchRequested) onReaderSearchRequested();
        } else if (onSearchRequested) onSearchRequested('');
      }
      // Cmd+S: Save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (handleSaveFileRef.current) handleSaveFileRef.current();
      }
      // Alt+R: Reader Mode
      if (e.altKey && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setShowReader(prev => !prev);
      }
      // Cmd+T: Insert TODO
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        setInputModalMode('insert_todo');
        setInputModalValue('');
        setShowInputModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onSearchRequested,
    isReaderOpen,
    onReaderSearchRequested,
    handleSaveFileRef,
    setShowReader,
    setInputModalMode,
    setInputModalValue,
    setShowInputModal
  ]);
}
