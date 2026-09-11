import React from 'react';

const ExportPanel = ({
  onFormat,
  onPrint,
  onEpubExport,
  onDocxExport,
  onMergedTextExport,
  onBatchExport,
  mode = 'output',
  colorTheme,
}) => {
  const isDark = colorTheme === 'dark';
  const colors = {
    text: isDark ? '#f4f4f5' : '#242424',
    muted: isDark ? '#a1a1aa' : '#6b7280',
    card: isDark ? 'rgba(255,255,255,0.055)' : '#fff',
    border: isDark ? 'rgba(255,255,255,0.12)' : '#e3e5e8',
    soft: isDark ? 'rgba(142,68,173,0.16)' : '#f7f0fa',
    accent: '#8e44ad',
  };

  const outputActions = [
    { icon: '🧾', title: '結合TXT', description: '分割した全章を、作品の順番どおり1ファイルにまとめます', action: onMergedTextExport, tone: '#8e44ad' },
    { icon: '📄', title: 'Word', description: '応募用の書式を反映した .docx を作成します', action: onDocxExport, tone: '#2563eb' },
    { icon: '🖨️', title: 'PDF・印刷', description: '作品全体を印刷プレビューで確認し、PDF保存または印刷します', action: onPrint || (() => window.print()), tone: '#dc6b2f' },
    { icon: '📚', title: 'EPUB', description: '縦書き対応の電子書籍ファイルを書き出します', action: onEpubExport, tone: '#16836d' },
  ].filter(item => item.action);

  const toolGroups = [
    { title: '小説の基本表記', items: [
      ['ellipsis', '……', '三点リーダーを偶数個へ統一'],
      ['dash', '――', 'ダッシュを偶数個へ統一'],
      ['exclamation-space', '！？', '感嘆符・疑問符の後ろへ空白を追加'],
      ['indent', '字下げ', '会話文を除いて段落先頭を一字下げ'],
    ] },
    { title: '文章の整理', items: [
      ['remove-blank-lines', '空行整理', '連続した空行を圧縮'],
      ['quotes', '引用符', '二重かぎ括弧の表記を統一'],
      ['break-before-dialogue', '会話前改行', '会話文の前を改行'],
      ['double-space-to-newline', '改行変換', '連続スペースを改行へ変換'],
    ] },
    { title: '変換', items: [
      ['fullwidth', '英数字を全角化', '原稿用紙向けに英数字を変換'],
      ['markdown', 'Markdown変換', 'Markdown見出しなどを小説表記へ変換'],
      ['ruby', 'ルビ記法', 'ルビ記法を一括変換'],
    ] },
  ];

  const cardStyle = {
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    background: colors.card,
    color: colors.text,
    boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px', color: colors.text, fontFamily: 'var(--font-gothic)' }}>
      <header style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>{mode === 'output' ? '📤 作品を書き出す' : '🧰 原稿を整える'}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', lineHeight: 1.55, color: colors.muted }}>
          {mode === 'output' ? '執筆中の原稿は変更せず、提出・共有用のファイルを作ります。' : '現在開いている原稿へ処理を適用します。実行後に内容を確認してください。'}
        </div>
      </header>

      {mode === 'output' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
            {outputActions.map(item => (
              <button key={item.title} onClick={item.action} style={{ ...cardStyle, minHeight: '126px', padding: '13px', textAlign: 'left', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', inset: '0 auto 0 0', width: '4px', background: item.tone }} />
                <span style={{ display: 'block', fontSize: '24px', marginBottom: '7px' }}>{item.icon}</span>
                <strong style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>{item.title}</strong>
                <span style={{ display: 'block', fontSize: '10px', lineHeight: 1.5, color: colors.muted }}>{item.description}</span>
              </button>
            ))}
          </div>
          {onBatchExport && (
            <button onClick={onBatchExport} style={{ ...cardStyle, width: '100%', marginTop: '10px', padding: '11px 13px', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ fontSize: '20px' }}>📦</span><span><strong style={{ fontSize: '12px' }}>一括書き出し</strong><span style={{ display: 'block', marginTop: '2px', fontSize: '10px', color: colors.muted }}>複数のファイルをまとめて書き出します</span></span>
            </button>
          )}
          <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: colors.soft, color: isDark ? '#e9d5ff' : '#643076', fontSize: '10px', lineHeight: 1.55 }}>
            分割作品は、manifest.jsonに記録された章順で結合します。章が欠けている場合は不完全な出力を作らず中止します。
          </div>
        </>
      )}

      {mode === 'tools' && toolGroups.map(group => (
        <section key={group.title} style={{ marginBottom: '15px' }}>
          <div style={{ margin: '0 0 7px 2px', fontSize: '10px', fontWeight: 700, color: colors.muted, letterSpacing: '0.06em' }}>{group.title}</div>
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            {group.items.map(([id, title, description], index) => (
              <button key={id} onClick={() => onFormat?.(id)} style={{ width: '100%', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', textAlign: 'left', border: 'none', borderTop: index ? `1px solid ${colors.border}` : 'none', background: 'transparent', color: colors.text, cursor: 'pointer' }}>
                <span><strong style={{ display: 'block', fontSize: '12px' }}>{title}</strong><span style={{ display: 'block', marginTop: '2px', fontSize: '10px', color: colors.muted }}>{description}</span></span>
                <span style={{ color: colors.accent, fontSize: '16px' }}>›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default ExportPanel;
