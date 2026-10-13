const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const shortText = (value, length = 150) => String(value ?? '').slice(0, length);

export function emptySketch() {
  return {
    version: 1,
    title: '新規シーン',
    background: '',
    entities: [],
    frames: [{ id: 'f1', label: '開始', note: '', positions: {}, links: [] }]
  };
}

export function nextFrame(sketch, index) {
  const current = sketch.frames[index] || sketch.frames[sketch.frames.length - 1];
  return {
    id: 'f' + Date.now().toString(36),
    label: '次の場面',
    note: '',
    positions: JSON.parse(JSON.stringify(current.positions)),
    links: []
  };
}

export function normalizeSketch(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.entities) ||
      !Array.isArray(raw.frames) || !raw.frames.length ||
      raw.entities.length > 200 || raw.frames.length > 150) {
    throw new Error('シーン図のデータ形式が正しくありません');
  }
  const ids = new Set();
  const entities = raw.entities.map((entity, index) => {
    const id = shortText(entity?.id, 70);
    if (!id || ids.has(id)) throw new Error('人物・手掛かりのIDが重複しています');
    ids.add(id);
    return {
      id,
      name: shortText(entity.name || '要素' + (index + 1), 80),
      kind: entity.kind === 'clue' ? 'clue' : 'person'
    };
  });
  const frameIds = new Set();
  const frames = raw.frames.map((frame, index) => {
    const id = shortText(frame?.id || 'frame-' + index, 70);
    if (frameIds.has(id)) throw new Error('コマのIDが重複しています');
    frameIds.add(id);
    const positions = {};
    if (frame?.positions && typeof frame.positions === 'object') {
      for (const [entityId, p] of Object.entries(frame.positions)) {
        if (!ids.has(entityId) || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        positions[entityId] = {
          x: clamp(p.x, 10, 990), y: clamp(p.y, 10, 590),
          status: shortText(p.status, 120)
        };
      }
    }
    const links = Array.isArray(frame?.links) ? frame.links : [];
    if (links.length > 500) throw new Error('矢印が多すぎます');
    return {
      id, label: shortText(frame?.label || '場面' + (index + 1), 80),
      note: shortText(frame?.note, 4000),
      positions,
      links: links.filter(link => ids.has(link.from) && ids.has(link.to) && link.from !== link.to)
        .map(link => ({
          from: link.from, to: link.to,
          kind: link.kind === 'knowledge' ? 'knowledge' : 'attack'
        }))
    };
  });
  const background = typeof raw.background === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,/.test(raw.background) &&
    raw.background.length < 6_000_000 ? raw.background : '';
  return {
    version: 1,
    title: shortText(raw.title || '無題のシーン', 120),
    background, entities, frames
  };
}

export function parseSketchResponse(text, current) {
  const trimmed = String(text).trim();
  if (trimmed.length > 6_500_000) throw new Error('読み込みデータが大きすぎます');
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(stripped);
  const normalized = normalizeSketch(parsed);
  // ChatGPT may omit the image so importing a proposal never erases the existing map.
  if (!normalized.background && current?.background) normalized.background = current.background;
  return normalized;
}

export function exchangePrompt(sketch, instruction = '', mode = 'diagram') {
  const imageFreeData = { ...sketch, background: sketch.background ? '(地図画像はPNGで別添)' : '' };
  const data = JSON.stringify(imageFreeData, null, 2);
  const context = '【シーン名】\n' + sketch.title +
    '\n【作者のメモまたは対象本文】\n' + instruction +
    '\n【確定した配置と時系列】\n' + data;
  if (mode === 'prose') {
    return '次の場面の描写を補助してください。確定した配置・行動・時刻を変更せず、' +
      '未登録の位置や事実を断定しないでください。描写案と、不明・矛盾が残る箇所を分けて返してください。\n\n' + context;
  }
  return '次の本文・メモをもとに、NEXUSのシーン図データを更新してください。\n' +
    '回答はJSONのみ。version, title, background, entities, frames の形式を維持し、' +
    '各frameにはid, label, note, positions, linksを持たせてください。\n' +
    '座標はx:10〜990, y:10〜590の仮配置です。書かれていない動作・人物位置は断定せず、' +
    '不明点をframe.noteに残してください。既存の確定情報は勝手に変更しないでください。\n' +
    '画像は別添する場合があるのでbackgroundは空文字にしてください。\n\n' + context;
}
