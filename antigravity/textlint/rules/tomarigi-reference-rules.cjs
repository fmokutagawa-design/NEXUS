const { createTomarigiReferenceIndex } = require('./tomarigi-reference-data.cjs');
const { chineseNumeralExceptions } = require('../data/tomarigi/usage-exceptions.json');

const reference = createTomarigiReferenceIndex();

// Kuromoji tokens are read-only inputs. Findings contain reference information,
// never replacement instructions or a textlint fixer.
function runTomarigiReferenceRules(text, tokens, options = {}) {
    const whitelist = Array.isArray(options.whitelist) ? options.whitelist.filter(Boolean) : [];
    const kanjiEnabled = Array.isArray(options.enabled_rules) && options.enabled_rules.includes('tomarigi/kanji-level');
    const findings = [];
    // Kuromoji positions count code points (1-based); slices and findings use
    // UTF-16 offsets. Build the mapping once, including supplementary characters.
    const utf16Offsets = [0];
    for (const char of text) {
        utf16Offsets.push(utf16Offsets[utf16Offsets.length - 1] + char.length);
    }
    const add = (start, target, ruleId, message, candidates = []) => {
        if (!whitelist.some(word => target.includes(word))) {
            findings.push({ start, end: start + target.length, target, ruleId, message, candidates });
        }
    };

    for (const token of tokens) {
        const surface = token.surface_form;
        const start = utf16Offsets[token.word_position - 1];
        if (typeof surface !== 'string' || !surface || !Number.isInteger(start) || start < 0 ||
            text.slice(start, start + surface.length) !== surface) continue;
        if (whitelist.some(word => surface.includes(word))) continue;

        const candidates = reference.findHomonymCandidates({ surface, reading: token.reading })
            .map(({ text, meaning }) => ({ text, meaning }));
        if (candidates.length) {
            add(start, surface, 'tomarigi/homonym-reference',
                `同音候補があります。文脈に合う語か確認してください。参考候補: ${candidates.map(item => item.text).join(' / ')}`,
                candidates);
        }

        if (kanjiEnabled) {
            let offset = 0;
            for (const char of surface) {
                const classification = reference.classifyKanji(char);
                if (classification?.isCommon === false) {
                    add(start + offset, char, 'tomarigi/kanji-level',
                        'Tomarigi/saezuri辞書では常用漢字外です。作品の表記方針に照らして確認してください。');
                }
                offset += char.length;
            }
        }

        if (token.pos === '名詞' && token.pos_detail_1 === '数' && /^[〇零一二三四五六七八九十百千万億兆]+$/u.test(surface)) {
            const inException = chineseNumeralExceptions.some(word => {
                const index = text.lastIndexOf(word, start);
                return index >= 0 && index + word.length >= start + surface.length;
            });
            if (!inException) {
                add(start, surface, 'tomarigi/chinese-numeral',
                    '漢数字の数値表記です。作品の表記方針に照らして確認してください。');
            }
        }
    }
    return findings;
}

module.exports = { runTomarigiReferenceRules };
