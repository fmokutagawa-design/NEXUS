const { ipcMain } = require('electron');
const path = require('path');
const { createLinter, loadTextlintrc } = require('textlint');
const { TextlintLintableRuleDescriptor } = require('@textlint/kernel');
const { keepMessageForDialogue } = require('./dialogueFilter.cjs');

let linter = null;

/**
 * textlintエンジンの初期化
 * 統合ルール（LanguageTool/RedPen移植）とTomarigi辞書を組み合わせる
 */
async function initLinter() {
    try {
        const descriptor = await loadTextlintrc({
            configFilePath: path.join(__dirname, '../.textlintrc.js')
        });

        // 自作ルール（移植ロジック）を手動で注入
        const customRule = require('../textlint/rules/nexus-integrated-rules.js');
        descriptor.rule.ruleDescriptorList.push(new TextlintLintableRuleDescriptor({
            ruleId: "nexus-integrated-rules",
            rule: customRule,
            options: true
        }));

        linter = createLinter({ descriptor });
        console.log('[textlint] Linguistic Hub initialized successfully.');
    } catch (error) {
        console.error('[textlint] Failed to initialize linter:', error);
    }
}

function setupTextlintHandlers() {
    // 起動時に初期化
    initLinter();

    ipcMain.handle('textlint:proofread', async (event, text, profile = {}) => {
        try {
            if (!linter) {
                await initLinter();
            }
            if (!linter) return [];

            console.log('[textlint] starting proofread...');
            // ファイル名は仮のものを指定
            const results = await linter.lintText(text, "document.txt");
            
            const whitelist = Array.isArray(profile.whitelist) ? profile.whitelist.filter(Boolean) : [];
            const disabledRules = Array.isArray(profile.disabled_rules) ? profile.disabled_rules : [];
            const techniques = profile.techniques || {};
            const profileFilteredMessages = results.messages.filter(message => {
                const ruleId = String(message.ruleId || '');
                if (!keepMessageForDialogue(message, text, techniques.relax_dialogue === true)) return false;
                if (disabledRules.some(pattern => pattern.endsWith('*')
                    ? ruleId.startsWith(pattern.slice(0, -1))
                    : ruleId === pattern)) return false;
                if (techniques.allow_nominal_endings && message.message.includes('体言止め')) return false;
                if (techniques.allow_repetition && (message.message.includes('同じ語') || ruleId.includes('doubled'))) return false;
                const target = message.message.match(/【対象:([^】]+)】/)?.[1]
                    || text.slice(message.index || 0, (message.index || 0) + 1);
                return !whitelist.some(word => target.includes(word));
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
                fix: msg.fix,
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
