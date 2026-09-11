import React, { useState, useMemo } from 'react';
import literaryPrizes, { GENRES, getFollowingDeadlineInfo, getNextDeadline, getNextDeadlineInfo, getDaysUntilDeadline } from '../data/literaryPrizes';

const PrizePanel = ({ onApplyPrize, editorText, showToast, submissions = [], currentWorkId = '', currentWorkTitle = '現在の作品', onAddSubmission, onRemoveSubmission, onUpdateSubmission, selectedSubmissionId, onSelectSubmission }) => {
    const [selectedPrize, setSelectedPrize] = useState(null);
    const [genreFilter, setGenreFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const deadlineItems = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return submissions.map(item => {
            if (!item.deadline) return { ...item, daysLeft: null, urgency: 'open' };
            const due = new Date(`${item.deadline}T23:59:59`);
            const daysLeft = Math.ceil((due - now) / 86400000);
            const urgency = daysLeft < 0 ? 'overdue' : daysLeft <= 14 ? 'critical' : daysLeft <= 45 ? 'soon' : 'safe';
            return { ...item, daysLeft, urgency };
        }).sort((a, b) => {
            if (a.daysLeft === null) return 1;
            if (b.daysLeft === null) return -1;
            return a.daysLeft - b.daysLeft;
        });
    }, [submissions]);

    const deadlineColors = {
        overdue: '#7f1d1d', critical: '#dc2626', soon: '#d97706', safe: '#15803d', open: '#64748b'
    };

    const filteredPrizes = useMemo(() => {
        return literaryPrizes.filter(p => {
            if (genreFilter !== 'all' && !p.genre.includes(genreFilter)) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matchName = p.name.toLowerCase().includes(term);
                const matchOrg = p.organizer.toLowerCase().includes(term);
                const matchGenre = p.genre.toLowerCase().includes(term);
                if (!matchName && !matchOrg && !matchGenre) return false;
            }
            return true;
        });
    }, [genreFilter, searchTerm]);

    const handleApply = (prize) => {
        const deadlineInfo = getNextDeadlineInfo(prize);
        const target = {
            targetPages: prize.pageLimit.max || prize.pageLimit.min,
            deadline: deadlineInfo?.dateString || null,
            deadlineIsEstimated: Boolean(deadlineInfo?.isEstimated),
            prizeName: prize.name,
            prizeId: prize.id,
            editorFormat: prize.editorFormat || null,
            pageCountBasis: prize.pageCountBasis || '400-page',
            targetChars: prize.charLimit?.max || 0
        };
        onAddSubmission?.(target);
        onApplyPrize?.(target); // 旧進捗表示との互換
        showToast?.(`「${currentWorkTitle}」の応募予定に追加しました。執筆画面の書式は変更していません。`);
    };

    const getCurrentProgress = (prize) => {
        if (!editorText) return null;
        const basis = prize.pageCountBasis || '400-page';
        const target = prize.pageLimit.max || prize.pageLimit.min;
        if (basis === 'char-count') {
            const charTarget = prize.charLimit?.max || 0;
            return { current: editorText.length, target: charTarget, unit: '字' };
        } else if (basis === 'format-page') {
            const cpl = prize.editorFormat?.charsPerLine || 20;
            const lpp = prize.editorFormat?.linesPerPage || 20;
            return { current: Math.ceil(editorText.length / (cpl * lpp)), target, unit: '枚' };
        } else {
            return { current: Math.ceil(editorText.length / 400), target, unit: '枚' };
        }
    };

    const renderDeadlineBadge = (prize) => {
        const days = getDaysUntilDeadline(prize);
        if (days === null) return <span style={{ fontSize: '10px', color: '#7f8c8d' }}>通年</span>;
        const color = days <= 30 ? '#e74c3c' : days <= 90 ? '#f39c12' : '#27ae60';
        return (
            <span style={{ fontSize: '10px', color, fontWeight: days <= 30 ? 'bold' : 'normal' }}>
                〆切まで{days}日
            </span>
        );
    };

    if (selectedPrize) {
        const prize = selectedPrize;
        const days = getDaysUntilDeadline(prize);
        const deadline = getNextDeadline(prize);
        const deadlineInfo = getNextDeadlineInfo(prize);
        const followingDeadlineInfo = getFollowingDeadlineInfo(prize);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => setSelectedPrize(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }}>←</button>
                    <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{prize.name}</span>
                    <span style={{ fontSize: '10px', color: '#7f8c8d' }}>{prize.organizer}</span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Basic Info */}
                    <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                            <div>
                                <div style={{ color: '#7f8c8d', fontSize: '10px' }}>ジャンル</div>
                                <div style={{ fontWeight: 'bold' }}>{prize.genre}</div>
                            </div>
                            <div>
                                <div style={{ color: '#7f8c8d', fontSize: '10px' }}>賞金</div>
                                <div style={{ fontWeight: 'bold' }}>{prize.prize}</div>
                            </div>
                            <div>
                                <div style={{ color: '#7f8c8d', fontSize: '10px' }}>分量規定</div>
                                <div style={{ fontWeight: 'bold', fontSize: prize.formatNote ? '10px' : '12px' }}>
                                    {prize.formatNote ? prize.formatNote
                                        : prize.charLimit && prize.charLimit.max ? `${prize.charLimit.min || ''}〜${prize.charLimit.max} 字`
                                            : `${prize.pageLimit.min}〜${prize.pageLimit.max || '上限なし'} 枚（400字詰）`}
                                </div>
                            </div>
                            <div>
                                <div style={{ color: '#7f8c8d', fontSize: '10px' }}>締切</div>
                                <div style={{ fontWeight: 'bold' }}>{prize.deadlineNote}</div>
                            </div>
                        </div>
                    </div>

                    {/* Deadline Countdown */}
                    {days !== null && (
                        <div style={{
                            background: days <= 30 ? '#fde8e8' : days <= 90 ? '#fef3cd' : '#e8f8f5',
                            border: `1px solid ${days <= 30 ? '#f5c6cb' : days <= 90 ? '#ffeeba' : '#c3e6cb'}`,
                            borderRadius: '8px', padding: '12px', textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '10px', color: '#666' }}>次回締切</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: days <= 30 ? '#c0392b' : days <= 90 ? '#d68910' : '#27ae60' }}>
                                あと {days} 日
                            </div>
                            <div style={{ fontSize: '11px', color: '#888' }}>
                                {deadline?.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}{deadlineInfo?.isEstimated ? '（推定・要公式確認）' : '（公式確認済み）'}
                            </div>
                            {followingDeadlineInfo && <div style={{ marginTop: '4px', fontSize: '10px', color: '#888' }}>翌回目安：{followingDeadlineInfo.dateString}{followingDeadlineInfo.isEstimated ? '（推定）' : '（公式）'}</div>}
                        </div>
                    )}

                    {/* Apply Button */}
                    <button
                        onClick={() => handleApply(prize)}
                        style={{
                            padding: '10px', background: '#8e44ad', color: 'white',
                            border: 'none', borderRadius: '8px', cursor: 'pointer',
                            fontWeight: 'bold', fontSize: '13px'
                        }}
                    >
                        🎯 この賞に応募する（目標設定）
                    </button>
                    {prize.editorFormat?.charsPerLine > 0 && (
                        <div style={{ fontSize: '11px', color: '#666', textAlign: 'center' }}>
                            提出時に {prize.editorFormat.charsPerLine}字×{prize.editorFormat.linesPerPage}行を使用します（執筆画面は変更しません）
                        </div>
                    )}
                    {submissions.some(s => s.workId === currentWorkId && s.prizeId === prize.id) && (
                        <div style={{ fontSize: '10px', color: '#27ae60', textAlign: 'center' }}>✓ 現在この賞が設定されています</div>
                    )}

                    {/* Progress */}
                    {(() => {
                        const progress = getCurrentProgress(prize);
                        if (!progress) return null;
                        const pct = progress.target > 0 ? Math.min(100, Math.round(progress.current / progress.target * 100)) : 0;
                        return (
                            <div style={{ background: '#f0ebf5', borderRadius: '8px', padding: '10px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#555' }}>📊 現在の進捗</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                    <span>{progress.current.toLocaleString()}{progress.unit}</span>
                                    <span style={{ color: '#888' }}>{progress.target > 0 ? `${progress.target.toLocaleString()}${progress.unit}` : '上限なし'}</span>
                                </div>
                                {progress.target > 0 && (
                                    <div style={{ background: '#ddd', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                        <div style={{ background: pct >= 100 ? '#27ae60' : '#8e44ad', width: `${pct}%`, height: '100%', borderRadius: '4px', transition: 'width 0.3s' }} />
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Analysis */}
                    <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#555' }}>📊 傾向分析</div>
                        <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#333' }}>{prize.analysis}</div>
                    </div>

                    {/* Recent Winners */}
                    <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#555' }}>🏆 近年の受賞作</div>
                        {prize.recentWinners.map((w, i) => (
                            <div key={i} style={{ padding: '4px 0', fontSize: '12px', borderBottom: i < prize.recentWinners.length - 1 ? '1px dotted #ddd' : 'none' }}>
                                <span style={{ color: '#7f8c8d', marginRight: '6px' }}>{w.year}</span>
                                <span style={{ fontWeight: 'bold' }}>{w.title}</span>
                                <span style={{ color: '#888', marginLeft: '6px' }}>{w.author}</span>
                            </div>
                        ))}
                    </div>

                    {/* Links */}
                    <a href={prize.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: '#3498db', textAlign: 'center' }}>
                        🔗 公式ページを開く
                    </a>
                </div>
            </div>
        );
    }

    // List View
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🏆 文学新人賞</span>
                    <span style={{ fontSize: '10px', color: '#888', fontWeight: 'normal' }}>
                        {filteredPrizes.length} / {literaryPrizes.length} 賞
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setGenreFilter('all')}
                        style={{
                            padding: '2px 8px', fontSize: '10px', border: '1px solid #ddd',
                            borderRadius: '12px', cursor: 'pointer',
                            background: genreFilter === 'all' ? '#8e44ad' : 'transparent',
                            color: genreFilter === 'all' ? 'white' : '#666'
                        }}
                    >全て</button>
                    {GENRES.map(g => (
                        <button
                            key={g}
                            onClick={() => setGenreFilter(g)}
                            style={{
                                padding: '2px 8px', fontSize: '10px', border: '1px solid #ddd',
                                borderRadius: '12px', cursor: 'pointer',
                                background: genreFilter === g ? '#8e44ad' : 'transparent',
                                color: genreFilter === g ? 'white' : '#666'
                            }}
                        >{g}</button>
                    ))}
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="賞名・出版社で検索..."
                    style={{ width: '100%', padding: '4px 8px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '6px', boxSizing: 'border-box' }}
                />
            </div>

            {submissions.length > 0 && (
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', background: 'rgba(142,68,173,0.06)', maxHeight: '46%', overflowY: 'auto', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>📅 全作品の締切ダッシュボード</div>
                        <div style={{ display: 'flex', gap: '5px', fontSize: '9px' }}>
                            <span style={{ color: deadlineColors.critical }}>● 14日以内</span>
                            <span style={{ color: deadlineColors.soon }}>● 45日以内</span>
                            <span style={{ color: deadlineColors.safe }}>● 余裕あり</span>
                        </div>
                    </div>
                    {deadlineItems.map(item => (
                        <div key={item.id} style={{ borderLeft: `4px solid ${deadlineColors[item.urgency]}`, background: selectedSubmissionId === item.id ? 'rgba(142,68,173,0.1)' : 'var(--bg-paper, #fff)', borderRadius: '6px', padding: '7px 8px', marginBottom: '6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) auto auto', gap: '7px', alignItems: 'center', fontSize: '10px' }}>
                            <span><strong>{item.workTitle}</strong><br/><span style={{ color: '#666' }}>{item.prizeName}</span></span>
                            <div style={{ textAlign: 'right', minWidth: '58px', color: deadlineColors[item.urgency], fontWeight: 'bold' }}>
                                {item.daysLeft === null ? '通年' : item.daysLeft < 0 ? `${Math.abs(item.daysLeft)}日超過` : item.daysLeft === 0 ? '本日締切' : `あと${item.daysLeft}日`}
                            </div>
                            {item.deadline ? (
                                <label style={{ color: '#777' }}>
                                    <input type="date" value={item.deadline} onChange={e => onUpdateSubmission?.(item.id, { deadline: e.target.value, deadlineIsEstimated: false })} style={{ fontSize: '9px' }} />
                                    {item.deadlineIsEstimated ? ' 概算・要確認' : ''}
                                </label>
                            ) : <span style={{ color: '#777' }}>通年</span>}
                          </div>
                          {item.daysLeft !== null && item.daysLeft >= 0 && (
                            <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }} title="180日を全幅として表示">
                                <div style={{ width: `${Math.max(2, Math.min(100, (item.daysLeft / 180) * 100))}%`, height: '100%', background: deadlineColors[item.urgency] }} />
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '5px' }}>
                            {item.workId === currentWorkId && (
                                <button onClick={() => onSelectSubmission?.(item.id)} style={{ border: '1px solid #8e44ad', borderRadius: '10px', background: selectedSubmissionId === item.id ? '#8e44ad' : 'transparent', color: selectedSubmissionId === item.id ? '#fff' : '#8e44ad', cursor: 'pointer', fontSize: '9px' }}>
                                    {selectedSubmissionId === item.id ? '提出設定中' : '提出用に選択'}
                                </button>
                            )}
                            <button onClick={() => onRemoveSubmission?.(item.id)} title="応募予定から削除" style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Prize List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredPrizes.map(prize => (
                    <div
                        key={prize.id}
                        onClick={() => setSelectedPrize(prize)}
                        style={{
                            padding: '10px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                            cursor: 'pointer', transition: 'background 0.15s',
                            background: submissions.some(s => s.workId === currentWorkId && s.prizeId === prize.id) ? 'rgba(142, 68, 173, 0.08)' : 'transparent'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = submissions.some(s => s.workId === currentWorkId && s.prizeId === prize.id) ? 'rgba(142, 68, 173, 0.08)' : 'transparent'}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                                    {prize.name}
                                    {submissions.some(s => s.workId === currentWorkId && s.prizeId === prize.id) && <span style={{ marginLeft: '6px', color: '#8e44ad', fontSize: '10px' }}>✓ 応募予定</span>}
                                </div>
                                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                                    {prize.organizer} | {prize.genre} | {prize.formatNote ? prize.formatNote.substring(0, 20) + (prize.formatNote.length > 20 ? '…' : '') : prize.charLimit && prize.charLimit.max ? prize.charLimit.max + '字' : prize.pageLimit.min + '〜' + (prize.pageLimit.max || '∞') + '枚'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                {renderDeadlineBadge(prize)}
                                <div style={{ fontSize: '9px', color: '#aaa' }}>{prize.prize}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PrizePanel;
