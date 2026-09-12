const { RuleHelper } = require("textlint-rule-helper");
const { getTokenizer } = require("kuromojin");
const { runTomarigiReferenceRules } = require('./tomarigi-reference-rules.cjs');
const fs = require("fs");
const path = require("path");

const TOMARIGI_SUBSIDIARY_VERBS = new Set(["上", "言", "行", "居", "置", "掛", "兼", "切", "来", "出", "付", "見"]);
const TOMARIGI_FORMAL_NOUNS = new Set(["辺", "上", "折", "限", "位", "事", "毎", "度", "積", "通", "時", "所", "等", "筈", "方", "程", "物", "様", "訳"]);

// Load the pre-extracted complex rules
const complexRulesPath = path.join(__dirname, "lt_complex_rules.json");
let complexRules = [];
let tomarigiSentenceEndRules = [];
try {
    complexRules = JSON.parse(fs.readFileSync(complexRulesPath, "utf-8"))
        // 変換元の語面情報が欠落したルールは「任意の動詞」等に誤爆するため実行しない。
        .filter(rule => rule.tokens?.some(token => token.surface));
} catch (e) {
    console.error("Failed to load complex rules:", e);
}
try {
    tomarigiSentenceEndRules = JSON.parse(fs.readFileSync(
        path.join(__dirname, "tomarigi_sentence_end_rules.json"), "utf-8"
    ));
} catch (e) {
    console.error("Failed to load Tomarigi sentence-end rules:", e);
}

module.exports = function(context, options = {}) {
    const { Syntax, RuleError, report, getSource } = context;
    const ruleHelper = new RuleHelper(context);

    return {
        async [Syntax.Str](node) {
            if (ruleHelper.isChildNode(node, [Syntax.Link, Syntax.Image, Syntax.BlockQuote])) {
                return;
            }

            const text = getSource(node);
            const tokenizer = await getTokenizer();
            const tokens = await tokenizer.tokenize(text);

            for (const finding of runTomarigiReferenceRules(text, tokens, options)) {
                // Internal identity is normalized before project filtering in textlintMain.
                report(node, new RuleError(
                    `【NEXUS_ADVISORY:${finding.ruleId}】【トマリギ】【対象:${finding.target}】${finding.message}`,
                    { index: finding.start }
                ));
            }

            // LanguageToolのXML <or> を使う規則。旧変換器はor配下を落として
            // いたため、選択肢を保持した安全な正規表現として補完する。
            const ltAlternativeRules = [
                { pattern: /[ー－][っゃゅょ]/g, id: "START2", message: "長音記号の直後に小書き文字が来ています。" },
                { pattern: /自身(?:が|を)(?:ない|持つ)/g, id: "JISINN", message: "「自信」の誤変換の可能性があります。" }
            ];
            for (const rule of ltAlternativeRules) {
                for (const match of text.matchAll(rule.pattern)) {
                    report(node, new RuleError(
                        `【LanguageTool】【対象:${match[0]}】${rule.message} (Rule: ${rule.id})`,
                        { index: match.index }
                    ));
                }
            }

            // RedPen InvalidSymbol / SpaceBeginningOfSentence 相当。
            // URLや小数点を避け、日本語文字に隣接する半角句読点だけを対象にする。
            for (const match of text.matchAll(/(?<=[ぁ-んァ-ヶ一-龠々]),(?=[ぁ-んァ-ヶ一-龠々])/g)) {
                report(node, new RuleError(
                    "【RedPen】【対象:,】日本語文中の半角カンマです。読点「、」を推奨します。",
                    { index: match.index }
                ));
            }
            for (const match of text.matchAll(/(?<=[ぁ-んァ-ヶ一-龠々])\.(?=[ぁ-んァ-ヶ一-龠々]|$)/g)) {
                report(node, new RuleError(
                    "【RedPen】【対象:.】日本語文中の半角ピリオドです。句点「。」を推奨します。",
                    { index: match.index }
                ));
            }
            for (const match of text.matchAll(/(^|\n)( +)(?=[ぁ-んァ-ヶ一-龠々「『])/g)) {
                const index = match.index + match[1].length;
                report(node, new RuleError(
                    `【RedPen】【対象:${match[2]}】日本語段落の行頭に半角空白があります。全角空白か字下げ設定を使用してください。`,
                    { index }
                ));
            }

            // Tomarigi「読点位置」相当。作家の裁量が大きい読点の追加提案は
            // 控え、文頭・句読点直前など構造的に不自然な位置だけを確定指摘する。
            for (const match of text.matchAll(/(^|\n)(、)|、(?=[、。！？])|(?<=[。！？])、/g)) {
                const target = match[2] || match[0];
                const index = match.index + (match[1]?.length || 0);
                report(node, new RuleError(
                    `【トマリギ】【対象:${target}】読点の位置が不自然です。`,
                    { index }
                ));
            }
            for (const match of text.matchAll(/[^。！？\n]{80,}[。！？]/g)) {
                if (!match[0].includes("、")) {
                    report(node, new RuleError(
                        `【トマリギ】80文字以上の文に読点がありません。読みやすさを確認してください。`,
                        { index: match.index }
                    ));
                }
            }

            // Tomarigi「冗長な文末」辞書。単純な一文字置換ではなく、まとまった
            // フレーズだけを対象にするため、表記辞書より誤検出が少ない。
            for (const rule of tomarigiSentenceEndRules) {
                let start = 0;
                while ((start = text.indexOf(rule.text, start)) !== -1) {
                    report(node, new RuleError(
                        `【トマリギ】【対象:${rule.text}】冗長な文末表現です。修正案: ${rule.revision}`,
                        { index: start }
                    ));
                    start += rule.text.length;
                }
            }

            // Helper to match a single token against a rule token definition
            const matchToken = (textToken, ruleToken) => {
                if (!textToken) return false;

                // Surface match
                if (ruleToken.surface) {
                    if (ruleToken.regexp) {
                        const regex = new RegExp(`^${ruleToken.surface}$`);
                        if (!regex.test(textToken.surface_form)) return false;
                    } else if (ruleToken.surface !== textToken.surface_form) {
                        // Handle inflected check if surface doesn't match
                        if (!ruleToken.inflected || ruleToken.surface !== textToken.basic_form) {
                            return false;
                        }
                    }
                }

                // POS match
                if (ruleToken.postag) {
                    const postag = textToken.pos + (textToken.pos_detail_1 ? "-" + textToken.pos_detail_1 : "");
                    if (ruleToken.postag === "SENT_END") {
                        return ["。", "！", "？", ".", "!", "?"].includes(textToken.surface_form);
                    }
                    if (ruleToken.postag_regexp) {
                        const regex = new RegExp(`^${ruleToken.postag}`);
                        if (!regex.test(postag)) return false;
                    } else if (ruleToken.postag !== postag) {
                        return false;
                    }
                }

                return true;
            };

            // Run the LT Interpreter
            for (let i = 0; i < tokens.length; i++) {
                // Optimization: In a real high-perf engine, we'd use a prefix-map.
                // For now, we iterate, but LT rules are mostly specific enough.
                
                for (const rule of complexRules) {
                    let tokenIdx = i;
                    let matched = true;
                    
                    for (let tStep = 0; tStep < rule.tokens.length; tStep++) {
                        const rToken = rule.tokens[tStep];
                        const textToken = tokens[tokenIdx];
                        
                        if (!matchToken(textToken, rToken)) {
                            // If it doesn't match, check if we can skip (LT skip attribute)
                            let skipFound = false;
                            if (rToken.skip > 0) {
                                for (let s = 1; s <= rToken.skip && (tokenIdx + s) < tokens.length; s++) {
                                    if (matchToken(tokens[tokenIdx + s], rToken)) {
                                        tokenIdx += s;
                                        skipFound = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (!skipFound) {
                                matched = false;
                                break;
                            }
                        }
                        tokenIdx++;
                    }

                    if (matched) {
                        const matchedTokens = tokens.slice(i, tokenIdx);
                        const matchStart = tokens[i].word_position - 1;
                        const lastToken = matchedTokens[matchedTokens.length - 1];
                        const matchEnd = lastToken.word_position - 1 + lastToken.surface_form.length;
                        const targetText = text.slice(matchStart, matchEnd);
                        const suggestion = rule.suggestions?.[0];
                        const literalPattern = rule.tokens.every(token => token.surface && !token.postag && !token.skip);
                        const suggestionText = suggestion
                            ? literalPattern ? ` 修正案: ${suggestion}` : ` 参考候補: ${suggestion}`
                            : "";
                        report(node, new RuleError(`【NEXUS統合校正】【対象:${targetText}】${rule.message}${suggestionText} (Rule: ${rule.id})`, {
                            index: tokens[i].word_position - 1
                        }));
                    }
                }
            }

            // --- Tomarigi Subsidiary/Formal Noun checks (POS based) ---
            tokens.forEach((token, tokenIndex) => {
                const subsidiaryKey = [...TOMARIGI_SUBSIDIARY_VERBS].find(key =>
                    token.surface_form.startsWith(key) || token.basic_form?.startsWith(key)
                );
                const followsTeForm = ["て", "で"].includes(tokens[tokenIndex - 1]?.surface_form);
                if (subsidiaryKey && token.pos === "動詞" && (token.pos_detail_1 === "非自立" || followsTeForm)) {
                    report(node, new RuleError(
                        `【トマリギ】【対象:${token.surface_form}】補助動詞「${token.surface_form}」はひらがな表記が推奨されます。`,
                        { index: token.word_position - 1 }
                    ));
                }
                if (TOMARIGI_FORMAL_NOUNS.has(token.surface_form) && token.pos === "名詞" && token.pos_detail_1 === "非自立") {
                    report(node, new RuleError(
                        `【トマリギ】【対象:${token.surface_form}】形式名詞「${token.surface_form}」はひらがな表記が推奨されます。`,
                        { index: token.word_position - 1 }
                    ));
                }
            });

            // Tomarigi「指示詞多用」。一文ごとに数え、設定値（3回目）で通知する。
            const indexicals = new Set(["これ", "それ", "あれ", "この", "その", "あの", "ここ", "そこ", "あそこ"]);
            let sentenceIndexicals = [];
            for (const token of tokens) {
                if (indexicals.has(token.surface_form)) sentenceIndexicals.push(token);
                if (["。", "！", "？"].includes(token.surface_form)) {
                    if (sentenceIndexicals.length >= 3) {
                        const target = sentenceIndexicals[2];
                        report(node, new RuleError(
                            `【トマリギ】【対象:${target.surface_form}】一文で指示詞が${sentenceIndexicals.length}回使われています。具体的な名詞への置き換えを検討してください。`,
                            { index: target.word_position - 1 }
                        ));
                    }
                    sentenceIndexicals = [];
                }
            }

            // Tomarigi「重複語」相当。助詞はpreset-japaneseへ任せ、内容語が
            // 空白なしでそのまま連続した場合だけを扱う。
            for (let i = 1; i < tokens.length; i++) {
                const previous = tokens[i - 1];
                const current = tokens[i];
                const previousEnd = previous.word_position - 1 + previous.surface_form.length;
                if (previous.surface_form.length >= 2 &&
                    previous.surface_form === current.surface_form &&
                    previousEnd === current.word_position - 1 &&
                    ["名詞", "動詞", "形容詞", "副詞"].includes(current.pos)) {
                    report(node, new RuleError(
                        `【トマリギ】同じ語「${current.surface_form}」が連続しています。`,
                        { index: current.word_position - 1 }
                    ));
                }
            }

            // Tomarigi「体言止め」相当。小説では体言止め自体は正しいため、
            // 三文以上連続した場合にだけリズム確認として通知する。
            let nominalRun = 0;
            let lastContentToken = null;
            for (const token of tokens) {
                if (["。", "！", "？"].includes(token.surface_form)) {
                    if (lastContentToken?.pos === "名詞") nominalRun += 1;
                    else nominalRun = 0;
                    if (nominalRun === 3) {
                        report(node, new RuleError(
                            "【トマリギ】体言止めが3文連続しています。意図したリズムか確認してください。",
                            { index: lastContentToken.word_position - 1 }
                        ));
                    }
                    lastContentToken = null;
                } else if (!["記号", "助詞"].includes(token.pos)) {
                    lastContentToken = token;
                }
            }

            // Tomarigi「連用形」相当。連用形で終わる節が読点を挟んで三つ
            // 連続した場合だけ、単調な接続になっていないかを通知する。
            let continuativeRun = 0;
            let clauseLastToken = null;
            for (const token of tokens) {
                if (token.surface_form === "、") {
                    const isContinuative = clauseLastToken?.pos === "動詞" &&
                        String(clauseLastToken.conjugated_form || "").startsWith("連用形");
                    continuativeRun = isContinuative ? continuativeRun + 1 : 0;
                    if (continuativeRun === 3) {
                        report(node, new RuleError(
                            `【トマリギ】【対象:${clauseLastToken.surface_form}】連用形で終わる節が3回連続しています。接続表現の単調さを確認してください。`,
                            { index: clauseLastToken.word_position - 1 }
                        ));
                    }
                    clauseLastToken = null;
                } else if (["。", "！", "？"].includes(token.surface_form)) {
                    continuativeRun = 0;
                    clauseLastToken = null;
                } else if (!["記号", "助詞", "助動詞"].includes(token.pos)) {
                    clauseLastToken = token;
                }
            }
        }
    };
};
