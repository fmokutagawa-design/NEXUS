import React, { useState } from 'react';
import { DndContext, pointerWithin, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStoryBoard } from '../hooks/useStoryBoard';
import { StoryWizard } from './StoryWizard';
import { StoryAnalysisPanel } from './StoryAnalysisPanel';
import { StoryCardEditor } from './StoryCardEditor';
import { StoryChronologyView } from './StoryChronologyView';
import SceneSketchBoard from './SceneSketchBoard';
import './StoryBoard.css';

// --- Styled Components (as objects for now) ---
const boardContainerStyle = {
    display: 'flex',
    flexDirection: 'row',
    height: '100%',
    width: '100%',
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
    position: 'relative'
};

const boardStyle = {
    display: 'flex',
    padding: '24px',
    gap: '24px',
    overflowX: 'auto',
    overflowY: 'hidden',
    flex: 1,
    scrollBehavior: 'smooth',
    position: 'relative'
};

const columnStyle = {
    backgroundColor: '#ebedf0',
    borderRadius: '12px',
    width: '300px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid rgba(0,0,0,0.05)',
    maxHeight: '100%',
    position: 'relative'
};

const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    userSelect: 'none',
    border: '1px solid #e0e0e0',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative'
};

const paletteStyle = {
    position: 'relative',
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(4px)',
    padding: '16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    borderRight: '1px solid rgba(0,0,0,0.1)',
    height: '100%',
    width: '66px',
    flexShrink: 0,
    alignItems: 'center',
    overflowY: 'auto'
};

const SCENE_TEMPLATES = [
    { type: 'event', label: 'イベント', color: '#fff', icon: '📝' },
    { type: 'character', label: '人物', color: '#e3f2fd', icon: '👤' },
    { type: 'world', label: '舞台', color: '#e8f5e9', icon: '🗺️' },
    { type: 'item', label: '重要品', color: '#fff3e0', icon: '🔑' },
    { type: 'foreshadow', label: '伏線', color: '#f3e5f5', icon: '💡' }
];

// Template Card Component
const TemplateItem = ({ template }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `template-${template.type}`,
        data: { type: 'template', template }
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: template.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                cursor: 'grab',
                opacity: isDragging ? 0.5 : 1,
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                border: '1px solid #ddd'
            }}
            title={template.label}
        >
            {template.icon}
        </div>
    );
};

// Sortable Item Component
const SortableItem = ({ id, content, type, onClick, isSelected, isSource, color, icon }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    // Use predefined color if available, or legacy type color
    const getBgColor = () => {
        if (color) return color;
        switch (type) {
            case 'character': return '#e3f2fd';
            case 'world': return '#e8f5e9';
            case 'item': return '#fff3e0';
            case 'foreshadow': return '#f3e5f5';
            case 'file': return '#f5f5f5';
            default: return '#fff';
        }
    };

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        ...cardStyle,
        backgroundColor: getBgColor(),
        borderColor: isSelected ? '#2196F3' : (isSource ? '#ff9800' : '#e0e0e0'),
        boxShadow: isSelected ? '0 0 0 2px #2196F3' : (isSource ? '0 0 0 2px #ff9800' : '0 1px 4px rgba(0,0,0,0.1)'),
        zIndex: isDragging ? 2 : 1
    };

    const iconToShow = icon || (type === 'file' ? '📄' : SCENE_TEMPLATES.find(t => t.type === type)?.icon) || '📝';

    return (
        <div
            id={`card-node-${id}`}
            ref={setNodeRef}
            style={style}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            {...attributes}
            {...listeners}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{iconToShow}</span>
                <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: '500', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {content}
                </div>
                {type === 'file' && <span style={{ fontSize: '0.7rem', color: '#4CAF50' }} title="ファイルと同期中">●</span>}
            </div>
        </div>
    );
};

// Scene Column Wrapper
const SceneColumn = ({ scene, cards, onAddCard, onCardClick, connectState, onUpdateScene, onDeleteScene }) => {
    const { setNodeRef } = useSortable({ id: scene.id });
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: `container-${scene.id}`,
        data: { type: 'container', sceneId: scene.id }
    });

    return (
        <div
            ref={setNodeRef}
            style={{ ...columnStyle, height: 'fit-content', border: isOver ? '2px solid #2196F3' : '1px solid rgba(0,0,0,0.05)' }}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={() => {
                // ...
            }}
            onDrop={(e) => {
                e.preventDefault();
                try {
                    const data = e.dataTransfer.getData('application/json');
                    if (data) {
                        const item = JSON.parse(data);
                        if (item) {
                            if (item.type === 'file' || (item.name && !item.id)) {
                                const templateObj = {
                                    defaultTitle: item.name,
                                    type: 'file',
                                    defaultPlot: `Linked File: ${item.name}`,
                                    linkedFile: item.name,
                                    icon: '📄',
                                    color: '#F5F5F5'
                                };
                                onAddCard(scene.id, templateObj);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Drop error:', err);
                }
            }}
        >
            <div ref={setDropRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '100px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <input
                        value={scene.title}
                        onChange={(e) => onUpdateScene(scene.id, { title: e.target.value })}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            color: '#444',
                            width: '80%',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={() => onDeleteScene(scene.id)}
                        style={{ border: 'none', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '0.8rem' }}
                        title="この章を削除"
                    >
                        ✕
                    </button>
                </div>
                {scene.description !== undefined && (
                    <textarea
                        value={scene.description}
                        onChange={(e) => onUpdateScene(scene.id, { description: e.target.value })}
                        placeholder="章の概要..."
                        style={{
                            border: 'none',
                            background: 'rgba(255,255,255,0.5)',
                            fontSize: '0.8rem',
                            color: '#777',
                            resize: 'none',
                            padding: '4px',
                            borderRadius: '4px',
                            outline: 'none',
                            height: '40px'
                        }}
                    />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <SortableContext items={cards.map(c => c.id)} strategy={verticalListStrategy}>
                        {cards.map(card => (
                            <SortableItem
                                key={card.id}
                                id={card.id}
                                content={card.title || card.content}
                                type={card.type}
                                color={card.color}
                                icon={card.icon}
                                onClick={() => onCardClick(card)}
                                isSelected={false}
                                isSource={connectState.sourceId === card.id}
                            />
                        ))}
                    </SortableContext>
                </div>

                <button
                    onClick={() => onAddCard(scene.id)}
                    style={{
                        padding: '8px',
                        border: '1px dashed #ccc',
                        background: '#f9f9f9',
                        borderRadius: '8px',
                        color: '#999',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        marginTop: '4px',
                        transition: '0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#999'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#ccc'}
                >
                    + カードを追加
                </button>
            </div>
        </div>
    );
};

// SVG Overlay Component
const ConnectionLines = ({ connections }) => {
    const getCardPos = (id) => {
        const el = document.getElementById(`card-node-${id}`);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const container = document.querySelector('.story-board-main');
        if (!container) return null;
        const cRect = container.getBoundingClientRect();

        return {
            x: rect.left - cRect.left + container.scrollLeft + rect.width / 2,
            y: rect.top - cRect.top + container.scrollTop + rect.height / 2
        };
    };

    const renderLine = (conn) => {
        const start = getCardPos(conn.source);
        const end = getCardPos(conn.target);
        if (!start || !end) return null;

        const dx = end.x - start.x;
        const controlPointOffset = Math.max(Math.abs(dx) * 0.5, 50);

        const d = `M ${start.x} ${start.y} C ${start.x + controlPointOffset} ${start.y}, ${end.x - controlPointOffset} ${end.y}, ${end.x} ${end.y}`;

        return (
            <path
                key={conn.id}
                d={d}
                stroke="#ffb74d"
                strokeWidth="2"
                fill="none"
                style={{ opacity: 0.6, pointerEvents: 'none' }}
                strokeDasharray="4"
            />
        );
    };

    return (
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '10000px', height: '10000px', pointerEvents: 'none', zIndex: 0 }}>
            {connections.map(renderLine)}
        </svg>
    );
};

const verticalListStrategy = verticalListSortingStrategy;

export const StoryBoard = ({ projectHandle, allFiles = [], onOpenFile, onCreateCard }) => {
    const { boardData, isLoading, setBoardData, saveBoard, addCard, updateCard, deleteCard, moveCard, moveCardToColumn, addConnection, generateBoardFromWizard, resetToHollywood, applyTemplate, addScene, deleteScene, updateScene, syncWithFolder } = useStoryBoard(projectHandle);
    const [activeId, setActiveId] = useState(null);
    const [viewMode, setViewMode] = useState('board'); // 'board' or 'chronology'
    const [showWizard, setShowWizard] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [editingCard, setEditingCard] = useState(null);
    const [isConnectMode, setIsConnectMode] = useState(false);
    const [connectSource, setConnectSource] = useState(null);
    const [tick, setTick] = useState(0);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event) => {
        const { active } = event;
        setActiveId(active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        // Case 1: Drag Template/File to Scene
        if (active.data.current?.type === 'template' && over.data.current?.type === 'container') {
            const template = active.data.current.template;
            const targetSceneId = over.data.current.sceneId;
            addCard(targetSceneId, {
                defaultTitle: `新規${template.label}`,
                type: template.type,
                color: template.color,
                icon: template.icon
            });
            return;
        }

        // Case 2: Move Card (within scenes or between scenes)
        if (active.id !== over.id) {
            const activeColId = findColumnOfCard(active.id);
            const overColId = over.data.current?.sceneId || findColumnOfCard(over.id);

            if (activeColId && overColId) {
                const newCards = { ...boardData.cards };
                const activeCards = [...newCards[activeColId]];

                if (activeColId === overColId) {
                    const oldIndex = activeCards.findIndex(c => c.id === active.id);
                    const newIndex = activeCards.findIndex(c => c.id === over.id);
                    newCards[activeColId] = arrayMove(activeCards, oldIndex, newIndex);
                } else {
                    const overCards = [...(newCards[overColId] || [])];
                    const activeIndex = activeCards.findIndex(c => c.id === active.id);
                    const [movedItem] = activeCards.splice(activeIndex, 1);
                    const overIndex = overCards.findIndex(c => c.id === over.id);
                    if (overIndex === -1) {
                        overCards.push(movedItem);
                    } else {
                        overCards.splice(overIndex, 0, movedItem);
                    }
                    newCards[activeColId] = activeCards;
                    newCards[overColId] = overCards;
                }
                moveCard(newCards);
            }
        }
    };

    const findColumnOfCard = (cardId) => {
        return Object.keys(boardData.cards).find(colId => boardData.cards[colId].some(c => c.id === cardId));
    };

    const handleAddCard = (sceneId, content) => {
        addCard(sceneId, content || "新規カード");
    };

    const handleCardClick = (card) => {
        if (activeId) return;

        if (isConnectMode) {
            if (!connectSource) {
                setConnectSource(card);
            } else {
                if (connectSource.id === card.id) {
                    setConnectSource(null);
                } else {
                    if (confirm('このカード同士を「ライン」で接続しますか？')) {
                        addConnection(connectSource.id, card.id);
                        setConnectSource(null);
                        setIsConnectMode(false);
                    }
                }
            }
        } else {
            setEditingCard(card);
        }
    };

    const handleWizardComplete = (answers) => {
        if (confirm('現在のボードの内容は上書きされ、「大塚プロット」形式で再生成されます。よろしいですか？')) {
            generateBoardFromWizard(answers);
            setShowWizard(false);
        }
    };

    if (isLoading || !boardData) {
        return <div style={{ padding: '20px' }}>Loading Story Board...</div>;
    }

    const contents = (
        <div className="story-board-container" style={boardContainerStyle}>
            {/* Template Palette (Sidebar) */}
            {viewMode === 'board' && (
                <div style={paletteStyle}>
                    <div style={{ fontSize: '0.6rem', color: '#999', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parts</div>
                    {SCENE_TEMPLATES.map(t => (
                        <TemplateItem key={t.type} template={t} />
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                {/* Toolbar (Floating in its container) */}
                <div style={{
                    padding: '8px 16px',
                    borderRadius: '24px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    position: 'absolute',
                    top: '12px',
                    right: '24px',
                    zIndex: 1000,
                    border: '1px solid rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', background: '#e0e0e0', borderRadius: '16px', padding: '2px', marginRight: '8px' }}>
                            <button
                                onClick={() => setViewMode('board')}
                                style={{
                                    padding: '5px 12px',
                                    border: 'none',
                                    background: viewMode === 'board' ? '#fff' : 'transparent',
                                    color: viewMode === 'board' ? '#333' : '#777',
                                    borderRadius: '14px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem'
                                }}
                            >📋 ボード</button>
                            <button
                                onClick={() => setViewMode('chronology')}
                                style={{
                                    padding: '5px 12px',
                                    border: 'none',
                                    background: viewMode === 'chronology' ? '#fff' : 'transparent',
                                    color: viewMode === 'chronology' ? '#E91E63' : '#777',
                                    borderRadius: '14px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem'
                                }}
                            >📅 時系列</button>
                            <button onClick={() => setViewMode('scene')} style={{ padding: '5px 12px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: viewMode === 'scene' ? '#fff' : 'transparent', color: viewMode === 'scene' ? '#1565c0' : '#777', fontWeight: 700 }}>🗺️ シーン図</button>
                        </div>

                        {/* Template Switcher */}
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f5f5f5', borderRadius: '16px', padding: '0 8px', height: '32px', border: '1px solid #e0e0e0' }}>
                            <span style={{ fontSize: '0.9rem', marginRight: '6px' }}>🔄</span>
                            <select
                                style={{ border: 'none', background: 'transparent', fontSize: '0.85rem', color: '#444', cursor: 'pointer', outline: 'none', fontWeight: '500', maxWidth: '140px' }}
                                value={boardData.scenes.length === 12 ? '12stage' : (boardData.scenes.length === 8 ? 'hollywood' : 'simple')}
                                onChange={(e) => {
                                    const nextType = e.target.value;
                                    if (confirm(`テンプレートを切り替えますか？\n(現在のカードは保持されます)`)) {
                                        applyTemplate(nextType);
                                    }
                                }}
                            >
                                <option value="hollywood">ハリウッド式 3幕</option>
                                <option value="12stage">12ステージ構成</option>
                                <option value="simple">シンプル 10章</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '4px', background: '#fff', padding: '4px', borderRadius: '8px', border: '1px solid #eee' }}>
                            <button onClick={() => onCreateCard && onCreateCard('登場人物')} title="人物を追加" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem' }}>👤</button>
                            <button onClick={() => onCreateCard && onCreateCard('場所')} title="場所を追加" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem' }}>🗺️</button>
                            <button onClick={() => onCreateCard && onCreateCard('アイテム')} title="アイテムを追加" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem' }}>🔑</button>
                            <button onClick={() => onCreateCard && onCreateCard('イベント')} title="イベントを追加" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem' }}>⚡</button>
                        </div>

                        <button
                            onClick={() => setShowWizard(true)}
                            style={{ padding: '6px 12px', border: 'none', background: '#f0f4f8', color: '#333', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}
                        >🪄 ウィザード</button>

                        <button
                            onClick={() => setShowAnalysis(true)}
                            style={{ padding: '6px 12px', border: 'none', background: '#e3f2fd', color: '#1565c0', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}
                        >📊 分析</button>

                        <button
                            onClick={() => { setIsConnectMode(!isConnectMode); setConnectSource(null); }}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                background: isConnectMode ? '#ffe0b2' : '#f5f5f5',
                                color: isConnectMode ? '#e65100' : '#444',
                                borderRadius: '16px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '500'
                            }}
                        >🔗 {isConnectMode ? '接続中' : '接続'}</button>

                        <button
                            onClick={() => {
                                const folder = prompt('同期するフォルダ名を入力してください', boardData.linkedFolder || 'Drafts');
                                if (folder) syncWithFolder(folder);
                            }}
                            style={{ padding: '6px 12px', border: 'none', background: '#e8f5e9', color: '#2e7d32', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            📁 {boardData.linkedFolder ? `${boardData.linkedFolder} 同期中` : '同期'}
                        </button>

                        <button
                            onClick={() => { if (confirm('ボードを初期化しますか？')) resetToHollywood(); }}
                            style={{ padding: '6px', border: 'none', background: 'transparent', color: '#bbb', borderRadius: '50%', cursor: 'pointer' }}
                        >🗑️</button>
                    </div>
                </div>

                <div className="story-board-main" style={{ ...boardStyle, paddingTop: '60px' }} onScroll={() => setTick(t => t + 1)}>
                    {showWizard && <StoryWizard onExampleComplete={handleWizardComplete} onCancel={() => setShowWizard(false)} />}
                    {showAnalysis && <StoryAnalysisPanel boardData={boardData} onClose={() => setShowAnalysis(false)} addConnection={addConnection} />}
                    {editingCard && (
                        <StoryCardEditor
                            card={editingCard}
                            onSave={updateCard}
                            onDelete={deleteCard}
                            onClose={() => setEditingCard(null)}
                            allFiles={allFiles}
                            onOpenFile={onOpenFile}
                        />
                    )}

                    {viewMode === 'scene' ? (
                        <SceneSketchBoard projectHandle={projectHandle} />
                    ) : viewMode === 'chronology' ? (
                        <StoryChronologyView
                            boardData={boardData}
                            onCardClick={(card) => {
                                if (card.linkedFile && onOpenFile) onOpenFile(null, card.linkedFile);
                                else setEditingCard(card);
                            }}
                            addCard={addCard}
                            updateCard={updateCard}
                            deleteCard={deleteCard}
                            moveCardToColumn={moveCardToColumn}
                            setBoardData={setBoardData}
                            saveBoard={saveBoard}
                            addScene={addScene}
                        />
                    ) : (
                        <>
                            <ConnectionLines connections={boardData.connections || []} tick={tick} />
                            <SortableContext items={boardData.scenes.map(s => s.id)} strategy={horizontalListSortingStrategy}>
                                {boardData.scenes.map(scene => (
                                    <SceneColumn
                                        key={scene.id}
                                        scene={scene}
                                        cards={boardData.cards[scene.id] || []}
                                        onAddCard={handleAddCard}
                                        onCardClick={handleCardClick}
                                        connectState={{ sourceId: connectSource?.id }}
                                        onUpdateScene={updateScene}
                                        onDeleteScene={deleteScene}
                                    />
                                ))}
                            </SortableContext>
                            <div style={{ flexShrink: 0, width: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #e0e0e0', borderRadius: '12px', cursor: 'pointer', color: '#bbb', fontSize: '2rem', height: 'fit-content', minHeight: '200px', marginTop: '12px' }}
                                onClick={() => {
                                    const title = prompt('追加する章のタイトル:', `第${boardData.scenes.length + 1}章`);
                                    if (title) addScene(title);
                                }}
                            >+</div>
                        </>
                    )}
                </div>
            </div>

            <DragOverlay>
                {activeId ? (
                    <div style={{ ...cardStyle, transform: 'scale(1.05)', boxShadow: '0 5px 15px rgba(0,0,0,0.2)' }}>移動中...</div>
                ) : null}
            </DragOverlay>
        </div>
    );

    if (viewMode === 'board') {
        return (
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                {contents}
            </DndContext>
        );
    }
    return contents;
};
