import unittest

from deterministic_store import classify_document


class DocumentClassificationTests(unittest.TestCase):
    def test_distant_library_root_does_not_force_manuscript(self):
        path = "/library/原稿/2025/work/設定/ciphercell/復号マッピング.md"
        self.assertEqual(classify_document(path), "SETTING")

    def test_ambiguous_markdown_remains_other(self):
        self.assertEqual(classify_document("/library/原稿/old/作者にも不明.md"), "OTHER")

    def test_manifest_segment_is_manuscript(self):
        identity = {"version_role": "CURRENT_SEGMENT"}
        self.assertEqual(classify_document("/work/chapter.md", identity), "MANUSCRIPT")

    def test_plot_name_wins_without_ai(self):
        self.assertEqual(classify_document("/work/AI版原稿/3章以降プロット.md"), "PLOT")

    def test_explicit_manuscript_folder(self):
        self.assertEqual(classify_document("/work/manuscripts/第一章.md"), "MANUSCRIPT")

    def test_joplin_export_folder_is_setting_but_same_named_work_is_manuscript(self):
        base = "/work/Ciphered Forsaken – 噛み砕く夜/joplin版MD文書"
        self.assertEqual(classify_document(base + "/◤篠田雅紀◢.md"), "SETTING")
        self.assertEqual(classify_document(base + "/Ciphered Forsaken – 噛み砕く夜.md"), "MANUSCRIPT")


if __name__ == "__main__":
    unittest.main()
