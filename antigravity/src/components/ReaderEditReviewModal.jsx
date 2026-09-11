import React, { useMemo } from 'react';
import { buildConflictDiff } from '../utils/conflictDiff.mjs';
import { assessReaderEdit } from '../utils/readerEditSession.mjs';

export default function ReaderEditReviewModal({ review, onContinue, onSave, onDiscard }) {
  const parts = useMemo(() => review
    ? buildConflictDiff(review.currentText, review.baselineText)
    : [], [review]);
  if (!review) return null;

  const assessment = assessReaderEdit({
    baselineText: review.baselineText,
    currentText: review.currentText,
    hasTarget: Boolean(review.fileHandle),
  });
  const changed = parts.filter(part => part.type !== 'unchanged');
  const isClosing = review.mode === 'close';

  return <div style={{ position: 'fixed', inset: 0, zIndex: 300001, background: 'rgba(0,0,0,.72)', padding: 24, display: 'flex' }}>
    <section style={{ margin: 'auto', width: 'min(1100px,96vw)', height: 'min(820px,92vh)', background: 'var(--bg-paper,#fff)', color: 'var(--text-main,#222)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color,#ddd)' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{isClosing ? '終了前に変更内容を確認' : '保存する変更内容を確認'}</h2>
        <p style={{ margin: '8px 0 0', lineHeight: 1.6 }}>
          対象：<strong>{review.fileName || '保存先不明'}</strong>（ファイル全体）
        </p>
        {!review.fileHandle && <p style={{ margin: '8px 0 0', color: '#b42318', fontWeight: 700 }}>{review.saveUnavailableMessage || '保存先を確認できないため、保存はできません。本文をコピーして退避できます。'}</p>}
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: 18, writingMode: 'horizontal-tb' }}>
        {changed.length === 0 ? <p>本文の変更はありません。</p> : changed.map((part, index) => <div key={index} style={{ margin: '0 0 12px', borderRadius: 8, border: `1px solid ${part.type === 'nexus' ? '#3182ce' : '#d69e2e'}`, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', fontWeight: 700, background: part.type === 'nexus' ? '#dbeafe' : '#fff3cd', color: '#222' }}>{part.type === 'nexus' ? '現在の編集内容' : '編集前'}</div>
          <pre style={{ margin: 0, padding: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mincho,serif)', lineHeight: 1.7 }}>{part.text}</pre>
        </div>)}
      </div>
      <footer style={{ padding: 16, borderTop: '1px solid var(--border-color,#ddd)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={() => navigator.clipboard?.writeText(review.currentText)}>現在の本文をコピー</button>
        <button onClick={onContinue}>編集を続ける</button>
        <button onClick={onDiscard} style={{ color: isClosing ? '#b42318' : undefined }}>{isClosing ? '保存せず終了' : '変更を保持して戻る'}</button>
        {assessment.canSave && <button onClick={onSave} style={{ background: '#176b3a', color: '#fff' }}>{isClosing ? '保存して終了' : 'この変更を保存して戻る'}</button>}
      </footer>
    </section>
  </div>;
}
