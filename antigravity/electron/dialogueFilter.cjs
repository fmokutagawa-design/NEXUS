function keepMessageForDialogue(message, text, relaxDialogue) {
    if (!relaxDialogue) return true;
    const index = Math.max(0, Number(message.index) || 0);
    const before = text.slice(0, index + 1);
    if (before.lastIndexOf('「') <= before.lastIndexOf('」')) return true;
    const ruleId = String(message.ruleId || '');
    const body = String(message.message || '');
    return ruleId === 'prh'
        || /no-(?:nfd|invalid-control-character)/.test(ruleId)
        || /^【(?:LanguageTool|RedPen)】/.test(body)
        || (body.startsWith('【NEXUS統合校正】') && body.includes('修正案:'));
}

module.exports = { keepMessageForDialogue };
