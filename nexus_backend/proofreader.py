import re
import json
import os
from html import escape

class Proofreader:
    """
    データ駆動型の高度な日本語校正エンジン
    LanguageTool (700+ルール), textlint, Tomarigi の知見を統合
    """
    
    def __init__(self, rules_path=None, whitelist_path=None):
        if rules_path is None:
            from config_loader import get_rules_path
            rules_path = get_rules_path()
        self.rules = []
        self.compiled_rules = []
        
        # ホワイトリスト読み込み
        self.whitelist = set()
        if whitelist_path is None:
            whitelist_path = os.path.join(os.path.dirname(__file__), "nexus_whitelist.json")
        if os.path.exists(whitelist_path):
            try:
                with open(whitelist_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.whitelist = set(data.get("whitelist", []))
            except Exception as e:
                print(f"Warning: failed to load whitelist: {e}")

        # 1. 外部辞書の読み込み
        # ※ textlint (Electron側) が lt_complex_rules.json で同等のチェックを
        #   品詞条件付きで実行するため、Python側での重複実行を無効化。
        #   Python側は小説特化ルール (fast_rules, novel_specific) と
        #   物語監査 (audit_narrative) に専念する。
        # if os.path.exists(rules_path): ...

        # 2. 小説特化型の追加ルール (textlint / Tomarigi セオリー)
        # ※リテラル置換で可能なものは fast_rules へ移行済み
        self.novel_specific_rules = [
            (re.compile(r'([^\s]+)を行う'), r'\1する', '「〜する」で簡潔に表現できます'),
        ]

        # 3. 高速エンジン（リテラル置換）用ルール
        # キーワード: (置換案, メッセージ)
        self.fast_rules = {
            "というふうに": ("と", "冗長な表現です"),
            "することができる": ("できる", "冗長な表現です"),
        }

    def _run_fast_scan(self, text, narration_only=True):
        """リテラル文字列による高速スキャン"""
        results = []
        for word, (suggestion, message) in self.fast_rules.items():
            start = 0
            while True:
                idx = text.find(word, start)
                if idx == -1: break
                results.append({
                    "original": word,
                    "suggested": suggestion,
                    "reason": message + ("（地の文）" if narration_only else ""),
                    "start": idx,
                    "engine": "NEXUS",
                    "rule_id": "nexus/redundancy",
                    "severity": 1,
                })
                start = idx + len(word)
        return results

    def check_stylistic_consistency(self, sentences):
        """敬体(ですます)と常体(だである)の混在をチェック"""
        desu_masu = 0
        da_dearu = 0
        for s in sentences:
            s = s.strip()
            if not s: continue
            if re.search(r'(です|ます|でした|ました|ませ|ましょう)[。？！]?$', s):
                desu_masu += 1
            elif re.search(r'(だ|である|した|だった|のだ|る|ない)[。？！]?$', s):
                da_dearu += 1
        
        if desu_masu > 0 and da_dearu > 0:
            dominant = "敬体" if desu_masu > da_dearu else "常体"
            minority = da_dearu if desu_masu > da_dearu else desu_masu
            if minority > 0:
                return {
                    "original": "テキスト全体",
                    "suggested": f"{dominant}に統一",
                    "reason": f"文体が混在しています（敬体:{desu_masu}、常体:{da_dearu}）。意図的でない場合は統一を推奨します。"
                }
        return None

    def check_successive_words(self, text):
        """「私はは」のような連続した同じ単語を検知"""
        # 助詞や短い単語の連続を検知
        pattern = re.compile(r'([ぁ-んァ-ヶー]{1,2})\1')
        matches = pattern.finditer(text)
        results = []
        for m in matches:
            # 「たた」「ここ」などは日常語なので除外するフィルタが必要
            word = m.group(1)
            if word in ['た', 'こ', 'て', 'に', 'は', 'を', 'が', 'の']:
                results.append({
                    "original": m.group(0),
                    "suggested": word,
                    "reason": f"助詞「{word}」が連続しています。タイポの可能性があります。"
                })
        return results

    def _get_aliases(self, char_name):
        """エイリアスリストを取得"""
        aliases_path = os.path.join(os.path.dirname(__file__), "nexus_aliases.json")
        if os.path.exists(aliases_path):
            try:
                with open(aliases_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("aliases", {}).get(char_name, [])
            except:
                pass
        return []

    def audit_narrative(self, text, materials_context=None, chapter_number=None):
        """
        物語の整合性を監査する (Layer 2)
        """
        audit_results = []
        if not materials_context:
            return audit_results

        for char_name, state in materials_context.get('characters', {}).items():
            # 現在の章の状態を取得 (stateは単一のdictを想定)
            if state.get('status') == 'dead':
                search_names = [char_name] + self._get_aliases(char_name)
                exclusion_words = ["回想", "思い出", "かつて", "あの日", "死", "遺影", "墓", "供養", "亡き"]
                for name in search_names:
                    for m in re.finditer(re.escape(name), text):
                        # マッチ位置の前後50文字を取得して回想コンテキストをチェック
                        ctx_start = max(0, m.start() - 50)
                        ctx_end = min(len(text), m.end() + 50)
                        context = text[ctx_start:ctx_end]
                        if any(w in context for w in exclusion_words):
                            continue  # 回想・追悼コンテキストなのでスキップ
                        
                        reason = f"第{chapter_number}章時点では【{char_name}】は死亡しているはずです。"
                        audit_results.append({
                            "original": m.group(0),
                            "suggested": "時系列の確認",
                            "reason": reason + f"（ソース: {state.get('source', '不明')}）"
                        })

            # 属性チェック (瞳の色、出身、武器など)
            attributes = state.get('attributes', {})
            if attributes:
                search_names = [char_name] + self._get_aliases(char_name)
                for attr_key, attr_val in attributes.items():
                    # 属性の矛盾を検知するためのパターン
                    # 例: 瞳が「青」なのに「赤い瞳」と書かれている場合
                    keywords = {
                        "eye_color": ["瞳", "目", "眼"],
                        "hair": ["髪"],
                        "origin": ["出身", "故郷"],
                        "weapon": ["武器", "装備", "剣", "銃"]
                    }.get(attr_key, [])

                    if not keywords: continue

                    for name in search_names:
                        # 「名前」の近くにある「属性キーワード」を探す
                        # 例: 「アリスの赤い瞳」
                        pattern = re.compile(rf'{re.escape(name)}[^。？！]{0,20}(?:{"|".join(keywords)})[：:\s]*([^\s,，。、]+)')
                        for m in pattern.finditer(text):
                            detected_val = m.group(1)
                            if attr_val not in detected_val and detected_val not in attr_val:
                                audit_results.append({
                                    "original": m.group(0),
                                    "suggested": f"{attr_val}",
                                    "reason": f"設定資料では【{char_name}】の{attr_key}は「{attr_val}」ですが、本文では「{detected_val}」と描写されています。"
                                })

        return audit_results

    def split_dialogue_and_narration(self, text):
        """
        テキストを会話文と地の文に分離する。
        """
        dialogue_ranges = []
        result = list(text)
        i = 0
        while i < len(text):
            if text[i] in '「『':
                close_char = '」' if text[i] == '「' else '』'
                depth = 1
                j = i + 1
                while j < len(text) and depth > 0:
                    if text[j] == text[i]:
                        depth += 1
                    elif text[j] == close_char:
                        depth -= 1
                    j += 1
                dialogue_ranges.append((i, j))
                for k in range(i, min(j, len(text))):
                    result[k] = ' '
                i = j
            else:
                i += 1
        
        narration_text = ''.join(result)
        return narration_text, dialogue_ranges

    def _is_whitelisted(self, matched_text):
        """マッチしたテキストにホワイトリストの語が含まれていたら True"""
        for word in self.whitelist:
            if word in matched_text:
                return True
        return False

    def calculate_kanji_ratio(self, text):
        """漢字の含有率を計算"""
        if not text: return 0
        kanji_count = len(re.findall(r'[一-龠々]', text))
        return (kanji_count / len(text)) * 100

    def check_document_structure(self, text, profile=None):
        """RedPen相当の文書・段落構造検査（小説向けの保守的設定）。"""
        profile = profile or {}
        thresholds = profile.get("thresholds", {})
        long_paragraph = int(thresholds.get("long_paragraph", 1000))
        blank_lines = max(2, int(thresholds.get("blank_lines", 3)))
        results = []

        for match in re.finditer(rf"\n{{{blank_lines + 1},}}", text):
            results.append({
                "original": match.group(0), "suggested": "空行数を確認",
                "reason": f"空行が{len(match.group(0)) - 1}行以上連続しています。意図した場面転換か確認してください。",
                "start": match.start(), "engine": "RedPen", "rule_id": "redpen/excessive-blank-lines", "severity": 1,
            })

        offset = 0
        paragraphs = text.split("\n")
        prose_paragraphs = []
        for paragraph in paragraphs:
            stripped = paragraph.strip()
            if len(stripped) > long_paragraph:
                results.append({
                    "original": stripped[:20] + "…", "suggested": "段落を分割",
                    "reason": f"段落が{len(stripped)}文字あります。構造上の分割を検討してください。",
                    "start": offset + max(0, paragraph.find(stripped)), "engine": "RedPen",
                    "rule_id": "redpen/paragraph-length", "severity": 1,
                })
            if stripped and not stripped.startswith(("#", "「", "『", "［＃")):
                prose_paragraphs.append(paragraph)
            offset += len(paragraph) + 1

        # Markdown見出しを利用する原稿では、見出しレベルの飛びだけを検出する。
        previous_level = None
        for match in re.finditer(r"(?m)^(#{1,6})\s+.+$", text):
            level = len(match.group(1))
            if previous_level is not None and level > previous_level + 1:
                results.append({
                    "original": match.group(0), "suggested": f"見出しレベル{previous_level + 1}",
                    "reason": f"見出しレベルが{previous_level}から{level}へ飛んでいます。",
                    "start": match.start(), "engine": "RedPen", "rule_id": "redpen/section-level", "severity": 1,
                })
            previous_level = level

        # 会話文を除く段落が十分ある場合だけ、字下げ方式の混在を通知する。
        if len(prose_paragraphs) >= 5:
            indented = sum(paragraph.startswith("　") for paragraph in prose_paragraphs)
            unindented = len(prose_paragraphs) - indented
            if indented >= 2 and unindented >= 2:
                results.append({
                    "original": "文書全体", "suggested": "段落字下げを統一",
                    "reason": f"地の文の字下げが混在しています（字下げあり{indented}／なし{unindented}）。",
                    "engine": "RedPen", "rule_id": "redpen/paragraph-indent", "severity": 1,
                })
        return results

    def proofread(self, text, mode='all', materials_context=None, chapter_number=None, profile=None):
        """
        校正監査を実行
        """
        corrections = []
        profile = profile or {}
        
        # 会話文と地の文を分離
        narration_text, dialogue_ranges = self.split_dialogue_and_narration(text)
        
        def is_in_dialogue(pos):
            for start, end in dialogue_ranges:
                if start <= pos < end:
                    return True
            return False
        
        # --- Layer 1: 校正 (瞬時) ---
        if mode in ['proof', 'all']:
            # 高速リテラルスキャン（地の文）
            corrections.extend(self._run_fast_scan(narration_text, narration_only=True))
            
            narration_sentences = re.split(r'(?<=[。？！])\s*', narration_text)
            narration_sentences = [s for s in narration_sentences if s.strip()]
            # 文体混在・文長・指示詞多用は、位置を正確に返せるtextlint／
            # RedPen／Tomarigi系統へ一本化する。
            
            # 小説特化ルール（地の文のみ）
            for pattern, suggestion, message in self.novel_specific_rules:
                for m in pattern.finditer(narration_text):
                    corrections.append({
                        "original": m.group(0),
                        "suggested": suggestion,
                        "reason": message + "（地の文）"
                    })

            # 文末重複（地の文のみ）
            for i in range(len(narration_sentences) - 2):
                s1_end = re.sub(r'[。？！]', '', narration_sentences[i].strip())[-2:]
                s2_end = re.sub(r'[。？！]', '', narration_sentences[i+1].strip())[-2:]
                s3_end = re.sub(r'[。？！]', '', narration_sentences[i+2].strip())[-2:]
                if len(s1_end) >= 2 and s1_end == s2_end == s3_end:
                    corrections.append({"original": f"「{s1_end}」の連続", "suggested": "変更", "reason": "地の文で文末表現が3回連続しています。"})

            # 外部辞書スキャン — textlint に一本化したため無効化
            # (compiled_rules は空のまま保持)

            # 2. 全文に適用するルール
            # 短文では比率が大きく振れ、誤検出になるため作品単位の長さでのみ評価する。
            if len(text) >= 200:
                ratio = self.calculate_kanji_ratio(text)
                if ratio > 40:
                    corrections.append({"original": "全体", "suggested": "ひらがな増", "reason": f"漢字率 {ratio:.1f}%: 小説としては堅苦しすぎます。"})
                elif ratio < 15:
                    corrections.append({"original": "全体", "suggested": "漢字増", "reason": f"漢字率 {ratio:.1f}%: 小説としては幼すぎます。"})

            corrections.extend(self.check_successive_words(text))

            for ob, cb in {'「': '」', '（': '）', '『': '』'}.items():
                if text.count(ob) != text.count(cb):
                    corrections.append({"original": f"{ob}{cb}", "suggested": "修正", "reason": "カッコの対応が取れていません。"})

            corrections.extend(self.check_document_structure(text, profile))

        # --- Layer 2: 監査 (物語整合性) ---
        if mode in ['audit', 'all']:
            audit_results = self.audit_narrative(text, materials_context, chapter_number)
            corrections.extend(audit_results)

        # 統合ハブが同じ表記の複数箇所を区別できるよう、位置と出典を必ず付与する。
        search_offsets = {}
        for correction in corrections:
            original = str(correction.get("original", ""))
            if "start" not in correction and original and original not in ("全体", "テキスト全体"):
                offset = search_offsets.get(original, 0)
                found = text.find(original, offset)
                if found >= 0:
                    correction["start"] = found
                    search_offsets[original] = found + max(1, len(original))
            correction.setdefault("engine", "NEXUS")
            correction.setdefault("rule_id", "nexus/style")
            correction.setdefault("severity", 1)

        whitelist = set(profile.get("whitelist", [])) | self.whitelist
        disabled_rules = set(profile.get("disabled_rules", []))
        techniques = profile.get("techniques", {})
        filtered = []
        for correction in corrections:
            original = str(correction.get("original", ""))
            rule_id = str(correction.get("rule_id", ""))
            reason = str(correction.get("reason", ""))
            if rule_id in disabled_rules or any(rule_id.startswith(prefix.rstrip("*")) for prefix in disabled_rules if prefix.endswith("*")):
                continue
            if any(word and word in original for word in whitelist):
                continue
            if techniques.get("allow_nominal_endings") and "体言止め" in reason:
                continue
            if techniques.get("allow_repetition") and rule_id in {"nexus/repetition", "redpen/successive-word"}:
                continue
            filtered.append(correction)

        return filtered

    def to_xml(self, corrections):
        xml = ""
        for c in corrections:
            xml += f"<correction>\n  <original>{escape(str(c['original']))}</original>\n"
            xml += f"  <suggested>{escape(str(c['suggested']))}</suggested>\n"
            xml += f"  <reason>{escape(str(c['reason']))}</reason>\n</correction>\n"
        return xml
