import React, { useState, useEffect } from 'react';
import { ollamaService } from '../utils/ollamaService';

import ContextPicker from './ContextPicker';
import PromptPreviewModal from './PromptPreviewModal';
import AIChatView from './AIChatView';
import AIKnowledgeManager from './AIKnowledgeManager';
import AuditReportWindow from './AuditReportWindow';


const SYSTEM_PROMPTS = {
    FORMATTER: `
あなたは小説の整形専用フィルタです。以下のルールに従って整形し、本文のみを返してください。
内容の変更・削除・言い換え・追加は絶対に行わないこと。
説明文、挨拶、質問などの前置き・後置きも一切出力しないこと。

────────────────────
【絶対禁止事項】
・ダブルクォーテーション（" ”）
・強調における ** や 〈〉 の使用
・本文以外の言葉（説明、意見、感想、質問文）
────────────────────

【改行・段落】
・1文ごとに改行する
・空行は原則なし（ただし場面転換時を除く）
・途中改行は削除し、文末のみ改行する

【字下げ】
・地の文：行頭に全角1字下げ
・会話文：行頭から「」で始める（字下げしない）

【会話文】
・会話文には「」のみ使用する（絶対遵守）
・『』は会話文には絶対に使用しない（強調用途のみ）
・（）は会話文には使用しない（内言・思考専用）
・閉じカギカッコ直後の句点「。」は禁止

【強調】
・『』のみ使用する
・《》はルビ用途以外では『』へ統一する

【ルビ（ふりがな）】
・青空文庫形式へ統一：｜漢字《かな》
・〈かな〉は注釈のみ可（多用しない）
・連続する場合は可読性に応じて半角スペースを挿入
・英字略称に読み仮名ルビは振らない
・英字略称 ⇔ 正式名称の対応を示すルビは例外的に許可する（必要最小限）

【英数字】
・すべて全角へ統一する
・URL・コード・技術記号等は必要最小限に限り原文維持

【記号・符号】
・三点リーダーは……を2つ単位とする
・句読点位置は変更しない
・地の文の文末の句点「。」は削除しない
・ダッシュ「――」は必要最小限
・文中の「！」および「？」直後には全角1スペースを挿入し、改行は禁止（文末除く）
・中黒「・」は必要最小限に限り使用

【括弧】
・括弧は（）に統一（［］｛｝等禁止）
・（）は内言・思考専用とし、会話文に使用しない

// [場面転換]
// ・行頭に「* * *」を置く
・前後の空行は入れない
────────────────────
以上を厳守して本文のみ出力すること。
`,
    PROOFREAD: `
あなたはプロの編集者・校正者です。
提示された小説のテキストに対し、以下の2点を中心にチェックを行ってください。

1. 【文章校正】: 誤字脱字、文法エラー、不自然な日本語、表記ゆれ。
2. 【物語監査】: 提供された <creation_memory>（プロットや設定資料）との矛盾。
   - 例：キャラの機体名が違う、舞台の場所が設定と食い違っている、過去の出来事と矛盾している。

指摘事項は必ず以下のタグ形式で1件ずつ出力してください。

<correction>
<original>指摘箇所の原文（短いフレーズ、検索可能なもの）</original>
<suggested>修正後の案</suggested>
<reason>指摘の理由（設定矛盾の場合は、どの資料と矛盾しているかも明記）</reason>
</correction>

説明文、挨拶、前置きなどは一切不要です。タグのみを正確に出力してください。
`,
    ANALYSIS: `
あなたは文芸評論家および脚本アナリストです。
提示された小説のテキストを構造的に分析し、物語の質を高めるためのフィードバックを提供してください。

【分析項目】
1. **構造分析**: 起承転結や三幕構成の観点から、現在のシーンの役割を分析
2. **キャラクター**: 心理描写の深度、行動の動機付けについての評価
3. **テンポとリズム**: 読みやすさ、描写と会話のバランス
4. **改善提案**: より魅力的な展開にするための具体的な提案

出力はMarkdown形式で見やすく整理してください。
`,
    SUMMARIZE: `
あなたは要約アシスタントです。
提示されたテキストの内容を、以下の制約に従って要約してください。

1. 最大3行程度の簡潔な文章にする
2. 「誰が」「何をして」「どうなったか」を明確にする
3. 物語の核心（重要な出来事や感情の変化）を捉える
`,
    RELATION_EXTRACT: `
あなたは小説の相関関係抽出アシスタントです。
提示されたテキストを読み、登場人物間の関係性を抽出してください。
出力は必ず以下の形式のリンク記法のみで行ってください。

[[人物名|関係性]]

例:
[[太郎|親友]]
[[花子|かつての敵]]

説明文や挨拶は一切不要です。リンク記法のみを、1行に1つずつ出力してください。
他キャラクターとの接点がない場合は何も出力しないでください。
`,
    REWRITE: `
あなたは文芸推敲のスペシャリストです。
提示された「対象テキスト」を、ユーザーの「要望」に基づいてリライトしてください。

【出力ルール】
1. リライト後のテキストのみを出力してください。
2. 説明、前置き、挨拶は一切不要です。
3. 文脈やキャラクターの口調を維持しつつ、より魅力的な表現にしてください。
`,
    CONTINUE: `
    あなたは小説の続きを執筆するゴーストライターです。
    提示された「現在の本文」の続きを、自然な流れで予測して執筆してください。

    【出力ルール】
    1. 続きの文章のみを出力してください。
    2. 最大2〜3文程度の短い提案に留めてください。
    3. 説明、前置き、挨拶は一切不要です。
    4. 文末が途切れている場合は、その続きを補完するように書き始めてください。
    `,
    SHORTEN: `
    以下の日本語テキストを、意味を保ちながら簡潔に短縮してください。
    ルビや書式は維持してください。短縮した文章だけを出力してください。
    説明、挨拶、前置きは一切不要です。
    `,
    DESCRIBE: `
    以下の日本語テキストに、五感（視覚・聴覚・触覚・嗅覚・味覚）の描写を自然に追加してください。
    元の文体を維持してください。描写を追加した文章だけを出力してください。
    説明、挨拶、前置きは一切不要です。
    `
};

const AIAssistant = ({
    text, onInsert, isOpen, onClose, allFiles = [], activeFile = null, initialAction = null, initialTab = 'chat', initialOptions = {},
    corrections = [], setCorrections = null, onApplyCorrection = null, onDiscardCorrection = null, onApplyAllCorrections = null,
    chatMessages = [], setChatMessages = null, setGhostText = null, addCandidate = null, isSidebarMode = false, style = {},
    // AI Model Props
    aiModel = 'local', setAiModel = null, localModels = [], selectedLocalModel = '', setSelectedLocalModel = null, isLocalConnected = false, checkLocalConnection = null,
    // Integrated panels
    renderCandidateBoxPanel, renderSnippetsPanel, renderNotesPanel, projectId = ''
}) => {
    const [activeMode, setActiveMode] = useState('generator'); // 'generator', 'chat', 'correction', 'candidates', 'memos'
    const [chatInput, setChatInput] = useState('');
    const [formatterInput, setFormatterInput] = useState('');
    const [outputMode, setOutputMode] = useState('current');
    const [activeTab, setActiveTab] = useState(initialTab);

    // Chat Mode State
    // const [activeMode, setActiveMode] = useState('generator'); // Removed duplicate
    // Use internal state if props not provided (fallback)
    const [internalChatMessages, setInternalChatMessages] = useState([]);

    const messages = setChatMessages ? chatMessages : internalChatMessages;
    const setMessages = setChatMessages || setInternalChatMessages;

    const [includeContext, setIncludeContext] = useState(true);
    const [useStrictRules, setUseStrictRules] = useState(true);
    // Deprecated in favor of contextFiles
    const [contextFiles, setContextFiles] = useState([]); // List of handles
    const [showContextPicker, setShowContextPicker] = useState(false);
    const [useRAG, setUseRAG] = useState(false); // Local RAG (ChromaDB) toggle
    const [promptPreview, setPromptPreview] = useState({ visible: false, prompt: '', sysPrompt: '', mode: '', options: {} });

    // AI States
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedText, setGeneratedText] = useState('');
    const [cloudInput, setCloudInput] = useState('');
    const [isCloudFlow, setIsCloudFlow] = useState(false);
    const [activeAIAction, setActiveAIAction] = useState(initialAction);
    const [isAuditing, setIsAuditing] = useState(false);
    const [showAuditReport, setShowAuditReport] = useState(false);
    const thinkingTimer = React.useRef(null);
    const abortControllerRef = React.useRef(null);

    const stopGeneration = React.useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsGenerating(false);
        setGeneratedText(prev => prev ? prev + '\n\n（⏹ 生成を中断しました）' : '');
        clearTimeout(thinkingTimer.current);
    }, []);

    const parseCorrections = React.useCallback((textStr) => {
        // Regex to match <correction>...<original>...</original>...
        // Handles optional attributes, whitespace, and case-insensitivity
        const regex = /<correction([^>]*)>[\s\S]*?<original[^>]*>([\s\S]*?)<\/original>[\s\S]*?<suggested[^>]*>([\s\S]*?)<\/suggested>[\s\S]*?(?:<reason[^>]*>([\s\S]*?)<\/reason>)?[\s\S]*?<\/correction>/gi;

        const matches = [...textStr.matchAll(regex)];
        const parsed = matches.map(m => {
            const original = m[2].trim();
            const startMatch = m[1].match(/\bstart=["'](\d+)["']/i);
            const endMatch = m[1].match(/\bend=["'](\d+)["']/i);
            let start = startMatch ? Number(startMatch[1]) : undefined;
            let end = endMatch ? Number(endMatch[1]) : undefined;

            // 位置情報を返さない外部AIについては、一意に特定できる場合だけ補完する。
            // 同じ表現が複数ある場合は曖昧なままにし、適用側で安全に拒否する。
            if (!Number.isInteger(start) || !Number.isInteger(end) || text.slice(start, end) !== original) {
                const first = text.indexOf(original);
                const second = first >= 0 ? text.indexOf(original, first + original.length) : -1;
                if (first >= 0 && second === -1) {
                    start = first;
                    end = first + original.length;
                } else {
                    start = undefined;
                    end = undefined;
                }
            }
            return {
                original,
                suggested: m[3].trim(),
                reason: m[4] ? m[4].trim() : '',
                start,
                end,
                id: Math.random().toString(36).substr(2, 9)
            };
        });

        if (parsed.length === 0 && textStr.includes('correction')) {
            console.warn('Parsing failed despite "correction" keyword present.', textStr);
        }

        if (setCorrections) {
            setCorrections(parsed);
        }
    }, [setCorrections, text]);

    const handleLaunchAI = React.useCallback(async (mode = 'chat', options = {}) => {
        if (mode === 'chat' && !chatInput.trim()) return;
        setActiveAIAction(mode === 'chat' ? null : mode);
        if (setCorrections) setCorrections([]);

        setGeneratedText('AIが思考中...');

        // Start fallback timer (15s) for local AI
        clearTimeout(thinkingTimer.current);
        if (aiModel === 'local') {
            thinkingTimer.current = setTimeout(() => {
                alert('ローカルAIの生成に時間がかかっています。より高品質な「クラウドモード」を試してみませんか？');
            }, 15000);
        }

        let prompt = "";
        let systemPrompt = "";

        // Build prompt based on mode
        switch (mode) {
            case 'proofread':
                systemPrompt = SYSTEM_PROMPTS.PROOFREAD;
                prompt = `以下のテキストを校正してください: \n\n${options.selectedText || text.slice(-8000)}`;
                break;
            case 'analysis':
                systemPrompt = SYSTEM_PROMPTS.ANALYSIS;
                prompt = `以下のテキストを分析してください: \n\n${options.selectedText || text.slice(-12000)} `;
                break;
            case 'summarize':
                systemPrompt = SYSTEM_PROMPTS.SUMMARIZE;
                prompt = `以下のテキストを要約してください: \n\n${options.selectedText || text.slice(-8000)} `;
                break;
            case 'relextract':
                systemPrompt = SYSTEM_PROMPTS.RELATION_EXTRACT;
                prompt = `以下のテキストから人物相関を抽出してください: \n\n${options.selectedText || text.slice(-12000)} `;
                break;
            case 'rewrite':
                systemPrompt = SYSTEM_PROMPTS.REWRITE;
                prompt = `対象テキスト: \n${options.selectedText || text.slice(-1000)} \n\n要望: \n${options.instruction || chatInput || 'より魅力的にしてください'} `;
                break;
            case 'continue':
                systemPrompt = SYSTEM_PROMPTS.CONTINUE;
                prompt = `現在の本文: \n${text.slice(-4000)} `;
                break;
            case 'shorten':
                systemPrompt = SYSTEM_PROMPTS.SHORTEN;
                prompt = `以下のテキストを短縮してください: \n\n${options.selectedText || text.slice(-4000)}`;
                break;
            case 'describe':
                systemPrompt = SYSTEM_PROMPTS.DESCRIBE;
                prompt = `以下のテキストに描写を追加してください: \n\n${options.selectedText || text.slice(-4000)}`;
                break;
            default: { // Handle default/chat mode
                // Strict Order: Cards -> Summary (Skip) -> Previous Text -> Selection -> Instruction
                const buildContextualPrompt = () => {
                    let constructedPrompt = "";

                    // 1. Context Files (Cards/Materials)
                    if (contextFiles.length > 0 && allFiles.length > 0) {
                        let materialContext = "【参照コンテキスト】\n";
                        const selectedFiles = allFiles.filter(f => contextFiles.includes(f.handle));
                        selectedFiles.forEach(f => {
                            materialContext += `■ ${f.name} (${f.metadata?.種別 || '資料'})\n${f.body?.slice(0, 2000)} \n\n`;
                        });
                        constructedPrompt += materialContext + "\n";
                    } else if (activeFile) {
                        // Default to active file if no specific context selected? 
                        // No, explicit selection is better.
                    }

                    // 2. Previous Text (Context)
                    if (includeContext) {
                        constructedPrompt += `現在の本文: \n${text.slice(-2000)} \n\n`;
                    }

                    return constructedPrompt;
                };

                const basePrompt = buildContextualPrompt();
                prompt = basePrompt + `指示: \n${chatInput} \n\n`;

                // Add hint for corrections
                prompt += `\n(文章の修正・校正を求められた場合は、必ず <correction> タグを使用してください)`;

                if (useStrictRules) {
                    prompt += `\n(出力ルール: 青空文庫形式の小説ルールを厳守してください)`;
                }
                break;
            }
        }

        if (options.preview) {
            setPromptPreview({
                visible: true,
                prompt: prompt,
                sysPrompt: systemPrompt,
                mode: mode,
                options: { ...options, preview: false } // Avoid loop
            });
            return;
        }

            if (aiModel === 'local') {
                if (mode === 'proofread') {
                    setIsGenerating(true);
                    setGeneratedText('🚩 統合校正を実行中（textlint／LanguageTool／RedPen／Tomarigi系統）...');
                    try {
                        const activePath = activeFile?.path || activeFile?.handle || '';
                        const resultXml = await ollamaService.proofreadWithRules(
                            options.selectedText || text.slice(-8000), activePath, selectedLocalModel
                        );
                        setGeneratedText(resultXml || '指摘事項はありませんでした。');
                        parseCorrections(resultXml);
                    } catch (err) {
                        console.error("Proofread failed", err);
                        alert("校正に失敗しました");
                    } finally {
                        setIsGenerating(false);
                        clearTimeout(thinkingTimer.current);
                    }
                    return;
                }
                
                if (!isLocalConnected) {
                alert('Ollamaに接続できません。Ollamaが起動しているか確認してください。');
                setGeneratedText('');
                clearTimeout(thinkingTimer.current);
                return;
            }
            if (!selectedLocalModel) {
                alert('モデルが選択されていません。');
                setGeneratedText('');
                clearTimeout(thinkingTimer.current);
                return;
            }
            setIsGenerating(true);
            setGeneratedText('');
            abortControllerRef.current = new AbortController();
            try {
                const messages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ];
                let fullText = "";
                
                // Proofread の場合は RAG (物語監査) を優先使用する
                if (mode === 'proofread') {
                    await ollamaService.chatWithRAG(prompt, selectedLocalModel, (chunk) => {
                        fullText += chunk;
                        setGeneratedText(fullText);
                    }, abortControllerRef.current.signal, systemPrompt, activeFile?.path || activeFile?.handle || '');
                } else {
                    await ollamaService.chat(messages, selectedLocalModel, (chunk) => {
                        fullText += chunk;
                        setGeneratedText(fullText);
                    }, abortControllerRef.current.signal);
                }
                if (!fullText) {
                    // Aborted
                    return;
                }
                if (mode === 'proofread') {
                    parseCorrections(fullText);
                } else if (addCandidate) {
                    // Send to Candidate Box
                    addCandidate({
                        type: mode || 'general',
                        content: fullText,
                        originalText: options.selectedText || '',
                        source: {
                            mode: mode || 'general',
                            timestamp: new Date().toISOString()
                        }
                    });
                }
                if (mode === 'continue' && setGhostText) {
                    setGhostText(fullText);
                }
            } catch (e) {
                console.error("Local generation failed", e);
                alert("生成に失敗しました: " + e.message);
            } finally {
                setIsGenerating(false);
                clearTimeout(thinkingTimer.current);
            }
            return;
        }

        // Cloud Ritual Flow
        try {
            const fullPrompt = `【役割定義】\n${systemPrompt} \n\n【プロンプト】\n${prompt}\n\n[回答ルール] 結果は必ず \`\`\` (コードブロック) で囲んで出力してください。`;

            // Clipboard writing needs focus (mostly in Electron/Safari)
            window.focus();
            await navigator.clipboard.writeText(fullPrompt);

            setIsCloudFlow(true);
            setGeneratedText('プロンプトをクリップボードにコピーしました！\n1. WebのAI（ChatGPT等）に貼り付けて実行してください。\n2. 返ってきた結果を下の「結果貼り付け」欄に入れてください。');

            if (aiModel === 'chatgpt') {
                window.open('https://chatgpt.com/', '_blank');
            } else if (aiModel === 'gemini') {
                window.open('https://gemini.google.com/', '_blank');
            } else if (aiModel === 'claude') {
                window.open('https://claude.ai/', '_blank');
            } else if (aiModel === 'genspark') {
                window.open('https://www.genspark.ai/', '_blank');
            }
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('クリップボードへのコピーに失敗しました。この操作にはウィンドウのフォーカスが必要です。');
        } finally {
            clearTimeout(thinkingTimer.current);
        }
    }, [aiModel, isLocalConnected, selectedLocalModel, allFiles, activeFile, text, chatInput, useStrictRules, includeContext, parseCorrections, setGhostText, setCorrections, addCandidate, contextFiles]);

    const handleStartFullAudit = async () => {
        setIsAuditing(true);
        setGeneratedText('🚩 【校正監査モード】を開始しました。全原稿の同期と、設定資料との照合をバックグラウンドで実行しています。大規模な原稿の場合、数分かかることがあります。');
        try {
            const data = await ollamaService.startFullAudit();
            if (data.status === 'completed') {
                setGeneratedText('🎉 監査が完了しました！別窓の「宿題リスト」に指摘事項が表示されます。');
                setShowAuditReport(true);
            }
        } catch (error) {
            console.error('Audit failed:', error);
            setGeneratedText('❌ 監査中にエラーが発生しました。Pythonブリッジサーバーのログを確認してください。');
        } finally {
            setIsAuditing(false);
        }
    };

    useEffect(() => {
        if (isOpen && initialAction) {
            handleLaunchAI(initialAction, initialOptions);
        }
    }, [isOpen, initialAction, initialOptions, handleLaunchAI]);

    const handleApplyCorrection = async (correction) => {
        let applied = true;
        if (onInsert) {
            applied = await onInsert(correction, 'replace');
        }
        if (applied !== false && setCorrections) {
            setCorrections(prev => prev.filter(c => c.id !== correction.id));
        }
    };

    const handleJumpToCorrection = (correction) => {
        if (onInsert) {
            onInsert(correction, 'jump');
        }
    };



    const handleContextSelection = (handles) => {
        const selectedFiles = allFiles.filter(f => handles.includes(f.handle));
        setContextFiles(selectedFiles);
    };

    const handleInsert = async () => {
        if (!formatterInput.trim()) return;
        let cleaned = formatterInput;
        cleaned = cleaned.replace(/^["'「](.*)["'」]$/gs, '$1').trim();
        if (outputMode === 'clipboard') {
            try {
                await navigator.clipboard.writeText(cleaned);
                alert("クリップボードにコピーしました。");
            } catch (copyErr) {
                console.error(copyErr);
                alert("コピーに失敗しました。");
            }
        } else {
            onInsert(cleaned, outputMode);
        }
        setFormatterInput('');
        onClose();
    };

    const handleChatSendMessage = async (userMessage) => {
        if (!userMessage.trim()) return;

        const newMessages = [...chatMessages, { role: 'user', content: userMessage }];
        setMessages(newMessages);
        setIsGenerating(true);

        try {
            // Build context prompt if needed
            let systemPrompt = "あなたは小説執筆のアシスタントです。ユーザーの創作活動をサポートし、壁打ち相手として振る舞ってください。";
            let contextContent = "";

            if (contextFiles.length > 0) {
                // Simplified context inclusion for now
                contextContent = "\n\n【参照資料】\n" + contextFiles.map(f => `--- ${f.name} ---\n${f.content.substring(0, 1000)}...`).join('\n\n');
            }

            const messagesToSend = [
                { role: 'system', content: systemPrompt + (contextContent ? "\n以下の資料を参照してください。" + contextContent : "") },
                ...newMessages
            ];

            if (aiModel === 'local') {
                abortControllerRef.current = new AbortController();
                let fullResponse = "";
                
                const onChunk = (chunk) => {
                    fullResponse += chunk;
                    // Update the last message in real-time
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
                            newMsgs[newMsgs.length - 1].content = fullResponse;
                        } else {
                            newMsgs.push({ role: 'assistant', content: fullResponse });
                        }
                        return newMsgs;
                    });
                };

                if (useRAG) {
                    await ollamaService.chatWithRAG(
                        userMessage,
                        selectedLocalModel,
                        onChunk,
                        abortControllerRef.current.signal,
                        "",
                        activeFile?.path || activeFile?.handle || ''
                    );
                } else {
                    await ollamaService.chat(
                        messagesToSend,
                        selectedLocalModel,
                        onChunk,
                        abortControllerRef.current.signal
                    );
                }
            } else {
                // Mock for Cloud
                setTimeout(() => {
                    setMessages(prev => [...prev, { role: 'assistant', content: "クラウドAIのチャット機能はまだ実装されていません。" }]);
                }, 1000);
            }

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { role: 'assistant', content: "エラーが発生しました: " + error.message }]);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="ai-assistant-panel" style={isSidebarMode ? {
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--bg-paper)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'var(--font-gothic)',
            ...style
        } : {
            position: 'fixed',
            bottom: '80px',
            right: '30px',
            width: '400px',
            height: '600px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            borderRadius: '16px',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.5)',
            backdropFilter: 'blur(12px)',
            fontFamily: 'var(--font-gothic)',
            ...style
        }}>
            <div className="ai-header" style={{
                padding: '0',
                backgroundColor: 'transparent',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px' }}>
                    <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {[
                            { id: 'generator', label: '⚡ 生成' },
                            { id: 'chat', label: '💬 チャット' },
                            { id: 'knowledge', label: '🧠 知識管理' },
                            { id: 'correction', label: '📝 校正' },
                            { id: 'candidates', label: '📦 候補' },
                            { id: 'memos', label: '📌 メモ' },
                            { id: 'notes', label: '📓 ノート' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveMode(tab.id)}
                                style={{
                                    padding: '4px 8px', border: 'none', background: 'transparent',
                                    borderBottom: activeMode === tab.id ? '2px solid var(--accent-color)' : '2px solid transparent',
                                    color: activeMode === tab.id ? 'var(--accent-color)' : '#999',
                                    cursor: 'pointer', fontSize: '12px', fontWeight: activeMode === tab.id ? 'bold' : 'normal',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {!isSidebarMode && (
                        <button onClick={onClose} style={{
                            border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer',
                            width: '24px', height: '24px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666'
                        }}>✕</button>
                    )}
                </div>
            </div>

            {/* Content Area Switch */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* AI Status Bar - 生成中の表示と停止ボタン */}
                {isGenerating && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        backgroundColor: 'var(--accent-color, #3498db)',
                        color: '#fff',
                        fontSize: '12px',
                        flexShrink: 0,
                        animation: 'pulse 1.5s ease-in-out infinite'
                    }}>
                        <span>🤖 {activeAIAction === 'rewrite' ? 'リライト' : activeAIAction === 'proofread' ? '校正' : activeAIAction === 'shorten' ? '短縮' : activeAIAction === 'describe' ? '描写追加' : activeAIAction === 'continue' ? '続き生成' : activeAIAction === 'analysis' ? '分析' : activeAIAction || '生成'}中...</span>
                        <button
                            onClick={stopGeneration}
                            style={{
                                border: '1px solid rgba(255,255,255,0.5)',
                                background: 'rgba(255,255,255,0.15)',
                                color: '#fff',
                                padding: '2px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}
                        >
                            ⏹ 停止
                        </button>
                    </div>
                )}
                <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }`}</style>
                {activeMode === 'candidates' && renderCandidateBoxPanel && renderCandidateBoxPanel()}
                {activeMode === 'memos' && renderSnippetsPanel && renderSnippetsPanel()}
                {activeMode === 'notes' && renderNotesPanel && renderNotesPanel()}
                {activeMode === 'knowledge' && <AIKnowledgeManager targetPath={projectId} />}

                {activeMode === 'chat' && (
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <AIChatView
                            messages={messages}
                            onSendMessage={handleChatSendMessage}
                            isGenerating={isGenerating}
                            contextFiles={contextFiles}
                            onClearChat={() => setMessages([])}
                            useRAG={useRAG}
                            setUseRAG={setUseRAG}
                        />
                        {showContextPicker && (
                            <ContextPicker
                                availableFiles={allFiles}
                                selectedHandles={contextFiles.map(f => f.handle)}
                                onSelectionChange={handleContextSelection}
                                onClose={() => setShowContextPicker(false)}
                            />
                        )}
                    </div>
                )}

                {activeMode === 'generator' && (
                    <>
                        <div style={{ display: 'flex', padding: '0 20px' }}>
                            <button
                                onClick={() => setActiveTab('chat')}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    border: 'none',
                                    background: 'transparent',
                                    fontWeight: activeTab === 'chat' ? 'bold' : 'normal',
                                    color: activeTab === 'chat' ? 'var(--accent-color)' : '#888',
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'chat' ? '2px solid var(--accent-color)' : '2px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                AI起動
                            </button>
                            <button
                                onClick={() => setActiveTab('formatter')}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    border: 'none',
                                    background: 'transparent',
                                    fontWeight: activeTab === 'formatter' ? 'bold' : 'normal',
                                    color: activeTab === 'formatter' ? 'var(--accent-color)' : '#888',
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'formatter' ? '2px solid var(--accent-color)' : '2px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                            </button>
                            <button
                                onClick={() => setActiveTab('corrections')}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    border: 'none',
                                    background: 'transparent',
                                    fontWeight: activeTab === 'corrections' ? 'bold' : 'normal',
                                    color: activeTab === 'corrections' ? 'var(--accent-color)' : '#888',
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'corrections' ? '2px solid var(--accent-color)' : '2px solid transparent',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                            >
                                校正
                                {corrections.length > 0 && (
                                    <span style={{
                                        position: 'absolute', top: '5px', right: '15px',
                                        background: '#ff4d4f', color: 'white', borderRadius: '50%',
                                        width: '18px', height: '18px', fontSize: '10px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {corrections.length}
                                    </span>
                                )}
                            </button>
                        </div>


                        {activeTab === 'chat' ? (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', gap: '15px', overflowY: 'auto' }}>

                                <div style={{
                                    backgroundColor: '#f0f4f8',
                                    padding: '15px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    color: '#444',
                                    lineHeight: '1.6'
                                }}>
                                    <strong>使い方:</strong>
                                    <ol style={{ paddingLeft: '20px', margin: '5px 0 0 0' }}>
                                        <li>指示を入力して「AIを起動」をクリック</li>
                                        <li>プロンプトが自動的に<strong>コピー</strong>されます</li>
                                        <li>開いたAIツールの入力欄に<strong>貼り付け（Ctrl+V）</strong>してください</li>
                                    </ol>
                                </div>

                                {aiModel === 'local' && isLocalConnected && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isSidebarMode ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
                                        gap: '8px',
                                        marginBottom: '5px'
                                    }}>
                                        <button
                                            onClick={() => handleLaunchAI('proofread')}
                                            disabled={isGenerating || !text}
                                            style={{
                                                flex: 1, padding: '8px', fontSize: '12px',
                                                background: '#fff3e0', border: '1px solid #ffe0b2', color: '#e65100',
                                                borderRadius: '4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center'
                                            }}
                                        >
                                            <span style={{ fontSize: '16px' }}>📝</span>
                                            校正
                                        </button>
                                        <button
                                            onClick={() => handleLaunchAI('analysis')}
                                            disabled={isGenerating || !text}
                                            style={{
                                                flex: 1, padding: '8px', fontSize: '12px',
                                                background: '#e3f2fd', border: '1px solid #bbdefb', color: '#0d47a1',
                                                borderRadius: '4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center'
                                            }}
                                        >
                                            <span style={{ fontSize: '16px' }}>🔬</span>
                                            構造解析
                                        </button>
                                        <button
                                            onClick={handleStartFullAudit}
                                            disabled={isGenerating || isAuditing}
                                            style={{
                                                flex: 1, padding: '8px', fontSize: '12px',
                                                background: '#f3e5f5', border: '1px solid #e1bee7', color: '#4a148c',
                                                borderRadius: '4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center'
                                            }}
                                        >
                                            <span style={{ fontSize: '16px' }}>⚖️</span>
                                            {isAuditing ? '中...' : '校正監査'}
                                        </button>
                                        <button
                                            onClick={() => window.api?.invoke?.('window:openKnowledge', projectId)}
                                            style={{
                                                flex: 1, padding: '8px', fontSize: '12px',
                                                background: '#fff9c4', border: '1px solid #fff176', color: '#f57f17',
                                                borderRadius: '4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center'
                                            }}
                                        >
                                            <span style={{ fontSize: '16px' }}>🧠</span>
                                            知識ベース
                                        </button>
                                    </div>
                                )}

                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="例: 続きを書いて、このシーンの描写を膨らませて..."
                                    style={{
                                        flex: 1,
                                        minHeight: isSidebarMode ? '60px' : '100px',
                                        resize: 'none',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #ddd',
                                        fontFamily: 'inherit',
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
                                    }}
                                />

                                <div style={{ display: 'flex', gap: '15px', padding: '0 5px', flexWrap: isSidebarMode ? 'wrap' : 'nowrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isSidebarMode ? '11px' : '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="aiModel"
                                            checked={aiModel === 'local'}
                                            onChange={() => setAiModel('local')}
                                            style={{ accentColor: '#333' }}
                                        />
                                        Local (Ollama)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isSidebarMode ? '11px' : '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="aiModel"
                                            checked={aiModel === 'chatgpt'}
                                            onChange={() => setAiModel('chatgpt')}
                                            style={{ accentColor: '#10a37f' }}
                                        />
                                        ChatGPT
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isSidebarMode ? '11px' : '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="aiModel"
                                            checked={aiModel === 'gemini'}
                                            onChange={() => setAiModel('gemini')}
                                            style={{ accentColor: '#4285F4' }}
                                        />
                                        Gemini
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isSidebarMode ? '11px' : '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="aiModel"
                                            checked={aiModel === 'claude'}
                                            onChange={() => setAiModel('claude')}
                                            style={{ accentColor: '#d97757' }}
                                        />
                                        Claude
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isSidebarMode ? '11px' : '13px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="aiModel"
                                            checked={aiModel === 'genspark'}
                                            onChange={() => setAiModel('genspark')}
                                            style={{ accentColor: '#6366f1' }}
                                        />
                                        Genspark
                                    </label>
                                </div>

                                {
                                    aiModel === 'local' && (
                                        <div style={{ background: '#eee', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isLocalConnected ? '#4CAF50' : '#f44336' }}></div>
                                                    <span>{isLocalConnected ? 'Connected' : 'Disconnected'}</span>
                                                </div>
                                                <button onClick={checkLocalConnection} style={{ padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}>再接続</button>
                                            </div>

                                            {isLocalConnected ? (
                                                <>
                                                    <select
                                                        value={selectedLocalModel}
                                                        onChange={(e) => setSelectedLocalModel(e.target.value)}
                                                        style={{ width: '100%', padding: '4px' }}
                                                    >
                                                        {localModels.map(m => { const name = typeof m === 'string' ? m : m.name || m.model; return <option key={name} value={name}>{name}</option>; })}
                                                        {localModels.length === 0 && <option value="">モデルなし: ターミナルで `ollama run llama3` などを実行してください</option>}
                                                    </select>
                                                    {localModels.length === 0 && (
                                                        <div style={{ fontSize: '11px', color: '#e65100', marginTop: '4px' }}>
                                                            ⚠️ AIモデルがインストールされていません。<br />
                                                            ターミナルを開き <code>ollama run llama3</code> を実行してモデルをダウンロードしてください。
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div style={{ color: '#d32f2f' }}>
                                                    Ollamaを起動してください。<br />
                                                    <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: '#1976d2' }}>公式サイトからインストール</a>
                                                </div>
                                            )}
                                        </div>
                                    )
                                }

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => setShowContextPicker(true)}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '12px',
                                                background: contextFiles.length > 0 ? '#e3f2fd' : '#f5f5f5',
                                                color: contextFiles.length > 0 ? '#1976d2' : '#333',
                                                border: '1px solid #ddd',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            📚 コンテキスト選択: {contextFiles.length}ファイル
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="includeContext"
                                            checked={includeContext}
                                            onChange={(e) => setIncludeContext(e.target.checked)}
                                            style={{ accentColor: 'var(--accent-color)' }}
                                        />
                                        <label htmlFor="includeContext" style={{ fontSize: '13px', cursor: 'pointer', color: '#555' }}>
                                            直前の本文（2000文字）を含める
                                        </label>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="useStrictRules"
                                            checked={useStrictRules}
                                            onChange={(e) => setUseStrictRules(e.target.checked)}
                                            style={{ accentColor: 'var(--accent-color)' }}
                                        />
                                        <label htmlFor="useStrictRules" style={{ fontSize: '13px', cursor: 'pointer', color: '#555' }}>
                                            厳格な整形ルールを適用
                                        </label>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={() => handleLaunchAI('chat', { preview: true })}
                                        disabled={!chatInput.trim()}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            backgroundColor: '#fff',
                                            color: '#333',
                                            border: '1px solid #ddd',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                            fontSize: '12px'
                                        }}
                                    >
                                        <span style={{ fontSize: '16px' }}>👁️</span>
                                        <span style={{ whiteSpace: 'nowrap' }}>プレビュー</span>
                                    </button>
                                    <button
                                        onClick={() => handleLaunchAI('copy')}
                                        disabled={!chatInput.trim()}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            backgroundColor: '#f5f5f5',
                                            color: '#333',
                                            border: '1px solid #ddd',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                            fontSize: '12px'
                                        }}
                                    >
                                        <span style={{ fontSize: '16px' }}>📋</span>
                                        <span style={{ whiteSpace: 'nowrap' }}>コピー</span>
                                    </button>
                                    <button
                                        onClick={() => handleLaunchAI('chat')}
                                        disabled={!chatInput.trim() || (aiModel === 'local' && (!isLocalConnected || isGenerating))}
                                        style={{
                                            flex: 2,
                                            padding: '8px',
                                            backgroundColor: aiModel === 'local' ? '#333' : (aiModel === 'chatgpt' ? '#10a37f' : aiModel === 'claude' ? '#d97757' : aiModel === 'genspark' ? '#6366f1' : '#4285F4'),
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '13px',
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <span style={{ fontSize: '16px' }}>🚀</span>
                                        <span style={{ whiteSpace: 'nowrap' }}>AIを起動</span>
                                    </button>
                                </div>

                                {
                                    isCloudFlow && (
                                        <div style={{ marginTop: '5px', padding: '12px', background: '#f0f7ff', borderRadius: '8px', border: '1px solid #c0d9f2' }}>
                                            <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold', color: '#0056b3' }}>
                                                📥 クラウドAIの結果を貼り付け
                                            </p>
                                            <textarea
                                                value={cloudInput}
                                                onChange={(e) => setCloudInput(e.target.value)}
                                                placeholder="AIの回答をここにペースト..."
                                                style={{
                                                    width: '100%',
                                                    height: isSidebarMode ? '50px' : '80px',
                                                    fontSize: '12px',
                                                    padding: '8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #ccc',
                                                    marginBottom: '8px',
                                                    resize: 'none',
                                                    fontFamily: 'inherit'
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const match = cloudInput.match(/\[RESULT START\]([\s\S]*?)\[RESULT END\]/) ||
                                                        cloudInput.match(/```(?:javascript|text|markdown)?\n([\s\S]*?)\n```/);
                                                    let cleanText = match ? match[1] : cloudInput;
                                                    cleanText = cleanText.replace(/［＃.*?］/g, '').trim();

                                                    if (activeAIAction === 'proofread') {
                                                        parseCorrections(cleanText);
                                                    } else if (addCandidate) {
                                                        addCandidate({
                                                            type: activeAIAction || 'general',
                                                            content: cleanText,
                                                            originalText: chatInput || '',
                                                            source: {
                                                                mode: activeAIAction || 'general',
                                                                timestamp: new Date().toISOString()
                                                            }
                                                        });
                                                        setGeneratedText('候補箱に追加しました！');
                                                    } else if (activeAIAction === 'continue' && setGhostText) {
                                                        setGhostText(cleanText);
                                                    } else if (onInsert) {
                                                        onInsert(cleanText);
                                                    }
                                                    setIsCloudFlow(false);
                                                    setCloudInput('');
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    background: '#28a745',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                {activeAIAction === 'proofread' ? 'エディタに適用する' : '候補箱に追加する'}
                                            </button>
                                        </div>
                                    )
                                }

                                {
                                    activeAIAction === 'proofread' && corrections.length > 0 && (
                                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                                                {corrections.length}件の指摘があります:
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', padding: '2px' }}>
                                                {corrections.map(c => (
                                                    <div key={c.id} style={{
                                                        background: '#fff',
                                                        border: '1px solid #e0e0e0',
                                                        borderRadius: '8px',
                                                        padding: '12px',
                                                        fontSize: '13px',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '8px'
                                                    }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                                            <span style={{ color: '#e53935', textDecoration: 'line-through' }}>{c.original}</span>
                                                            <span style={{ color: '#888' }}>→</span>
                                                            <span style={{ color: '#43a047', fontWeight: 'bold' }}>{c.suggested}</span>
                                                        </div>
                                                        <div style={{ color: '#666', fontSize: '12px', fontStyle: 'italic', borderLeft: '2px solid #ddd', paddingLeft: '8px' }}>
                                                            {c.reason}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                            <button
                                                                onClick={() => handleJumpToCorrection(c)}
                                                                style={{
                                                                    padding: '6px 12px', background: '#e3f2fd', color: '#0d47a1',
                                                                    border: '1px solid #bbdefb', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                                                                }}
                                                            >
                                                                確認
                                                            </button>
                                                            <button
                                                                onClick={() => handleApplyCorrection(c)}
                                                                style={{
                                                                    flex: 1, padding: '6px', background: 'var(--accent-color)', color: '#fff',
                                                                    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                                                                }}
                                                            >
                                                                適用する
                                                            </button>
                                                            <button
                                                                onClick={() => { if (setCorrections) setCorrections(prev => prev.filter(item => item.id !== c.id)); }}
                                                                style={{
                                                                    padding: '6px 12px', background: '#f5f5f5', color: '#666',
                                                                    border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                                                                }}
                                                            >
                                                                無視
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                }

                                <div style={{
                                    marginTop: '15px',
                                    padding: '10px',
                                    background: '#f9f9f9',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    whiteSpace: 'pre-wrap',
                                    border: '1px solid #eee',
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    color: generatedText.includes('思考中') ? '#666' : '#333'
                                }}>
                                    {generatedText}
                                </div>
                            </div >
                        ) : activeTab === 'corrections' ? (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                                {corrections.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
                                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
                                        修正事項はありません
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <span style={{ fontWeight: 'bold' }}>{corrections.length}件の指摘</span>
                                            {corrections.length > 1 && onApplyAllCorrections && (
                                                <button
                                                    onClick={onApplyAllCorrections}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: 'var(--accent-color)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    すべて適用
                                                </button>
                                            )}
                                        </div>
                                        {corrections.map((corr) => (
                                            <div key={corr.id} style={{
                                                padding: '12px',
                                                border: '1px solid #eee',
                                                borderRadius: '8px',
                                                background: '#fff',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        color: '#e74c3c',
                                                        fontWeight: 'bold',
                                                        background: '#fdedec',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px'
                                                    }}>原文</span>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => onApplyCorrection && onApplyCorrection(corr)}
                                                            title="修正を適用"
                                                            style={{ border: 'none', background: '#e8f5e9', color: '#27ae60', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px' }}
                                                        >
                                                            ✅ 適用
                                                        </button>
                                                        <button
                                                            onClick={() => onDiscardCorrection && onDiscardCorrection(corr.id)}
                                                            title="無視"
                                                            style={{ border: 'none', background: '#f5f5f5', color: '#999', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px' }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    marginBottom: '10px',
                                                    padding: '8px',
                                                    background: '#f9f9f9',
                                                    borderRadius: '4px',
                                                    fontSize: '13px',
                                                    textDecoration: 'line-through',
                                                    textDecorationColor: '#ffcccc',
                                                    color: '#666'
                                                }}>
                                                    {corr.original}
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '18px' }}>⬇️</span>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        color: '#27ae60',
                                                        fontWeight: 'bold',
                                                        background: '#e8f5e9',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px'
                                                    }}>修正案</span>
                                                </div>

                                                <div style={{
                                                    marginBottom: '12px',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    color: '#2c3e50',
                                                    padding: '4px 8px',
                                                    borderLeft: '3px solid #27ae60'
                                                }}>
                                                    {corr.suggested}
                                                </div>

                                                {corr.reason && (
                                                    <div style={{ fontSize: '12px', color: '#7f8c8d', fontStyle: 'italic' }}>
                                                        💡 {corr.reason}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', gap: '15px' }}>
                                <div style={{ fontSize: '13px', color: '#666' }}>整形・出力先を選択して挿入をクリックしてください。</div>
                                <textarea
                                    value={formatterInput}
                                    onChange={(e) => setFormatterInput(e.target.value)}
                                    placeholder="ここに整形したいテキストを貼り付けるか、AIチャットから転送してください。"
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #ddd',
                                        fontFamily: 'inherit',
                                        fontSize: '14px',
                                        lineHeight: '1.5'
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input type="radio" checked={outputMode === 'current'} onChange={() => setOutputMode('current')} />
                                        カーソル位置
                                    </label>
                                    <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input type="radio" checked={outputMode === 'append'} onChange={() => setOutputMode('append')} />
                                        末尾に追記
                                    </label>
                                    <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input type="radio" checked={outputMode === 'new-file'} onChange={() => setOutputMode('new-file')} />
                                        新規ファイル
                                    </label>
                                    <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input type="radio" checked={outputMode === 'clipboard'} onChange={() => setOutputMode('clipboard')} />
                                        コピーのみ
                                    </label>
                                </div>
                                <button
                                    onClick={handleInsert}
                                    disabled={!formatterInput.trim()}
                                    style={{
                                        padding: '12px',
                                        backgroundColor: 'var(--accent-color)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '15px'
                                    }}
                                >
                                    本文に挿入
                                </button>
                            </div>
                        )}

                        {showContextPicker && (
                            <ContextPicker
                                availableFiles={allFiles}
                                selectedHandles={contextFiles.map(f => f.handle)}
                                onSelectionChange={handleContextSelection}
                                onClose={() => setShowContextPicker(false)}
                            />
                        )}

                        <PromptPreviewModal
                            visible={promptPreview.visible}
                            prompt={promptPreview.prompt}
                            sysPrompt={promptPreview.sysPrompt}
                            onConfirm={() => {
                                setPromptPreview({ ...promptPreview, visible: false });
                                handleLaunchAI(promptPreview.mode, promptPreview.options);
                            }}
                            onCancel={() => setPromptPreview({ ...promptPreview, visible: false })}
                        />
                    </>
                )}
            </div>
            <AuditReportWindow 
                isOpen={showAuditReport} 
                onClose={() => setShowAuditReport(false)} 
            />
        </div>
    );
};

export default AIAssistant;
