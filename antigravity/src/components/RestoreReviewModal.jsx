import React, { useMemo } from 'react';
import { buildConflictDiff } from '../utils/conflictDiff.mjs';

export default function RestoreReviewModal({ review, onContinue, onSave, onCancel }) {
  const parts = useMemo(() => review
    ? buildConflictDiff(review.restoredText, review.diskText).filter(part => part.type !== 'unchanged')
    : [], [review]);
  if (!review) return null;

  return <div style={{ position: 'fixed', inset: 0, zIndex: 300002, background: 'rgba(0,0,0,.72)', padding: 24, display: 'flex' }}>
    <section style={{ margin: 'auto', width: 'min(1100px,96vw)', height: 'min(820px,92vh)', background: 'var(--bg-paper,#fff)', color: 'var(--text-main,#222)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color,#ddd)' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>スナップショット復元内容を確認</h2>
        <p style={{ margin: '8px 0 0', lineHeight: 1.6 }}>対象：<strong>{review.fileName}</strong>。現在は復元プレビュー中で、自動保存と通常保存を停止しています。</p>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: 18, writingMode: 'horizontal-tb' }}>
        {parts.length === 0 ? <p>現在の原稿との差分はありません。</p> : parts.map((part, index) => <div key={index} style={{ marginBottom: 12, border: `1px solid ${part.type === 'nexus' ? '#3182ce' : '#d69e2e'}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', fontWeight: 700, background: part.type === 'nexus' ? '#dbeafe' : '#fff3cd', color: '#222' }}>{part.type === 'nexus' ? '復元する内容' : '現在の原稿'}</div>
          <pre style={{ margin: 0, padding: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mincho,serif)', lineHeight: 1.7 }}>{part.text}</pre>
        </div>)}
      </div>
      <footer style={{ padding: 16, borderTop: '1px solid var(--border-color,#ddd)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={() => navigator.clipboard?.writeText(review.restoredText)}>復元本文をコピー</button>
        <button onClick={onContinue}>編集を続ける</button>
        <button onClick={onCancel}>復元を取り消す</button>
        {review.hasChanges && <button onClick={onSave} style={{ background: '#176b3a', color: '#fff' }}>この内容を保存</button>}
      </footer>
    </section>
  </div>;
}
