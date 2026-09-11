import React, { useState, useEffect } from 'react';
import { ollamaService } from '../utils/ollamaService';
import DocumentViewer from './DocumentViewer';

const AIKnowledgeManager = (props) => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isGeneratingMemoryPack, setIsGeneratingMemoryPack] = useState(false);
    const [memoryPackDestination, setMemoryPackDestination] = useState(() => localStorage.getItem('nexus.aiMemory.destination') || '');
    const [message, setMessage] = useState('');
    const [error, setError] = useState(null);
    const [filterTag, setFilterTag] = useState(null);
    const [ledger, setLedger] = useState(null);
    const [ledgerKind, setLedgerKind] = useState('PERSON');
    const [isLoadingLedger, setIsLoadingLedger] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [browseName, setBrowseName] = useState('');
    const [browseWork, setBrowseWork] = useState('');
    const [browseRole, setBrowseRole] = useState('');
    const [browseYear, setBrowseYear] = useState('');
    const [browseSort, setBrowseSort] = useState('newest');
    const [sourceConfig, setSourceConfig] = useState({ included: [], excluded: [] });
    const [showSources, setShowSources] = useState(false);

    const decisionLabels = {
        UNREVIEWED: '未確認', CONFIRMED: '確定', PROVISIONAL: '仮決定',
        CONSIDERING: '検討中', REJECTED: '却下', RETIRED: '廃止', CONFLICT: '矛盾あり'
    };
    const predicateLabels = {
        name: '名前', reading: '読み', profile: '人物・項目概要', alias: '別名', eye_color: '瞳・目', hair: '髪',
        origin: '出身', weapon: '武器・装備', affiliation: '所属', status: '状態',
        death_chapter: '死亡章', first_chapter: '登場章', candidate_term: '固有名詞候補'
    };
    const entityKindLabels = {
        PERSON: '人物', LOCATION: '地名', ORGANIZATION: '組織', TERM: '用語',
        ITEM: '道具・技術', EVENT: '事件・作戦', UNKNOWN: '未分類', IGNORE: '不要'
    };

    const loadItems = async () => {
        setIsLoading(true);
        setError(null);
        try {
            console.log("Fetching knowledge items from bridge server...");
            const data = await ollamaService.listDBItems();
            setItems(data || []);
        } catch (err) {
            console.error("Failed to load knowledge items:", err);
            setError("データの読み込みに失敗しました。Pythonブリッジサーバー(localhost:8000)が起動しているか確認してください。");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadItems();
        fetch('http://localhost:8000/db/sources')
            .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
            .then(setSourceConfig)
            .catch(() => {});
    }, []);

    const chooseSourceFolder = async (mode) => {
        const path = await window.api?.fs?.selectFolder?.();
        if (!path) return;
        setMessage(mode === 'include' ? '参照フォルダを索引へ追加しています…' : '除外フォルダを索引から外しています…');
        try {
            const response = await fetch('http://localhost:8000/db/sources', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, mode })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            setSourceConfig({ included: result.included || [], excluded: result.excluded || [] });
            await loadItems();
            setMessage(mode === 'include'
                ? `「${path}」を参照対象へ追加しました（${result.stats?.scanned || 0}ファイル確認）`
                : `「${path}」を除外しました（索引から${result.deleted || 0}ファイル削除・原本は変更なし）`);
        } catch (err) {
            setMessage(`検索範囲を変更できませんでした: ${err.message}`);
        }
    };

    const restoreExcludedSource = async (path) => {
        try {
            const response = await fetch('http://localhost:8000/db/sources', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, mode: 'include' })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            setSourceConfig({ included: result.included || [], excluded: result.excluded || [] });
            await loadItems();
            setMessage(`「${path}」を再び参照対象にしました`);
        } catch (err) {
            setMessage(`参照を再開できませんでした: ${err.message}`);
        }
    };

    const excludeRegisteredSource = async (path) => {
        setMessage(`「${path}」を参照対象から外しています…`);
        try {
            const response = await fetch('http://localhost:8000/db/sources', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, mode: 'exclude' })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            setSourceConfig({ included: result.included || [], excluded: result.excluded || [] });
            await loadItems();
            setMessage(`参照を停止しました（索引から${result.deleted || 0}ファイル削除・原本は変更なし）`);
        } catch (err) {
            setMessage(`参照を停止できませんでした: ${err.message}`);
        }
    };

    const handleDelete = async (fullPath) => {
        if (!window.confirm(`このファイルをAIの記憶から消去しますか？\n${fullPath}`)) return;
        
        const success = await ollamaService.deleteDBItem(fullPath);
        if (success) {
            setMessage('記憶を消去しました');
            loadItems();
        } else {
            setMessage('消去に失敗しました');
        }
        setTimeout(() => setMessage(''), 3000);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setMessage('同期（記憶）を開始しました。完了まで数分かかる場合があります...');
        const result = await ollamaService.triggerIngest(props.targetPath || '');
        if (result?.status === 'completed') {
            const stats = result.stats || {};
            setMessage(`差分更新完了：現在章 ${stats.current_segments || 0}、単独稿 ${stats.standalone || 0}、旧稿 ${stats.archived || 0}、構成外 ${stats.unreferenced || 0}、完全重複 ${stats.exact_duplicate_groups || 0}組`);
            await loadItems();
            setIsSyncing(false);
        } else {
            setMessage('同期の開始に失敗しました');
            setIsSyncing(false);
        }
    };

    const handleGenerateMemoryPack = async () => {
        if (!props.targetPath) {
            setMessage('作品フォルダを開いてから実行してください');
            return;
        }
        setIsGeneratingMemoryPack(true);
        setMessage('AI共通記憶パックを更新しています…');
        try {
            // 先に差分索引を更新し、古い設定候補をパックへ出さない。
            const ingest = await ollamaService.triggerIngest(props.targetPath);
            if (ingest?.status !== 'completed') throw new Error('資料の差分更新に失敗しました');
            const response = await fetch('http://localhost:8000/memory-pack/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_path: props.targetPath, output_dir: memoryPackDestination || undefined })
            });
            if (!response.ok) {
                const detail = await response.json().catch(() => ({}));
                throw new Error(detail.detail || `HTTP ${response.status}`);
            }
            const result = await response.json();
            await navigator.clipboard?.writeText(result.markdown_path);
            setMessage(`AI共通記憶パックを更新しました：確定 ${result.confirmed}件、要確認 ${result.candidates}件、原本 ${result.sources}件。保存先をコピーしました`);
            await loadItems();
        } catch (err) {
            setMessage(`AI共通記憶パックを作成できませんでした: ${err.message}`);
        } finally {
            setIsGeneratingMemoryPack(false);
        }
    };

    const handleChooseMemoryDestination = async () => {
        if (!window.api?.fs?.selectFolder) {
            setMessage('この環境では同期先フォルダを選択できません');
            return;
        }
        const selected = await window.api.fs.selectFolder();
        if (!selected) return;
        setMemoryPackDestination(selected);
        localStorage.setItem('nexus.aiMemory.destination', selected);
        setMessage('AI共通記憶の同期先を設定しました。Google DriveやOneDriveの同期フォルダも選べます');
    };

    const loadLedger = async (sync = true) => {
        if (!props.targetPath) {
            setMessage('作品フォルダを開いてから実行してください');
            return;
        }
        setIsLoadingLedger(true);
        try {
            if (sync) await ollamaService.triggerIngest(props.targetPath);
            const workQuery = browseWork ? `&work_title=${encodeURIComponent(browseWork)}` : '';
            const response = await fetch(`http://localhost:8000/ledger?target_path=${encodeURIComponent(props.targetPath)}${workQuery}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setLedger(await response.json());
        } catch (err) {
            setMessage(`作品台帳を読み込めませんでした: ${err.message}`);
        } finally {
            setIsLoadingLedger(false);
        }
    };

    const updateLedgerFact = async (fact, status, note = fact.decision_note || '') => {
        try {
            const response = await fetch('http://localhost:8000/memory-pack/facts/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fact_id: fact.id, status, note })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await loadLedger(false);
        } catch (err) {
            setMessage(`判断を保存できませんでした: ${err.message}`);
        }
    };

    const editLedgerNote = (fact) => {
        const note = window.prompt('この判断の理由・注意事項を入力してください', fact.decision_note || '');
        if (note === null) return;
        updateLedgerFact(fact, fact.decision_status, note);
    };

    const updateLedgerKind = async (fact, kind) => {
        try {
            const response = await fetch('http://localhost:8000/ledger/facts/classify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fact_id: fact.id, kind })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await loadLedger(false);
        } catch (err) {
            setMessage(`分類を保存できませんでした: ${err.message}`);
        }
    };

    const handleOpenFile = (item) => {
        if (window.api && window.api.invoke) {
            // ElectronのIPC経由でメインエディタにファイルを開くよう命令
            window.api.invoke('file:open', item.full_path);
            setMessage(`「${item.file}」をエディタで開きました`);
            setTimeout(() => setMessage(''), 2000);
        } else if (props.onOpenFile) {
            // Webブラウザ版などの場合（props経由）
            props.onOpenFile(null, item.file, { path: item.full_path });
        }
    };

    const handleTagClick = (tag) => {
        setFilterTag(prev => prev === tag ? null : tag);
    };

    const [refSheetQuery, setRefSheetQuery] = useState('');
    const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [selectedEvidence, setSelectedEvidence] = useState([]);
    const [viewedDocument, setViewedDocument] = useState(null);
    const [searchScope, setSearchScope] = useState('all');
    const [searchWork, setSearchWork] = useState('');
    const [searchRoot, setSearchRoot] = useState('');

    const pathLabel = path => String(path || '').split(/[/\\]/).filter(Boolean).pop() || 'フォルダ';
    const searchScopeLabel = () => {
        if (searchScope === 'current') return `現在の作品：${pathLabel(props.targetPath)}`;
        if (searchScope === 'work') return searchWork ? `作品：${searchWork}` : '作品未選択';
        if (searchScope === 'folder') return searchRoot ? `フォルダ：${pathLabel(searchRoot)}` : 'フォルダ未選択';
        return `登録フォルダすべて（${sourceConfig.included.length}件）`;
    };

    const viewOriginal = async (result) => {
        const next = { path: result.full_path, name: result.file, content: '', loading: true, error: '' };
        setViewedDocument(next);
        try {
            if (!window.api?.fs?.readFile) throw new Error('デスクトップ版NEXUSで開いてください');
            const content = await window.api.fs.readFile(result.full_path);
            setViewedDocument({ ...next, content, loading: false });
        } catch (error) {
            setViewedDocument({ ...next, loading: false, error: `原本を読み込めませんでした: ${error.message}` });
        }
    };

    const openOriginal = async (path) => {
        const opened = await window.api?.system?.launchApp?.(path);
        if (!opened) setMessage('原本を外部アプリで開けませんでした');
    };

    const showInFolder = path => window.api?.fs?.showInExplorer?.(path);

    const handleGenerateReferenceSheet = async () => {
        if (!refSheetQuery) {
            alert("検索したいキーワード（例：莓朱の設定矛盾について）を入力してください");
            return;
        }
        if (searchScope === 'current' && !props.targetPath) {
            setMessage('現在の作品フォルダが分かりません。作品を開いてから検索してください');
            return;
        }
        if (searchScope === 'work' && !searchWork) {
            setMessage('検索する作品を選択してください');
            return;
        }
        if (searchScope === 'folder' && !searchRoot) {
            setMessage('検索する登録フォルダを選択してください');
            return;
        }
        setIsGeneratingSheet(true);
        try {
            const request = { query: refSheetQuery, limit: 50 };
            if (searchScope === 'current') request.target_path = props.targetPath;
            if (searchScope === 'work') request.project = searchWork;
            if (searchScope === 'folder') request.target_path = searchRoot;
            const response = await fetch('http://localhost:8000/db/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });
            const data = await response.json();
            const results = data.results || [];
            setSearchResults(results);
            setSelectedEvidence(results.map((_, index) => index));
            if (!results.length) setMessage('該当する根拠は見つかりませんでした');
        } catch (err) {
            console.error("Failed to generate sheet:", err);
            setMessage("シート生成に失敗しました");
        } finally {
            setIsGeneratingSheet(false);
        }
    };

    const copyConsultationMaterial = async () => {
        const chosen = (searchResults || []).filter((_, index) => selectedEvidence.includes(index));
        if (!chosen.length) {
            setMessage('相談資料へ入れる根拠を選択してください');
            return;
        }
        const lines = [
            '# NEXUS 相談資料', '', `## 質問`, '', refSheetQuery, '',
            '## AIへの指示', '',
            '- 下記の根拠だけを事実として扱ってください。',
            '- 根拠にない内容は推測で補わず、不明と明記してください。',
            '- 回答では出典ファイル名と行番号を示してください。', '',
            '## 選択した根拠', ''
        ];
        chosen.forEach((result, index) => {
            lines.push(
                `### ${index + 1}. ${result.file}`,
                '',
                `作品: ${result.work_title || result.project}`,
                `原稿状態: ${result.version_role}`,
                `出典: ${result.full_path} L${result.line}`,
                `完全一致の重複: ${result.exact_duplicate_count || 1}件`,
                '', result.content.trim(), ''
            );
        });
        await navigator.clipboard.writeText(lines.join('\n'));
        setMessage(`選択した根拠 ${chosen.length}件を、一個の相談資料としてコピーしました`);
    };

    const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'SETTING', 'PLOT', 'MANUSCRIPT'
    const [lexicon, setLexicon] = useState(null);
    const [isScanningLexicon, setIsScanningLexicon] = useState(false);
    const [selectedTerms, setSelectedTerms] = useState([]);

    const handleScanLexicon = async () => {
        if (!props.targetPath || !window.api?.textlint?.scanProjectTerms) {
            setMessage('作品フォルダを開いてから実行してください');
            return;
        }
        setIsScanningLexicon(true);
        try {
            const result = await window.api.textlint.scanProjectTerms(props.targetPath);
            setLexicon(result);
            setSelectedTerms(result.candidates.filter(item => item.status === 'recommended').map(item => item.term));
        } catch (err) {
            setMessage(`作品語彙の抽出に失敗しました: ${err.message}`);
        } finally {
            setIsScanningLexicon(false);
        }
    };

    const handleSaveLexicon = async () => {
        if (!selectedTerms.length) return;
        try {
            const result = await window.api.textlint.saveProjectTerms(props.targetPath, selectedTerms);
            setMessage(`${selectedTerms.length}語を作品語彙として保護しました（登録済み合計 ${result.count}語）`);
            setLexicon(null);
        } catch (err) {
            setMessage(`作品語彙を保存できませんでした: ${err.message}`);
        }
    };

    const itemYear = (item) => {
        const pathYears = String(item.full_path || '').match(/(?:19|20)\d{2}/g);
        if (pathYears?.length) return pathYears[pathYears.length - 1];
        if (item.mtime_ns) return String(new Date(Number(item.mtime_ns) / 1e6).getFullYear());
        return '';
    };
    const formatFileSize = (bytes) => {
        const size = Number(bytes || 0);
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${Math.round(size / 1024).toLocaleString()} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };
    const formatModifiedDate = (mtimeNs) => {
        if (!mtimeNs) return '更新日不明';
        const date = new Date(Number(mtimeNs) / 1e6);
        return Number.isNaN(date.getTime()) ? '更新日不明' : date.toLocaleDateString('ja-JP');
    };
    const workOptions = [...new Set(items.map(item => item.work_title || item.project).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ja'));
    const yearOptions = [...new Set(items.map(itemYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const filteredItems = items.filter(item => {
        const matchTag = filterTag ? (item.tags || []).includes(filterTag) : true;
        const matchTab = activeTab === 'ALL' ? true : item.doc_type === activeTab;
        const matchName = !browseName || `${item.file} ${item.full_path}`.toLocaleLowerCase('ja').includes(browseName.toLocaleLowerCase('ja'));
        const matchWork = !browseWork || (item.work_title || item.project) === browseWork;
        const matchRole = !browseRole || item.version_role === browseRole;
        const matchYear = !browseYear || itemYear(item) === browseYear;
        return matchTag && matchTab && matchName && matchWork && matchRole && matchYear;
    }).sort((left, right) => {
        if (browseSort === 'name') return left.file.localeCompare(right.file, 'ja');
        const difference = Number(right.mtime_ns || 0) - Number(left.mtime_ns || 0);
        return browseSort === 'oldest' ? -difference : difference;
    });

    const categories = [
        { id: 'ALL', label: 'すべて', icon: '🌐' },
        { id: 'SETTING', label: '設定資料', icon: '📚' },
        { id: 'PLOT', label: 'プロット', icon: '🗺️' },
        { id: 'MANUSCRIPT', label: '原稿', icon: '✍️' },
        { id: 'OTHER', label: '未分類', icon: '❓' }
    ];

    return (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden', padding: '15px', backgroundColor: '#fcfcfc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#333', fontWeight: '800' }}>📚 ローカル資料・設定ブラウザ</h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowGuide(value => !value)} style={{ padding: '6px 12px', border: '1px solid #aaa', borderRadius: '20px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>？ 使い方</button>
                    {props.standalone && <button onClick={props.onClose || (() => window.close())} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '20px', background: '#fff', color: '#333', cursor: 'pointer', fontSize: '12px' }}>閉じる</button>}
                </div>
            </div>
            {showGuide && <div style={{ marginBottom: '10px', padding: '12px 14px', border: '1px solid #c7d2fe', borderRadius: '9px', background: '#eef2ff', color: '#3730a3', fontSize: '12px', lineHeight: 1.65 }}>
                <strong>基本の使い方</strong><br />
                ① 最初に「資料を差分更新」で、現在の作品フォルダを索引へ反映します。<br />
                ② 内容の言葉を覚えていれば「根拠を検索」、覚えていなければ下の「資料棚」から作品・年代・種類で絞ります。<br />
                ③ 必要な検索結果を選び、「一個の相談資料としてコピー」するとChatGPTなどへ渡せます。<br />
                「作品台帳」は抽出された設定の確認用、「AI共通記憶を更新」は外部AIへ渡すMarkdownの作成用です。原稿本文そのものをDBへ複製しません。
            </div>}
            {!props.targetPath && <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '8px', background: '#fff3cd', color: '#7c5a00', fontSize: '12px' }}>対象作品が渡されていません。資料・知識画面へ戻り、作品を開いた状態で「全文索引・AI相談」を押してください。</div>}
            <div style={{ marginBottom: '10px', border: '1px solid #d7dce5', borderRadius: '9px', background: '#fff', overflow: 'hidden' }}>
                <button onClick={() => setShowSources(value => !value)} style={{ width: '100%', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', border: 'none', background: '#f7f8fa', cursor: 'pointer', color: '#333', fontWeight: 700 }}>
                    <span>📁 検索するフォルダを管理</span><span>{sourceConfig.included.length}件参照・{sourceConfig.excluded.length}件除外 {showSources ? '▲' : '▼'}</span>
                </button>
                {showSources && <div style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <button onClick={() => chooseSourceFolder('include')} style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#2e7d32', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>＋ このフォルダを参照</button>
                        <button onClick={() => chooseSourceFolder('exclude')} style={{ padding: '8px 12px', border: '1px solid #c62828', borderRadius: '6px', background: '#fff', color: '#b71c1c', cursor: 'pointer', fontWeight: 700 }}>－ このフォルダは見ない</button>
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '9px' }}>除外しても原本ファイルは移動・削除しません。NEXUSの検索索引から外すだけです。</div>
                    {sourceConfig.included.map(path => <div key={`in:${path}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '11px' }}><span>✅</span><span title={path} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span><button onClick={() => excludeRegisteredSource(path)} style={{ fontSize: '10px' }}>参照停止</button></div>)}
                    {sourceConfig.excluded.map(path => <div key={`out:${path}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '11px', color: '#777' }}><span>🚫</span><span title={path} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span><button onClick={() => restoreExcludedSource(path)} style={{ fontSize: '10px' }}>再び参照</button></div>)}
                    {!sourceConfig.included.length && !sourceConfig.excluded.length && <div style={{ padding: '8px 0', color: '#888', fontSize: '11px' }}>手動登録はまだありません。現在開いている作品は従来どおり検索できます。</div>}
                </div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                    <button
                        onClick={() => loadLedger(true)}
                        disabled={isLoadingLedger}
                        style={{ padding: '6px 14px', border: '1px solid #3949ab', borderRadius: '20px', color: '#283593', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                        {isLoadingLedger ? '台帳を準備中…' : browseWork ? `「${browseWork}」の作品台帳` : '全作品の台帳'}
                    </button>
                    <button
                        onClick={handleGenerateMemoryPack}
                        disabled={isGeneratingMemoryPack || isSyncing}
                        title="作品フォルダ内に、ChatGPT・Gemini共通の軽量な参照資料を作ります"
                        style={{ padding: '6px 14px', border: '1px solid #00897b', borderRadius: '20px', color: '#00695c', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                        {isGeneratingMemoryPack ? '共通記憶を更新中…' : 'AI共通記憶を更新'}
                    </button>
                    <button
                        onClick={handleChooseMemoryDestination}
                        title={memoryPackDestination || '未設定時は作品フォルダ内へ保存します'}
                        style={{ padding: '6px 10px', border: '1px solid #80cbc4', borderRadius: '20px', color: '#00695c', background: '#fff', cursor: 'pointer', fontSize: '11px' }}
                    >
                        {memoryPackDestination ? '共通記憶の同期先 ✓' : '同期先を選択'}
                    </button>
                    <button
                        onClick={handleScanLexicon}
                        disabled={isScanningLexicon}
                        style={{ padding: '6px 14px', border: '1px solid #7e57c2', borderRadius: '20px', color: '#5e35b1', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                        {isScanningLexicon ? '作品語彙を抽出中…' : '作品語彙を整理'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #b8c3d6', borderRadius: '9px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                        <select
                            value={searchScope}
                            onChange={event => setSearchScope(event.target.value)}
                            title="検索する範囲"
                            style={{ border: 'none', borderRight: '1px solid #d7dce5', padding: '8px 9px', background: '#f6f8fb', color: '#25324a', fontSize: '12px', fontWeight: 700, outline: 'none' }}
                        >
                            <option value="all">登録フォルダすべて</option>
                            <option value="current" disabled={!props.targetPath}>現在の作品だけ</option>
                            <option value="work">作品を選択</option>
                            <option value="folder">フォルダを選択</option>
                        </select>
                        {searchScope === 'work' && <select value={searchWork} onChange={event => setSearchWork(event.target.value)} style={{ maxWidth: '190px', border: 'none', borderRight: '1px solid #d7dce5', padding: '8px', outline: 'none' }}>
                            <option value="">作品を選択…</option>
                            {workOptions.map(work => <option key={work} value={work}>{work}</option>)}
                        </select>}
                        {searchScope === 'folder' && <select value={searchRoot} onChange={event => setSearchRoot(event.target.value)} style={{ maxWidth: '230px', border: 'none', borderRight: '1px solid #d7dce5', padding: '8px', outline: 'none' }}>
                            <option value="">登録フォルダを選択…</option>
                            {sourceConfig.included.map(path => <option key={path} value={path}>{pathLabel(path)}</option>)}
                        </select>}
                        <input 
                            type="text" 
                            placeholder="人物名・地名・覚えている断片を入力…"
                            value={refSheetQuery}
                            onChange={(e) => setRefSheetQuery(e.target.value)}
                            onKeyDown={event => { if (event.key === 'Enter') handleGenerateReferenceSheet(); }}
                            style={{ border: 'none', padding: '9px 13px', fontSize: '13px', width: '280px', outline: 'none' }}
                        />
                        <button 
                            onClick={handleGenerateReferenceSheet}
                            disabled={isGeneratingSheet}
                            style={{ 
                                border: 'none', 
                                backgroundColor: '#2196f3', 
                                color: 'white', 
                                padding: '6px 12px', 
                                cursor: 'pointer', 
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}
                        >
                            {isGeneratingSheet ? '検索中…' : '全文検索'}
                        </button>
                    </div>
                    <button 
                        onClick={handleSync} 
                        disabled={isSyncing}
                        style={{
                            padding: '6px 16px',
                            backgroundColor: isSyncing ? '#ccc' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '20px',
                            cursor: isSyncing ? 'default' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isSyncing ? '📚 差分確認中...' : '資料を差分更新'}
                    </button>
            </div>

            {searchResults && (
                <div style={{ position: 'absolute', inset: '18px', zIndex: 45, background: '#fff', border: '1px solid #90caf9', borderRadius: '12px', boxShadow: '0 14px 44px rgba(0,0,0,.24)', padding: '18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '14px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px' }}>出典付き検索結果</h3>
                            <div style={{ fontSize: '12px', color: '#666' }}>「{refSheetQuery}」: {searchResults.length}件 / {searchScopeLabel()} / 相談資料へ入れる箇所を選択してください</div>
                        </div>
                        <button onClick={() => setSearchResults(null)} style={{ border: 'none', background: 'transparent', fontSize: '22px', cursor: 'pointer' }}>×</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', marginTop: '12px', border: '1px solid #eee', borderRadius: '8px' }}>
                        {searchResults.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>一致する原本はありません</div>
                        ) : searchResults.map((result, index) => {
                            const checked = selectedEvidence.includes(index);
                            return (
                                <label key={`${result.full_path}:${result.offset}`} style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: '8px', padding: '11px', borderBottom: '1px solid #eee', cursor: 'pointer', background: checked ? '#f5faff' : '#fff' }}>
                                    <input type="checkbox" checked={checked} onChange={() => setSelectedEvidence(current => checked ? current.filter(value => value !== index) : [...current, index])} />
                                    <div>
                                        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                                            <strong style={{ color: '#1565c0' }}>{result.file}</strong>
                                            <span>{result.work_title || result.project}</span>
                                            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#eee' }}>{result.version_role}</span>
                                            <span>L{result.line}</span>
                                            {(result.exact_duplicate_count || 1) > 1 && <span>同一本文 {result.exact_duplicate_count}件</span>}
                                        </div>
                                        <div style={{ marginTop: '7px', padding: '8px 10px', background: '#fafafa', whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '12px', maxHeight: '150px', overflow: 'auto' }}>{result.content}</div>
                                        <div style={{ marginTop: '5px', color: '#999', fontSize: '10px' }}>{result.full_path}</div>
                                        <div style={{ display: 'flex', gap: '7px', marginTop: '8px' }}>
                                            <button onClick={event => { event.preventDefault(); event.stopPropagation(); viewOriginal(result); }} style={{ padding: '6px 11px', border: 'none', borderRadius: '5px', background: '#1565c0', color: '#fff', cursor: 'pointer' }}>{/\.md$/i.test(result.file) ? 'Markdownで読む' : '全文を読む'}</button>
                                            <button onClick={event => { event.preventDefault(); event.stopPropagation(); openOriginal(result.full_path); }} style={{ padding: '6px 10px' }}>原本を開く</button>
                                            <button onClick={event => { event.preventDefault(); event.stopPropagation(); showInFolder(result.full_path); }} style={{ padding: '6px 10px' }}>保存場所</button>
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>{selectedEvidence.length}件を選択中</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setSelectedEvidence([])} style={{ padding: '8px 12px' }}>選択解除</button>
                            <button onClick={copyConsultationMaterial} disabled={!selectedEvidence.length} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#1976d2', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>一個の相談資料としてコピー</button>
                        </div>
                    </div>
                </div>
            )}

            {viewedDocument && <DocumentViewer
                document={viewedDocument}
                query={refSheetQuery}
                onClose={() => setViewedDocument(null)}
                onOpenOriginal={openOriginal}
                onShowInFolder={showInFolder}
            />}

            {ledger && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 36px)', height: 'calc(100% - 36px)', minWidth: '620px', minHeight: '420px', maxWidth: 'calc(100% - 12px)', maxHeight: 'calc(100% - 12px)', resize: 'both', zIndex: 40, background: '#fff', border: '1px solid #c5cae9', borderRadius: '12px', boxShadow: '0 14px 44px rgba(0,0,0,.24)', padding: '18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '14px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px' }}>作品台帳</h3>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                抽出候補 {ledger.total}件 / 確定 {ledger.counts?.CONFIRMED || 0} / 仮決定 {ledger.counts?.PROVISIONAL || 0} / 検討中 {ledger.counts?.CONSIDERING || 0} / 未確認 {ledger.counts?.UNREVIEWED || 0}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: '#888', fontSize: '11px' }}>右下をドラッグして大きさを変更</span>
                            <button onClick={() => setLedger(null)} style={{ border: 'none', background: 'transparent', fontSize: '22px', cursor: 'pointer' }}>×</button>
                        </div>
                    </div>
                    <div style={{ margin: '12px 0', padding: '9px 11px', borderRadius: '8px', background: '#e8eaf6', color: '#283593', fontSize: '12px' }}>
                        NEXUSが見つけた候補です。AIや抽出処理だけでは確定しません。筆者が状態を選んだ項目だけが作品の判断として保存されます。
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {Object.entries(entityKindLabels).map(([kind, label]) => (
                            <button key={kind} onClick={() => setLedgerKind(kind)} style={{ padding: '6px 10px', borderRadius: '16px', border: ledgerKind === kind ? '2px solid #3949ab' : '1px solid #ccd0dd', background: ledgerKind === kind ? '#e8eaf6' : '#fff', color: '#263238', cursor: 'pointer' }}>
                                {label} {ledger.kind_counts?.[kind] || 0}
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                        {ledger.subjects?.filter(group => group.facts.some(fact => (fact.entity_kind || 'PERSON') === ledgerKind)).length === 0 ? (
                            <div style={{ padding: '35px', textAlign: 'center', color: '#888' }}>この分類の候補はまだ見つかっていません</div>
                        ) : ledger.subjects?.filter(group => group.facts.some(fact => (fact.entity_kind || 'PERSON') === ledgerKind)).map(group => (
                            <section key={group.subject} style={{ borderBottom: '1px solid #ddd' }}>
                                <div style={{ position: 'sticky', top: 0, background: '#f5f6fb', padding: '8px 12px', fontWeight: 'bold', color: '#303f9f' }}>{group.subject}</div>
                                {group.facts.filter(fact => (fact.entity_kind || 'PERSON') === ledgerKind).map(fact => (
                                    <div key={fact.id} style={{ display: 'grid', gridTemplateColumns: '105px minmax(180px,1fr) minmax(330px,auto) 120px 55px', gap: '8px', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid #f3f3f3', fontSize: '12px' }}>
                                        <span style={{ color: '#666' }}>{predicateLabels[fact.predicate] || fact.predicate}</span>
                                        <div>
                                            <div>{fact.value}</div>
                                            <div style={{ color: '#999', fontSize: '10px' }}>{fact.file_path.split(/[/\\]/).pop()} L{fact.line}{fact.duplicate_count > 1 ? `・同一内容 ${fact.duplicate_count}ファイル` : ''}{fact.decision_note ? ` — ${fact.decision_note}` : ''}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                            {Object.entries(entityKindLabels).filter(([kind]) => kind !== 'UNKNOWN').map(([kind, label]) => {
                                                const selected = (fact.entity_kind || 'PERSON') === kind;
                                                return (
                                                    <button key={kind} onClick={() => updateLedgerKind(fact, kind)} title={`${label}として分類`} style={{ padding: '4px 7px', borderRadius: '12px', border: selected ? '2px solid #3949ab' : '1px solid #d5d8e2', background: selected ? '#e8eaf6' : '#fff', color: kind === 'IGNORE' ? '#b71c1c' : '#263238', fontWeight: selected ? 'bold' : 'normal', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '10px' }}>
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <select value={fact.decision_status} onChange={event => updateLedgerFact(fact, event.target.value)} style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ccc' }}>
                                            {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                        <button onClick={() => editLedgerNote(fact)} style={{ padding: '5px', border: '1px solid #ddd', background: '#fff', borderRadius: '5px', cursor: 'pointer' }}>注記</button>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </div>
                </div>
            )}

            {lexicon && (
                <div style={{ position: 'absolute', inset: '20px', zIndex: 30, background: '#fff', border: '1px solid #ddd', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,.2)', padding: '18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px' }}>作品語彙の候補</h3>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                {lexicon.stats.scannedFiles}ファイルを確認・重複版{lexicon.stats.duplicateFiles}件を除外・推奨{lexicon.stats.recommended}語・要確認{lexicon.stats.review}語・似た表記{lexicon.stats.variantPairs}組
                            </div>
                        </div>
                        <button onClick={() => setLexicon(null)} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer' }}>×</button>
                    </div>
                    <div style={{ margin: '12px 0', padding: '10px', background: '#f3e5f5', borderRadius: '8px', fontSize: '12px', color: '#4a148c' }}>
                        設定資料と複数の本文に登場する固有名詞を選択済みにしています。一般的なカタカナ語は自動選択しません。
                    </div>
                    {lexicon.variants?.length > 0 && (
                        <div style={{ marginBottom: '10px', padding: '9px 10px', background: '#fff3e0', borderRadius: '8px', fontSize: '12px', color: '#8a4b08' }}>
                            表記揺れ候補: {lexicon.variants.slice(0, 8).map(item => `${item.left}／${item.right}`).join('、')}
                            {lexicon.variants.length > 8 ? ` ほか${lexicon.variants.length - 8}組` : ''}
                        </div>
                    )}
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                        {lexicon.candidates.filter(item => item.status !== 'reference').slice(0, 400).map(item => {
                            const checked = selectedTerms.includes(item.term);
                            return <label key={item.term} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #f3f3f3', cursor: 'pointer', fontSize: '13px' }}>
                                <input type="checkbox" checked={checked} onChange={() => setSelectedTerms(current => checked ? current.filter(term => term !== item.term) : [...current, item.term])} />
                                <strong>{item.term}</strong>
                                <span>{item.occurrences}回</span>
                                <span style={{ color: item.status === 'recommended' ? '#2e7d32' : '#ef6c00' }}>{item.status === 'recommended' ? '推奨' : '要確認'}</span>
                            </label>;
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>{selectedTerms.length}語を選択中</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setSelectedTerms([])} style={{ padding: '8px 12px' }}>選択解除</button>
                            <button onClick={handleSaveLexicon} disabled={!selectedTerms.length} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#5e35b1', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>選択した語を作品で保護</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginBottom: '12px', padding: '12px 14px', border: '1px solid #d8dee9', borderRadius: '10px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '9px' }}>
                    <div><strong style={{ fontSize: '14px' }}>🗂️ 資料棚から探す</strong><span style={{ marginLeft: '8px', color: '#777', fontSize: '11px' }}>内容を覚えていなくても、保存時期や作品から辿れます</span></div>
                    <span style={{ fontSize: '11px', color: '#555' }}>{filteredItems.length}件</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(150px, 1fr) 120px 100px 110px auto', gap: '8px' }}>
                    <input value={browseName} onChange={event => setBrowseName(event.target.value)} placeholder="ファイル名・フォルダ名" style={{ minWidth: 0, padding: '7px 9px', border: '1px solid #ccc', borderRadius: '6px' }} />
                    <select value={browseWork} onChange={event => setBrowseWork(event.target.value)} style={{ minWidth: 0, padding: '7px', border: '1px solid #ccc', borderRadius: '6px' }}>
                        <option value="">すべての作品</option>
                        {workOptions.map(work => <option key={work} value={work}>{work}</option>)}
                    </select>
                    <select value={browseRole} onChange={event => setBrowseRole(event.target.value)} style={{ padding: '7px', border: '1px solid #ccc', borderRadius: '6px' }}>
                        <option value="">新旧すべて</option><option value="CURRENT_SEGMENT">現在の構成</option><option value="STANDALONE">単独稿</option><option value="ARCHIVE">旧稿候補</option><option value="UNREFERENCED">構成外</option>
                    </select>
                    <select value={browseYear} onChange={event => setBrowseYear(event.target.value)} style={{ padding: '7px', border: '1px solid #ccc', borderRadius: '6px' }}>
                        <option value="">全年代</option>{yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
                    </select>
                    <select value={browseSort} onChange={event => setBrowseSort(event.target.value)} style={{ padding: '7px', border: '1px solid #ccc', borderRadius: '6px' }}>
                        <option value="newest">更新が新しい順</option><option value="oldest">更新が古い順</option><option value="name">名前順</option>
                    </select>
                    <button onClick={() => { setBrowseName(''); setBrowseWork(''); setBrowseRole(''); setBrowseYear(''); setActiveTab('ALL'); setFilterTag(null); }} style={{ padding: '7px 10px', border: '1px solid #bbb', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>解除</button>
                </div>
            </div>

            {/* カテゴリタブ */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveTab(cat.id)}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            background: activeTab === cat.id ? '#333' : 'transparent',
                            color: activeTab === cat.id ? 'white' : '#666',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>{cat.icon}</span>
                        {cat.label}
                        <span style={{ 
                            fontSize: '10px', 
                            backgroundColor: activeTab === cat.id ? 'rgba(255,255,255,0.2)' : '#eee', 
                            padding: '1px 6px', 
                            borderRadius: '10px',
                            marginLeft: '4px'
                        }}>
                            {items.filter(item => cat.id === 'ALL' || item.doc_type === cat.id).length}
                        </span>
                    </button>
                ))}
            </div>

            {filterTag && (
                <div style={{ 
                    backgroundColor: '#e3f2fd', 
                    color: '#1976d2', 
                    padding: '8px 15px', 
                    borderRadius: '8px', 
                    fontSize: '12px',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span>🏷️ タグで絞り込み中: <strong>#{filterTag}</strong></span>
                    <span onClick={() => setFilterTag(null)} style={{ cursor: 'pointer', fontWeight: 'bold' }}>✕ 解除</span>
                </div>
            )}

            {message && (
                <div style={{ 
                    padding: '8px 12px', 
                    marginBottom: '10px', 
                    backgroundColor: '#e3f2fd', 
                    color: '#0d47a1', 
                    borderRadius: '6px', 
                    fontSize: '12px',
                    borderLeft: '4px solid #2196f3',
                    animation: 'fadeIn 0.3s'
                }}>
                    {message}
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>記憶を読み出し中...</div>
                ) : error ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <div style={{ color: '#d32f2f', marginBottom: '10px', fontSize: '13px' }}>{error}</div>
                        <button onClick={loadItems} style={{ padding: '6px 20px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ddd' }}>再試行</button>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                        一致する資料はありません
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', borderBottom: '2px solid #eee', zIndex: 10 }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '12px 15px' }}>ファイル名 / 明示タグ</th>
                                <th style={{ textAlign: 'center', padding: '12px 10px', width: '100px' }}>ファイル情報</th>
                                <th style={{ textAlign: 'right', padding: '12px 15px', width: '80px' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((item, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.2s' }} className="knowledge-row">
                                    <td style={{ padding: '12px 15px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <div 
                                                onClick={() => handleOpenFile(item)}
                                                style={{ 
                                                    fontWeight: 'bold', 
                                                    fontSize: '14px', 
                                                    color: '#2196f3', 
                                                    cursor: 'pointer',
                                                    textDecoration: 'underline'
                                                }}
                                                title="エディタで開く"
                                            >
                                                {item.file}
                                            </div>
                                            {item.project && (
                                                <span style={{ fontSize: '10px', backgroundColor: '#f0f0f0', padding: '1px 6px', borderRadius: '4px', color: '#666' }}>
                                                    📁 {item.project}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '10px', backgroundColor: item.version_role === 'CURRENT_SEGMENT' ? '#e8f5e9' : item.version_role === 'ARCHIVE' ? '#eeeeee' : item.version_role === 'UNREFERENCED' ? '#fff3e0' : '#e3f2fd', padding: '1px 6px', borderRadius: '4px', color: '#555' }}>
                                                {item.version_role === 'CURRENT_SEGMENT' ? '現在の構成' : item.version_role === 'ARCHIVE' ? '旧稿候補' : item.version_role === 'UNREFERENCED' ? '構成外' : '単独稿'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                            {(item.tags || []).map((tag, i) => (
                                                <span key={i} 
                                                    onClick={() => handleTagClick(tag)}
                                                    style={{ 
                                                        fontSize: '10px', 
                                                        backgroundColor: filterTag === tag ? '#e3f2fd' : '#f5f5f5', 
                                                        color: filterTag === tag ? '#1976d2' : '#555',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        border: filterTag === tag ? '1px solid #2196f3' : '1px solid #ddd',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="このタグで絞り込み"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ 
                                            fontSize: '11px', 
                                            color: '#666', 
                                            backgroundColor: '#f9f9f9', 
                                            padding: '6px 10px', 
                                            borderRadius: '6px',
                                            lineHeight: '1.5',
                                            borderLeft: '2px solid #ddd'
                                        }}>
                                            {item.preview}
                                        </div>
                                        <div title={item.full_path} style={{ marginTop: '6px', color: '#999', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            📂 {String(item.full_path || '').replace(/[/\\][^/\\]+$/, '')}{itemYear(item) ? ` / ${itemYear(item)}年` : ''}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '12px 10px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#555' }}>{formatFileSize(item.size)}</div>
                                        <div style={{ marginTop: '3px', fontSize: '9px', color: '#999' }}>{formatModifiedDate(item.mtime_ns)}</div>
                                        <div style={{ marginTop: '2px', fontSize: '9px', color: '#999' }}>原本参照</div>
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '12px 15px' }}>
                                        <button 
                                            onClick={() => handleDelete(item.full_path)}
                                            style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: '18px', opacity: 0.6 }}
                                            title="AIの記憶から消去"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div style={{ marginTop: '15px', fontSize: '11px', color: '#888' }}>
                ※ 削除するとAIはその内容を引用できなくなります。再度同期すると、ファイルが実在する限り再び記憶されます。
            </div>
        </div>
    );
};

export default AIKnowledgeManager;
