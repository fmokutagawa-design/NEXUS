import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const DocumentViewer = ({ document, query = '', onClose, onOpenOriginal, onShowInFolder }) => {
  const [raw, setRaw] = useState(false);
  const bodyRef = useRef(null);
  const isMarkdown = /\.md$/i.test(document?.path || '');
  const terms = useMemo(() => query.trim().split(/\s+/).filter(Boolean), [query]);

  useEffect(() => {
    setRaw(false);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [document?.path]);

  if (!document) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: '#f4f5f7', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', borderBottom: '1px solid #d7dce5' }}>
        <button onClick={onClose} style={{ padding: '7px 12px' }}>← 検索結果へ戻る</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.name}</strong>
          <span title={document.path} style={{ display: 'block', color: '#777', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.path}</span>
        </div>
        {isMarkdown && <button onClick={() => setRaw(value => !value)} style={{ padding: '7px 10px' }}>{raw ? '整形表示' : '原文表示'}</button>}
        <button onClick={() => onShowInFolder?.(document.path)} style={{ padding: '7px 10px' }}>保存場所</button>
        <button onClick={() => onOpenOriginal?.(document.path)} style={{ padding: '7px 10px' }}>原本を開く</button>
        <button onClick={onClose} aria-label="閉じる" style={{ border: 'none', background: 'transparent', fontSize: '24px', cursor: 'pointer' }}>×</button>
      </header>
      {!!terms.length && <div style={{ padding: '7px 16px', background: '#fff8d8', color: '#6a5200', fontSize: '11px', borderBottom: '1px solid #eadca0' }}>検索語: {terms.join(' / ')}</div>}
      <main ref={bodyRef} style={{ flex: 1, overflow: 'auto', padding: '28px clamp(18px, 6vw, 84px)' }}>
        {document.loading ? <div style={{ textAlign: 'center', color: '#777' }}>原本を読み込み中…</div>
          : document.error ? <div style={{ padding: '14px', color: '#b71c1c', background: '#ffebee', borderRadius: '8px' }}>{document.error}</div>
          : isMarkdown && !raw ? (
            <article className="nexus-markdown-viewer">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.content || ''}</ReactMarkdown>
            </article>
          ) : (
            <pre style={{ margin: '0 auto', maxWidth: '1000px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mincho), serif', fontSize: '15px', lineHeight: 1.9, color: '#242424' }}>{document.content || ''}</pre>
          )}
      </main>
      <style>{`
        .nexus-markdown-viewer { max-width: 1000px; margin: 0 auto; padding: 30px 38px; background: #fff; color: #242424; border: 1px solid #e0e2e6; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.05); font-size: 15px; line-height: 1.8; overflow-wrap: anywhere; }
        .nexus-markdown-viewer h1,.nexus-markdown-viewer h2,.nexus-markdown-viewer h3 { line-height: 1.35; margin: 1.6em 0 .7em; }
        .nexus-markdown-viewer h1 { margin-top: 0; padding-bottom: .3em; border-bottom: 2px solid #d7dce5; }
        .nexus-markdown-viewer h2 { padding-bottom: .25em; border-bottom: 1px solid #e5e7eb; }
        .nexus-markdown-viewer table { display: block; width: max-content; min-width: 100%; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 1em 0; }
        .nexus-markdown-viewer th,.nexus-markdown-viewer td { padding: 7px 10px; border: 1px solid #cfd4dc; text-align: left; vertical-align: top; white-space: pre-wrap; }
        .nexus-markdown-viewer th { position: sticky; top: 0; background: #f3f5f8; }
        .nexus-markdown-viewer blockquote { margin-left: 0; padding: .2em 1em; border-left: 4px solid #b7a3d0; color: #555; background: #faf8fc; }
        .nexus-markdown-viewer code { padding: .12em .35em; border-radius: 4px; background: #f0f1f3; }
        .nexus-markdown-viewer pre { padding: 14px; overflow: auto; border-radius: 7px; background: #22252a; color: #f7f7f7; }
        .nexus-markdown-viewer pre code { padding: 0; background: transparent; }
        .nexus-markdown-viewer img { max-width: 100%; height: auto; }
        .nexus-markdown-viewer a { color: #1565c0; }
      `}</style>
    </div>
  );
};

export default DocumentViewer;
