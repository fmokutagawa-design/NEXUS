import React, { useEffect, useRef, useState } from 'react';
import { fileSystem } from '../utils/fileSystem';
import { emptySketch, nextFrame, normalizeSketch, parseSketchResponse, exchangePrompt } from '../utils/sceneSketchModel.mjs';

const SAVE_NAME = '_scene-sketch.json';
const canvasWidth = 1000;
const canvasHeight = 600;
const smallButton = { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 10px', background: '#fff', color: '#263445', cursor: 'pointer' };
const activeButton = { ...smallButton, background: '#214c72', color: '#fff' };
const inputStyle = { border: '1px solid #cbd5e1', borderRadius: 6, padding: 7, color: '#213547', background: 'white', width: '100%', boxSizing: 'border-box' };
const boxStyle = { border: '1px solid #d2dce7', borderRadius: 9, padding: 12, background: '#fff' };

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SceneSketchBoard({ projectHandle }) {
  const [doc, setDoc] = useState(emptySketch);
  const [loaded, setLoaded] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [mode, setMode] = useState('move');
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [paste, setPaste] = useState('');
  const [proposal, setProposal] = useState(null);
  const [message, setMessage] = useState('');
  const svgRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFrameIndex(0);
    setSelected(null);
    setProposal(null);
    const load = async () => {
      if (!projectHandle) { setDoc(emptySketch()); setLoaded(true); return; }
      try {
        const handle = await fileSystem.getFileHandle(projectHandle, SAVE_NAME, { create: false });
        const raw = await fileSystem.readFile(handle);
        if (!cancelled) setDoc(normalizeSketch(JSON.parse(raw)));
      } catch (error) {
        if (!cancelled) {
          setDoc(emptySketch());
          if (error?.message && !/not found|ENOENT/i.test(error.message)) setMessage('シーン図の読み込みに失敗しました。新しい図を表示しています。');
        }
      }
      if (!cancelled) setLoaded(true);
    };
    load();
    return () => { cancelled = true; };
  }, [projectHandle]);

  useEffect(() => {
    if (!loaded || !projectHandle) return;
    const timer = setTimeout(async () => {
      try {
        await fileSystem.createFile(projectHandle, SAVE_NAME, JSON.stringify(doc, null, 2));
      } catch (error) {
        setMessage('保存できませんでした。JSONを書き出して退避してください。' + (error?.message || ''));
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [doc, projectHandle, loaded]);

  const visible = proposal || doc;
  const safeIndex = Math.min(frameIndex, visible.frames.length - 1);
  const frame = visible.frames[safeIndex];
  const selectedEntity = doc.entities.find(entity => entity.id === selected);
  const updateFrame = fn => setDoc(previous => ({
    ...previous,
    frames: previous.frames.map((item, i) => i === frameIndex ? fn(item) : item)
  }));

  const addEntity = kind => {
    const id = 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const number = doc.entities.filter(entity => entity.kind === kind).length + 1;
    const entity = { id, kind, name: (kind === 'clue' ? '手掛かり' : '人物') + number };
    setDoc(previous => ({
      ...previous,
      entities: [...previous.entities, entity],
      frames: previous.frames.map((item, i) => i === frameIndex ? {
        ...item, positions: { ...item.positions, [id]: { x: 200 + number * 42, y: 160 + number * 31, status: '' } }
      } : item)
    }));
    setSelected(id);
    setMode('move');
  };
  const point = event => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: Math.round(Math.min(990, Math.max(10, (event.clientX - rect.left) * canvasWidth / rect.width))),
      y: Math.round(Math.min(590, Math.max(10, (event.clientY - rect.top) * canvasHeight / rect.height)))
    };
  };
  const onEntityDown = (event, id) => {
    event.stopPropagation();
    if (proposal) return;
    if (mode === 'attack' || mode === 'knowledge') {
      if (selected && selected !== id) {
        updateFrame(item => ({
          ...item,
          links: [...item.links, { from: selected, to: id, kind: mode }]
        }));
        setSelected(null);
        setMode('move');
      } else setSelected(id);
      return;
    }
    setSelected(id);
    setDragging(id);
    svgRef.current.setPointerCapture(event.pointerId);
  };
  const onMove = event => {
    if (!dragging || proposal) return;
    const pos = point(event);
    updateFrame(item => ({
      ...item, positions: { ...item.positions, [dragging]: { ...item.positions[dragging], ...pos } }
    }));
  };
  const setStatus = value => {
    if (!selected || !frame.positions[selected]) return;
    updateFrame(item => ({
      ...item, positions: {
        ...item.positions, [selected]: { ...item.positions[selected], status: value }
      }
    }));
  };
  const addNext = () => {
    const next = nextFrame(doc, frameIndex);
    setDoc(previous => ({
      ...previous,
      frames: [...previous.frames.slice(0, frameIndex + 1), next, ...previous.frames.slice(frameIndex + 1)]
    }));
    setFrameIndex(frameIndex + 1);
    setSelected(null);
  };
  const deleteFrame = () => {
    if (doc.frames.length < 2) return;
    setDoc(previous => ({ ...previous, frames: previous.frames.filter((_, i) => i !== frameIndex) }));
    setFrameIndex(Math.max(0, frameIndex - 1));
    setSelected(null);
  };
  const handleBackground = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3_500_000) {
      setMessage('PNG・JPEG・WebP画像を3.5MB以内で選択してください。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDoc(previous => ({ ...previous, background: String(reader.result) }));
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  const copyText = async content => {
    try {
      await navigator.clipboard.writeText(content);
      setMessage('コピーしました。ChatGPTに貼り付けてください。');
    } catch {
      setPaste(content);
      setMessage('自動コピーできませんでした。下の欄からコピーしてください。');
    }
  };
  const loadProposal = () => {
    try {
      const next = parseSketchResponse(paste, doc);
      setProposal(next);
      setFrameIndex(0);
      setSelected(null);
      setMessage('提案された配置図を表示中です。確認してから確定してください。');
    } catch (error) {
      setMessage('読み込めませんでした。' + (error?.message || 'データ形式を確認してください。'));
    }
  };
  const exportPng = async () => {
    try {
      const svg = svgRef.current;
      const data = new XMLSerializer().serializeToString(svg);
      const svgUrl = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(image, 0, 0);
        canvas.toBlob(blob => {
          if (blob) downloadBlob(blob, 'scene-sketch.png');
          else setMessage('PNGの作成に失敗しました。');
        });
        URL.revokeObjectURL(svgUrl);
      };
      image.onerror = () => { URL.revokeObjectURL(svgUrl); setMessage('PNGの生成に失敗しました。'); };
      image.src = svgUrl;
    } catch (error) { setMessage('PNGの生成に失敗しました。' + (error?.message || '')); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 630, height: '100%', overflowY: 'auto', color: '#263445', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input aria-label="シーン名" style={{ ...inputStyle, width: 240, fontWeight: 700 }} value={doc.title} disabled={Boolean(proposal)}
          onChange={event => setDoc(previous => ({ ...previous, title: event.target.value }))} />
        <button style={smallButton} onClick={() => addEntity('person')} disabled={Boolean(proposal)}>＋人物</button>
        <button style={smallButton} onClick={() => addEntity('clue')} disabled={Boolean(proposal)}>＋手掛かり・場所</button>
        <button style={mode === 'move' ? activeButton : smallButton} onClick={() => setMode('move')}>移動</button>
        <button style={mode === 'attack' ? activeButton : smallButton} onClick={() => { setSelected(null); setMode('attack'); }}>攻撃線</button>
        <button style={mode === 'knowledge' ? activeButton : smallButton} onClick={() => { setSelected(null); setMode('knowledge'); }}>情報線</button>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', minHeight: 330 }}>
        <div style={{ flex: 1, minWidth: 0, ...boxStyle, padding: 6 }}>
          <svg ref={svgRef} viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block', background: '#f8fafc', width: '100%', aspectRatio: '5 / 3', touchAction: 'none', borderRadius: 6 }}
            onPointerMove={onMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}
            onPointerDown={() => { if (!proposal && mode === 'move') setSelected(null); }}>
            <defs>
              <marker id="nexus-scene-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L0 6 L9 3 z" fill="#c4594a" />
              </marker>
              <marker id="nexus-scene-info" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L0 6 L9 3 z" fill="#4a84a3" />
              </marker>
            </defs>
            {visible.background ? <image href={visible.background} x="0" y="0" width="1000" height="600" preserveAspectRatio="xMidYMid meet" /> : null}
            {!visible.background && Array.from({ length: 9 }, (_, i) => <line key={'v' + i} x1={(i + 1) * 100} y1="0" x2={(i + 1) * 100} y2="600" stroke="#dce4ec" strokeWidth="1" />)}
            {!visible.background && Array.from({ length: 5 }, (_, i) => <line key={'h' + i} x1="0" y1={(i + 1) * 100} x2="1000" y2={(i + 1) * 100} stroke="#dce4ec" strokeWidth="1" />)}
            {frame.links.map((link, i) => {
              const a = frame.positions[link.from], b = frame.positions[link.to];
              if (!a || !b) return null;
              const color = link.kind === 'knowledge' ? '#4a84a3' : '#c4594a';
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeWidth="4" strokeDasharray={link.kind === 'knowledge' ? '9 7' : undefined}
                markerEnd={link.kind === 'knowledge' ? 'url(#nexus-scene-info)' : 'url(#nexus-scene-arrow)'} />;
            })}
            {visible.entities.map(entity => {
              const p = frame.positions[entity.id];
              if (!p) return null;
              const color = entity.kind === 'clue' ? '#a77836' : '#246ba5';
              return <g key={entity.id} onPointerDown={event => onEntityDown(event, entity.id)} style={{ cursor: proposal ? 'default' : 'grab' }}>
                {entity.kind === 'clue'
                  ? <rect x={p.x - 24} y={p.y - 24} width="48" height="48" rx="8" fill="#fff2d8" stroke={selected === entity.id ? '#f39c12' : color} strokeWidth="4" />
                  : <circle cx={p.x} cy={p.y} r="25" fill="#dceefc" stroke={selected === entity.id ? '#f39c12' : color} strokeWidth="4" />}
                <text x={p.x} y={p.y + 5} textAnchor="middle" fill="#1f3545" fontSize="16" fontWeight="bold">{entity.name.slice(0, 3)}</text>
                <text x={p.x} y={p.y + 43} textAnchor="middle" fill="#24374b" fontSize="17" stroke="#fff" strokeWidth="4" paintOrder="stroke">{entity.name}</text>
                {p.status && <text x={p.x} y={p.y + 61} textAnchor="middle" fill="#24374b" fontSize="13" stroke="#fff" strokeWidth="3" paintOrder="stroke">{p.status.slice(0, 18)}</text>}
              </g>;
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px 0', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ cursor: 'pointer' }}>背景地図 <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleBackground} disabled={Boolean(proposal)} style={{ maxWidth: 190 }} /></label>
            <button style={smallButton} onClick={() => setDoc(previous => ({ ...previous, background: '' }))} disabled={Boolean(proposal)}>背景を外す</button>
            <button style={smallButton} onClick={exportPng}>図をPNG保存</button>
          </div>
        </div>
        <div style={{ width: 208, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={boxStyle}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>時系列・コマ</div>
            <select aria-label="表示コマ" style={inputStyle} value={safeIndex}
              onChange={event => { setFrameIndex(Number(event.target.value)); setSelected(null); }}>
              {visible.frames.map((item, i) => <option key={item.id} value={i}>{i + 1}　{item.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button style={smallButton} disabled={safeIndex === 0} onClick={() => { setFrameIndex(safeIndex - 1); setSelected(null); }}>前</button>
              <button style={smallButton} disabled={safeIndex >= visible.frames.length - 1} onClick={() => { setFrameIndex(safeIndex + 1); setSelected(null); }}>次</button>
              <button style={smallButton} disabled={Boolean(proposal)} onClick={addNext}>＋コマ</button>
            </div>
            <input aria-label="コマの時刻・名称" style={{ ...inputStyle, marginTop: 8 }} value={frame.label} disabled={Boolean(proposal)}
              onChange={event => updateFrame(item => ({ ...item, label: event.target.value }))} />
            <button style={{ ...smallButton, marginTop: 8 }} onClick={deleteFrame} disabled={Boolean(proposal) || doc.frames.length < 2}>このコマを削除</button>
          </div>
          <div style={boxStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>選択した要素</div>
            {selectedEntity && frame.positions[selected] && !proposal ? <>
              <input aria-label="要素名" style={inputStyle} value={selectedEntity.name} onChange={event => setDoc(previous => ({
                ...previous, entities: previous.entities.map(entity => entity.id === selected ? { ...entity, name: event.target.value } : entity)
              }))} />
              <input aria-label="状態・姿勢" placeholder="状態・姿勢（任意）" style={{ ...inputStyle, marginTop: 8 }}
                value={frame.positions[selected]?.status || ''} onChange={event => setStatus(event.target.value)} />
              <button style={{ ...smallButton, marginTop: 8 }} onClick={() => {
                updateFrame(item => {
                  const positions = { ...item.positions };
                  delete positions[selected];
                  return { ...item, positions, links: item.links.filter(link => link.from !== selected && link.to !== selected) };
                });
                setSelected(null);
              }}>このコマでは非表示</button>
            </> : <span style={{ color: '#64748b' }}>人物を選んで名前・状態を編集します。</span>}
          </div>
          <div style={{ ...boxStyle, flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>この場面のメモ</div>
            <textarea aria-label="場面メモ" style={{ ...inputStyle, resize: 'vertical', minHeight: 110 }}
              value={frame.note} disabled={Boolean(proposal)}
              onChange={event => updateFrame(item => ({ ...item, note: event.target.value }))} />
            <div style={{ color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>人物はドラッグで動かせます。攻撃線・情報線は始点と終点を順に選択します。</div>
          </div>
        </div>
      </div>
      <div style={{ ...boxStyle, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>ChatGPTとの往復</div>
        <textarea aria-label="本文や場面指示" placeholder="本文や場面のメモを貼り付ける（任意）" rows={3} style={inputStyle}
          value={instruction} onChange={event => setInstruction(event.target.value)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          <button style={smallButton} onClick={() => copyText(exchangePrompt(doc, instruction, 'diagram'))}>文章から図を提案してもらう</button>
          <button style={smallButton} onClick={() => copyText(exchangePrompt(doc, instruction, 'prose'))}>この図から描写を依頼する</button>
          <button style={smallButton} onClick={() => downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), 'scene-sketch.json')}>JSON保存</button>
        </div>
        <textarea aria-label="ChatGPTからのJSON" placeholder="ChatGPTが返したシーン図JSONを貼り付ける" rows={3}
          style={inputStyle} value={paste} onChange={event => setPaste(event.target.value)} />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={smallButton} onClick={loadProposal}>読み込んで図を確認</button>
          {proposal && <>
            <span style={{ color: '#a05d1d' }}>提案確認中・未保存</span>
            <button style={activeButton} onClick={() => { setDoc(proposal); setProposal(null); setSelected(null); setMessage('確認した図を確定しました。'); }}>この図を確定</button>
            <button style={smallButton} onClick={() => { setProposal(null); setMessage('提案を破棄しました。'); }}>破棄</button>
          </>}
        </div>
        {message && <div role="status" style={{ color: '#516376' }}>{message}</div>}
      </div>
    </div>
  );
}
