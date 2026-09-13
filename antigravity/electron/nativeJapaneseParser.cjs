'use strict';

function linesOf(output) {
  return String(output ?? '').replace(/\r\n?/g, '\n').split('\n');
}

function parseTokenLine(line) {
  const tab = line.indexOf('\t');
  if (tab <= 0) return null;
  const surface = line.slice(0, tab);
  const features = line.slice(tab + 1).split(',');
  return {
    surface,
    pos: features[0] || '',
    pos1: features[1] || '',
    pos2: features[2] || '',
    pos3: features[3] || '',
    conjugationType: features[4] || '',
    conjugationForm: features[5] || '',
    base: features[6] && features[6] !== '*' ? features[6] : surface,
    reading: features[7] && features[7] !== '*' ? features[7] : '',
  };
}

function placeToken(text, token, cursor, errors) {
  if (!text.startsWith(token.surface, cursor)) {
    errors.push(`surface mismatch at UTF-16 offset ${cursor}: ${token.surface}`);
    return null;
  }
  return { ...token, start: cursor, end: cursor + token.surface.length };
}

function parseMecab(text, output) {
  const source = String(text ?? '');
  const morphemes = [];
  const errors = [];
  let cursor = 0;
  let ended = false;
  for (const line of linesOf(output)) {
    if (!line && !ended) continue;
    if (line === 'EOS') { ended = true; continue; }
    if (ended) {
      if (line) errors.push('content after EOS');
      continue;
    }
    const token = parseTokenLine(line);
    if (!token) { errors.push(`malformed MeCab line: ${line}`); continue; }
    const placed = placeToken(source, token, cursor, errors);
    if (!placed) continue;
    morphemes.push(placed);
    cursor = placed.end;
  }
  if (!ended) errors.push('missing EOS');
  if (cursor !== source.length) errors.push(`unparsed text at UTF-16 offset ${cursor}`);
  return { morphemes, errors };
}

const CHUNK_HEADER = /^\* (\d+) (-1|\d+)D (\d+)\/(\d+) ([-+]?\d+(?:\.\d+)?)$/;

function parseCabocha(text, output) {
  const source = String(text ?? '');
  const morphemes = [];
  const chunks = [];
  const errors = [];
  let cursor = 0;
  let current = null;
  let ended = false;

  for (const line of linesOf(output)) {
    if (!line && !ended) continue;
    if (line === 'EOS') { ended = true; current = null; continue; }
    if (ended) {
      if (line) errors.push('content after EOS');
      continue;
    }
    if (line.startsWith('*')) {
      const match = CHUNK_HEADER.exec(line);
      if (!match) { errors.push(`malformed CaboCha chunk header: ${line}`); current = null; continue; }
      const index = Number(match[1]);
      if (index !== chunks.length) errors.push(`unexpected chunk index: ${index}`);
      current = {
        index,
        start: cursor,
        end: cursor,
        link: Number(match[2]),
        head: Number(match[3]),
        function: Number(match[4]),
        score: Number(match[5]),
        morphemeStart: morphemes.length,
        morphemeEnd: morphemes.length,
      };
      chunks.push(current);
      continue;
    }
    if (!current) { errors.push(`token without chunk: ${line}`); continue; }
    const token = parseTokenLine(line);
    if (!token) { errors.push(`malformed CaboCha token: ${line}`); continue; }
    const placed = placeToken(source, token, cursor, errors);
    if (!placed) continue;
    morphemes.push(placed);
    cursor = placed.end;
    current.end = cursor;
    current.morphemeEnd = morphemes.length;
  }

  if (!ended) errors.push('missing EOS');
  if (chunks.length === 0) errors.push('missing chunks');
  if (chunks.some((chunk) => chunk.morphemeEnd === chunk.morphemeStart)) errors.push('empty chunk');
  if (cursor !== source.length) errors.push(`unparsed text at UTF-16 offset ${cursor}`);
  return { chunks, morphemes, errors };
}

function analyzeStructure(text, morphemes, chunks, thresholds = {}) {
  const dependencyLimit = Number.isFinite(Number(thresholds.dependencyDistance))
    ? Math.max(0, Number(thresholds.dependencyDistance))
    : 4;
  const distances = chunks.map((chunk) => (
    Number.isInteger(chunk.link) && chunk.link >= 0 && chunk.link > chunk.index
      ? chunk.link - chunk.index
      : 0
  ));
  const findings = chunks.flatMap((chunk, index) => (
    distances[index] > dependencyLimit
      ? [{
        start: chunk.start,
        end: chunk.end,
        ruleId: 'tomarigi-native/long-dependency',
        severity: 1,
      }]
      : []
  ));
  return {
    textLength: String(text ?? '').length,
    morphemeCount: morphemes.length,
    chunkCount: chunks.length,
    maxDependencyDistance: Math.max(0, ...distances),
    findings,
  };
}

module.exports = { parseMecab, parseCabocha, analyzeStructure };
