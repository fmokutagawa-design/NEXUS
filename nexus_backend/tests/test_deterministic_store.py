import os
import json
import sqlite3
import tempfile
import unittest

from deterministic_store import DeterministicStore, extract_facts, extract_profile_candidates, extract_joplin_title_candidates
from memory_pack import render_memory_pack, write_memory_pack
from proofreader import Proofreader


class DeterministicStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self.temp.name, "作品A")
        os.makedirs(os.path.join(self.root, "設定"))
        os.makedirs(os.path.join(self.root, "原稿"))
        self.store = DeterministicStore(os.path.join(self.temp.name, "nexus.sqlite3"))

    def tearDown(self):
        self.temp.cleanup()

    def write(self, relative, content):
        path = os.path.join(self.root, relative)
        with open(path, "w", encoding="utf-8") as stream:
            stream.write(content)
        return path

    def test_extracts_explicit_facts(self):
        facts = extract_facts("人物: アリス\n別名: 赤の魔女、アリィ\n瞳: 青\n")
        self.assertIn(("アリス", "alias", "赤の魔女"), [(f.subject, f.predicate, f.value) for f in facts])
        self.assertIn(("アリス", "eye_color", "青"), [(f.subject, f.predicate, f.value) for f in facts])

    def test_extracts_joplin_frontmatter_person_and_markdown_organization(self):
        person = """---
title: ◤篠田 雅紀（しのだ まさき）／八潮工業・警備統括◢
---
# ◤篠田 雅紀（しのだ まさき）／八潮工業・警備統括◢
"""
        facts = extract_joplin_title_candidates(person)
        self.assertIn(("篠田雅紀", "reading", "しのだまさき"), [(f.subject, f.predicate, f.value) for f in facts])
        organization = "# ◤中之島イノベーションタワー◢\n"
        fact = extract_joplin_title_candidates(organization)[0]
        self.assertEqual((fact.subject, fact.predicate), ("中之島イノベーションタワー", "candidate_term"))

    def test_image_prompt_in_manuscript_is_not_added_to_ledger(self):
        self.write(
            "原稿/画像指示.txt",
            "画像を生成してください。\n人物: 金髪の少女、青い瞳\n状態: 炎の中に立っている\n",
        )
        self.store.index_roots([self.root])
        self.assertEqual(self.store.facts_under_root(self.root), [])

    def test_extracts_profiles_from_natural_setting_document(self):
        content = """主人公
東郷冴一（ごいち）
筋肉質な体格。178cm。
暗殺組織『女王蜂』に拾われた孤児である。

ヒロイン
夜眞あずら
毒舌家で、黒を基調とした格好をする。

■大体のプロット
事件が始まる。

●ハイブ
冴一を訓練した親代わりの存在。
"""
        facts = extract_profile_candidates(content)
        names = {fact.subject for fact in facts if fact.predicate == "name"}
        self.assertEqual(names, {"東郷冴一（ごいち）", "夜眞あずら", "ハイブ"})
        profile = next(fact.value for fact in facts if fact.subject == "東郷冴一（ごいち）" and fact.predicate == "profile")
        self.assertIn("178cm", profile)
        self.assertNotIn("大体のプロット", names)

    def test_extracts_marked_character_card(self):
        facts = extract_profile_candidates("■荻堂酉馬\n\n主人公１。\nくたびれた黒コートを着ている。\n\n●宇佐見嘉壽夫\n生活安全部に所属していた。\n")
        names = {fact.subject for fact in facts if fact.predicate == "name"}
        self.assertEqual(names, {"荻堂酉馬", "宇佐見嘉壽夫"})

    def test_extracts_role_organization_and_inline_definition_without_plot_bullets(self):
        content = """■タイトル未定新案

主人公
ナイナス・オーク
35歳。結婚詐欺師として活躍中。

ライバル
ハーバート・ディスファレト
暴君にして新興宗教の指導者。

キーパーソン
オニキス・マクレーン
民主化運動の第一人者。

自由公正選挙監視委員会『ユスティティア』

民間のNGO団体。各国の自由選挙を監視する。

ジュネバル派―― 王家。教義に絶対的な神への愛を誓う。

■追加案
・突然のジョン・コスナーからの呼び出し。
・道中思い出す過去の事件
"""
        facts = extract_profile_candidates(content)
        names = {fact.subject for fact in facts if fact.predicate == "name"}
        self.assertEqual(names, {
            "ナイナス・オーク", "ハーバート・ディスファレト", "オニキス・マクレーン",
            "自由公正選挙監視委員会『ユスティティア』", "ジュネバル派",
        })
        self.assertNotIn("タイトル未定新案", names)
        self.assertNotIn("追加案", names)
        nainas = next(fact.value for fact in facts if fact.subject == "ナイナス・オーク" and fact.predicate == "profile")
        self.assertIn("35歳", nainas)
        justitia = next(fact.value for fact in facts if fact.subject == "自由公正選挙監視委員会『ユスティティア』" and fact.predicate == "profile")
        self.assertNotIn("突然のジョン", justitia)

    def test_extracts_marked_japanese_name_and_reading(self):
        content = """■賀上硝子　かがみがらす

「自分を生きる」少女

非常に体が弱いが、今を生きようと必死に動く。

■新倉明太　にくらあくた

「他人になる」少年

整形ニクと言われる少年。

■芝辻凌空　しばつじりく
"""
        facts = extract_profile_candidates(content)
        names = {fact.subject for fact in facts if fact.predicate == "name"}
        self.assertEqual(names, {"賀上硝子", "新倉明太", "芝辻凌空"})
        readings = {(fact.subject, fact.value) for fact in facts if fact.predicate == "reading"}
        self.assertIn(("賀上硝子", "かがみがらす"), readings)
        self.assertIn(("芝辻凌空", "しばつじりく"), readings)
        profile = next(fact.value for fact in facts if fact.subject == "賀上硝子" and fact.predicate == "profile")
        self.assertIn("非常に体が弱い", profile)

    def test_natural_profile_document_can_feed_ledger_while_unclassified(self):
        self.write(
            "原稿/昔のノート.txt",
            """■賀上硝子　かがみがらす
非常に体が弱い少女。

■新倉明太　にくらあくた
両親を幼い頃に亡くした少年。
""",
        )
        self.store.index_roots([self.root])
        item = next(item for item in self.store.list_files() if item["file"] == "昔のノート.txt")
        self.assertEqual(item["doc_type"], "OTHER")
        subjects = {fact["subject"] for fact in self.store.facts_under_root(self.root)}
        self.assertEqual(subjects, {"賀上硝子", "新倉明太"})

    def test_instruction_headings_are_not_profile_candidates(self):
        content = """■ 原作キャラクターの扱い

人数制限
- モードA：主軸作品は制限なし。参戦作品は運用ルールに従う

分量の目安
- 中ボス戦：3～5ページ。攻防の描写を丁寧に
- ボス戦・因縁の対決：5～10ページ。

(本作の独自シーン：原作再現エピソードとの交錯)
"""
        self.assertEqual(extract_profile_candidates(content), [])

    def test_scene_and_structure_headings_are_not_ledger_subjects(self):
        content = """●ドラマ核（最重要ポイント）
物語のテーマと勝敗の流れを整理する。

■ 場面の流れ
主人公が廊下を歩き、敵と遭遇する。

■中国
多国籍企業と国家インフラの状況を説明する。

⑥ N-CCC 初代長官（就任からまだ数ヶ月）
組織の権限と職員の配置を説明する。

◆ OIG特別捜査官（米国の医療犯罪の最終兵器）
アムニス社を監督する権限を持つ人物。
"""
        self.assertEqual(extract_profile_candidates(content), [])

    def test_setting_reference_candidates_are_separate_and_classified(self):
        self.write("設定/世界.txt", """■ノルヴィア州
北方にある寒冷地。

■銀河統一連盟
複数の星を束ねる組織。

■フォエーナの実
高山で栽培される特殊な植物。

■ドラマ核
物語上の最重要ポイント。
""")
        self.store.index_roots([self.root])
        facts = self.store.facts_under_root(self.root)
        candidates = {fact["subject"]: fact for fact in facts}
        self.assertEqual(candidates["ノルヴィア州"]["entity_kind"], "LOCATION")
        self.assertEqual(candidates["銀河統一連盟"]["entity_kind"], "ORGANIZATION")
        self.assertNotIn("ドラマ核", candidates)
        target = candidates["フォエーナの実"]
        self.assertTrue(self.store.update_fact_kind(target["id"], "ITEM"))
        updated = next(f for f in self.store.facts_under_root(self.root) if f["id"] == target["id"])
        self.assertEqual(updated["entity_kind"], "ITEM")

    def test_ledger_collapses_identical_candidates_from_duplicate_files(self):
        text = "人物: アリス\n瞳: 青\n"
        first = self.write("設定/alice.txt", text)
        second = self.write("設定/alice_copy.txt", text)
        self.store.index_roots([self.root])
        ledger = self.store.ledger_under_root(self.root)
        eye = next(fact for fact in ledger["facts"] if fact["predicate"] == "eye_color")
        self.assertEqual(eye["duplicate_count"], 2)
        self.assertEqual({source["file_path"] for source in eye["sources"]}, {first, second})

    def test_ledger_can_be_scoped_to_selected_work_inside_parent_root(self):
        first = self.write("設定/alice.txt", "人物: アリス\n瞳: 青\n")
        second_root = os.path.join(self.root, "別作品")
        os.makedirs(os.path.join(second_root, "設定"))
        second = os.path.join(second_root, "設定", "bob.txt")
        with open(second, "w", encoding="utf-8") as stream:
            stream.write("人物: ボブ\n瞳: 茶\n")
        self.store.index_roots([self.root])
        with self.store.connect() as db:
            db.execute("UPDATE files SET work_title='作品A' WHERE path=?", (first,))
            db.execute("UPDATE files SET work_title='別作品' WHERE path=?", (second,))
        ledger = self.store.ledger_under_root(self.root, "作品A")
        self.assertEqual({group["subject"] for group in ledger["subjects"]}, {"アリス"})

    def test_existing_wrong_classification_and_ledger_are_migrated_on_start(self):
        manuscript = self.write("原稿/画像指示.txt", "人物: 巨漢\n状態: 戦闘中\n")
        self.store.index_roots([self.root])
        with self.store.connect() as db:
            db.execute("UPDATE files SET doc_type='MANUSCRIPT' WHERE path=?", (manuscript,))
            db.execute(
                """INSERT INTO facts(file_path,project,subject,predicate,value,line)
                   VALUES(?,?,?,?,?,?)""",
                (manuscript, "作品A", "巨漢", "status", "戦闘中", 2),
            )
            db.execute("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('fact_extractor_version','4')")
        migrated = DeterministicStore(self.store.db_path)
        item = next(item for item in migrated.list_files() if item["full_path"] == manuscript)
        self.assertEqual(item["doc_type"], "OTHER")
        self.assertEqual(migrated.facts_under_root(self.root), [])

    def test_incremental_index_search_and_delete(self):
        setting = self.write("設定/alice.md", "人物: アリス\n瞳: 青\n武器: 月光剣\n")
        self.write("原稿/第一章.txt", "アリスは月光剣を抜いた。")
        first = self.store.index_roots([self.root])
        self.assertEqual(first["updated"], 2)
        second = self.store.index_roots([self.root])
        self.assertEqual(second["unchanged"], 2)
        results = self.store.search("月光剣")
        self.assertEqual(len(results), 2)
        facts = self.store.facts_for_project("作品A")
        self.assertTrue(any(f["predicate"] == "weapon" for f in facts))
        os.unlink(setting)
        final = self.store.index_roots([self.root])
        self.assertEqual(final["deleted"], 1)

    def test_two_character_japanese_query_falls_back_from_trigram_fts(self):
        self.write("原稿/札幌.txt", "雪の札幌で少女は学校へ向かった。")
        self.store.index_roots([self.root])
        results = self.store.search("札幌")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["line"], 1)

    def test_space_separated_terms_must_all_exist_in_same_file(self):
        self.write("原稿/場面.txt", "雪の札幌で少女は学校へ向かった。")
        self.write("設定/都市.txt", "札幌は北方の都市である。")
        self.store.index_roots([self.root])
        results = self.store.search("札幌 少女 学校")
        self.assertEqual([result["file"] for result in results], ["場面.txt"])

    def test_lightweight_index_does_not_store_plaintext_or_chunks(self):
        manuscript = "原本にだけ存在すべき秘密の本文。" * 100
        self.write("原稿/本文.txt", manuscript)
        self.store.index_roots([self.root])
        with sqlite3.connect(self.store.db_path) as db:
            file_columns = {row[1] for row in db.execute("PRAGMA table_info(files)")}
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            stored = db.execute("SELECT sql FROM sqlite_master WHERE name='file_fts'").fetchone()[0]
        self.assertNotIn("content", file_columns)
        self.assertNotIn("chunks", tables)
        self.assertIn("content=''", stored.replace(' ', ''))
        self.assertEqual(len(self.store.search("秘密の本文")), 1)

    def test_legacy_fulltext_database_is_backed_up_before_rebuild(self):
        legacy_path = os.path.join(self.temp.name, "legacy.sqlite3")
        with sqlite3.connect(legacy_path) as db:
            db.execute(
                """CREATE TABLE files(
                   path TEXT PRIMARY KEY,name TEXT,project TEXT,doc_type TEXT,content_hash TEXT,
                   mtime_ns INTEGER,size INTEGER,content TEXT,tags TEXT,indexed_at TEXT
                )"""
            )
            db.execute(
                "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
                ("/tmp/old.txt", "old.txt", "旧作", "MANUSCRIPT", "hash", 0, 6, "旧本文", "[]"),
            )
        migrated = DeterministicStore(legacy_path)
        self.assertTrue(os.path.isfile(legacy_path + ".legacy-fulltext.bak"))
        with migrated.connect() as db:
            columns = {row[1] for row in db.execute("PRAGMA table_info(files)")}
            version = db.execute("SELECT value FROM schema_meta WHERE key='schema_version'").fetchone()[0]
        self.assertNotIn("content", columns)
        self.assertEqual(version, "4")

    def test_ledger_decision_survives_source_line_changes(self):
        setting = self.write("設定/alice.md", "人物: アリス\n瞳: 青\n")
        self.store.index_roots([self.root])
        eye = next(fact for fact in self.store.facts_under_root(self.root) if fact["predicate"] == "eye_color")
        self.assertTrue(self.store.update_fact_decision(eye["id"], "PROVISIONAL", "色調は再検討"))
        with open(setting, "w", encoding="utf-8") as stream:
            stream.write("# 設定\n人物: アリス\n瞳: 青\n")
        self.store.index_roots([self.root])
        updated = next(fact for fact in self.store.facts_under_root(self.root) if fact["predicate"] == "eye_color")
        self.assertEqual(updated["decision_status"], "PROVISIONAL")
        self.assertEqual(updated["decision_note"], "色調は再検討")
        self.assertEqual(updated["line"], 3)

    def test_only_confirmed_facts_feed_story_state(self):
        self.write("設定/alice.md", "人物: アリス\n瞳: 青\n武器: 月光剣\n")
        self.store.index_roots([self.root])
        facts = self.store.facts_for_project("作品A")
        eye = next(fact for fact in facts if fact["predicate"] == "eye_color")
        self.store.update_fact_decision(eye["id"], "CONFIRMED")
        states = self.store.story_states("作品A")
        self.assertEqual(states["characters"]["アリス"]["attributes"], {"eye_color": "青"})

    def test_manifest_defines_current_segments_and_unreferenced_files(self):
        nexus = os.path.join(self.root, "作品A.nexus")
        os.makedirs(nexus)
        current = os.path.join(nexus, "01_第一章.txt")
        extra = os.path.join(nexus, "統合版.txt")
        with open(current, "w", encoding="utf-8") as stream:
            stream.write("斉藤は山田市へ戻った。")
        with open(extra, "w", encoding="utf-8") as stream:
            stream.write("構成外の統合本文。")
        with open(os.path.join(nexus, "manifest.json"), "w", encoding="utf-8") as stream:
            json.dump(
                {"version": 1, "title": "作品A", "segments": [
                    {"id": "seg-1", "file": "01_第一章.txt", "displayName": "第一章"}
                ]}, stream, ensure_ascii=False,
            )
        stats = self.store.index_roots([self.root])
        self.assertEqual(stats["current_segments"], 1)
        self.assertEqual(stats["unreferenced"], 1)
        items = {item["file"]: item for item in self.store.list_files()}
        self.assertEqual(items["01_第一章.txt"]["version_role"], "CURRENT_SEGMENT")
        self.assertEqual(items["01_第一章.txt"]["segment_order"], 0)
        self.assertEqual(items["統合版.txt"]["version_role"], "UNREFERENCED")

    def test_archive_marker_and_exact_duplicate_results_are_grouped(self):
        text = "イヴォルバーは山田市で起動した。"
        self.write("原稿/本文.txt", text)
        archived_dir = os.path.join(self.root, "旧稿")
        os.makedirs(archived_dir)
        with open(os.path.join(archived_dir, "本文_backup.txt"), "w", encoding="utf-8") as stream:
            stream.write(text)
        stats = self.store.index_roots([self.root])
        self.assertEqual(stats["archived"], 1)
        self.assertEqual(stats["exact_duplicate_groups"], 1)
        results = self.store.search("イヴォルバー")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["exact_duplicate_count"], 2)

    def test_same_filename_does_not_collide(self):
        other = os.path.join(self.temp.name, "作品B")
        os.makedirs(other)
        self.write("原稿/本文.txt", "青い月が昇る。")
        with open(os.path.join(other, "本文.txt"), "w", encoding="utf-8") as stream:
            stream.write("赤い月が昇る。")
        self.store.index_roots([self.root, other])
        self.assertEqual(len(self.store.search("月が昇る")), 2)
        self.assertEqual(len(self.store.search("月が昇る", root=self.root)), 1)

    def test_search_can_be_limited_to_multiple_registered_roots(self):
        other = os.path.join(self.temp.name, "原稿倉庫")
        excluded = os.path.join(self.temp.name, "OneDrive")
        os.makedirs(other)
        os.makedirs(excluded)
        self.write("原稿/現在.txt", "穴水の現在設定。")
        with open(os.path.join(other, "旧設定.md"), "w", encoding="utf-8") as stream:
            stream.write("穴水の旧設定。")
        with open(os.path.join(excluded, "除外.txt"), "w", encoding="utf-8") as stream:
            stream.write("穴水の別コピー。")
        self.store.index_roots([self.root, other, excluded])
        results = self.store.search("穴水", roots=[self.root, other])
        self.assertEqual({result["file"] for result in results}, {"現在.txt", "旧設定.md"})

    def test_search_work_filter_accepts_displayed_work_title(self):
        target = self.write("原稿/作品名検索.txt", "エリクの設定。")
        self.store.index_roots([self.root])
        with self.store.connect() as db:
            db.execute("UPDATE files SET work_title=? WHERE path=?", ("表示用作品名", target))
        self.assertEqual(len(self.store.search("エリク", project="表示用作品名")), 1)

    def test_excluded_folder_is_not_indexed_and_existing_rows_are_removed(self):
        keep = self.write("設定/keep.txt", "残す資料")
        ignored_dir = os.path.join(self.root, "設定", "除外")
        os.makedirs(ignored_dir)
        ignored = os.path.join(ignored_dir, "ignore.txt")
        with open(ignored, "w", encoding="utf-8") as stream:
            stream.write("見ない資料")
        self.store.index_roots([self.root])
        self.assertEqual({item["full_path"] for item in self.store.list_files()}, {keep, ignored})
        self.store.index_roots([self.root], [ignored_dir])
        self.assertEqual({item["full_path"] for item in self.store.list_files()}, {keep})

    def test_short_text_does_not_trigger_kanji_ratio_judgement(self):
        results = Proofreader().proofread("することができる。", mode="proof")
        self.assertFalse(any(result["original"] == "全体" for result in results))

    def test_memory_pack_separates_confirmed_facts_and_does_not_copy_manuscript(self):
        self.write("設定/alice.md", "人物: アリス\n瞳: 青\n武器: 月光剣\n")
        self.write("原稿/第一章.txt", "これは記憶パックへ複製してはいけない本文です。")
        self.store.index_roots([self.root])
        facts = self.store.facts_for_project("作品A")
        eye = next(fact for fact in facts if fact["predicate"] == "eye_color")
        self.assertTrue(self.store.confirm_fact(eye["id"], True))

        markdown = render_memory_pack(
            "作品A", self.store.facts_for_project("作品A"), self.store.files_for_project("作品A"), self.root
        )
        self.assertIn("**アリス / eye_color**: 青", markdown)
        self.assertIn("アリス / weapon: 月光剣", markdown)
        self.assertIn("未確認", markdown)
        self.assertNotIn("これは記憶パックへ複製してはいけない本文です", markdown)

        written = write_memory_pack(
            os.path.join(self.temp.name, "Drive"), "作品A", markdown, {"schema": "nexus.ai-memory.v1"}
        )
        self.assertTrue(os.path.isfile(written["markdown_path"]))
        self.assertTrue(os.path.isfile(written["metadata_path"]))


if __name__ == "__main__":
    unittest.main()
