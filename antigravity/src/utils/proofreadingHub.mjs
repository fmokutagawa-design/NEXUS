const XML_ESCAPE = /[&<>]/g;
const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

const escapeXml = (value) => String(value ?? '').replace(XML_ESCAPE, char => XML_ENTITIES[char]);

const engineOfRule = (ruleId = '') => {
    if (ruleId === 'prh') return 'prh表記辞書';
    if (ruleId.startsWith('tomarigi/')) return 'Tomarigi相当';
    if (ruleId.startsWith('languagetool/')) return 'LanguageTool';
    if (ruleId.startsWith('redpen/')) return 'RedPen';
    if (ruleId === 'nexus-integrated-rules') return 'NEXUS';
    return 'textlint';
};

const classifyTextlintResult = (result, text) => {
    const message = String(result.message || '');
    const ltMatch = message.match(/\(Rule:\s*([^\)]+)\)/);
    let ruleId = result.ruleId || 'textlint';
    if (ltMatch || message.includes('【LanguageTool】')) ruleId = `languagetool/${ltMatch?.[1] || ruleId}`;
    else if (message.includes('【トマリギ】')) ruleId = `tomarigi/${ruleId}`;
    else if (message.includes('【RedPen】')) ruleId = `redpen/${ruleId}`;
    else if (['sentence-length', 'max-ten', 'no-mix-dearu-desumasu'].some(id => ruleId.includes(id))) ruleId = `redpen/${ruleId}`;

    const start = Math.max(0, Number(result.index) || 0);
    const fixStart = Number(result.fix?.range?.[0]);
    const fixEnd = Number(result.fix?.range?.[1]);
    const messageStart = Number(result.range?.[0]);
    const messageEnd = Number(result.range?.[1]);
    const targetMatch = message.match(/【対象:([^】]+)】/);
    const length = Number.isFinite(fixStart) && Number.isFinite(fixEnd) && fixEnd > fixStart
        ? fixEnd - fixStart
        : targetMatch ? targetMatch[1].length
            : Number.isFinite(messageStart) && Number.isFinite(messageEnd) && messageEnd > messageStart
                ? messageEnd - messageStart : 1;
    const suggestedMatch = message.match(/修正案:\s*([^（。]+?)(?=\s*\(Rule:|$)/);
    return {
        start, end: Math.min(text.length, start + length),
        original: text.slice(start, start + length) || '該当箇所',
        suggested: result.fix?.text || (suggestedMatch ? suggestedMatch[1].trim() : ''),
        message: message.replace(/【対象:[^】]+】/, '').replace(/^【[^】]+】/, '').trim(),
        ruleId, engine: engineOfRule(ruleId), severity: Number(result.severity) || 1
    };
};

const normalizeBackendResult = (issue, text) => {
    let start = Number(issue.start);
    if (!Number.isFinite(start) || start < 0) start = text.indexOf(issue.original || '');
    if (start < 0) start = text.length;
    const original = String(issue.original || '該当箇所');
    return {
        start, end: start + original.length, original,
        suggested: String(issue.suggested || ''), message: String(issue.reason || ''),
        ruleId: String(issue.rule_id || 'nexus/style'), engine: String(issue.engine || 'NEXUS'),
        severity: Number(issue.severity) || 1
    };
};

const sameFinding = (left, right) => {
    const overlaps = left.start < right.end && right.start < left.end;
    const sameText = left.original === right.original && Math.abs(left.start - right.start) <= 2;
    const sameSuggestion = left.suggested && left.suggested === right.suggested;
    const nestedText = left.original.includes(right.original) || right.original.includes(left.original);
    const compatibleSuggestion = sameSuggestion || !left.suggested || !right.suggested;
    return sameText || (overlaps && nestedText && compatibleSuggestion);
};

export function mergeProofreadingResults(text, textlintResults = [], backendResults = []) {
    const raw = [...textlintResults.map(result => classifyTextlintResult(result, text)), ...backendResults.map(issue => normalizeBackendResult(issue, text))]
        .sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const issue of raw) {
        const existing = merged.find(candidate => sameFinding(candidate, issue));
        if (!existing) {
            merged.push({ ...issue, engines: [issue.engine], ruleIds: [issue.ruleId], messages: [issue.message] });
            continue;
        }
        if (!existing.engines.includes(issue.engine)) existing.engines.push(issue.engine);
        if (!existing.ruleIds.includes(issue.ruleId)) existing.ruleIds.push(issue.ruleId);
        if (issue.message && !existing.messages.includes(issue.message)) existing.messages.push(issue.message);
        if (issue.suggested && existing.suggested && issue.suggested !== existing.suggested) {
            existing.conflict = true;
            existing.suggestions = [...new Set([existing.suggested, issue.suggested])];
            existing.suggested = '';
        } else if (!existing.suggested && issue.suggested && !existing.conflict) existing.suggested = issue.suggested;
        existing.severity = Math.max(existing.severity, issue.severity);
    }
    return merged.map(issue => ({ ...issue, confidence: issue.conflict ? '要確認' : issue.engines.length >= 2 ? '高' : issue.suggested ? '中' : '参考' }));
}

export function proofreadingResultsToXml(issues) {
    return issues.map(issue => {
        const suggested = issue.conflict ? `候補が競合: ${(issue.suggestions || []).join(' / ')}` : issue.suggested || '内容を確認';
        const reason = `【${issue.confidence}｜${issue.engines.join('＋')}】${issue.messages.filter(Boolean).join(' / ')}`;
        return `<correction confidence="${escapeXml(issue.confidence)}" start="${issue.start}" end="${issue.end}">\n  <original>${escapeXml(issue.original)}</original>\n  <suggested>${escapeXml(suggested)}</suggested>\n  <reason>${escapeXml(reason)}</reason>\n</correction>\n`;
    }).join('');
}
