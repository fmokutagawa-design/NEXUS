export function parseHeadingLine(sourceLine = '') {
  let line = sourceLine;
  let heading = null;

  if (/^[\uFEFF \t\u3000]*[■◇]/.test(line)) {
    heading = 'chapter';
    const markerMatch = line.match(/^[\uFEFF \t\u3000]*[■◇]+/);
    const marker = markerMatch ? markerMatch[0].trim() : '';
    line = line.replace(/^[\uFEFF \t\u3000]*[■◇]+\s*/, '');
    if (line.length === 0) line = marker;
  }

  if (/［＃大見出し］/.test(line)) {
    heading = 'large';
    line = line.replace(/［＃大見出し］/g, '').replace(/［＃大見出し終わり］/g, '');
  } else if (/［＃中見出し］/.test(line)) {
    heading = 'medium';
    line = line.replace(/［＃中見出し］/g, '').replace(/［＃中見出し終わり］/g, '');
  } else if (/［＃小見出し］/.test(line)) {
    heading = 'small';
    line = line.replace(/［＃小見出し］/g, '').replace(/［＃小見出し終わり］/g, '');
  }

  return heading ? { heading, content: line.replace(/［＃[^］]*］/g, '') } : null;
}

export function buildHeadingNavigation(workText = '', offsetMap = []) {
  if (!workText || !offsetMap.length) return [];

  const entries = [];
  const lines = workText.split('\n');
  let globalOffset = 0;
  let segmentIndex = 0;

  for (const line of lines) {
    while (segmentIndex < offsetMap.length - 1 && globalOffset >= offsetMap[segmentIndex].globalEnd) {
      segmentIndex += 1;
    }
    const segment = offsetMap[segmentIndex];
    const parsed = parseHeadingLine(line);
    if (parsed && segment && globalOffset >= segment.globalStart && globalOffset <= segment.globalEnd) {
      entries.push({
        file: segment.file,
        chapterName: segment.displayName || segment.file,
        label: parsed.content.trim(),
        heading: parsed.heading,
        localOffset: globalOffset - segment.globalStart,
      });
    }
    globalOffset += line.length + 1;
  }

  return entries;
}
