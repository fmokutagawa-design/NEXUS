import os
import json
import time
import re
from proofreader import Proofreader
from deterministic_store import DeterministicStore

class AuditBatchProcessor:
    """
    全原稿を一括で監査し、宿題リストを作成する
    """
    def __init__(self, target_dirs=None):
        self.pr = Proofreader()
        self.store = DeterministicStore()
        from config_loader import get_manuscript_dirs
        self.target_dirs = target_dirs or get_manuscript_dirs()
        self.report_path = os.path.join(os.path.dirname(__file__), "homework_list.json")

    def _extract_chapter_number(self, filename):
        """
        ファイル名から章番号（整数）を抽出する
        例: "第05章_遭遇.txt" -> 5
        例: "chapter_12.md" -> 12
        """
        match = re.search(r'(?:第|chapter_?)(\d+)', filename, re.IGNORECASE)
        if match:
            return int(match.group(1))
        # 数字のみのパターンも試行
        m = re.search(r'(\d+)', filename)
        if m:
            return int(m.group(1))
        return None

    def run_full_audit(self):
        print("🚀 【校正監査モード】大規模監査を開始します...")
        
        index_stats = self.store.index_roots(self.target_dirs)
        print(f"📚 差分索引: 更新 {index_stats['updated']} / 変更なし {index_stats['unchanged']}")
        
        homework_list = []
        start_time = time.time()
        file_count = 0

        # 登録済みSQLiteを唯一の対象一覧として使う。設定パスがOS間で異なっても動作する。
        indexed_files = [item for item in self.store.list_files() if item["doc_type"] == "MANUSCRIPT"]
        for item in indexed_files:
            file = item["file"]
            file_path = item["full_path"]
            project_id = item["project"]
            print(f"🔍 監査中 [{project_id}]: {file}")
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as stream:
                    content = stream.read()
                chapter_num = self._extract_chapter_number(file)
                file_states = self.store.story_states(project_id=project_id)
                results = self.pr.proofread(
                    content,
                    mode="all",
                    materials_context=file_states,
                    chapter_number=chapter_num,
                )
                for result in results:
                    homework_list.append({
                        "file": file,
                        "full_path": file_path,
                        "project": project_id,
                        "original": result["original"],
                        "suggested": result["suggested"],
                        "reason": result["reason"],
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    })
                file_count += 1
            except Exception as error:
                print(f"❌ エラー ({file}): {error}")

        # 3. 結果の保存
        with open(self.report_path, "w", encoding="utf-8") as f:
            json.dump(homework_list, f, ensure_ascii=False, indent=2)

        elapsed = time.time() - start_time
        print(f"🎉 監査完了！ {file_count} ファイルを精査しました。")
        print(f"⏱ 処理時間: {elapsed:.1f} 秒")

if __name__ == "__main__":
    processor = AuditBatchProcessor()
    processor.run_full_audit()
