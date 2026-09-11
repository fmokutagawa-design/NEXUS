"""NEXUS作品資料から、外部AIでも読める軽量な記憶パックを生成する。"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path


def _display_source(path: str, root: str | None) -> str:
    if root:
        try:
            return os.path.relpath(path, root)
        except ValueError:
            pass
    return os.path.basename(path)


def render_memory_pack(project: str, facts: list[dict], files: list[dict], root: str | None = None) -> str:
    """確定情報と出典目録だけをMarkdown化する。本文そのものは複製しない。"""
    status_groups = {}
    for fact in facts:
        status_groups.setdefault(fact.get("decision_status", "UNREVIEWED"), []).append(fact)
    confirmed = status_groups.get("CONFIRMED", [])
    candidates = status_groups.get("UNREVIEWED", [])
    lines = [
        f"# {project} — NEXUS AI記憶パック",
        "",
        "> NEXUSが生成した外部AI参照用資料です。原稿本文のコピーではありません。",
        "> 『確認済み』だけを確定設定として扱い、『要確認』から推測で設定を補わないでください。",
        "",
        "## AIへの指示",
        "",
        "- 回答には、可能な限り下記の出典ファイル名と行番号を示してください。",
        "- 資料にない内容は『資料内では確認できない』と答えてください。",
        "- 要確認情報を確定設定として扱わないでください。",
        "",
        "## 確認済み設定",
        "",
    ]
    if not confirmed:
        lines.append("現在、筆者が確認済みにした設定はありません。")
    else:
        for fact in confirmed:
            source = _display_source(fact["file_path"], root)
            lines.append(
                f"- **{fact['subject']} / {fact['predicate']}**: {fact['value']} "
                f"（出典: `{source}` L{fact['line']}）"
            )

    labels = {
        "PROVISIONAL": "仮決定", "CONSIDERING": "検討中", "CONFLICT": "矛盾あり",
        "REJECTED": "却下", "RETIRED": "廃止",
    }
    for status, label in labels.items():
        grouped = status_groups.get(status, [])
        lines.extend(["", f"## {label}", ""])
        if not grouped:
            lines.append("該当項目はありません。")
        for fact in grouped:
            source = _display_source(fact["file_path"], root)
            note = f"、注記: {fact['decision_note']}" if fact.get("decision_note") else ""
            lines.append(
                f"- {fact['subject']} / {fact['predicate']}: {fact['value']} "
                f"（出典: `{source}` L{fact['line']}{note}）"
            )

    lines.extend(["", "## 要確認の抽出候補", ""])
    if not candidates:
        lines.append("候補はありません。")
    else:
        for fact in candidates:
            source = _display_source(fact["file_path"], root)
            lines.append(
                f"- {fact['subject']} / {fact['predicate']}: {fact['value']} "
                f"（出典: `{source}` L{fact['line']}、未確認）"
            )

    lines.extend(["", "## 原本目録", ""])
    for item in sorted(files, key=lambda entry: (entry.get("doc_type", ""), entry.get("path", ""))):
        source = _display_source(item["path"], root)
        lines.append(
            f"- `{source}` — {item.get('doc_type', 'OTHER')} / {item.get('version_role', 'STANDALONE')} / "
            f"{item.get('size', 0):,} bytes / SHA-256 `{item.get('content_hash', '')}`"
        )
    lines.extend(
        [
            "",
            "## 更新情報",
            "",
            f"- 生成日時: {datetime.now(timezone.utc).isoformat()}",
            f"- 確認済み設定: {len(confirmed)}件",
            f"- 要確認候補: {len(candidates)}件",
            f"- 原本: {len(files)}件",
            "",
        ]
    )
    return "\n".join(lines)


def write_memory_pack(output_dir: str, project: str, markdown: str, metadata: dict) -> dict:
    """Drive同期フォルダを含む任意の保存先へ、可搬な2ファイルを書き出す。"""
    target = Path(output_dir).expanduser().resolve() / project
    target.mkdir(parents=True, exist_ok=True)
    markdown_path = target / "NEXUS_AI_MEMORY.md"
    metadata_path = target / "NEXUS_AI_MEMORY.json"
    markdown_path.write_text(markdown, encoding="utf-8")
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"directory": str(target), "markdown_path": str(markdown_path), "metadata_path": str(metadata_path)}
