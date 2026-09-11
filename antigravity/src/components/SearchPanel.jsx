import React, { useState, useEffect, useCallback, useMemo } from 'react';

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeWhitespaceQuery = value => {
    const text = String(value ?? '');
    // 旧ビルドでは半角スペースを「SP」と表示していたため、互換検索を残す。
    if (text === 'SP') return ' ';
    return text.replace(/␠/g, ' ').replace(/□/g, '　');
};

const SearchPanel = ({ allFiles, activeWorkFolderPath, activeFilePath, onOpenFile, searchQuery: initialQuery, requestConfirm, showToast }) => {
    const [searchQuery, setSearchQuery] = useState(initialQuery?.term || '');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [engineName, setEngineName] = useState('');
    const [isRegex, setIsRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [txtOnly, setTxtOnly] = useState(true);
    const [replacePreview, setReplacePreview] = useState([]);
    const [isReplacing, setIsReplacing] = useState(false);

    const makePattern = useCallback((term, global = false) => {
        const normalizedTerm = normalizeWhitespaceQuery(term);
        const source = isRegex ? normalizedTerm : escapeRegExp(normalizedTerm);
        return new RegExp(source, `${caseSensitive ? '' : 'i'}${global ? 'g' : ''}`);
    }, [isRegex, caseSensitive]);

    const performSearch = useCallback(async (term) => {
        const query = normalizeWhitespaceQuery(term);
        if (!query || !activeWorkFolderPath) { setResults([]); return; }
        setIsSearching(true);
        setReplacePreview([]);
        try {
            const isElectron = !!window.api;
            let rawResults = [];
            if (isElectron && window.api.fs?.grep) {
                rawResults = await window.api.fs.grep(activeWorkFolderPath, query, { useRegex: isRegex, caseSensitive, extensions: txtOnly ? ['.txt'] : undefined });
                setEngineName('Grep（Electron）');
            } else {
                setEngineName('JS Scan（読み込み済みファイル）');
                const pattern = makePattern(query);
                const scanned = [];
                for (const file of (allFiles || [])) {
                    const path = typeof file === 'string' ? file : (file.path || file.handle || '');
                    const name = typeof file === 'string' ? file.split(/[/\\]/).pop() : (file.name || path.split(/[/\\]/).pop());
                    if (txtOnly && !String(name).toLowerCase().endsWith('.txt')) continue;
                    let body = typeof file === 'object' ? (file.body || file.content || '') : '';
                    if (!body && window.api?.fs?.readFile && path) { try { body = await window.api.fs.readFile(path); } catch { body = ''; } }
                    if (!body) continue;
                    String(body).split(/\r?\n/).forEach((lineContent, lineIndex) => {
                        pattern.lastIndex = 0;
                        if (pattern.test(lineContent)) scanned.push({ name, path, lineIndex, lineContent });
                    });
                }
                rawResults = scanned;
            }
            const filteredResults = txtOnly
                ? (rawResults || []).filter(res => {
                    const candidate = String(res?.name || res?.path || '').toLowerCase();
                    return candidate.endsWith('.txt');
                })
                : (rawResults || []);
            const mappedResults = filteredResults.map(res => ({
                ...res,
                name: res.name || String(res.path || '').split(/[/\\]/).pop() || 'Unknown',
                path: res.path || '',
                lineIndex: Number.isFinite(res.lineIndex) ? res.lineIndex : 0,
            })).sort((a, b) => a.path.localeCompare(b.path) || a.lineIndex - b.lineIndex);
            setResults(mappedResults);
        } catch (err) {
            console.error('Search failed:', err);
            setResults([]);
            showToast?.(`検索に失敗しました: ${err.message || err}`, 'error');
        } finally { setIsSearching(false); }
    }, [activeWorkFolderPath, allFiles, isRegex, caseSensitive, txtOnly, makePattern, showToast]);

    useEffect(() => {
        if (initialQuery?.term) { setSearchQuery(initialQuery.term); performSearch(initialQuery.term); }
    }, [initialQuery, performSearch]);

    const displayPath = activeWorkFolderPath ? activeWorkFolderPath.split(/[/\\]/).slice(-3).join(' / ') : '未設定';
    const folderHint = useMemo(() => activeFilePath ? `編集中: ${activeFilePath.split(/[/\\]/).pop()}` : '現在の編集ファイル未設定', [activeFilePath]);

    const contextFor = useCallback((lineContent, term) => {
        const line = String(lineContent || '');
        let match = null;
        try { match = makePattern(term).exec(line); } catch { /* 無効な正規表現 */ }
        if (!match) return { before: line.slice(0, 100), matched: '', after: '', prefix: false, suffix: line.length > 100 };
        const start = Math.max(0, match.index - 64);
        const end = Math.min(line.length, match.index + Math.max(match[0].length, 1) + 120);
        return { before: line.slice(start, match.index), matched: line.slice(match.index, match.index + match[0].length), after: line.slice(match.index + match[0].length, end), prefix: start > 0, suffix: end < line.length };
    }, [makePattern]);

    const highlight = useCallback((res) => {
        const ctx = contextFor(res.lineContent, searchQuery);
        return <>{ctx.prefix && '…'}{ctx.before}<mark style={{ background: '#ffe58f', color: '#111', padding: '0 2px', borderRadius: '2px' }}>{ctx.matched || searchQuery}</mark>{ctx.after}{ctx.suffix && '…'}</>;
    }, [contextFor, searchQuery]);

    const handleSelectFolder = async () => {
        if (window.api?.fs?.selectFolder) {
            const newPath = await window.api.fs.selectFolder();
            if (newPath) window.dispatchEvent(new CustomEvent('nexus-update-search-path', { detail: { path: newPath } }));
        }
    };

    const handleResultClick = useCallback((res) => {
        window.dispatchEvent(new CustomEvent('nexus-jump-to-text', { detail: { file: res.name, line: res.lineIndex, path: res.path, text: res.lineContent } }));
    }, []);

    const buildReplacePreview = useCallback(async () => {
        if (!searchQuery || !results.length || !window.api?.fs?.readFile) return;
        let pattern;
        try { pattern = makePattern(searchQuery, true); } catch (error) { showToast?.(`正規表現が無効です: ${error.message}`, 'error'); return; }
        const paths = [...new Set(results.map(r => r.path).filter(Boolean))];
        const preview = [];
        for (const path of paths) {
            try {
                const before = String(await window.api.fs.readFile(path));
                pattern.lastIndex = 0;
                const after = before.replace(pattern, replaceTerm);
                pattern.lastIndex = 0;
                const count = (before.match(pattern) || []).length;
                if (count > 0 && before !== after) preview.push({ path, name: path.split(/[/\\]/).pop(), before, after, count });
            } catch (error) { showToast?.(`${path} を読み込めませんでした: ${error.message}`, 'error'); }
        }
        setReplacePreview(preview);
        if (!preview.length) showToast?.('置換対象がありません。検索結果と置換文字を確認してください。');
    }, [searchQuery, results, replaceTerm, makePattern, showToast]);

    const executeReplace = useCallback(async () => {
        if (!replacePreview.length || isReplacing || !window.api?.fs?.writeFile) return;
        const total = replacePreview.reduce((sum, f) => sum + f.count, 0);
        const confirmed = requestConfirm ? await requestConfirm('置換の確認', `${replacePreview.length}ファイル、合計${total}箇所を置換しますか？\n対象フォルダ: ${activeWorkFolderPath}`, true) : window.confirm(`${replacePreview.length}ファイルを置換しますか？`);
        if (!confirmed) return;
        setIsReplacing(true);
        try {
            for (const change of replacePreview) {
                const result = await window.api.fs.writeFile(change.path, change.after, { expectedContent: change.before });
                if (result?.ok === false) throw new Error(`${change.name} の保存結果を確認できませんでした`);
                const readBack = String(await window.api.fs.readFile(change.path));
                if (readBack !== change.after) throw new Error(`${change.name} の保存後内容が一致しません`);
            }
            if (activeFilePath && replacePreview.some(change => change.path === activeFilePath)) {
                const fileName = activeFilePath.split(/[/\\]/).pop();
                await onOpenFile?.(activeFilePath, fileName);
            }
            setReplacePreview([]);
            showToast?.(`${total}箇所を置換し、保存内容を確認しました。`);
            await performSearch(searchQuery);
        } catch (error) { showToast?.(`置換に失敗しました: ${error.message}`, 'error'); }
        finally { setIsReplacing(false); }
    }, [replacePreview, isReplacing, requestConfirm, activeWorkFolderPath, activeFilePath, onOpenFile, showToast, performSearch, searchQuery]);

    return (
        <div className="search-panel-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#111', background: 'var(--bg-dark)' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                <div style={{ fontSize: '11px', color: '#111', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeWorkFolderPath}>📂 検索フォルダ: {displayPath}</div>
                    <button onClick={handleSelectFolder} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #555', color: '#111', fontSize: '10px', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer' }}>変更</button>
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>{folderHint}（初期値はこのファイルの親フォルダ）</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && performSearch(searchQuery)} placeholder="作品内を検索（␠=半角空白、□=全角空白）..." style={{ flex: 1, background: '#fff', border: '1px solid #999', color: '#333', padding: '6px 10px', fontSize: '13px', borderRadius: '4px' }} />
                    <button onClick={() => performSearch(searchQuery)} style={{ background: '#5b7bb5', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>検索</button>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    <input type="text" value={replaceTerm} onChange={e => setReplaceTerm(e.target.value)} onKeyDown={e => e.key === 'Enter' && buildReplacePreview()} placeholder="置換後の文字（空文字も可）" style={{ flex: 1, background: '#fff', border: '1px solid #999', color: '#333', padding: '6px 10px', fontSize: '12px', borderRadius: '4px' }} />
                    <button onClick={buildReplacePreview} disabled={!searchQuery || !results.length} style={{ background: '#8a5a44', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', opacity: (!searchQuery || !results.length) ? .5 : 1 }}>置換プレビュー</button>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px', color: '#111' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><input type="checkbox" checked={isRegex} onChange={e => setIsRegex(e.target.checked)} style={{ margin: 0 }} />正規表現</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} style={{ margin: 0 }} />大文字/小文字</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><input type="checkbox" checked={txtOnly} onChange={e => setTxtOnly(e.target.checked)} style={{ margin: 0 }} />TXTのみ</label>
                    <span style={{ marginLeft: 'auto', color: '#1e5aad' }}>{engineName}</span>
                </div>
                {!isSearching && searchQuery && <div style={{ fontSize: '11px', marginTop: '8px', color: '#1e5aad' }}>{results.length} 件のヒット</div>}
                {isSearching && <div style={{ fontSize: '11px', marginTop: '8px', color: '#111' }}>検索中...</div>}
            </div>
            {replacePreview.length > 0 && <div style={{ margin: '8px 12px', padding: '9px', border: '1px solid #c58b55', borderRadius: '6px', background: '#fff9ee', fontSize: '11px' }}><div style={{ fontWeight: 'bold', marginBottom: '4px' }}>置換プレビュー（まだ保存していません）</div><div style={{ marginBottom: '6px' }}>{replacePreview.map(f => <div key={f.path}>・{f.name}: {f.count}箇所</div>)}</div><div style={{ display: 'flex', gap: '6px' }}><button onClick={executeReplace} disabled={isReplacing} style={{ background: '#b33a2b', color: '#fff', border: 0, borderRadius: '4px', padding: '5px 9px' }}>{isReplacing ? '保存中…' : '置換実行'}</button><button onClick={() => setReplacePreview([])} style={{ background: '#eee', border: '1px solid #aaa', borderRadius: '4px', padding: '5px 9px' }}>キャンセル</button></div></div>}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {results.map((res, i) => <div key={`${res.path}:${res.lineIndex}:${i}`} onClick={() => handleResultClick(res)} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }} title={res.path}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}><span style={{ fontSize: '11.5px', color: '#1e5aad', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.name.replace(/\.txt$/, '')}</span><span style={{ fontSize: '10px', color: '#333', flexShrink: 0, marginTop: '1px' }}>L{res.lineIndex + 1}</span></div><div style={{ fontSize: '12px', color: '#222', lineHeight: '1.4', maxHeight: '3.0em', overflow: 'hidden', wordBreak: 'break-all' }}>{highlight(res)}</div></div>)}
                {!isSearching && searchQuery && !results.length && <div style={{ padding: '20px 12px', color: '#666', fontSize: '12px' }}>一致する行がありません。検索フォルダと表記を確認してください。</div>}
            </div>
        </div>
    );
};

export default SearchPanel;
