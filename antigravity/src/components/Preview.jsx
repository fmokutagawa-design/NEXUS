import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { parseRuby } from '../utils/textUtils';
import { preprocessText, composeLines, parseAozoraStructure } from '../utils/typesetting';
import { resolveSubmissionLayout, orientedPageMm } from '../utils/submissionLayout';
import '../styles/Preview.css';

const Preview = ({ text, settings, mode = 'manuscript', onOpenLink, projectHandle, workText, isNexusFile, workTitle, resolveOffset, onOpenSegmentFile, submissionMode = false }) => {
    const submissionLayout = useMemo(() => resolveSubmissionLayout(settings), [settings]);
    // mode: 'manuscript' | 'plain'
    const [showFullWork, setShowFullWork] = useState(false);
    const effectiveShowFullWork = showFullWork || (submissionMode && isNexusFile);

    useEffect(() => {
        const printFullWork = () => {
            if (!isNexusFile) return;
            setShowFullWork(true);
            // 全章表示への再描画とページ組版が反映されてから印刷する。
            requestAnimationFrame(() => requestAnimationFrame(() => {
                document.getElementById('preview-print-button')?.click();
            }));
        };
        window.addEventListener('nexus:print-full-work', printFullWork);
        return () => window.removeEventListener('nexus:print-full-work', printFullWork);
    }, [isNexusFile]);
    const showGrid = settings.showGrid !== false;
  
    // 表示するテキストを決定（コンポーネントレベルで1回だけ、useMemoで最適化）
    const displayText = useMemo(() => {
        if (effectiveShowFullWork && isNexusFile && workText) return workText;
        return text;
    }, [effectiveShowFullWork, isNexusFile, workText, text]);

    const [imageUrls, setImageUrls] = useState({});
    const knownImages = useRef(new Set());

    useEffect(() => {
        if (!projectHandle) return;

        // テキスト内の挿絵記法を全て検出
        const matches = [...displayText.matchAll(/［＃挿絵（(.+?)）入る］/g)];
        if (matches.length === 0) return;

        const loadImages = async () => {
            const urls = {};
            let hasNew = false;
            for (const match of matches) {
                const fileName = match[1];
                if (knownImages.current.has(fileName)) continue; // 既にロード済み
                knownImages.current.add(fileName);
                try {
                    const isElectron = !!window.api;
                    if (isElectron && typeof projectHandle === 'string') {
                        // Electron: file:// URL
                        urls[fileName] = `file://${projectHandle}/images/${fileName}`;
                    } else {
                        // Browser: File System Access API
                        const imagesDir = await projectHandle.getDirectoryHandle('images');
                        const fileHandle = await imagesDir.getFileHandle(fileName);
                        const file = await fileHandle.getFile();
                        urls[fileName] = URL.createObjectURL(file);
                    }
                    hasNew = true;
                } catch (err) {
                    console.warn(`Image not found: ${fileName}`, err);
                }
            }
            if (hasNew) {
                setImageUrls(prev => ({ ...prev, ...urls }));
            }
        };

        loadImages();
    }, [displayText, projectHandle]);

    // クリーンアップ: コンポーネントのアンマウント時に revokeObjectURL を実行
    useEffect(() => {
        return () => {
            Object.values(imageUrls).forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [imageUrls]);

    // Helper to parse text into segments (text, ruby, link)
    const parseContent = (line) => {
        const segments = [];
        const linkRegex = /\[\[(.*?)\]\]/g;
        let lastIndex = 0;
        let match;

        while ((match = linkRegex.exec(line)) !== null) {
            // Add text before link
            if (match.index > lastIndex) {
                segments.push({
                    type: 'text',
                    content: line.substring(lastIndex, match.index)
                });
            }

            // Add link
            segments.push({
                type: 'link',
                target: match[1],
                content: match[1] // Display text (could be alias in future)
            });

            lastIndex = linkRegex.lastIndex;
        }

        // Add remaining text
        if (lastIndex < line.length) {
            segments.push({
                type: 'text',
                content: line.substring(lastIndex)
            });
        }

        return segments;
    };

    // Memoize the heavy Typesetting & Layout Calculation
    // Only re-run if text or layout settings change. Do NOT re-run on showGrid change.
    const { pages, styles, pageSizeClass, orientationClass, paddingStyle, lineGapPx, cellWidthPx, cellHeightPx } = useMemo(() => {
        // Ensure numbers
        const charsPerLine = submissionLayout.charsPerLine;
        const linesPerPage = submissionLayout.linesPerPage;

        // --- Auto-Scale & Distribution Logic ---

        // 1. Determine Page Dimensions (mm)
        const pageDims = orientedPageMm(submissionLayout);
        const pageWidth = pageDims.width;
        const pageHeight = pageDims.height;

        // 2. Define Margins (mm)
        const marginTop = submissionLayout.margins.top;
        const marginBottom = submissionLayout.margins.bottom;
        const marginLeft = submissionLayout.margins.left;
        const marginRight = submissionLayout.margins.right;

        // CSS padding values (creates visual margins on the page)
        const paddingStyle = `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`;

        // Global * { box-sizing: border-box } in index.css means
        // CSS width/height INCLUDE padding. Content area = dims - padding.
        const availWidth = pageWidth - (marginLeft + marginRight);
        const availHeight = pageHeight - (marginTop + marginBottom);

        // 3. Calculate Cell Dimensions (mm)
        // 原稿用紙: ルビ欄（行間）を確保しつつ、ページ全体を埋める

        // LINE direction (width): cells + line gaps must fill availWidth
        // lineGap = cellWidth * 0.5 (ルビ欄は文字幅の半分)
        const lineGapRatio = 0.5;
        const widthDenom = linesPerPage + lineGapRatio * (linesPerPage - 1);
        const cellWidthMm = availWidth / widthDenom;
        const lineGapMm = cellWidthMm * lineGapRatio;

        // CHARACTER direction (height): cells fill availHeight (calculated in px below)

        // 4. Convert to px
        const mmToPx = 3.78;
        const cellWidthPx = cellWidthMm * mmToPx;
        const lineGapPx = lineGapMm * mmToPx;
        // CSS has margin-top: -1px on .manuscript-cell + .manuscript-cell for border collapse.
        // With N cells, that removes (N-1)px from total height. Compensate:
        const borderCollapseTotal = (charsPerLine - 1) * 1;
        const availHeightPx = availHeight * mmToPx;
        const cellHeightPx = (availHeightPx + borderCollapseTotal) / charsPerLine;
        const charGapPx = 0;

        // Font size: 小さい方の辺の75%
        const fontSizePx = Math.min(cellWidthPx, cellHeightPx) * 0.75;

        // --- Typesetting Logic ---
        // 1. Preprocess
        const processedText = preprocessText(displayText);

        // 2. Parse Logical Structure
        const logicalBlocks = parseAozoraStructure(processedText);

        // 3. Typesetting (Compose Lines)
        const allDisplayLines = composeLines(logicalBlocks, charsPerLine);

        // 4. Pagination
        const calculatedPages = [];
        let currentPage = [];

        allDisplayLines.forEach(line => {
            if (line.length > 0 && line[0].type === 'page_break') {
                if (currentPage.length > 0) {
                    calculatedPages.push(currentPage);
                    currentPage = [];
                }
                return;
            }

            currentPage.push(line);
            if (currentPage.length >= linesPerPage) {
                calculatedPages.push(currentPage);
                currentPage = [];
            }
        });
        if (currentPage.length > 0) calculatedPages.push(currentPage);

        return {
            pages: calculatedPages,
            styles: {
                '--preview-font-size': `${fontSizePx}px`,
                '--line-gap': `${lineGapPx}px`,
                '--char-gap': `${charGapPx}px`,
                '--cell-width': `${cellWidthPx}px`,
                '--cell-height': `${cellHeightPx}px`,
                // 後方互換性: cell-size は小さい方を使用
                '--cell-size': `${Math.min(cellWidthPx, cellHeightPx)}px`
            },
            pageSizeClass: `size-${submissionLayout.pageSize}`,
            orientationClass: `orient-${submissionLayout.orientation}`,
            paddingStyle,
            lineGapPx,
            cellWidthPx,
            cellHeightPx
        };
    }, [displayText, submissionLayout]);

    useEffect(() => {
        let secondFrame;
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('nexus:preview-ready', {
                    detail: { pageCount: pages.length, textLength: displayText.length }
                }));
            });
        });
        return () => {
            cancelAnimationFrame(firstFrame);
            if (secondFrame) cancelAnimationFrame(secondFrame);
        };
    }, [pages.length, displayText.length]);

    /**
     * 作品全体表示中のクリック → 該当章ファイルを開く
     */
    const handleWorkClick = useCallback((e) => {
        if (!effectiveShowFullWork || !resolveOffset || !onOpenSegmentFile) return;

        // クリック位置からテキスト内の文字位置を推定する
        const pageEl = e.target.closest('.manuscript-page');
        if (!pageEl) return;

        const pageIndex = Array.from(document.querySelectorAll('.manuscript-page')).indexOf(pageEl);
        if (pageIndex < 0) return;

        const charsPerPage = (Number(settings.charsPerLine) || 20) * (Number(settings.linesPerPage) || 20);
        const estimatedOffset = pageIndex * charsPerPage;

        const resolved = resolveOffset(estimatedOffset);
        if (resolved) {
            onOpenSegmentFile(resolved.file, resolved.localOffset);
        }
    }, [effectiveShowFullWork, resolveOffset, onOpenSegmentFile, settings.charsPerLine, settings.linesPerPage, displayText]);

    /**
     * Plain モードでの行クリック
     */
    const handlePlainLineClick = useCallback((lineIndex) => {
        if (!effectiveShowFullWork || !resolveOffset || !onOpenSegmentFile) return;

        const lines = displayText.split('\n');
        let offset = 0;
        for (let i = 0; i < lineIndex && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for \n
        }

        const resolved = resolveOffset(offset);
        if (resolved) {
            onOpenSegmentFile(resolved.file, resolved.localOffset);
        }
    }, [effectiveShowFullWork, resolveOffset, onOpenSegmentFile, displayText]);

    // Render logic continues below...
    const renderManuscript = () => {
        // Helper to render content
        const renderTokenContent = (token) => {
            if (token.type === 'tcy') return <span className="tcy-digits">{token.content}</span>;
            if (token.type === 'ruby') {
                const isLong = token.ruby.length > token.base.length * 2;
                return <ruby>{token.base}<rt className={isLong ? 'long-ruby' : ''}>{token.ruby}</rt></ruby>;
            }
            if (token.linkTarget) {
                const color = settings.previewSyntaxColors ? (settings.syntaxColors?.link || '#2196f3') : 'inherit';
                return (
                    <span
                        className="wiki-link"
                        onClick={() => onOpenLink && onOpenLink(token.linkTarget)}
                        style={{ color }}
                    >
                        {token.char}
                    </span>
                );
            }
            // Dash block tokens: render as a continuous CSS line instead of characters
            if (token.type === 'text' && token.block && /^[—―ー]+$/.test(token.content)) {
                return (
                    <div style={{
                        width: '1.5px',
                        height: '100%',
                        backgroundColor: 'currentColor',
                        margin: '0 auto',
                    }} />
                );
            }
            return token.char || token.content;
        };

        return (
            <div
                className={`manuscript-wrapper ${showGrid ? '' : 'no-grid'}`}
                style={{ ...styles, cursor: effectiveShowFullWork ? 'pointer' : undefined }}
                onClick={effectiveShowFullWork ? handleWorkClick : undefined}
            >
                {pages.map((page, pIndex) => (
                    <div key={pIndex}
                        className={`manuscript-page ${pageSizeClass} ${orientationClass}`}
                        style={{
                            padding: paddingStyle,
                            gap: `${lineGapPx}px`, // Direct gap binding
                            alignItems: 'flex-start' // Align content to top (start) to ensure grid alignment
                        }}>
                        {/* Page Number */}
                        <div className="page-number">{pIndex + 1}</div>

                        {page.map((line, lIndex) => {
                            let currentLen = 0;

                            line.forEach(token => {
                                if (token.type === 'ruby') currentLen += Math.max(token.base.length, 1);
                                else if (token.type === 'tcy') currentLen += 1;
                                else if (token.type === 'spacer') currentLen += token.length;
                                else if (token.type === 'text' && token.block) currentLen += token.length;
                                else currentLen += 1;
                            });

                            const emptyCount = Math.max(0, (settings.charsPerLine || 20) - currentLen);

                            const showLineNumbers = settings.showLineNumbers !== false;

                            return (
                                <div key={lIndex} className="manuscript-line" style={{ gap: 'var(--char-gap)', position: 'relative', width: `${cellWidthPx}px` }}>
                                    {/* Line Number Indicator */}
                                    {showLineNumbers && (
                                        <div className="line-number-indicator" style={{
                                            position: 'absolute',
                                            top: '-16px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            fontSize: '0.6rem',
                                            color: '#999',
                                            textAlign: 'center',
                                            pointerEvents: 'none',
                                            // 行番号は常に横書き表示
                                            writingMode: 'horizontal-tb',
                                            textOrientation: 'mixed',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {lIndex + 1}
                                        </div>
                                    )}
                                    {(() => {
                                        let cumulativeLen = 0;
                                        return line.map((token, cIndex) => {
                                            let span = 1;
                                            if (token.type === 'ruby') span = Math.max(token.base.length, 1);
                                            else if (token.type === 'spacer') span = token.length;
                                            else if (token.type === 'text' && token.block) span = token.length;

                                            const borderOverlapPx = 1;
                                            const spanSize = span > 1 ? (cellHeightPx * span) - (borderOverlapPx * (span - 1)) : cellHeightPx;

                                            // Determine extra classes
                                            const classes = [
                                                'manuscript-cell',
                                                token.linkTarget ? 'is-link' : '',
                                                token.type === 'ruby' ? 'has-ruby' : '',
                                                token.type === 'spacer' ? 'is-spacer' : '',
                                                token.isHeader ? 'is-header' : '',
                                                token.heading === 'large' ? 'is-heading-large' : '',
                                                token.heading === 'medium' ? 'is-heading-medium' : '',
                                                // Identify hanging (overflow)
                                                (cumulativeLen >= (settings.charsPerLine || 20)) ? 'is-hanging' : ''
                                            ].filter(Boolean).join(' ');

                                            // Basic Syntax Colors
                                            const syntaxColors = settings.syntaxColors || {};
                                            let customStyle = {};

                                            // Apply colors only if enabled
                                            if (settings.previewSyntaxColors) {
                                                if (token.type === 'ruby') {
                                                    customStyle.color = syntaxColors.ruby;
                                                } else if (token.linkTarget) {
                                                    customStyle.color = syntaxColors.link;
                                                } else if (token.type === 'text') {
                                                    // Conversation logic placeholder if needed
                                                }
                                                // 着色オン時のみ bold を適用
                                                if (token.isBold) {
                                                    customStyle.fontWeight = 'bold';
                                                }
                                            } else {
                                                // Default Styles if Disabled (ensure no partial styling)
                                                if (token.type === 'ruby') {
                                                    // Keep ruby specific layout needs if any, but reset color
                                                }
                                            }

                                            if (token.fontFamily) {
                                                customStyle.fontFamily = token.fontFamily;
                                            }

                                            // Update len for next iteration
                                            const tokenLen = token.type === 'ruby' ? Math.max(token.base.length, 1) :
                                                token.type === 'tcy' ? 1 :
                                                    token.type === 'spacer' ? token.length :
                                                        (token.type === 'text' && token.block) ? token.length : 1;
                                            cumulativeLen += tokenLen;

                                            return (
                                                <div
                                                    key={cIndex}
                                                    className={classes}
                                                    style={{
                                                        cursor: token.linkTarget ? 'pointer' : 'default',
                                                        width: `${cellWidthPx}px`,
                                                        height: `${spanSize}px`,
                                                        justifyContent: token.type === 'tcy' ? 'center' : undefined,
                                                        fontSize: 'inherit',
                                                        fontWeight: (token.isHeader || token.heading) ? 'bold' : 'normal',
                                                        ...customStyle
                                                    }}
                                                    title={token.linkTarget ? `${token.linkTarget} を開く` : undefined}
                                                >
                                                    {token.type === 'ruby' ? (
                                                        <>
                                                            {/* Base Text */}
                                                            {[...token.base].map((c, i) => (
                                                                <div key={i} className="ruby-base-char">{c}</div>
                                                            ))}
                                                            {/* Ruby Text (Justified) */}
                                                            <div className={`ruby-text ${token.ruby.length > token.base.length * 2 ? 'long-ruby' : ''}`}>
                                                                {token.ruby.split('').map((c, i) => (
                                                                    <span key={i} style={{ display: 'block' }}>{c}</span>
                                                                ))}
                                                            </div>
                                                        </>
                                                    ) : renderTokenContent(token)}
                                                </div>
                                            );
                                        })
                                    })()
                                    }
                                    {/* Empty Cells */}
                                    {Array.from({ length: emptyCount }).map((_, i) => (
                                        <div key={`empty-${i}`} className="manuscript-cell" style={{
                                            width: `${cellWidthPx}px`,
                                            height: `${cellHeightPx}px`
                                        }} />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    };

    const renderPlain = () => {
        return (
            <div className="plain-content">
                {displayText.split('\n').map((line, i) => {
                    // 挿絵記法の検出
                    const illustMatch = line.match(/［＃挿絵（(.+?)）入る］/);
                    if (illustMatch) {
                        const fileName = illustMatch[1];
                        return (
                            <div key={i} className="illustration-container" style={{
                                textAlign: 'center',
                                margin: '1em 0',
                                writingMode: 'horizontal-tb',
                            }}>
                                {imageUrls[fileName] ? (
                                    <img
                                        src={imageUrls[fileName]}
                                        alt={fileName}
                                        style={{ maxWidth: '100%', maxHeight: '80vh' }}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                ) : (
                                    <div style={{ padding: '2em', border: '1px dashed #ccc', color: '#999' }}>
                                        Image loading: {fileName}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    const segments = parseContent(line);
                    return (
                        <p
                            key={i}
                            style={{
                                fontFamily: settings.fontFamily,
                                lineHeight: '1.8',
                                cursor: effectiveShowFullWork ? 'pointer' : undefined
                            }}
                            onClick={() => effectiveShowFullWork && handlePlainLineClick(i)}
                        >
                            {segments.map((segment, j) => {
                                if (segment.type === 'link') {
                                    return (
                                        <span
                                            key={j}
                                            className="wiki-link"
                                            onClick={() => onOpenLink && onOpenLink(segment.target)}
                                            title={`${segment.target} を開く`}
                                        >
                                            {segment.content}
                                        </span>
                                    );
                                } else {
                                    // Handle Ruby in text segments
                                    return <span key={j}>{parseRuby(segment.content)}</span>;
                                }
                            })}
                        </p>
                    );
                })}
            </div>
        );
    };

    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            // Map vertical wheel to horizontal scroll for Manuscript mode
            if (mode === 'manuscript' && !e.shiftKey) {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.preventDefault();
                    container.scrollLeft -= e.deltaY;
                }
            }
        };

        // Attach non-passive listener to allow preventDefault
        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [mode]);

    return (
        <div
            ref={containerRef}
            className={`preview-container mode-${mode} ${settings.showGrid === false ? 'hide-grid' : ''}`}
            style={{
                fontFamily: settings.fontFamily,
                '--chars-per-line': settings.charsPerLine || 20,
                '--lines-per-page': settings.linesPerPage || 20,
                '--preview-font-size': settings.fontSize || '20px',
                flex: 1,
                overflow: 'auto',
                height: '100%',
                position: 'relative'
            }}
        >
            {/* Toolbar */}
            <div className="preview-toolbar no-print" style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: 100,
                background: 'rgba(255, 255, 255, 0.95)',
                padding: '8px 16px',
                borderRadius: '24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontFamily: '"Noto Sans JP", sans-serif',
                border: '1px solid #ddd'
            }}>
                {isNexusFile && (
                    <button
                        onClick={() => setShowFullWork(v => !v)}
                        style={{
                            padding: '4px 12px',
                            fontSize: '0.85rem',
                            background: effectiveShowFullWork ? '#4a9eff' : '#f0f0f0',
                            color: effectiveShowFullWork ? '#fff' : '#333',
                            border: '1px solid #ccc',
                            borderRadius: '16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                        title={effectiveShowFullWork ? '現在の章のみ表示' : '作品全体を表示'}
                    >
                        {effectiveShowFullWork ? `📖 全体表示中${workTitle ? ` (${workTitle})` : ''}` : '📖 作品全体'}
                    </button>
                )}
                <button
                    id="preview-print-button"
                    onClick={() => {
                        const firstPage = document.querySelector('.manuscript-page');
                        if (!firstPage) { window.print(); return; }

                        const linesPerPage = submissionLayout.linesPerPage;
                        const charsPerLine = submissionLayout.charsPerLine;

                        const mmToPx = 96 / 25.4;
                        const pageDims = orientedPageMm(submissionLayout);
                        const paperW = pageDims.width * mmToPx;
                        const paperH = pageDims.height * mmToPx;
                        const margin = submissionLayout.margins;
                        const contentW = paperW - (margin.left + margin.right) * mmToPx;
                        const contentH = paperH - (margin.top + margin.bottom) * mmToPx;
                        const lineGapRatio = 0.5;
                        const cellW = contentW / (linesPerPage + lineGapRatio * (linesPerPage - 1));
                        const lineGap = cellW * lineGapRatio;
                        const cellH = contentH / charsPerLine;
                        const fontSize = Math.min(cellW, cellH) * 0.7;

                        // 全要素のインラインスタイルを退避
                        const savedAll = [];
                        document.querySelectorAll(
                            '.manuscript-wrapper, .manuscript-page, .manuscript-line, .manuscript-cell, .ruby-base-char'
                        ).forEach(el => {
                            savedAll.push({ el, style: el.getAttribute('style') });
                        });

                        // --- 直接DOMスタイルを書き換え（@media printに頼らない） ---
                        const wrapper = document.querySelector('.manuscript-wrapper');
                        wrapper.style.cssText = 'display:block!important;writing-mode:horizontal-tb!important;direction:ltr!important;padding:0!important;margin:0!important;width:auto!important;min-width:unset!important;';

                        const allPages = document.querySelectorAll('.manuscript-page');
                        allPages.forEach((page, idx) => {
                            const isLast = idx === allPages.length - 1;
                            page.style.cssText = `
                                writing-mode:vertical-rl!important;
                                text-orientation:upright!important;
                                width:${paperW}px!important;
                                height:${paperH}px!important;
                                padding:${margin.top * mmToPx}px ${margin.right * mmToPx}px ${margin.bottom * mmToPx}px ${margin.left * mmToPx}px!important;
                                margin:0!important;
                                box-shadow:none!important;
                                border:none!important;
                                background:white!important;
                                overflow:hidden!important;
                                page-break-after:${isLast ? 'auto' : 'always'}!important;
                                break-after:${isLast ? 'auto' : 'page'}!important;
                                page-break-inside:avoid!important;
                                break-inside:avoid!important;
                                min-height:unset!important;
                                max-height:unset!important;
                                box-sizing:border-box!important;
                                display:flex!important;
                                flex-direction:column!important;
                                align-items:flex-start!important;
                                gap:${lineGap}px!important;
                                flex-shrink:0!important;
                            `;
                        });

                        document.querySelectorAll('.manuscript-line').forEach(line => {
                            line.style.cssText = `display:flex!important;flex-direction:row!important;gap:0!important;width:${cellW}px!important;flex-shrink:0!important;position:relative!important;`;
                        });

                        document.querySelectorAll('.manuscript-cell').forEach(cell => {
                            // has-ruby と is-hanging はボーダーなし
                            const noB = cell.classList.contains('has-ruby') || cell.classList.contains('is-hanging');
                            cell.style.cssText = `
                                width:${cellW}px!important;
                                height:${cellH}px!important;
                                flex-shrink:0!important;
                                font-size:${fontSize}px!important;
                                display:flex!important;
                                align-items:center!important;
                                justify-content:center!important;
                                border:${noB ? 'none' : '1px solid rgba(184,134,11,0.3)'}!important;
                                box-sizing:border-box!important;
                                line-height:1!important;
                                position:relative!important;
                                overflow:visible!important;
                            `;
                        });

                        document.querySelectorAll('.ruby-base-char').forEach(rb => {
                            rb.style.cssText = `
                                width:${cellW}px!important;
                                height:${cellH}px!important;
                                flex-shrink:0!important;
                                display:flex!important;
                                align-items:center!important;
                                justify-content:center!important;
                                border:1px solid rgba(184,134,11,0.3)!important;
                                box-sizing:border-box!important;
                                line-height:1!important;
                            `;
                        });

                        // @page と非表示要素用のスタイルシートだけ注入
                        const styleEl = document.createElement('style');
                        styleEl.id = 'dynamic-print-style';
                        styleEl.textContent = `
                            @page { margin: 0; size: ${submissionLayout.pageSize} ${submissionLayout.orientation}; }
                            @media print {
                                .sidebar, .editor-pane, .tab-nav-bottom, .toolbar,
                                .editor-toolbar-overlay, .no-print, .line-number-indicator,
                                .preview-toolbar { display: none !important; }
                                body, html, #root {
                                    margin:0!important; padding:0!important;
                                    background:white!important; overflow:visible!important;
                                }
                                .app-container, .content-wrapper, .main-content,
                                .editor-container, .split-pane, .pane.preview-pane {
                                    display:block!important; width:auto!important;
                                    height:auto!important; margin:0!important;
                                    padding:0!important; overflow:visible!important;
                                }
                                .preview-container {
                                    display:block!important; padding:0!important;
                                    background:white!important; overflow:visible!important;
                                    width:auto!important; height:auto!important;
                                    direction:ltr!important;
                                }
                            }
                        `;
                        document.head.appendChild(styleEl);

                        // レイアウト再計算を強制してから印刷
                        document.body.offsetHeight; // force reflow
                        requestAnimationFrame(() => {
                            window.print();

                            // 印刷後: 復元
                            const injected = document.getElementById('dynamic-print-style');
                            if (injected) injected.remove();
                            savedAll.forEach(({ el, style }) => {
                                if (style) el.setAttribute('style', style);
                                else el.removeAttribute('style');
                            });
                        });
                    }}
                    style={{
                        padding: '4px 12px',
                        fontSize: '0.85rem',
                        background: '#f0f0f0', // Slight grey for button
                        border: '1px solid #ccc',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                    title="印刷 (Cmd+P) / PDF保存"
                >
                    🖨️ 印刷
                </button>
            </div>

            {mode === 'manuscript' ? renderManuscript() : renderPlain()}
        </div>
    );
};

export default Preview;
