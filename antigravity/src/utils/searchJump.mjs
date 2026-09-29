const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function createMatcher({ query, matchedText, isRegex, caseSensitive }) {
  const source = isRegex ? String(query || '') : escapeRegExp(matchedText || query || '');
  if (!source) return null;
  try {
    return new RegExp(source, `${caseSensitive ? '' : 'i'}g`);
  } catch {
    return null;
  }
}

export function resolveSearchJump(text, request = {}) {
  const sourceText = String(text || '');
  const matcher = createMatcher(request);
  if (!sourceText || !matcher) return { status: 'stale' };

  const starts = lineStarts(sourceText);
  const requestedLine = Math.max(0, Number(request.line) || 0);
  const approximate = (starts[Math.min(requestedLine, starts.length - 1)] || 0) + Math.max(0, Number(request.column) || 0);
  const expectedLine = String(request.expectedLine || '');
  let best = null;
  let match;

  while ((match = matcher.exec(sourceText)) !== null) {
    if (!match[0]) {
      matcher.lastIndex += 1;
      continue;
    }
    const start = match.index;
    const lineStart = sourceText.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const newline = sourceText.indexOf('\n', start);
    const lineEnd = newline < 0 ? sourceText.length : newline;
    const currentLine = sourceText.slice(lineStart, lineEnd).replace(/\r$/, '');
    const exactLineBonus = expectedLine && currentLine === expectedLine ? 1_000_000 : 0;
    const score = exactLineBonus - Math.abs(start - approximate);
    if (!best || score > best.score) best = { status: 'found', start, end: start + match[0].length, score };
  }

  if (!best) return { status: 'stale' };
  const { score: _score, ...result } = best;
  return result;
}
