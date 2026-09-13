const { ipcMain } = require('electron');
const path = require('path');
const { createLinter, loadTextlintrc } = require('textlint');
const { TextlintLintableRuleDescriptor } = require('@textlint/kernel');
const { datasets } = require('../textlint/data/tomarigi/reference-manifest.json');
const advisorySources = {
    'tomarigi/homonym-reference': datasets.homonymGroups,
    'tomarigi/kanji-level': datasets.kanji,
    'tomarigi/chinese-numeral': datasets.chineseNumeralExceptions,
};

// Only two immutable configurations are needed. Never change shared rule options
// in response to a project request; concurrent projects must remain isolated.
const linters = new Map();
const advisoryMarker = /^【NEXUS_ADVISORY:(tomarigi\/(?:homonym-reference|kanji-level|chinese-numeral))】/;

/**
 * textlintエンジンの初期化
 * 統合ルール（LanguageTool/RedPen移植）とTomarigi辞書を組み合わせる
 */
async function initLinter(kanjiEnabled = false) {
    try {
        const descriptor = await loadTextlintrc({
            configFilePath: path.join(__dirname, '../.textlintrc.js')
        });

        // 自作ルール（移植ロジック）を手動で注入
        const customRule = require('../textlint/rules/nexus-integrated-rules.js');
        descriptor.rule.ruleDescriptorList.push(new TextlintLintableRuleDescriptor({
            ruleId: "nexus-integrated-rules",
            rule: customRule,
            options: { enabled_rules: kanjiEnabled ? ['tomarigi/kanji-level'] : [] }
        }));

        const linter = createLinter({ descriptor });
        console.log('[textlint] Linguistic Hub initialized successfully.');
        return linter;
    } catch (error) {
        console.error('[textlint] Failed to initialize linter:', error);
        return null;
    }
}

function getLinter(kanjiEnabled = false) {
    if (!linters.has(kanjiEnabled)) {
        linters.set(kanjiEnabled, initLinter(kanjiEnabled).then(linter => {
            if (!linter) linters.delete(kanjiEnabled);
            return linter;
        }));
    }
    return linters.get(kanjiEnabled);
}

function setupTextlintHandlers() {
    // 起動時に初期化
    getLinter();

    ipcMain.handle('textlint:proofread', async (event, text, profile = {}) => {
        try {
            const kanjiEnabled = Array.isArray(profile.enabled_rules) && profile.enabled_rules.includes('tomarigi/kanji-level');
            const linter = await getLinter(kanjiEnabled);
            if (!linter) return [];

            console.log('[textlint] starting proofread...');
            // ファイル名は仮のものを指定
            const results = await linter.lintText(text, "document.txt");
            
            const whitelist = Array.isArray(profile.whitelist) ? profile.whitelist.filter(word => typeof word === 'string' && word.length > 0) : [];
            // Request-local UTF-16 spans: a whole word can cover multiple kanji
            // findings/tokens. Never put project whitelist state in the cache.
            const whitelistedSpans = [];
            for (const word of whitelist) {
                for (let start = text.indexOf(word); start !== -1; start = text.indexOf(word, start + 1)) {
                    whitelistedSpans.push([start, start + word.length]);
                }
            }
            const disabledRules = Array.isArray(profile.disabled_rules) ? profile.disabled_rules : [];
            const techniques = profile.techniques || {};
            const normalizedMessages = results.messages.map(message => {
                const marker = message.ruleId === 'nexus-integrated-rules' && message.message.match(advisoryMarker);
                return marker ? {
                    ...message, outerRuleId: message.ruleId, ruleId: marker[1],
                    message: message.message.slice(marker[0].length), advisory: true,
                } : message;
            });
            const profileFilteredMessages = normalizedMessages.filter(message => {
                const ruleId = String(message.ruleId || '');
                if (disabledRules.some(pattern => [ruleId, message.outerRuleId].filter(Boolean).some(id => pattern.endsWith('*')
                    ? id.startsWith(pattern.slice(0, -1))
                    : id === pattern))) return false;
                if (techniques.allow_nominal_endings && message.message.includes('体言止め')) return false;
                if (techniques.allow_repetition && (message.message.includes('同じ語') || ruleId.includes('doubled'))) return false;
                const target = message.message.match(/【対象:([^】]+)】/)?.[1]
                    || text.slice(message.index || 0, (message.index || 0) + 1);
                if (whitelist.some(word => target.includes(word))) return false;
                const start = message.index;
                return !(message.advisory && Number.isInteger(start) &&
                    text.slice(start, start + target.length) === target &&
                    whitelistedSpans.some(([from, to]) => from <= start && start + target.length <= to));
            });

            const uniqueMessages = profileFilteredMessages.filter((message, index, messages) =>
                messages.findIndex(candidate =>
                    candidate.ruleId === message.ruleId &&
                    candidate.index === message.index &&
                    candidate.message === message.message
                ) === index
            );

            return uniqueMessages.map(msg => ({
                message: msg.message,
                line: msg.line,
                column: msg.column,
                severity: msg.severity,
                ruleId: msg.ruleId,
                ...(msg.advisory ? advisorySources[msg.ruleId] : {}),
                ...(!msg.advisory && msg.fix !== undefined ? { fix: msg.fix } : {}),
                range: msg.range,
                index: msg.index
            }));
        } catch (error) {
            console.error('[textlint] Error during proofread:', error);
            throw error;
        }
    });
}

module.exports = { setupTextlintHandlers };
