import os
import xml.etree.ElementTree as ET
import yaml

# Common mappings for Tomarigi keys that don't have explicit Kana in the XML
COMMON_KANA_MAP = {
    "辺": "あたり", "上": "うえ", "折": "おり", "限": "かぎり", "方": "かた", "事": "こと",
    "所": "ところ", "時": "とき", "内": "うち", "中": "なか", "物": "もの", "故": "ゆえ",
    "外": "ほか", "間": "ま", "分": "ぶん", "様": "よう", "位": "くらい",
    "言": "いう", "行": "いく", "居": "いる", "置": "おく", "掛": "かける", 
    "兼": "かねる", "切": "きる", "来": "くる", "出": "でる", "付": "つける", "見": "みる"
}

def j_to_h(text):
    # Very simple Katakana to Hiragana conversion
    return "".join([chr(ord(c) - 96) if 'ァ' <= c <= 'ヶ' else c for c in text])

def parse_tomarigi_xml(filepath):
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        rules = []
        
        # Determine the type of file and extract rules
        for item in root.findall('.//*'):
            # Standard Kanji/Kana pairs (adverbkanji, adverbkana, conjunctionkanji, substitutecharacter)
            kanji_elem = item.find('Kanji')
            kana_elem = item.find('Kana')
            
            if kanji_elem is not None and kana_elem is not None:
                kanji = kanji_elem.text
                kana = kana_elem.text
                if not kanji or not kana: continue
                
                # Check for IsHiragana flag (like in substitutecharacter)
                is_hiragana = item.find('IsHiragana')
                if is_hiragana is not None and is_hiragana.text == 'true':
                    rules.append({'expected': j_to_h(kana), 'pattern': kanji})
                else:
                    # Default: pattern is Kanji, expected is Kana (usually Hiragana for these rules)
                    # But if it's adverbkana, it's the opposite.
                    if 'adverbkana' in filepath:
                        rules.append({'expected': kanji, 'pattern': j_to_h(kana)})
                    else:
                        rules.append({'expected': j_to_h(kana), 'pattern': kanji})
            
            # Key-only items (formalnoun, subsidiaryverb)
            key_elem = item.find('Key')
            if key_elem is not None:
                key = key_elem.text
                if key in COMMON_KANA_MAP:
                    rules.append({'expected': COMMON_KANA_MAP[key], 'pattern': key})
                else:
                    # If unknown, we can't reliably convert to PRH without context
                    # So we'll skip or log it
                    pass
                    
        return rules
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return []

def main():
    base_dir = "/Volumes/Black6T/Nexus_Dev/Tomarigi/plugins/style/デフォルト"
    all_rules = []
    
    files = [
        "t_adverbkana.xml",
        "t_adverbkanji.xml",
        "t_conjunctionkanji.xml",
        "t_formalnoun.xml",
        "t_subsidiaryverb.xml",
        "t_substitutecharacter.xml",
        "t_okurikana.xml"
    ]
    
    for filename in files:
        path = os.path.join(base_dir, filename)
        if os.path.exists(path):
            print(f"Processing {filename}...")
            rules = parse_tomarigi_xml(path)
            all_rules.extend(rules)
            
    # Deduplicate and sort
    unique_rules = []
    seen = set()
    for r in all_rules:
        exp = r['expected'].strip() if r['expected'] else ""
        pat = r['pattern'].strip() if r['pattern'] else ""
        # 一文字の表記規則は「大切」の「切」まで置換するため、PRHへ入れない。
        # 形式名詞・補助動詞は品詞対応ルールで処理する。
        if not exp or not pat or len(pat) == 1: continue
        
        key = (exp, pat)
        if key not in seen and exp != pat:
            unique_rules.append({'expected': exp, 'pattern': pat})
            seen.add(key)
            
    # Sort by pattern length descending to match longest first in prh
    unique_rules.sort(key=lambda x: len(x['pattern']), reverse=True)
    
    output = {'rules': unique_rules}
    with open('/Volumes/Black6T/Nexus_Dev/antigravity/textlint/prh.yml', 'w', encoding='utf-8') as f:
        yaml.dump(output, f, allow_unicode=True, sort_keys=False)
    
    print(f"Total rules converted: {len(unique_rules)}")

if __name__ == "__main__":
    main()
