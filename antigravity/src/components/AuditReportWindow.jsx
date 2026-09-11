import React, { useState, useEffect, useMemo } from 'react';
import { ollamaService } from '../utils/ollamaService';
import './AuditReportWindow.css';

const AuditReportWindow = ({ isOpen, onClose, currentText, activeFile, onJumpToIndex }) => {
  const [report, setReport] = useState([]);
  const [textlintReport, setTextlintReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [fileFilter, setFileFilter] = useState('all');

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await ollamaService.getAuditReport();
      setReport(data || []);
    } catch (error) {
      console.error('Failed to fetch audit report:', error);
    } finally {
      setLoading(false);
    }
  };

  const startAudit = async () => {
    if (isRunning) return;
    try {
      const result = await ollamaService.startFullAudit();
      if (result.status === 'started' || result.status === 'already_running') {
        setIsRunning(true);
        setProgress("監査を開始しました...");
      }
    } catch (error) {
      console.error('Failed to start audit:', error);
      alert("監査の開始に失敗しました。");
    }
  };

  const fetchTextlint = async () => {
    if (!currentText || !window.api?.textlint) return;
    try {
      const activePath = typeof activeFile === 'string'
        ? activeFile
        : (activeFile?.path || activeFile?.handle || '');
      const activeName = typeof activeFile === 'string'
        ? activeFile.split(/[/\\]/).pop()
        : (activeFile?.name || String(activePath).split(/[/\\]/).pop());
      const results = await window.api.textlint.proofread(currentText);
      const formatted = results.map(msg => ({
        file: activeName || "現在のファイル",
        full_path: activePath,
        original: currentText.substring(msg.index - 5, msg.index + 10).replace(/\n/g, ' '),
        suggested: msg.message,
        reason: `[${msg.ruleId}] ${msg.message}`,
        line: msg.line,
        index: msg.index,
        category: '校正',
        currentFileResult: true,
        timestamp: new Date().toLocaleTimeString()
      }));
      setTextlintReport(formatted);
    } catch (e) {
      console.error('textlint failed:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // 開いた時に一度レポートを取得
      fetchReport();
      fetchTextlint();
      // 実行中かどうかのステータスも確認
      const checkInitialStatus = async () => {
        const status = await ollamaService.getAuditStatus();
        if (status.running) {
          setIsRunning(true);
          setProgress(status.progress);
        }
      };
      checkInitialStatus();
    }
  }, [isOpen]);

  // ポーリング
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(async () => {
      try {
        const status = await ollamaService.getAuditStatus();
        setProgress(status.progress);
        if (!status.running) {
          clearInterval(interval);
          setIsRunning(false);
          if (status.completed) {
            fetchReport();
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // カテゴリ判定
  const classifyCorrection = (item) => {
    if (item.category === '校正') return '校正';
    const reason = item.reason || '';
    if (reason.includes('設定資料') || reason.includes('矛盾') || reason.includes('整合性')) return '監査';
    if (reason.includes('誤変換') || reason.includes('誤字')) return '誤字';
    if (reason.includes('文法') || reason.includes('冗長')) return '文法';
    if (reason.includes('文体') || reason.includes('文末') || reason.includes('漢字率')) return '文体';
    return '文法';
  };

  // ユニークなファイルリスト
  const uniqueFiles = useMemo(() => {
    const files = new Set(report.map(item => item.file));
    return [...files].sort();
  }, [report]);

  // フィルタリングと優先度ソート
  const PRIORITY = { '監査': 0, '誤字': 1, '校正': 2, '文法': 3, '文体': 4 };

  const processedItems = useMemo(() => {
    const combined = [...textlintReport, ...report];
    let filtered = combined.filter(item => {
      if (categoryFilter !== 'all') {
        const category = classifyCorrection(item);
        if (category !== categoryFilter) return false;
      }
      if (fileFilter !== 'all' && item.file !== fileFilter) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const pa = PRIORITY[classifyCorrection(a)] ?? 99;
      const pb = PRIORITY[classifyCorrection(b)] ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.line || 0) - (b.line || 0); // 行番号順
    });
  }, [report, textlintReport, categoryFilter, fileFilter]);

  const handleJump = (item) => {
    if (item.currentFileResult && Number.isFinite(Number(item.index)) && onJumpToIndex) {
      onJumpToIndex(Number(item.index));
      return;
    }
    const event = new CustomEvent('nexus-jump-to-text', {
      detail: {
        text: item.original,
        file: item.file,
        path: item.full_path,
        line: item.line,
        index: item.index
      }
    });
    window.dispatchEvent(event);
  };

  if (!isOpen) return null;

  return (
    <div className="audit-report-window">
      <div className="audit-header">
        <h3>📋 校正監査：宿題リスト</h3>
        <div className="header-actions">
          <button 
            onClick={startAudit} 
            className="refresh-btn" 
            disabled={isRunning}
          >
            {isRunning ? "実行中..." : "監査実行"}
          </button>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
      </div>

      {isRunning && (
        <div className="audit-progress-banner">
          <div className="spinner"></div>
          <span>{progress}</span>
        </div>
      )}

      <div className="audit-filter-bar">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">すべて</option>
          <option value="監査">設定矛盾</option>
          <option value="校正">最強校正(LT+Tomarigi)</option>
          <option value="誤字">誤字</option>
          <option value="文法">文法</option>
          <option value="文体">文体</option>
        </select>
        
        <select value={fileFilter} onChange={e => setFileFilter(e.target.value)}>
          <option value="all">すべてのファイル</option>
          {uniqueFiles.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        
        <span className="audit-count">
          {processedItems.length} / {textlintReport.length + report.length} 件
        </span>
      </div>

      <div className="audit-content">
        {loading ? (
          <div className="loading">監査結果を読み込み中...</div>
        ) : processedItems.length === 0 ? (
          <div className="no-items">
            {(report.length + textlintReport.length) === 0 ? "指摘事項はありません。完璧です！" : "フィルタ条件に一致する項目はありません。"}
          </div>
        ) : (
          <ul className="homework-list">
            {processedItems.map((item, index) => {
              const category = classifyCorrection(item);
              return (
                <li
                  key={index}
                  className={`homework-item category-${category}`}
                  onClick={() => handleJump(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleJump(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="クリックして本文の該当位置へ移動"
                >
                  <div className="item-meta">
                    <span className={`category-tag category-${category}`}>{category}</span>
                    {item.project && <span className="project-tag">{item.project}</span>}
                    <span className="file-name">{item.file}</span>
                    <span className="timestamp">{item.timestamp}</span>
                  </div>
                  <div className="item-original">「{item.original}」</div>
                  <div className="item-suggestion">💡 {item.suggested}</div>
                  <div className="item-reason">{item.reason}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AuditReportWindow;
