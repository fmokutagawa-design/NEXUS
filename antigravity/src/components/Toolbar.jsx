import React, { useState, useEffect } from 'react';

// Reuseable Toggle Switch Component for consistency
const Toggle = ({ active, onClick, label }) => (
    <div className="control-item" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ margin: 0, fontSize: '11px' }}>{label}</label>
        <div
            className={`toggle-switch ${active ? 'active' : ''}`}
            onClick={onClick}
            style={{
                width: '30px', height: '16px', background: active ? '#8e44ad' : '#ccc',
                borderRadius: '8px', cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
            }}
        >
            <div style={{
                position: 'absolute', top: '2px', left: active ? '16px' : '2px',
                width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s'
            }} />
        </div>
    </div>
);

const Toolbar = ({
    settings, setSettings, presets = [], onSavePreset, onLoadPreset, onDeletePreset,
    isDarkMode, setIsDarkMode, showMetadata, setShowMetadata,
    // AI Props
    aiModel, setAiModel, localModels = [], selectedLocalModel, setSelectedLocalModel, isLocalConnected, checkLocalConnection
}) => {

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const [systemFonts, setSystemFonts] = useState([]);
    const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
    const [fontSearch, setFontSearch] = useState('');
    const [isLoadingFonts, setIsLoadingFonts] = useState(false);
    const [visibleCount, setVisibleCount] = useState(40);
    const [lastScrollTop, setLastScrollTop] = useState(0); // スクロール位置の記憶
    const [fontTarget, setFontTarget] = useState('fontFamily'); // 'fontFamily' or 'rubyFontFamily'
    const [fontMenuPosition, setFontMenuPosition] = useState({ top: 8, left: 8, width: 320 });

    const openFontMenu = (target, event) => {
        if (isFontMenuOpen && fontTarget === target) {
            setIsFontMenuOpen(false);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const width = Math.min(340, Math.max(240, window.innerWidth - 16));
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        const menuHeight = Math.min(400, window.innerHeight - 16);
        const below = rect.bottom + 6;
        const top = below + menuHeight <= window.innerHeight
            ? below
            : Math.max(8, rect.top - menuHeight - 6);
        setFontTarget(target);
        setFontMenuPosition({ top, left, width });
        setIsFontMenuOpen(true);
    };

    const PRESET_FONTS = [
        { label: '明朝 (標準)', value: 'var(--font-mincho)' },
        { label: 'ゴシック (標準)', value: 'var(--font-gothic)' },
        { label: 'ヒラギノ明朝', value: "'Hiragino Mincho ProN', 'Hiragino Mincho Pro', 'ヒラギノ明朝 ProN', 'ヒラギノ明朝 Pro', serif" },
        { label: 'ヒラギノ角ゴ (太め)', value: "'Hiragino Sans', sans-serif" },
        { label: '游明朝 (標準)', value: "'YuMincho', 'Yu Mincho', serif" },
        { label: 'メイリオ', value: "'Meiryo', sans-serif" },
        { label: '筑紫Aオールド明朝', value: "'FOT-筑紫Aオールド明朝 Pr6N', serif" },
        { label: 'A1明朝', value: "'A-OTF A1明朝 Std', serif" },
        { label: 'マティス EB (極太)', value: "'FOT-MatissePro-EB', serif" },
        { label: 'マティス Classic', value: "'EVA-Matisse_Classic', serif" },
        { label: '紅道 (手書き)', value: 'var(--font-hand)' },
        { label: 'クレー', value: "'Klee One', cursive" },
    ];

    useEffect(() => {
        if (window.api?.system?.getFonts) {
            // ESLintエラー回避のため、フラグ管理と非同期呼び出しを分離
            const loadFonts = async () => {
                setIsLoadingFonts(true);
                try {
                    const data = await window.api.system.getFonts();
                    if (!data || !Array.isArray(data)) {
                        console.error("Invalid font data received:", data);
                        setSystemFonts([]);
                        return;
                    }
                    
                    const jpKeywords = ['mincho', 'gothic', 'mplus', 'kaku', 'maru', 'hira', 'yu', 'biz', 'tsukushi', 'toppan', 'zen', 'kosugi', 'sawarabi', 'ipa', 'epson', 'ricoh', 'fujitsu', 'dyho', 'dyna', 'morisawa', 'matisse', 'klee', 'hg', 'ud'];
                    const isJP = (name) => {
                        if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(name)) return true;
                        const lower = name.toLowerCase();
                        return jpKeywords.some(k => lower.includes(k));
                    };

                    const jp = [];
                    const others = [];

                    data.forEach(item => {
                        if (!item || !item.family || !item.fonts) return;
                        const entry = {
                            family: item.family,
                            isJp: isJP(item.family),
                            fonts: item.fonts
                        };
                        if (entry.isJp) jp.push(entry);
                        else others.push(entry);
                    });

                    // Sort each list alphabetically by family name
                    const sortFn = (a, b) => a.family.localeCompare(b.family);
                    const finalFonts = [...jp.sort(sortFn), ...others.sort(sortFn)];
                    console.log(`Loaded ${data.length} font families (${finalFonts.length} entries total)`);
                    setSystemFonts(finalFonts);
                } finally {
                    setIsLoadingFonts(false);
                }
            };
            loadFonts();
        }
    }, []);

    return (
        <div className="settings-panel" style={{ overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 1. 環境・表示切替 */}
            <div className="toolbar-section">
                <div className="section-title">環境・表示</div>
                <div className="control-grid">

                    <Toggle active={showMetadata} onClick={() => setShowMetadata(!showMetadata)} label="メタ表示" />
                    <Toggle active={settings.showLogo !== false} onClick={() => handleChange('showLogo', settings.showLogo === false)} label="ロゴ表示" />
                    <Toggle active={settings.enableJournaling !== false} onClick={() => handleChange('enableJournaling', settings.enableJournaling === false)} label="操作ログ" />
                    <Toggle active={settings.enablePerfLogging === true} onClick={() => handleChange('enablePerfLogging', settings.enablePerfLogging !== true)} label="分析ログ" />

                    <div className="control-item">
                        <label>UIスケール</label>
                        <select
                            value={settings.uiScale || 100}
                            onChange={(e) => handleChange('uiScale', Number(e.target.value))}
                            style={{ width: '70px' }}
                        >
                            <option value={80}>80%</option>
                            <option value={85}>85%</option>
                            <option value={90}>90%</option>
                            <option value={95}>95%</option>
                            <option value={100}>100%</option>
                            <option value={110}>110%</option>
                            <option value={120}>120%</option>
                        </select>
                    </div>
                    <div className="control-item">
                        <label>テーマ</label>
                        <select
                            value={settings.colorTheme || (isDarkMode ? 'dark' : 'light')}
                            onChange={(e) => {
                                handleChange('colorTheme', e.target.value);
                                setIsDarkMode(e.target.value === 'dark' || e.target.value === 'blackboard');
                            }}
                            style={{ height: '22px', fontSize: '10px' }}
                        >
                            <option value="light">ライト</option>
                            <option value="sakura">サクラ</option>
                            <option value="dark">ダーク</option>
                            <option value="blackboard">黒板</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 2. 原稿・グリッド設定 (Editor + Output に影響) */}
            <div className="toolbar-section">
                <div className="section-title">原稿・グリッド</div>
                <div className="control-grid">
                    <div className="control-item">
                        <label>用紙</label>
                        <select value={settings.paperStyle || 'plain'} onChange={(e) => handleChange('paperStyle', e.target.value)}>
                            <option value="plain">無地</option>
                            <option value="grid">原稿用紙</option>
                            <option value="lined">ノート</option>
                            <option value="clean">クリーン</option>
                        </select>
                    </div>
                    <div className="control-item">
                        <label>向き</label>
                        <select value={settings.orientation || 'portrait'} onChange={(e) => handleChange('orientation', e.target.value)}>
                            <option value="portrait">タテ</option>
                            <option value="landscape">ヨコ</option>
                        </select>
                    </div>
                    <div className="control-item">
                        <label>1行文字数</label>
                        <input type="number" value={settings.charsPerLine || 0} onChange={(e) => handleChange('charsPerLine', Number(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>ページ行数</label>
                        <input type="number" value={settings.linesPerPage || 0} onChange={(e) => handleChange('linesPerPage', Number(e.target.value))} />
                    </div>
                    <div className="control-item span-full" style={{ borderTop: '1px solid #eee', paddingTop: '6px', marginTop: '2px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: '4px' }}>
                        <Toggle active={settings.showGrid !== false} onClick={() => handleChange('showGrid', settings.showGrid === false)} label="枠線" />
                        <Toggle active={settings.showWhitespace === true} onClick={() => handleChange('showWhitespace', settings.showWhitespace !== true)} label="空白表示" />
                        <Toggle active={settings.showLineNumbers !== false} onClick={() => handleChange('showLineNumbers', settings.showLineNumbers === false)} label="行番号" />
                        <Toggle active={settings.strictManuscriptMode || false} onClick={() => handleChange('strictManuscriptMode', !settings.strictManuscriptMode)} label="厳密マス" />
                    </div>
                </div>
            </div>

            {/* 3. 執筆・書式設定 */}
            <div className="toolbar-section">
                <div className="section-title">執筆・配色</div>
                <div className="control-grid">
                    <div className="control-item">
                        <label>字寸(px)</label>
                        <input type="number" value={settings.fontSize} onChange={(e) => handleChange('fontSize', Number(e.target.value))} />
                    </div>
                    <div className="control-item">
                        <label>行間</label>
                        <input type="number" value={settings.lineHeight || 1.65} onChange={(e) => handleChange('lineHeight', Number(e.target.value))} step="0.01" />
                    </div>
                    {settings.paperStyle !== 'grid' && settings.paperStyle !== 'clean' && (
                        <div className="control-item">
                            <label>字間</label>
                            <input type="number" value={settings.charSpacing || 1.4} onChange={(e) => handleChange('charSpacing', Number(e.target.value))} step="0.05" min="1.0" max="1.65" />
                        </div>
                    )}
                    <div className="control-item">
                        <label>書向</label>
                        <select value={settings.isVertical ? 'vertical' : 'horizontal'} onChange={(e) => handleChange('isVertical', e.target.value === 'vertical')}>
                            <option value="vertical">縦書</option>
                            <option value="horizontal">横書</option>
                        </select>
                    </div>
                    <div className="control-item" style={{ position: 'relative' }}>
                        <label>書体</label>
                        <div 
                            onClick={(event) => openFontMenu('fontFamily', event)}
                            style={{ 
                                fontSize: '10px', width: '100%', padding: '4px 8px', 
                                border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', 
                                background: 'rgba(0,0,0,0.02)', cursor: 'pointer',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                        >
                            <span>{PRESET_FONTS.find(f => f.value === settings.fontFamily)?.label || settings.fontFamily || '選択...'}</span>
                            <span style={{ fontSize: '8px', opacity: 0.5 }}>▼</span>
                        </div>
                    </div>
                    <div className="control-item" style={{ position: 'relative' }}>
                        <label>ルビ書体</label>
                        <div 
                            onClick={(event) => openFontMenu('rubyFontFamily', event)}
                            style={{ 
                                fontSize: '10px', width: '100%', padding: '4px 8px', 
                                border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', 
                                background: 'rgba(0,0,0,0.02)', cursor: 'pointer',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                        >
                            <span>{settings.rubyFontFamily === 'inherit' ? '本文と同じ' : (PRESET_FONTS.find(f => f.value === settings.rubyFontFamily)?.label || settings.rubyFontFamily || '選択...')}</span>
                            <span style={{ fontSize: '8px', opacity: 0.5 }}>▼</span>
                        </div>
                    </div>

                        {isFontMenuOpen && (
                            <div 
                                style={{ 
                                    position: 'fixed', top: `${fontMenuPosition.top}px`, left: `${fontMenuPosition.left}px`, width: `${fontMenuPosition.width}px`,
                                    maxHeight: '400px', background: isDarkMode ? '#2c3e50' : '#fff', 
                                    boxShadow: '0 -4px 16px rgba(0,0,0,0.25)', borderRadius: '8px', 
                                    zIndex: 2000, display: 'flex', flexDirection: 'column',
                                    border: '1px solid var(--border-color)'
                                }}
                                onMouseEnter={() => {
                                    // メニューが開いた際に前回の位置を復元（ライフサイクル的にここが確実）
                                    const container = document.getElementById('font-list-container');
                                    if (container && lastScrollTop > 0) {
                                        container.scrollTop = lastScrollTop;
                                    }
                                }}
                            >
                                <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                                    <input 
                                        type="text"
                                        autoFocus
                                        placeholder={isLoadingFonts ? "システムフォントを読み込み中..." : `フォントを検索 (${systemFonts.length}件ロード済み)...`}
                                        value={fontSearch}
                                        onChange={(e) => setFontSearch(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ 
                                            width: '100%', padding: '4px 8px', fontSize: '11px', 
                                            borderRadius: '4px', border: '1px solid #ddd',
                                            background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#fff',
                                            color: isDarkMode ? '#fff' : '#333'
                                        }}
                                    />
                                </div>
                                <div 
                                    id="font-list-container"
                                    style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}
                                    onScroll={(e) => {
                                        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                                        setLastScrollTop(scrollTop);
                                        if (scrollHeight - scrollTop <= clientHeight + 100) {
                                            setVisibleCount(prev => prev + 40);
                                        }
                                    }}
                                >
                                    {isLoadingFonts ? (
                                        <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, fontSize: '11px' }}>
                                            システムフォントをスキャン中...<br/>
                                            （ロード済み：{systemFonts.length}件）
                                        </div>
                                    ) : (
                                        (() => {
                                            const query = fontSearch.toLowerCase();
                                            
                                            // プリセットフォントの変換
                                            const presetItems = PRESET_FONTS.map(p => ({ 
                                                label: p.label, 
                                                value: p.value, 
                                                isPreset: true, 
                                                isJp: true,
                                                subLabel: p.value
                                            }));

                                            if (fontTarget === 'rubyFontFamily') {
                                                presetItems.unshift({
                                                    label: '本文と同じ',
                                                    value: 'inherit',
                                                    isPreset: true,
                                                    isJp: true,
                                                    subLabel: 'inherit'
                                                });
                                            }

                                            // システムフォントの展開と和名表示用オブジェクト作成
                                            const systemItems = [];
                                            systemFonts.forEach(item => {
                                                item.fonts.forEach(f => {
                                                    // 表示名は「ファミリー名 (ウェイト名)」
                                                    const label = f.weight && f.weight !== 'Regular' 
                                                        ? `${item.family} (${f.weight})` 
                                                        : item.family;
                                                    
                                                    systemItems.push({
                                                        label: label,
                                                        value: `"${String(f.ps || item.family).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
                                                        isPreset: false,
                                                        isJp: item.isJp,
                                                        subLabel: f.ps,
                                                        familyName: item.family
                                                    });
                                                });
                                            });

                                            // 重複排除 (プリセットがシステム側にもある場合はプリセット優先)
                                            const seen = new Set();
                                            const uniqueItems = [];
                                            [...presetItems, ...systemItems].forEach(item => {
                                                if (!seen.has(item.value)) {
                                                    seen.add(item.value);
                                                    uniqueItems.push(item);
                                                }
                                            });

                                            // フィルタリング (ラベル、PS名、ファミリー名で検索可能)
                                            let filtered = uniqueItems.filter(item => 
                                                !query || 
                                                item.label.toLowerCase().includes(query) || 
                                                item.value.toLowerCase().includes(query) ||
                                                (item.familyName && item.familyName.toLowerCase().includes(query))
                                            );

                                            if (filtered.length === 0) {
                                                return <div style={{ padding: '20px', fontSize: '11px', opacity: 0.5, textAlign: 'center' }}>一致するフォントが見つかりません</div>;
                                            }

                                            // 日本語とその他に分ける（ロード時の分類を活かす）
                                            const jpList = filtered.filter(f => f.isJp);
                                            const otherList = filtered.filter(f => !f.isJp);
                                            
                                            const combinedList = [...jpList, ...otherList];
                                            const displayItems = query ? combinedList : combinedList.slice(0, visibleCount);

                                            return (
                                                <>
                                                    {displayItems.map((item, idx) => {
                                                        const showSectionHeader = !query && (
                                                            (idx === 0 && item.isJp) || 
                                                            (idx === jpList.length && !item.isJp && jpList.length > 0)
                                                        );

                                                        return (
                                                            <React.Fragment key={idx}>
                                                                {showSectionHeader && (
                                                                    <div style={{ 
                                                                        padding: '8px 14px', fontSize: '10px', fontWeight: 'bold', 
                                                                        opacity: 0.4, background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                                                                        borderBottom: '1px solid rgba(0,0,0,0.03)'
                                                                    }}>
                                                                        {item.isJp ? '日本語 / 推奨書体' : 'その他 / 欧文等'}
                                                                    </div>
                                                                )}
                                                                <div 
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        handleChange(fontTarget, item.value); 
                                                                        setIsFontMenuOpen(false); 
                                                                        setFontSearch(''); 
                                                                    }}
                                                                    style={{ 
                                                                        padding: '10px 14px', fontSize: '14px', cursor: 'pointer',
                                                                        background: settings.fontFamily === item.value ? 'rgba(142,68,173,0.1)' : 'transparent',
                                                                        color: isDarkMode ? '#eee' : '#333',
                                                                        fontFamily: item.value,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '12px',
                                                                        borderBottom: '1px solid rgba(0,0,0,0.03)',
                                                                        transition: 'background 0.2s'
                                                                    }}
                                                                    className="font-option-hover"
                                                                    title={item.subLabel}
                                                                >
                                                                    <span style={{ fontSize: '18px', fontWeight: 'bold', opacity: 0.8, width: '24px', textAlign: 'center' }}>あ</span>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                                                        <span style={{ fontSize: '12px', fontWeight: item.isPreset ? '600' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {item.label}
                                                                        </span>
                                                                        {item.label !== item.subLabel && (
                                                                            <span style={{ fontSize: '9px', opacity: 0.5, fontFamily: 'sans-serif' }}>{item.subLabel}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    {!query && combinedList.length > visibleCount && (
                                                        <div style={{ padding: '10px', textAlign: 'center', fontSize: '10px', opacity: 0.3 }}>
                                                            スクロールしてさらに表示 ({combinedList.length - visibleCount}件)
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                {/* 3列カラーグリッド */}
                {/* 5 列カラーグリッド + Toggle */}
                <div className="control-grid color-grid" style={{ marginTop: '8px', borderTop: '1px dotted #eee', paddingTop: '8px' }}>
                    <div className="control-item color-item">
                        <label>ルビ</label>
                        <input type="color" value={settings.syntaxColors?.ruby || '#3498db'} onChange={(e) => setSettings(prev => ({ ...prev, syntaxColors: { ...prev.syntaxColors, ruby: e.target.value } }))} />
                    </div>
                    <div className="control-item color-item">
                        <label>リンク</label>
                        <input type="color" value={settings.syntaxColors?.link || '#2980b9'} onChange={(e) => setSettings(prev => ({ ...prev, syntaxColors: { ...prev.syntaxColors, link: e.target.value } }))} />
                    </div>
                    <div className="control-item color-item">
                        <label>強調</label>
                        <input type="color" value={settings.syntaxColors?.emphasis || '#c0392b'} onChange={(e) => setSettings(prev => ({ ...prev, syntaxColors: { ...prev.syntaxColors, emphasis: e.target.value } }))} />
                    </div>
                    <div className="control-item color-item">
                        <label>会話</label>
                        <input type="color" value={settings.syntaxColors?.conversation || '#e8f6f3'} onChange={(e) => setSettings(prev => ({ ...prev, syntaxColors: { ...prev.syntaxColors, conversation: e.target.value } }))} />
                    </div>
                    <div className="control-item color-item">
                        <label>注釈</label>
                        <input type="color" value={settings.syntaxColors?.aozora || '#27ae60'} onChange={(e) => setSettings(prev => ({ ...prev, syntaxColors: { ...prev.syntaxColors, aozora: e.target.value } }))} />
                    </div>
                </div>
                <div style={{ marginTop: '2px', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Toggle active={settings.editorSyntaxColors !== false} onClick={() => handleChange('editorSyntaxColors', settings.editorSyntaxColors === false)} label="エディタ着色" />
                    <Toggle active={settings.previewSyntaxColors || false} onClick={() => handleChange('previewSyntaxColors', !settings.previewSyntaxColors)} label="プレビュー着色" />
                </div>
            </div>

            {/* AI / Model Settings */}
            <div className="toolbar-section">
                <div className="section-title">AI / Model</div>
                <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    {/* Model Type Selector */}
                    <div style={{ display: 'flex', background: '#ecf0f1', borderRadius: '4px', padding: '2px' }}>
                        <button
                            onClick={() => setAiModel('local')}
                            style={{
                                flex: 1, border: 'none', background: aiModel === 'local' ? '#fff' : 'transparent',
                                color: aiModel === 'local' ? '#2c3e50' : '#7f8c8d',
                                borderRadius: '3px', padding: '4px', fontSize: '10px', cursor: 'pointer',
                                boxShadow: aiModel === 'local' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                fontWeight: aiModel === 'local' ? 'bold' : 'normal'
                            }}
                        >
                            Local (Ollama)
                        </button>
                        <button
                            onClick={() => setAiModel('chatgpt')}
                            style={{
                                flex: 1, border: 'none', background: aiModel !== 'local' ? '#fff' : 'transparent', // 'chatgpt' or 'gemini' treated as Cloud
                                color: aiModel !== 'local' ? '#2c3e50' : '#7f8c8d',
                                borderRadius: '3px', padding: '4px', fontSize: '10px', cursor: 'pointer',
                                boxShadow: aiModel !== 'local' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                fontWeight: aiModel !== 'local' ? 'bold' : 'normal'
                            }}
                        >
                            Cloud
                        </button>
                    </div>

                    {/* Local AI Controls */}
                    {aiModel === 'local' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#f9f9f9', padding: '6px', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                                    <span style={{ color: isLocalConnected ? '#2ecc71' : '#e74c3c' }}>●</span>
                                    {isLocalConnected ? 'Connected' : 'Disconnected'}
                                </div>
                                <button
                                    onClick={checkLocalConnection}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                                    title="再接続"
                                >
                                    🔄
                                </button>
                            </div>

                            {isLocalConnected && (
                                <select
                                    value={selectedLocalModel}
                                    onChange={(e) => setSelectedLocalModel(e.target.value)}
                                    style={{ width: '100%', fontSize: '10px', padding: '2px' }}
                                >
                                    {localModels.map(m => {
                                        const name = typeof m === 'string' ? m : m.name || m.model;
                                        return <option key={name} value={name}>{name}</option>;
                                    })}
                                    {localModels.length === 0 && <option value="">No models found</option>}
                                </select>
                            )}
                            {!isLocalConnected && <div style={{ fontSize: '9px', color: '#e74c3c' }}>Ollamaを起動してください</div>}

                            <div style={{ marginTop: '4px', borderTop: '1px dotted #ddd', paddingTop: '4px' }}>
                                <Toggle
                                    active={settings.enableGhostText !== false}
                                    onClick={() => handleChange('enableGhostText', settings.enableGhostText === false)}
                                    label="ゴーストテキスト (自動補完)"
                                />

                            </div>
                        </div>
                    )}

                    {/* Cloud AI Controls */}
                    {aiModel !== 'local' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#f9f9f9', padding: '6px', borderRadius: '4px' }}>
                            <div style={{ fontSize: '10px', color: '#7f8c8d', marginBottom: '2px' }}>Provider</div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        checked={aiModel === 'chatgpt'}
                                        onChange={() => setAiModel('chatgpt')}
                                    />
                                    ChatGPT
                                </label>
                                <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        checked={aiModel === 'gemini'}
                                        onChange={() => setAiModel('gemini')}
                                    />
                                    Gemini
                                </label>
                                <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        checked={aiModel === 'claude'}
                                        onChange={() => setAiModel('claude')}
                                    />
                                    Claude
                                </label>
                                <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        checked={aiModel === 'genspark'}
                                        onChange={() => setAiModel('genspark')}
                                    />
                                    Genspark
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. プリセット */}
            <div className="toolbar-section">
                <div className="section-title">プリセット</div>
                <div className="control-grid">
                    <div className="span-full" style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                        <select id="preset-load-select" onChange={(e) => e.target.value && onLoadPreset(e.target.value)} style={{ flex: 1, height: '22px', fontSize: '10px' }}>
                            <option value="">読込...</option>
                            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button onClick={() => onSavePreset()} style={{ width: '22px', height: '22px', padding: 0 }} title="現在の設定を保存">+</button>
                        <button
                            onClick={() => {
                                const sel = document.getElementById('preset-load-select');
                                if (sel && sel.value) {
                                    if (window.confirm('このプリセットを削除しますか？')) onDeletePreset(sel.value);
                                }
                            }}
                            style={{ width: '22px', height: '22px', padding: 0, color: '#e74c3c' }}
                            title="選択中のプリセットを削除"
                        >
                            ×
                        </button>
                    </div>
                    <div className="span-full" style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>カスタムCSS</div>
                        <textarea
                            value={settings.customCSS || ''}
                            onChange={(e) => handleChange('customCSS', e.target.value)}
                            placeholder=".native-grid-editor { background: ... }"
                            style={{
                                width: '100%',
                                height: '60px',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                resize: 'vertical',
                                background: settings.colorTheme === 'dark' ? '#1a1a2e' : '#fafafa',
                                color: settings.colorTheme === 'dark' ? '#ccc' : '#333',
                                border: '1px solid var(--border-color)',
                                borderRadius: '3px',
                                padding: '4px',
                            }}
                        />
                    </div>
                </div>
            </div>
        </div >
    );
};

export default Toolbar;
