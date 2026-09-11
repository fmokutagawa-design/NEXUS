import xml.etree.ElementTree as ET
import yaml
import os

def convert_tomarigi_xml_to_prh(base_dir, output_file):
    rules = []
    
    xml_files = [
        ("t_substitutecharacter.xml", "substitutecharacter", "Kanji", "Kana", "IsHiragana"),
        ("t_adverbkana.xml", "adverbkana", "Kanji", "Kana", None),
        ("t_conjunctionkanji.xml", "conjunctionkanji", "Kanji", "Kana", None),
        ("t_formalnoun.xml", "formalnoun", "Key", None, None)
    ]
    
    seen_patterns = set()

    for filename, item_tag, key_tag, val_tag, is_hiragana_tag in xml_files:
        path = os.path.join(base_dir, filename)
        if not os.path.exists(path):
            print(f"Skipping {filename} (not found)")
            continue
            
        tree = ET.parse(path)
        root = tree.getroot()
        
        # Find the container tag (e.g., SubstituteSet, AdverbkanaSet)
        container = root[0]
        
        for item in container:
            key_elem = item.find(key_tag)
            if key_elem is None or not key_elem.text:
                continue
                
            pattern = key_elem.text
            if len(pattern) == 1:
                continue
            
            # Skip if already added
            if pattern in seen_patterns:
                continue
            
            expected = None
            if val_tag:
                val_elem = item.find(val_tag)
                if val_elem is not None and val_elem.text:
                    # Convert Katakana to Hiragana if specified
                    expected = val_elem.text
                    if is_hiragana_tag:
                        is_h = item.find(is_hiragana_tag)
                        if is_h is not None and is_h.text == "true":
                            # Simple conversion for common usage
                            expected = "".join([chr(ord(c) - 96) if 12449 <= ord(c) <= 12534 else c for c in expected])
                    else:
                        # For adverbs/conjunctions, usually Hiragana is preferred
                        expected = "".join([chr(ord(c) - 96) if 12449 <= ord(c) <= 12534 else c for c in expected])

            # If no expected value (like in formalnoun), we skip for now or provide a default
            if not expected:
                if filename == "t_formalnoun.xml":
                    # For formal nouns, we can't easily automate without knowing the kana
                    # But we can skip or use a mapping. Let's skip to avoid false positives.
                    continue
                continue

            rules.append({
                "expected": expected,
                "pattern": pattern
            })
            seen_patterns.add(pattern)

    prh_data = {
        "version": 1,
        "rules": rules
    }
    
    with open(output_file, "w", encoding="utf-8") as f:
        yaml.dump(prh_data, f, allow_unicode=True, default_flow_style=False)
    
    print(f"Converted {len(rules)} rules to {output_file}")

if __name__ == "__main__":
    TOMARIGI_BASE = "/Volumes/Black6T/Nexus_Dev/Tomarigi/plugins/style/デフォルト"
    OUTPUT = "/Volumes/Black6T/Nexus_Dev/antigravity/textlint/prh.yml"
    convert_tomarigi_xml_to_prh(TOMARIGI_BASE, OUTPUT)
