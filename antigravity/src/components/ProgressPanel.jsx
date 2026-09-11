import React, { useState } from 'react';

const ProgressPanel = ({
    renderProgressTracker,
    renderProductionDashboard,
    renderChecklistPanel,
    renderTodoPanel
}) => {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color, #eee)',
                background: 'var(--bg-secondary, #f8f9fa)',
                flexShrink: 0
            }}>
                <button
                    onClick={() => setActiveTab('progress')}
                    style={{
                        flex: 1,
                        padding: '8px 4px',
                        fontSize: '11px',
                        border: 'none',
                        background: activeTab === 'progress' ? 'var(--bg-primary, #fff)' : 'transparent',
                        borderBottom: activeTab === 'progress' ? '2px solid var(--accent-color, #8e44ad)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'progress' ? 'bold' : 'normal',
                        color: 'inherit'
                    }}
                >
                    📊 進捗
                </button>
                <button
                    onClick={() => setActiveTab('overview')}
                    style={{ flex: 1, padding: '8px 4px', fontSize: '11px', border: 'none', background: activeTab === 'overview' ? 'var(--bg-primary, #fff)' : 'transparent', borderBottom: activeTab === 'overview' ? '2px solid var(--accent-color, #8e44ad)' : '2px solid transparent', cursor: 'pointer', fontWeight: activeTab === 'overview' ? 'bold' : 'normal', color: 'inherit' }}
                >
                    🧭 全作品
                </button>
                <button
                    onClick={() => setActiveTab('todo')}
                    style={{
                        flex: 1,
                        padding: '8px 4px',
                        fontSize: '11px',
                        border: 'none',
                        background: activeTab === 'todo' ? 'var(--bg-primary, #fff)' : 'transparent',
                        borderBottom: activeTab === 'todo' ? '2px solid var(--accent-color, #8e44ad)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'todo' ? 'bold' : 'normal',
                        color: 'inherit'
                    }}
                >
                    📋 TODO
                </button>
                <button
                    onClick={() => setActiveTab('checklist')}
                    style={{
                        flex: 1,
                        padding: '8px 4px',
                        fontSize: '11px',
                        border: 'none',
                        background: activeTab === 'checklist' ? 'var(--bg-primary, #fff)' : 'transparent',
                        borderBottom: activeTab === 'checklist' ? '2px solid var(--accent-color, #8e44ad)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'checklist' ? 'bold' : 'normal',
                        color: 'inherit'
                    }}
                >
                    ✅ チェック
                </button>
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'progress' && renderProgressTracker && renderProgressTracker()}
                {activeTab === 'overview' && renderProductionDashboard && renderProductionDashboard()}
                {activeTab === 'todo' && renderTodoPanel && renderTodoPanel()}
                {activeTab === 'checklist' && renderChecklistPanel && renderChecklistPanel()}
            </div>
        </div>
    );
};

export default ProgressPanel;
