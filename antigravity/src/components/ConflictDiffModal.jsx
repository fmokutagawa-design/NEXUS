import React, { useMemo } from 'react';
import { buildConflictDiff } from '../utils/conflictDiff.mjs';

export default function ConflictDiffModal({ conflict, onClose, onUseExternal, onUseNexus }) {
  const parts = useMemo(() => conflict ? buildConflictDiff(conflict.nexusText, conflict.externalText) : [], [conflict]);
  if (!conflict) return null;

  const changed = parts.filter(part => part.type !== 'unchanged');
  return <div style={{ position: 'fixed', inset: 0, zIndex: 300000, background: 'rgba(0,0,0,.72)', padding: 24, display: 'flex' }}>
    <section style={{ margin: 'auto', width: 'min(1100px,96vw)', height: 'min(820px,92vh)', background: 'var(--bg-paper,#fff)', color: 'var(--text-main,#222)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color,#ddd)' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>外部編集との競合を検知しました</h2>
        <p style={{ margin: '8px 0 0', lineHeight: 1.6 }}>Codexなどが保存した原稿は保護されています。変更箇所を確認して、採用する版を選んでください。</p>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: 18, writingMode: 'horizontal-tb' }}>
        {changed.length === 0 ? <p>内容上の差分はありません。</p> : changed.map((part, index) => <div key={index} style={{ margin: '0 0 12px', borderRadius: 8, border: `1px solid ${part.type === 'nexus' ? '#d69e2e' : '#3182ce'}`, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', fontWeight: 700, background: part.type === 'nexus' ? '#fff3cd' : '#dbeafe', color: '#222' }}>{part.type === 'nexus' ? 'NEXUS側の未保存内容' : 'Codexなどによる外部更新'}</div>
          <pre style={{ margin: 0, padding: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mincho,serif)', lineHeight: 1.7 }}>{part.text}</pre>
        </div>)}
      </div>
      <footer style={{ padding: 16, borderTop: '1px solid var(--border-color,#ddd)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={() => navigator.clipboard?.writeText(conflict.nexusText)}>NEXUS稿をコピー</button>
        <button onClick={onClose}>編集画面に残る</button>
        <button onClick={onUseExternal}>外部版を採用</button>
        <button onClick={onUseNexus} style={{ background: '#b45309', color: '#fff' }}>NEXUS版で上書き</button>
      </footer>
    </section>
  </div>;
}
