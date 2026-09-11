import xml.etree.ElementTree as ET
import json
import re

def parse_lt_grammar(xml_path):
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    compiled_rules = []
    
    for category in root.findall('category'):
        cat_name = category.get('name', 'General')
        for rule in category.findall('rule'):
            rule_id = rule.get('id')
            pattern_elem = rule.find('pattern')
            if pattern_elem is None: continue
            
            message_elem = rule.find('message')
            message_text = "".join(message_elem.itertext()) if message_elem is not None else "文法ミスがあります。"
            suggestions = []
            if message_elem is not None:
                suggestions = ["".join(item.itertext()).strip() for item in message_elem.findall('.//suggestion')]
                suggestions = [item for item in suggestions if item]
            
            # Extract tokens
            tokens_data = []
            for t in pattern_elem.findall('token'):
                token_info = {
                    'surface': t.text if t.text else None,
                    'postag': t.get('postag'),
                    'postag_regexp': t.get('postag_regexp') == 'yes',
                    'skip': int(t.get('skip', 0)),
                    'inflected': t.get('inflected') == 'yes',
                    'regexp': t.get('regexp') == 'yes'
                }
                tokens_data.append(token_info)
            
            # Only include rules that are more than 1 token OR have postag (complex rules)
            if tokens_data:
                if len(tokens_data) > 1 or tokens_data[0]['postag']:
                    compiled_rules.append({
                        'id': rule_id,
                        'category': cat_name,
                        'tokens': tokens_data,
                        'message': message_text,
                        'suggestions': suggestions
                    })
                
    return compiled_rules

def main():
    xml_path = '/Volumes/Black6T/Nexus_Dev/antigravity/textlint/rules/lt_grammar_ja.xml'
    output_path = '/Volumes/Black6T/Nexus_Dev/antigravity/textlint/rules/lt_complex_rules.json'
    
    print(f"Parsing {xml_path}...")
    rules = parse_lt_grammar(xml_path)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully extracted {len(rules)} complex rules to {output_path}")

if __name__ == "__main__":
    main()
