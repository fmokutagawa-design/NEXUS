// components/ReaderView.jsx
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { parseBlocks, renderInline } from '../utils/readerParser';
import './ReaderView.css';

const FONT_OPTIONS = [
    { label: '明朝', value: 'var(--font-mincho)' },
    { label: 'ゴシック', value: 'var(--font-gothic)' },
    { label: 'ヒラギノ明朝', value: "'Hiragino Mincho ProN', serif" },
    { label: '游明朝', value: "'YuMincho', 'Yu Mincho', serif" },
    { label: 'Noto Serif', value: "'Noto Serif JP', serif" },
    { label: 'クレー', value: "'Klee One', cursive" },
];

const RUBY_FONT_OPTIONS = [
    { label: 'ルビ: 本文と同じ', value: 'inherit' },
    ...FONT_OPTIONS
];

const SIZE_OPTIONS = [14, 16, 18, 20, 22, 24, 28, 32];

const ReaderView = ({ text, settings, onClose, cursorOffset = 0, onJumpToEditor, workText, isNexusFile, workTitle, resolveOffset, onOpenSegmentFile, chapterStatuses = [], loadFailures = [], onEditFromReader, onRequestReplace, initialFullWork = false }) => {
    const containerRef = useRef(null);
    const searchInputRef = useRef(null);
    const [showTOC, setShowTOC] = useState(false);
    const [showToolbar, setShowToolbar] = useState(true);
    const [showFullWork, setShowFullWork] = useState(initialFullWork);
    const [pendingTocIndex, setPendingTocIndex] = useState(null);
    const wheelDeltaRef = useRef(0);
    const wheelFrameRef = useRef(null);

    // リーダー独自の表示設定（親の settings を初期値に使う）
    const [readerFont, setReaderFont] = useState(settings.fontFamily || 'var(--font-mincho)');
    const [readerRubyFont, setReaderRubyFont] = useState(settings.rubyFontFamily || 'inherit');
    const [readerSize, setReaderSize] = useState(settings.fontSize || 18);
    const [readerVertical, setReaderVertical] = useState(settings.isVertical ?? true);
    const [readerTheme, setReaderTheme] = useState(settings.colorTheme || 'light');
    const [systemFontOptions, setSystemFontOptions] = useState([]);

    // 閲覧画面でもエディタと同じインストール済みフォントを選べるようにする。
    useEffect(() => {
        let active = true;
        window.api?.system?.getFonts?.().then(groups => {
            if (!active || !Array.isArray(groups)) return;
            const seen = new Set(FONT_OPTIONS.map(f => f.value));
            const options = [];
            groups.forEach(group => (group.fonts || []).forEach(font => {
                const value = font.ps || group.family;
                if (!value || seen.has(value)) return;
                seen.add(value);
                options.push({ label: font.weight && font.weight !== 'Regular' ? `${group.family} (${font.weight})` : group.family, value });
            }));
            setSystemFontOptions(options);
        }).catch(error => console.warn('[ReaderView] font loading failed:', error));
        return () => { active = false; };
    }, []);

    useEffect(() => { setReaderFont(settings.fontFamily || 'var(--font-mincho)'); }, [settings.fontFamily]);
    useEffect(() => { setReaderRubyFont(settings.rubyFontFamily || 'inherit'); }, [settings.rubyFontFamily]);

    const readerFontOptions = useMemo(() => {
        const all = [...FONT_OPTIONS, ...systemFontOptions];
        if (readerFont && !all.some(f => f.value === readerFont)) {
            all.unshift({ label: readerFont, value: readerFont });
        }
        return all;
    }, [systemFontOptions, readerFont]);

    // 検索
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResultIndex, setSearchResultIndex] = useState(-1);
    const [readerSearchScope, setReaderSearchScope] = useState('current');

    // ブロック解析
    const displayText = (showFullWork && isNexusFile && workText) ? workText : text;
    const blocks = useMemo(() => parseBlocks(displayText), [displayText]);
    const workBlocks = useMemo(
        () => (isNexusFile && workText ? parseBlocks(workText) : blocks),
        [isNexusFile, workText, blocks]
    );

    const searchBlocks = readerSearchScope === 'work' && isNexusFile && workText ? workBlocks : blocks;

    // 分割作品では、現在章だけを表示中でも作品全体から目次を作る。
    const toc = useMemo(() => {
        return workBlocks
            .map((b, i) => ({ ...b, index: i }))
            .filter(b => b.isHeader)
            .map(entry => {
                const resolved = isNexusFile && resolveOffset
                    ? resolveOffset(entry.textOffset ?? 0)
                    : null;
                return { ...entry, segmentName: resolved?.displayName || resolved?.file || '' };
            });
    }, [workBlocks, isNexusFile, resolveOffset]);

    // 検索結果（ブロックインデックス配列）
    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        const lower = searchTerm.toLowerCase();
        return searchBlocks.reduce((acc, b, i) => {
            if (b.content && b.content.toLowerCase().includes(lower)) acc.push(i);
            return acc;
        }, []);
    }, [searchBlocks, searchTerm]);

    // 章ジャンプ
    const jumpToChapter = useCallback((index) => {
        const container = containerRef.current;
        const el = container?.querySelector(`#reader-block-${index}`);
        if (!container || !el) return false;

        const containerRect = container.getBoundingClientRect();
        const targetRect = el.getBoundingClientRect();
        if (readerVertical) {
            const deltaX = targetRect.right - (containerRect.right - 32);
            container.scrollTo({ left: container.scrollLeft + deltaX, behavior: 'smooth' });
        } else {
            const deltaY = targetRect.top - (containerRect.top + 32);
            container.scrollTo({ top: container.scrollTop + deltaY, behavior: 'smooth' });
        }
        setShowTOC(false);
        return true;
    }, [readerVertical]);

    const navigateToWorkBlock = useCallback((index) => {
        if (isNexusFile && workText && !showFullWork) {
            setPendingTocIndex(index);
            setShowFullWork(true);
            setShowTOC(false);
            return;
        }
        jumpToChapter(index);
    }, [isNexusFile, workText, showFullWork, jumpToChapter]);

    const jumpFromToc = useCallback((entry) => {
        navigateToWorkBlock(entry.index);
    }, [navigateToWorkBlock]);

    useEffect(() => {
        if (!showFullWork || pendingTocIndex == null) return;
        const frame = requestAnimationFrame(() => {
            jumpToChapter(pendingTocIndex);
            setPendingTocIndex(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [showFullWork, pendingTocIndex, blocks, jumpToChapter]);

    // 初回マウント時：cursorOffset に最も近いブロックにスクロール
    useEffect(() => {
        if (!blocks.length) return;
        // cursorOffset に最も近い（超えない最大の textOffset を持つ）ブロックを探す
        let closestIdx = 0;
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i].textOffset != null && blocks[i].textOffset <= cursorOffset) {
                closestIdx = i;
            }
        }
        // 少し遅延させてDOMが揃ってからスクロール
        const timer = setTimeout(() => jumpToChapter(closestIdx), 100);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 初回のみ

    // 縦書き時ホイール変換
    useEffect(() => {
        const el = containerRef.current;
        if (!el || !readerVertical) return;
        const handler = (e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                wheelDeltaRef.current += e.deltaY;
                if (wheelFrameRef.current != null) return;
                wheelFrameRef.current = requestAnimationFrame(() => {
                    const delta = wheelDeltaRef.current;
                    wheelDeltaRef.current = 0;
                    wheelFrameRef.current = null;
                    el.scrollBy({ left: -delta, behavior: 'auto' });
                });
            }
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => {
            el.removeEventListener('wheel', handler);
            if (wheelFrameRef.current != null) cancelAnimationFrame(wheelFrameRef.current);
            wheelFrameRef.current = null;
            wheelDeltaRef.current = 0;
        };
    }, [readerVertical]);

    // エディタから Cmd/Ctrl+F を受けたときは、リーダー内検索へフォーカスする。
    useEffect(() => {
        const focusSearch = () => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
        };
        window.addEventListener('nexus-reader-focus-search', focusSearch);
        return () => window.removeEventListener('nexus-reader-focus-search', focusSearch);
    }, []);

    // ツールバー自動非表示（3秒操作なしで隠す）
    const hideTimerRef = useRef(null);
    const handleMouseMove = useCallback(() => {
        setShowToolbar(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setShowToolbar(false), 3000);
    }, []);

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, []);

    // Escキーで閉じる
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // 検索ナビゲーション
    const searchPrev = useCallback(() => {
        if (!searchResults.length) return;
        const idx = searchResultIndex < 0
            ? searchResults.length - 1
            : (searchResultIndex - 1 + searchResults.length) % searchResults.length;
        setSearchResultIndex(idx);
        if (readerSearchScope === 'work') navigateToWorkBlock(searchResults[idx]);
        else jumpToChapter(searchResults[idx]);
    }, [searchResults, searchResultIndex, navigateToWorkBlock, readerSearchScope, jumpToChapter]);

    const searchNext = useCallback(() => {
        if (!searchResults.length) return;
        const idx = (searchResultIndex + 1) % searchResults.length;
        setSearchResultIndex(idx);
        if (readerSearchScope === 'work') navigateToWorkBlock(searchResults[idx]);
        else jumpToChapter(searchResults[idx]);
    }, [searchResults, searchResultIndex, navigateToWorkBlock, readerSearchScope, jumpToChapter]);

    return (
        <div
            className={`reader-overlay theme-${readerTheme}`}
            onMouseMove={handleMouseMove}
        >
            {/* ===== ツールバー ===== */}
            <div className={`reader-toolbar ${showToolbar ? 'visible' : 'hidden'}`}>
                <div className="reader-toolbar-left">
                    {toc.length > 0 && (
                        <button
                            className="reader-btn"
                            onClick={() => setShowTOC(!showTOC)}
                        >
                            ☰ 目次
                        </button>
                    )}
                    {/* 検索バー */}
                    <div className="reader-search-bar">
                        <input
                            ref={searchInputRef}
                            type="text"
                            className="reader-search-input"
                            placeholder="検索..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setSearchResultIndex(-1); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (e.shiftKey) searchPrev();
                                    else searchNext();
                                }
                            }}
                        />
                        {searchResults.length > 0 && (
                            <span className="reader-search-count">
                                {searchResultIndex >= 0 ? searchResultIndex + 1 : 0}/{searchResults.length}
                            </span>
                        )}
                        <button className="reader-btn" onClick={searchPrev} disabled={!searchResults.length}>↑</button>
                        <button className="reader-btn" onClick={searchNext} disabled={!searchResults.length}>↓</button>
                        {isNexusFile && workText && (
                            <button className="reader-btn" onClick={() => { setReaderSearchScope(scope => { const next = scope === 'current' ? 'work' : 'current'; setShowFullWork(next === 'work'); return next; }); setSearchResultIndex(-1); }} title="検索範囲を切り替え">
                                {readerSearchScope === 'work' ? '作品全体' : '現在章'}
                            </button>
                        )}
                        {searchTerm && onRequestReplace && (
                            <button className="reader-btn" onClick={() => onRequestReplace(searchTerm)} title="編集画面で検索・置換を開く">編集で置換</button>
                        )}
                    </div>
                </div>

                <div className="reader-toolbar-center">
                    <select
                        className="reader-select"
                        value={readerFont}
                        onChange={(e) => setReaderFont(e.target.value)}
                    >
                        {readerFontOptions.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                    </select>

                    <select
                        className="reader-select"
                        value={readerRubyFont}
                        onChange={(e) => setReaderRubyFont(e.target.value)}
                        title="ルビのフォント"
                    >
                        {RUBY_FONT_OPTIONS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                    </select>

                    <select
                        className="reader-select"
                        value={readerSize}
                        onChange={(e) => setReaderSize(Number(e.target.value))}
                    >
                        {SIZE_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}px</option>
                        ))}
                    </select>

                    <button
                        className="reader-btn"
                        onClick={() => setReaderVertical(v => !v)}
                    >
                        {readerVertical ? '横書き' : '縦書き'}
                    </button>

                    <button
                        className="reader-btn"
                        onClick={() => {
                            const themes = ['light', 'dark', 'sakura'];
                            const idx = themes.indexOf(readerTheme);
                            setReaderTheme(themes[(idx + 1) % themes.length]);
                        }}
                    >
                        {readerTheme === 'light' ? '☀ ライト' : readerTheme === 'dark' ? '🌙 ダーク' : '🌸 桜'}
                    </button>
                </div>

                <div className="reader-toolbar-right">
                    {isNexusFile && (
                        <button
                            onClick={() => setShowFullWork(v => !v)}
                            className="reader-btn"
                            style={{
                                background: showFullWork ? 'var(--accent-color, #4a9eff)' : 'transparent',
                                color: showFullWork ? '#fff' : 'inherit',
                                borderRadius: '16px',
                                padding: '4px 12px',
                            }}
                            title={showFullWork ? '現在の章のみ表示' : '作品全体を表示'}
                        >
                            {showFullWork ? `📖 全体${workTitle ? ` (${workTitle})` : ''}` : '📖 全体'}
                        </button>
                    )}
                    <button className="reader-btn reader-btn-close" onClick={onClose}>
                        ✕ 閉じる
                    </button>
                </div>
            </div>

            {loadFailures.length > 0 && (
                <div style={{ position: 'fixed', top: '58px', left: '50%', transform: 'translateX(-50%)', zIndex: 1003, maxWidth: '80vw', padding: '9px 14px', borderRadius: '8px', background: '#fff0f0', border: '1px solid #c0392b', color: '#8e2418', boxShadow: '0 3px 12px rgba(0,0,0,.18)' }}>
                    読み込めない章があります：{loadFailures.map(item => item.file).join('、')}
                </div>
            )}

            {/* ===== 目次パネル ===== */}
            {showTOC && (
                <div className="reader-toc-panel">
                    <div className="reader-toc-title">目次</div>
                    {chapterStatuses.length > 0 && (
                        <div style={{ marginBottom: '8px', paddingBottom: '7px', borderBottom: '1px solid rgba(0,0,0,.12)', fontSize: '10px', lineHeight: 1.5 }}>
                            {chapterStatuses.map(chapter => (
                                <div key={chapter.id} title={chapter.file} style={{ color: chapter.status === 'loaded' ? 'inherit' : '#c0392b' }}>
                                    {chapter.status === 'loaded' ? '✓' : chapter.status === 'loading' ? '…' : '⚠'} {chapter.displayName || chapter.file} — {chapter.characters.toLocaleString()}字
                                </div>
                            ))}
                        </div>
                    )}
                    {toc.map((entry, i) => (
                        <div
                            key={i}
                            className={`reader-toc-item level-${entry.heading}`}
                            onClick={() => jumpFromToc(entry)}
                            title={entry.segmentName ? `${entry.segmentName} — ${entry.content}` : entry.content}
                        >
                            {entry.segmentName && (
                                <span className="reader-toc-segment">{entry.segmentName}</span>
                            )}
                            <span>{entry.content}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ===== 本文 ===== */}
            <div
                ref={containerRef}
                className={`reader-container ${readerVertical ? 'vertical' : 'horizontal'}`}
                style={{
                    writingMode: readerVertical ? 'vertical-rl' : 'horizontal-tb',
                    fontFamily: `${readerFont}, serif`,
                    fontSize: `${readerSize}px`,
                    '--reader-ruby-font': readerRubyFont,
                }}
            >
                <div className="reader-body">
                    {blocks.map((block, i) => {
                        if (block.type === 'break') {
                            return <hr key={i} className="reader-break" />;
                        }

                        const Tag = block.heading === 'large' || block.heading === 'chapter' ? 'h2'
                                  : block.heading === 'medium' ? 'h3'
                                  : block.heading === 'small' ? 'h4'
                                  : 'p';

                        const style = {};
                        if (block.indent) {
                            style.paddingInlineStart = `${block.indent}em`;
                        }
                        if (block.font) {
                            style.fontFamily = block.font;
                        }
                        if (block.align === 'center') {
                            style.textAlign = 'center';
                        }

                        const isSearchHit = searchTerm && searchResults.includes(i);
                        const content = block.content || '\u00A0';

                        return (
                            <Tag
                                key={i}
                                id={`reader-block-${i}`}
                                className={`reader-paragraph ${block.isHeader ? 'reader-heading' : ''} ${isSearchHit ? 'reader-search-hit' : ''}`}
                                style={{
                                    ...style,
                                    cursor: (onJumpToEditor || (showFullWork && onOpenSegmentFile)) ? 'pointer' : undefined,
                                }}
                                title={(onJumpToEditor || (showFullWork && onOpenSegmentFile)) ? 'ダブルクリックでこの位置を編集' : undefined}
                                onDoubleClick={() => {
                                    if (showFullWork && resolveOffset && onOpenSegmentFile) {
                                        // 作品全体表示中: 該当章ファイルを開く
                                        const resolved = resolveOffset(block.textOffset ?? 0);
                                        if (resolved) {
                                            if (onEditFromReader) onEditFromReader(resolved, block.textOffset ?? 0);
                                            else onOpenSegmentFile(resolved.file, resolved.localOffset, resolved.nexusPath);
                                            onClose(); // リーダーを閉じる
                                        }
                                    } else if (onJumpToEditor) {
                                        // 通常表示: 従来の Editor ジャンプ
                                        onJumpToEditor(block.textOffset ?? 0);
                                    }
                                }}
                            >
                                {renderInline(content)}
                            </Tag>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ReaderView;
