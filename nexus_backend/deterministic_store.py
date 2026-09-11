"""AI に依存しない NEXUS のローカル索引・検索・設定監査基盤。"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TEXT_SUFFIXES = {".txt", ".md"}
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200
DECISION_STATUSES = {
    "UNREVIEWED", "CONFIRMED", "PROVISIONAL", "CONSIDERING",
    "REJECTED", "RETIRED", "CONFLICT",
}
ENTITY_KINDS = {"PERSON", "LOCATION", "ORGANIZATION", "TERM", "ITEM", "EVENT", "UNKNOWN", "IGNORE"}

FACT_LABELS = {
    "別名": "alias",
    "異名": "alias",
    "瞳": "eye_color",
    "目": "eye_color",
    "眼": "eye_color",
    "髪": "hair",
    "髪色": "hair",
    "出身": "origin",
    "故郷": "origin",
    "武器": "weapon",
    "装備": "weapon",
    "所属": "affiliation",
    "状態": "status",
    "生死": "status",
    "死亡章": "death_chapter",
    "登場章": "first_chapter",
}

ROLE_HEADINGS = {
    "主人公", "主役", "ヒロイン", "ヒーロー", "ライバル", "キーパーソン",
    "敵", "敵役", "悪役", "黒幕", "脇役", "サブキャラ", "主要人物",
    "登場人物", "キャラクター", "キャラクタ", "人物",
}
GENERIC_HEADINGS = {
    "設定", "設定資料", "キャラクター設定", "キャラクタ設定", "人物設定",
    "プロット", "大体のプロット", "あらすじ", "梗概", "世界観", "用語",
    "キャラクター", "キャラクタ", "登場人物", "主人公", "ヒロイン",
}

ARCHIVE_MARKERS_JA = ("旧稿", "旧版", "改稿前", "バックアップ", "廃版", "没稿")
ARCHIVE_MARKERS_EN = {"backup", "archive", "archived", "old"}


def has_archive_marker(path: str) -> bool:
    """`folders`内の`old`など、パス全体の部分一致による誤判定を避ける。"""
    for part in Path(path).parts:
        lowered = part.lower()
        if any(marker in lowered for marker in ARCHIVE_MARKERS_JA):
            return True
        tokens = set(re.findall(r"[a-z]+", lowered))
        if tokens & ARCHIVE_MARKERS_EN:
            return True
    return False


def path_identity_key(path: str) -> str:
    return unicodedata.normalize("NFC", os.path.normcase(os.path.abspath(path)))


def discover_manifests(roots: Iterable[str]) -> tuple[dict[str, dict], list[dict]]:
    """manifest.jsonを正として、現在の論理作品を構成する章を特定する。"""
    segments: dict[str, dict] = {}
    errors: list[dict] = []
    for root in roots:
        for directory, names, files in os.walk(root):
            names[:] = [name for name in names if not name.startswith(".") and name not in {"node_modules", "release", ".git"}]
            if "manifest.json" not in files or not directory.endswith(".nexus"):
                continue
            manifest_path = os.path.join(directory, "manifest.json")
            try:
                manifest = json.loads(safe_read(manifest_path))
                if manifest.get("version") != 1 or not isinstance(manifest.get("segments"), list):
                    raise ValueError("unsupported or invalid manifest")
                title = str(manifest.get("title") or Path(directory).stem).strip()
                seen: set[str] = set()
                for order, segment in enumerate(manifest["segments"]):
                    filename = segment.get("file") if isinstance(segment, dict) else None
                    if not isinstance(filename, str) or not filename or os.path.basename(filename) != filename:
                        raise ValueError(f"invalid segment path: {filename!r}")
                    if filename in seen:
                        raise ValueError(f"duplicate segment: {filename}")
                    seen.add(filename)
                    normalized_name = unicodedata.normalize("NFC", filename)
                    direct_names = {unicodedata.normalize("NFC", name): name for name in files}
                    direct = os.path.abspath(os.path.join(directory, direct_names.get(normalized_name, filename)))
                    nested_directory = os.path.join(directory, "segments")
                    nested_names = {}
                    if os.path.isdir(nested_directory):
                        nested_names = {
                            unicodedata.normalize("NFC", name): name for name in os.listdir(nested_directory)
                        }
                    nested = os.path.abspath(os.path.join(nested_directory, nested_names.get(normalized_name, filename)))
                    actual = direct if os.path.isfile(direct) else nested
                    segments[path_identity_key(actual)] = {
                        "work_id": os.path.abspath(directory),
                        "work_title": title,
                        "version_role": "CURRENT_SEGMENT",
                        "manifest_path": os.path.abspath(manifest_path),
                        "segment_order": order,
                    }
                    if not os.path.isfile(actual):
                        errors.append({"path": actual, "error": "manifest segment is missing"})
            except Exception as error:
                errors.append({"path": manifest_path, "error": str(error)})
    return segments, errors


def identity_for_path(path: str, roots: Iterable[str], manifest_segments: dict[str, dict]) -> dict:
    absolute = os.path.abspath(path)
    identity_key = path_identity_key(absolute)
    if identity_key in manifest_segments:
        return manifest_segments[identity_key]
    nexus_parent = next((parent for parent in Path(absolute).parents if parent.name.endswith(".nexus")), None)
    if nexus_parent:
        archived = has_archive_marker(absolute) or "_original_" in nexus_parent.name.lower() or "_original_" in Path(absolute).name.lower()
        return {
            "work_id": str(nexus_parent),
            "work_title": nexus_parent.name[:-6],
            "version_role": "ARCHIVE" if archived else "UNREFERENCED",
            "manifest_path": str(nexus_parent / "manifest.json"),
            "segment_order": None,
        }
    archived = has_archive_marker(absolute)
    project = project_for_path(absolute, roots)
    return {
        "work_id": os.path.abspath(os.path.dirname(absolute)),
        "work_title": project,
        "version_role": "ARCHIVE" if archived else "STANDALONE",
        "manifest_path": None,
        "segment_order": None,
    }


def safe_read(path: str) -> str:
    for encoding in ("utf-8", "cp932", "shift_jis", "euc_jp"):
        try:
            return Path(path).read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return Path(path).read_text(encoding="utf-8", errors="replace")


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def classify_document(path: str, identity: dict | None = None) -> str:
    """Conservatively classify a document without trusting distant ancestors.

    A library root named ``原稿`` must not turn every setting file below it into
    a manuscript.  Unknown old files intentionally remain OTHER.
    """
    if identity and identity.get("version_role") == "CURRENT_SEGMENT":
        return "MANUSCRIPT"

    source = Path(path)
    name = source.name.lower()
    nearby_parts = [part.lower() for part in source.parts[-5:-1]]
    in_joplin_settings = "joplin版md文書" in nearby_parts

    # Joplin書き出し群の直下にある、作品名と同名のファイルだけは本文。
    if in_joplin_settings and len(source.parents) >= 2:
        if unicodedata.normalize("NFC", source.stem) == unicodedata.normalize("NFC", source.parent.parent.name):
            return "MANUSCRIPT"

    setting_folders = {"設定", "設定資料", "資料", "materials", "settings", "setting", "world", "characters", "人物", "用語"}
    plot_folders = {"プロット", "plots", "plot", "構成", "outline", "storyboard"}
    manuscript_folders = {"manuscripts", "manuscript", "本文", "本編", "ai版原稿", "現行原稿"}

    if in_joplin_settings or any(part in setting_folders for part in nearby_parts):
        return "SETTING"
    if any(part in plot_folders for part in nearby_parts):
        return "PLOT"
    if any(word in name for word in ("プロット", "plot", "あらすじ", "梗概", "章構成", "全体構成", "展開案")):
        return "PLOT"
    if any(word in name for word in ("設定", "用語", "キャラ", "人物", "世界観", "年表", "時系列", "資料")):
        return "SETTING"
    if any(part in manuscript_folders for part in nearby_parts):
        return "MANUSCRIPT"
    if any(word in name for word in ("本文", "本原稿", "完成稿", "初稿", "草稿", "改稿版", "清書")):
        return "MANUSCRIPT"
    return "OTHER"


def project_for_path(path: str, roots: Iterable[str]) -> str:
    absolute = os.path.abspath(path)
    for root in sorted((os.path.abspath(p) for p in roots), key=len, reverse=True):
        try:
            relative = os.path.relpath(absolute, root)
        except ValueError:
            continue
        if relative == os.pardir or relative.startswith(os.pardir + os.sep):
            continue
        parts = Path(relative).parts
        category_names = {"設定", "資料", "原稿", "本編", "プロット", "plot", "setting", "manuscript"}
        if len(parts) > 1 and parts[0].lower() not in category_names:
            return parts[0]
        return Path(root).name or "Unknown"
    return "Unknown"


def iter_chunks(content: str):
    if not content:
        return
    start = 0
    index = 0
    while start < len(content):
        end = min(len(content), start + CHUNK_SIZE)
        if end < len(content):
            newline = content.rfind("\n", start + CHUNK_SIZE // 2, end)
            if newline > start:
                end = newline + 1
        line = content.count("\n", 0, start) + 1
        yield index, start, line, content[start:end]
        if end >= len(content):
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
        index += 1


@dataclass(frozen=True)
class Fact:
    subject: str
    predicate: str
    value: str
    line: int


def extract_facts(content: str) -> list[Fact]:
    """明示的な「人物:」「瞳:」等だけを候補として抽出する。"""
    facts: list[Fact] = []
    current_subject = ""
    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip().lstrip("#■◆・- ")
        if not line:
            continue
        match = re.match(r"^([^：:]{1,20})[：:]\s*(.+?)\s*$", line)
        if not match:
            continue
        label, value = match.group(1).strip(), match.group(2).strip()
        if label in {"人物", "キャラクター", "名前", "氏名"}:
            current_subject = value
            facts.append(Fact(value, "name", value, line_number))
            continue
        predicate = FACT_LABELS.get(label)
        if predicate and current_subject:
            values = re.split(r"[、,／/]", value) if predicate == "alias" else [value]
            facts.extend(Fact(current_subject, predicate, item.strip(), line_number) for item in values if item.strip())
    return facts


def extract_profile_candidates(content: str) -> list[Fact]:
    """Extract candidate cards from ordinary human-written setting notes.

    This intentionally reads document structure, not prose semantics.  Marked
    headings (■/●/・), a name following a role heading, and a short standalone
    heading followed by prose are accepted.  Generic section headings are not.
    """
    raw_lines = content.splitlines()
    stripped = [line.strip() for line in raw_lines]

    def normalized_heading(value: str) -> str:
        return re.sub(r"[\s　]+", "", value).rstrip("：:")

    def looks_like_subject(value: str) -> bool:
        value = value.strip()
        if re.match(r"^[-–—*◆◇]\s*", value) or value.startswith(("(", "（")):
            return False
        value = value.strip("■●◆・ ")
        normalized = normalized_heading(value)
        if not value or len(value) > 48 or normalized in GENERIC_HEADINGS:
            return False
        if re.match(r"^(#{1,6}|\*|>|<|document\.|【|\[)", value, re.IGNORECASE):
            return False
        if re.search(
            r"(基本情報|外見|容姿|性格|口調|関係性|過去|現在|経歴|役割|到達点|消息|"
            r"セリフ|台詞|テーマ|構造|概要|一覧|制度|設定|メモ|和訳|挿入元|事件|"
            r"キャラの核|戦術|心理|文化|特徴|異名|背景|瞬間|特技|幼少期|位置づけ|"
            r"関与歴|発生件数|祈願回数|時代|タイトル|新案|モード|中盤|序盤|終盤|"
            r"独自シーン|配置|展開|分量|ページ|ボス戦|武器|ルール|運用|"
            r"ドラマ核|場面の流れ|成長|戦後の扱い|描写の優先事項|関連団体|"
            r"生育環境|習性|心の折れ方|最終的な追い込み|技術者)",
            normalized,
        ):
            return False
        if re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩㊀-㊿]", value):
            return False
        if re.fullmatch(r"(?:中国|日本|米国|英国|韓国|北朝鮮|ロシア|フランス|ドイツ|イタリア|インド)", normalized):
            return False
        if re.search(r"[。、！？!?「」：:]", value):
            return False
        if re.match(r"^(第.+[章部話]|[0-9０-９]+(?:歳|[\.．、]))", value):
            return False
        if re.search(r"(として|について|やること|[にはをで])$", normalized):
            return False
        return bool(re.search(r"[一-龯々ぁ-んァ-ヶA-Za-z]", value))

    def next_nonempty(index: int) -> tuple[int, str] | tuple[None, str]:
        for cursor in range(index + 1, len(stripped)):
            if stripped[cursor]:
                return cursor, stripped[cursor]
        return None, ""

    def has_entity_context(value: str) -> bool:
        return bool(re.search(
            r"(主人公|ヒロイン|人物|人間|男性|女性|少女|少年|老人|国籍|所属|組織|"
            r"孤児|暗殺|警官|刑事|教師|学生|歳|髪|瞳|性格|好き|部下|手下|仲間|友人|"
            r"親代わり|祖父|父|母|記者|店主|軍人|教官|組長|社長|リーダー|担任|所属|"
            r"NGO|王家|教義|民主化)",
            value,
        )) or bool(re.search(r"[一-龯ァ-ヶー]{2,12}人(?:[。、]|$)", value))

    def is_name_shaped(value: str) -> bool:
        return bool(re.fullmatch(r"[一-龯々ヶヵァ-ヶー・A-Za-z]{2,24}[\s　]+[ぁ-んァ-ヶー]{2,24}", value)) or bool(re.search(r"（[^）]*[ぁ-んァ-ヶ][^）]*）", value)) or bool(
            re.fullmatch(r"[ァ-ヶー・＝=A-Za-z\s]+", value)
        ) or bool(re.fullmatch(r"[一-龯々ぁ-ん]{2,12}", value)) or bool(re.search(
            r"(委員会|財団|協会|連盟|組織|団体|教団|宗教|会社|学園|王国|帝国|共和国|派)",
            value,
        ))

    def split_name_and_reading(value: str) -> tuple[str, str]:
        match = re.fullmatch(r"([一-龯々ヶヵァ-ヶー・A-Za-z]{2,24})[\s　]+([ぁ-んァ-ヶー]{2,24})", value.strip())
        return (match.group(1), match.group(2)) if match else (value.strip(), "")

    candidates: dict[int, tuple[str, int]] = {}
    inline_descriptions: dict[int, str] = {}
    candidate_readings: dict[int, str] = {}
    section_boundaries = {
        index for index, line in enumerate(stripped)
        if re.match(r"^[■◆◇]\s*\S", line) or normalized_heading(line) in GENERIC_HEADINGS
    }
    for index, line in enumerate(stripped):
        if not line:
            continue
        marked = re.match(r"^([■●◆・])\s*(.+?)\s*$", line)
        if marked and looks_like_subject(marked.group(2)):
            _, following = next_nonempty(index)
            explicit_reading = bool(re.fullmatch(r"[一-龯々ヶヵァ-ヶー・A-Za-z]{2,24}[\s　]+[ぁ-んァ-ヶー]{2,24}", marked.group(2)))
            # 記号付きであるだけの章題・場面名は人物名ではない。読みが明記
            # されているか、直後に明確な人物・組織説明がある場合だけ採る。
            if marked.group(1) != "◆" and is_name_shaped(marked.group(2)) and (explicit_reading or has_entity_context(following)):
                subject, reading = split_name_and_reading(marked.group(2))
                candidates[index] = (subject, index + 1)
                if reading:
                    candidate_readings[index] = reading
                continue
        if normalized_heading(line) in ROLE_HEADINGS:
            name_index, name = next_nonempty(index)
            if name_index is not None and looks_like_subject(name):
                candidates[name_index] = (name.strip(), name_index + 1)
            continue
        inline = re.match(r"^(.{2,32}?)[\s　]*(?:――|——|：|:)\s*(.{6,})$", line)
        inline_is_entity = bool(re.search(r"(委員会|財団|協会|連盟|組織|団体|教団|宗教|会社|学園|王国|帝国|共和国|派)", inline.group(1))) if inline else False
        if inline and inline_is_entity and looks_like_subject(inline.group(1)) and is_name_shaped(inline.group(1)):
            candidates[index] = (inline.group(1).strip(), index + 1)
            inline_descriptions[index] = inline.group(2).strip()
            continue
        previous_blank = index == 0 or not stripped[index - 1]
        next_index, following = next_nonempty(index)
        following_is_prose = bool(following) and not re.match(r"^[■●◆・]", following) and (
            len(following) >= 18 or bool(re.search(r"[。！？]$", following))
        )
        if previous_blank and following_is_prose and has_entity_context(following) and is_name_shaped(line) and looks_like_subject(line):
            candidates[index] = (line, index + 1)

    results: list[Fact] = []
    starts = sorted(candidates)
    for position, start in enumerate(starts):
        subject, line_number = candidates[start]
        end = starts[position + 1] if position + 1 < len(starts) else len(stripped)
        later_boundaries = [index for index in section_boundaries if start < index < end]
        if later_boundaries:
            end = min(later_boundaries)
        description_lines = [inline_descriptions[start]] if start in inline_descriptions else []
        for line in stripped[start + 1:end]:
            if not line:
                continue
            if normalized_heading(line) in ROLE_HEADINGS:
                continue
            description_lines.append(line)
        description = " ".join(description_lines).strip()
        results.append(Fact(subject, "name", subject, line_number))
        if start in candidate_readings:
            results.append(Fact(subject, "reading", candidate_readings[start], line_number))
        if description:
            results.append(Fact(subject, "profile", description[:600], line_number))
    return results


def extract_setting_facts(content: str) -> list[Fact]:
    profiles = extract_profile_candidates(content)
    known_subjects = {fact.subject for fact in profiles if fact.predicate == "name"}
    combined = [*extract_facts(content), *profiles, *extract_joplin_title_candidates(content, known_subjects), *extract_reference_candidates(content, known_subjects)]
    seen = set()
    result = []
    for fact in combined:
        key = (fact.subject, fact.predicate, fact.value)
        if key not in seen:
            seen.add(key)
            result.append(fact)
    return result


def extract_joplin_title_candidates(content: str, known_subjects: set[str] | None = None) -> list[Fact]:
    """Joplinのfrontmatter titleと装飾付きH1から人物・固有語を拾う。"""
    known_subjects = known_subjects or set()
    titles: list[tuple[str, int]] = []
    frontmatter = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if frontmatter:
        match = re.search(r"^title:\s*(.+?)\s*$", frontmatter.group(1), re.MULTILINE)
        if match:
            titles.append((match.group(1), content[:match.start()].count("\n") + 2))
    for line_number, line in enumerate(content.splitlines(), 1):
        match = re.match(r"^#\s+(.+?)\s*$", line.strip())
        if match:
            titles.append((match.group(1), line_number))

    results: list[Fact] = []
    seen: set[str] = set()
    for raw, line_number in titles:
        cleaned = raw.strip().strip("✅🟥■●◆◇◉◤◢【】《》 ")
        cleaned = re.sub(r"\s*(?:―|—|──|／|/)\s*.+$", "", cleaned).strip()
        reading_match = re.match(r"^([一-龯々ヶヵァ-ヶー・\s]{2,24})[（(]([ぁ-んァ-ヶー\s]{2,24})[）)]", cleaned)
        if reading_match:
            subject = re.sub(r"[\s　]+", "", reading_match.group(1)).strip()
            reading = re.sub(r"[\s　]+", "", reading_match.group(2)).strip()
            if subject not in known_subjects and subject not in seen:
                results.extend((Fact(subject, "name", subject, line_number), Fact(subject, "reading", reading, line_number)))
                seen.add(subject)
            continue
        subject = cleaned.strip()
        if not subject or subject in known_subjects or subject in seen or len(subject) > 40:
            continue
        kind = infer_entity_kind(subject, "candidate_term")
        proprietary = bool(re.fullmatch(r"[ァ-ヶー・＝=A-Za-z0-9\s]{4,40}", subject))
        if kind != "TERM" or proprietary:
            results.append(Fact(subject, "candidate_term", subject, line_number))
            seen.add(subject)
    return results


def infer_entity_kind(subject: str, predicate: str = "") -> str:
    value = subject.strip("■●◆◇・ 　")
    if re.search(r"(委員会|財団|協会|連盟|組織|団体|教団|宗教|会社|学園|王国|帝国|共和国|軍|省|庁|局|社|研究所|センター|タワー)$", value):
        return "ORGANIZATION"
    if re.search(r"(州|市|町|村|区|郡|県|国|山|川|海|島|駅|港|基地|惑星|星系)$", value) or value in {"中国", "日本", "米国", "英国", "韓国", "北朝鮮", "ロシア", "フランス", "ドイツ", "イタリア", "インド"}:
        return "LOCATION"
    if re.search(r"(剣|刀|銃|砲|艦|機|装置|薬|実|車|船|端末|システム)$", value):
        return "ITEM"
    if re.search(r"(事件|作戦|戦争|計画|会戦|事故|事変)$", value):
        return "EVENT"
    if predicate != "candidate_term":
        return "PERSON"
    return "TERM"


def extract_reference_candidates(content: str, known_subjects: set[str] | None = None) -> list[Fact]:
    """設定資料の明示見出しから、人物以外の固有語だけを候補箱へ送る。"""
    known_subjects = known_subjects or set()
    results: list[Fact] = []
    generic = {re.sub(r"[\s　]+", "", item) for item in GENERIC_HEADINGS}
    for line_number, raw in enumerate(content.splitlines(), 1):
        match = re.match(r"^[■●・]\s*(.{2,40}?)\s*$", raw.strip())
        if not match:
            continue
        subject = match.group(1).strip().rstrip("：:")
        normalized = re.sub(r"[\s　]+", "", subject)
        if subject in known_subjects or normalized in generic:
            continue
        if re.search(r"[。、！？!?「」]", subject) or re.match(r"^[①-⑳0-9０-９]", subject):
            continue
        kind = infer_entity_kind(subject, "candidate_term")
        # 正体不明の短い日本語見出しまで拾うと構成見出しだらけになる。
        # 作品語らしいカタカナ・英字、または分類可能な接尾辞を持つ語に限る。
        proprietary = bool(re.fullmatch(r"[ァ-ヶー・＝=A-Za-z0-9\s]{4,40}", subject))
        if kind != "TERM" or proprietary:
            results.append(Fact(subject, "candidate_term", subject, line_number))
    return results


def extract_document_facts(content: str, doc_type: str) -> list[Fact]:
    """Return ledger candidates without trusting document classification alone.

    Explicit colon fields remain setting-only because image prompts often use
    ``人物:`` and ``状態:``.  Natural profile cards may come from OTHER files
    when their repeated structure is strong enough to identify a setting note.
    """
    profiles = extract_profile_candidates(content)
    if doc_type == "SETTING":
        return extract_setting_facts(content)
    names = [fact for fact in profiles if fact.predicate == "name"]
    role_signal = any(normalized in ROLE_HEADINGS for normalized in (
        re.sub(r"[\s　]+", "", line.strip()).rstrip("：:") for line in content.splitlines()
    ))
    reading_signal = len(re.findall(
        r"^[■●◆・]\s*[一-龯々ヶヵァ-ヶー・A-Za-z]{2,24}[\s　]+[ぁ-んァ-ヶー]{2,24}\s*$",
        content, re.MULTILINE,
    ))
    marked_signal = len(re.findall(r"^[■●]\s*\S+", content, re.MULTILINE))
    if names and (role_signal or reading_signal >= 1 or marked_signal >= 2):
        return profiles
    return []


class DeterministicStore:
    def __init__(self, db_path: str | None = None):
        default_path = os.environ.get("NEXUS_LOCAL_DB") or os.path.join(os.path.dirname(__file__), "nexus_local.sqlite3")
        self.db_path = db_path or default_path
        self._initialize()
        self._refresh_document_types()

    def _refresh_document_types(self) -> None:
        """Apply current classification rules to an existing index.

        Classification rules can improve without file contents changing.  Old
        rows must therefore not wait for a content re-index.  Ledger candidates
        from non-setting documents are discarded at the same time.
        """
        with self.connect() as db:
            rows = db.execute("SELECT path,doc_type,version_role FROM files").fetchall()
            for row in rows:
                doc_type = classify_document(row["path"], {"version_role": row["version_role"]})
                if doc_type != row["doc_type"]:
                    db.execute("UPDATE files SET doc_type=? WHERE path=?", (doc_type, row["path"]))
            extractor_version = db.execute(
                "SELECT value FROM schema_meta WHERE key='fact_extractor_version'"
            ).fetchone()
            if not extractor_version or extractor_version["value"] != "9":
                indexed_rows = db.execute("SELECT path,project,doc_type FROM files").fetchall()
                for row in indexed_rows:
                    if not os.path.isfile(row["path"]):
                        continue
                    decisions = {
                        (fact["subject"], fact["predicate"], fact["value"]): (
                            fact["decision_status"], fact["decision_note"], fact["decided_at"], fact["entity_kind"]
                        )
                        for fact in db.execute(
                            """SELECT subject,predicate,value,decision_status,decision_note,decided_at,entity_kind
                               FROM facts WHERE file_path=? AND decision_status!='UNREVIEWED'""",
                            (row["path"],),
                        )
                    }
                    db.execute("DELETE FROM facts WHERE file_path=?", (row["path"],))
                    for fact in extract_document_facts(safe_read(row["path"]), row["doc_type"]):
                        decision = decisions.get(
                            (fact.subject, fact.predicate, fact.value),
                            ("UNREVIEWED", "", None, infer_entity_kind(fact.subject, fact.predicate))
                        )
                        db.execute(
                            """INSERT OR IGNORE INTO facts(
                               file_path,project,subject,predicate,value,line,confirmed,
                               decision_status,decision_note,decided_at,entity_kind
                               ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                            (row["path"], row["project"], fact.subject, fact.predicate, fact.value,
                             fact.line, int(decision[0] == "CONFIRMED"), *decision[:3], decision[3]),
                        )
                db.execute(
                    "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('fact_extractor_version','9')"
                )

    def connect(self):
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _initialize(self):
        legacy_fulltext = False
        if os.path.isfile(self.db_path):
            with sqlite3.connect(self.db_path) as probe:
                table = probe.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='files'"
                ).fetchone()
                if table:
                    columns = {row[1] for row in probe.execute("PRAGMA table_info(files)")}
                    legacy_fulltext = "content" in columns
        if legacy_fulltext:
            # 旧DBを失わずに退避し、新しい軽量索引は原本から再構築する。
            backup = self.db_path + ".legacy-fulltext.bak"
            if not os.path.exists(backup):
                with sqlite3.connect(self.db_path) as source, sqlite3.connect(backup) as target:
                    source.backup(target)

        with self.connect() as db:
            if legacy_fulltext:
                db.executescript(
                    """
                    PRAGMA foreign_keys = OFF;
                    DROP TABLE IF EXISTS chunks_fts;
                    DROP TABLE IF EXISTS file_fts;
                    DROP TABLE IF EXISTS chunks;
                    DROP TABLE IF EXISTS facts;
                    DROP TABLE IF EXISTS files;
                    DROP TABLE IF EXISTS schema_meta;
                    PRAGMA foreign_keys = ON;
                    """
                )
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    project TEXT NOT NULL,
                    doc_type TEXT NOT NULL,
                    content_hash TEXT NOT NULL,
                    mtime_ns INTEGER NOT NULL,
                    size INTEGER NOT NULL,
                    tags TEXT NOT NULL DEFAULT '[]',
                    work_id TEXT NOT NULL DEFAULT '',
                    work_title TEXT NOT NULL DEFAULT '',
                    version_role TEXT NOT NULL DEFAULT 'STANDALONE',
                    manifest_path TEXT,
                    segment_order INTEGER,
                    indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS facts (
                    id INTEGER PRIMARY KEY,
                    file_path TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
                    project TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    predicate TEXT NOT NULL,
                    value TEXT NOT NULL,
                    line INTEGER NOT NULL,
                    confirmed INTEGER NOT NULL DEFAULT 0,
                    decision_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
                    decision_note TEXT NOT NULL DEFAULT '',
                    decided_at TEXT,
                    entity_kind TEXT NOT NULL DEFAULT 'PERSON',
                    UNIQUE(file_path, subject, predicate, value, line)
                );
                CREATE INDEX IF NOT EXISTS facts_lookup ON facts(project, subject, predicate);
                """
            )
            file_columns = {row[1] for row in db.execute("PRAGMA table_info(files)")}
            additions = {
                "work_id": "TEXT NOT NULL DEFAULT ''",
                "work_title": "TEXT NOT NULL DEFAULT ''",
                "version_role": "TEXT NOT NULL DEFAULT 'STANDALONE'",
                "manifest_path": "TEXT",
                "segment_order": "INTEGER",
            }
            for column, definition in additions.items():
                if column not in file_columns:
                    db.execute(f"ALTER TABLE files ADD COLUMN {column} {definition}")
            fact_columns = {row[1] for row in db.execute("PRAGMA table_info(facts)")}
            fact_additions = {
                "decision_status": "TEXT NOT NULL DEFAULT 'UNREVIEWED'",
                "decision_note": "TEXT NOT NULL DEFAULT ''",
                "decided_at": "TEXT",
                "entity_kind": "TEXT NOT NULL DEFAULT 'PERSON'",
            }
            for column, definition in fact_additions.items():
                if column not in fact_columns:
                    db.execute(f"ALTER TABLE facts ADD COLUMN {column} {definition}")
            db.execute(
                """UPDATE facts SET decision_status='CONFIRMED'
                   WHERE confirmed=1 AND decision_status='UNREVIEWED'"""
            )
            db.execute("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','4')")
            try:
                db.execute(
                    """CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
                       content, content='', contentless_delete=1, tokenize='trigram'
                    )"""
                )
            except sqlite3.OperationalError:
                try:
                    db.execute(
                        """CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
                           content, content='', contentless_delete=1, tokenize='unicode61'
                        )"""
                    )
                except sqlite3.OperationalError:
                    # SQLite 3.43未満。本文を保存しないcontentless索引は維持し、
                    # 更新時だけ原本から索引を再構築する。
                    db.execute(
                        "CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(content, content='', tokenize='unicode61')"
                    )

    def index_roots(self, roots: Iterable[str], excluded_roots: Iterable[str] = ()) -> dict:
        normalized_roots = [os.path.abspath(root) for root in roots if root and os.path.isdir(root)]
        normalized_exclusions = [os.path.abspath(root) for root in excluded_roots if root]
        is_excluded = lambda path: any(path == root or path.startswith(root + os.sep) for root in normalized_exclusions)
        normalized_roots = [root for root in normalized_roots if not is_excluded(root)]
        manifest_segments, manifest_errors = discover_manifests(normalized_roots)
        discovered: set[str] = set()
        stats = {
            "scanned": 0, "updated": 0, "unchanged": 0, "deleted": 0,
            "current_segments": 0, "standalone": 0, "archived": 0, "unreferenced": 0,
            "exact_duplicate_groups": 0, "manifest_errors": manifest_errors, "errors": [],
        }
        for root in normalized_roots:
            for directory, names, files in os.walk(root):
                names[:] = [name for name in names if not name.startswith(".") and name not in {"node_modules", "release", ".git"} and not is_excluded(os.path.abspath(os.path.join(directory, name)))]
                for filename in files:
                    path = os.path.abspath(os.path.join(directory, filename))
                    if filename.startswith("._") or Path(filename).suffix.lower() not in TEXT_SUFFIXES:
                        continue
                    discovered.add(path)
                    stats["scanned"] += 1
                    try:
                        identity = identity_for_path(path, normalized_roots, manifest_segments)
                        role_key = {
                            "CURRENT_SEGMENT": "current_segments", "STANDALONE": "standalone",
                            "ARCHIVE": "archived", "UNREFERENCED": "unreferenced",
                        }[identity["version_role"]]
                        stats[role_key] += 1
                        changed = self.index_file(path, normalized_roots, identity)
                        stats["updated" if changed else "unchanged"] += 1
                    except Exception as error:  # keep the remaining index usable
                        stats["errors"].append({"path": path, "error": str(error)})

        with self.connect() as db:
            existing = [row["path"] for row in db.execute("SELECT path FROM files")]
            for path in existing:
                if any(path == root or path.startswith(root + os.sep) for root in normalized_roots) and path not in discovered:
                    self._delete_indexed_file(db, path)
                    stats["deleted"] += 1
            stats["exact_duplicate_groups"] = db.execute(
                "SELECT COUNT(*) FROM (SELECT content_hash FROM files GROUP BY content_hash HAVING COUNT(*) > 1)"
            ).fetchone()[0]
        return stats

    def delete_under_root(self, root: str) -> int:
        normalized = os.path.abspath(root)
        deleted = 0
        with self.connect() as db:
            paths = [row["path"] for row in db.execute("SELECT path FROM files")]
            for path in paths:
                if path == normalized or path.startswith(normalized + os.sep):
                    deleted += int(self._delete_indexed_file(db, path))
        return deleted

    def index_file(self, path: str, roots: Iterable[str], identity: dict | None = None) -> bool:
        stat = os.stat(path)
        content = safe_read(path)
        digest = content_hash(content)
        identity = identity or identity_for_path(path, roots, {})
        doc_type = classify_document(path, identity)
        with self.connect() as db:
            current = db.execute(
                """SELECT id,content_hash,doc_type,work_id,work_title,version_role,manifest_path,segment_order
                   FROM files WHERE path = ?""", (path,)
            ).fetchone()
            identity_values = (
                identity["work_id"], identity["work_title"], identity["version_role"],
                identity["manifest_path"], identity["segment_order"],
            )
            if current and current["content_hash"] == digest and tuple(current[key] for key in (
                "work_id", "work_title", "version_role", "manifest_path", "segment_order"
            )) == identity_values and current["doc_type"] == doc_type:
                return False
            content_changed = not current or current["content_hash"] != digest
            classification_changed = bool(current and current["doc_type"] != doc_type)
            db.execute(
                """INSERT INTO files(
                   path,name,project,doc_type,content_hash,mtime_ns,size,
                   work_id,work_title,version_role,manifest_path,segment_order,indexed_at
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
                   ON CONFLICT(path) DO UPDATE SET name=excluded.name, project=excluded.project,
                   doc_type=excluded.doc_type, content_hash=excluded.content_hash, mtime_ns=excluded.mtime_ns,
                   size=excluded.size, work_id=excluded.work_id, work_title=excluded.work_title,
                   version_role=excluded.version_role, manifest_path=excluded.manifest_path,
                   segment_order=excluded.segment_order, indexed_at=CURRENT_TIMESTAMP""",
                (path, os.path.basename(path), project_for_path(path, roots), doc_type, digest,
                 stat.st_mtime_ns, stat.st_size, *identity_values),
            )
            file_id = db.execute("SELECT id FROM files WHERE path=?", (path,)).fetchone()["id"]
            project = project_for_path(path, roots)
            if content_changed or classification_changed:
                previous_decisions = {
                    (row["subject"], row["predicate"], row["value"]): (
                        row["decision_status"], row["decision_note"], row["decided_at"], row["entity_kind"]
                    )
                    for row in db.execute(
                        """SELECT subject,predicate,value,decision_status,decision_note,decided_at,entity_kind
                           FROM facts WHERE file_path=? AND decision_status!='UNREVIEWED'""",
                        (path,),
                    )
                }
                if content_changed:
                    self._upsert_fts(db, file_id, content, bool(current))
                db.execute("DELETE FROM facts WHERE file_path = ?", (path,))
                facts = extract_document_facts(content, doc_type)
                for fact in facts:
                    decision = previous_decisions.get(
                        (fact.subject, fact.predicate, fact.value),
                        ("UNREVIEWED", "", None, infer_entity_kind(fact.subject, fact.predicate))
                    )
                    db.execute(
                        """INSERT OR IGNORE INTO facts(
                           file_path,project,subject,predicate,value,line,confirmed,
                           decision_status,decision_note,decided_at,entity_kind
                           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                        (path, project, fact.subject, fact.predicate, fact.value, fact.line,
                         1 if decision[0] == "CONFIRMED" else 0, *decision[:3], decision[3]),
                    )
            else:
                db.execute("UPDATE facts SET project=? WHERE file_path=?", (project, path))
        return True

    @staticmethod
    def _rebuild_contentless_fts(db):
        db.execute("INSERT INTO file_fts(file_fts) VALUES('delete-all')")
        rows = db.execute("SELECT id,path FROM files ORDER BY id").fetchall()
        for row in rows:
            try:
                content = safe_read(row["path"])
            except (OSError, UnicodeError):
                continue
            db.execute("INSERT INTO file_fts(rowid,content) VALUES(?,?)", (row["id"], content))

    @classmethod
    def _upsert_fts(cls, db, file_id: int, content: str, exists: bool):
        if exists:
            try:
                db.execute("DELETE FROM file_fts WHERE rowid=?", (file_id,))
            except sqlite3.OperationalError:
                cls._rebuild_contentless_fts(db)
                return
        db.execute("INSERT INTO file_fts(rowid,content) VALUES(?,?)", (file_id, content))

    @classmethod
    def _delete_indexed_file(cls, db, path: str) -> bool:
        row = db.execute("SELECT id FROM files WHERE path=?", (path,)).fetchone()
        if not row:
            return False
        try:
            db.execute("DELETE FROM file_fts WHERE rowid=?", (row["id"],))
            db.execute("DELETE FROM files WHERE path=?", (path,))
        except sqlite3.OperationalError:
            db.execute("DELETE FROM files WHERE path=?", (path,))
            cls._rebuild_contentless_fts(db)
        return True

    def list_files(self) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM files ORDER BY name COLLATE NOCASE").fetchall()
        return [
            {
                "file": row["name"], "path": row["path"], "full_path": row["path"],
                "preview": "本文は原本を検索時に参照します（DB内に複製していません）",
                "tags": json.loads(row["tags"] or "[]"),
                "project": row["project"], "doc_type": row["doc_type"], "chunks": 0,
                "storage_mode": "index-only", "size": row["size"],
                "work_id": row["work_id"], "work_title": row["work_title"],
                "version_role": row["version_role"], "segment_order": row["segment_order"],
                "mtime_ns": row["mtime_ns"], "indexed_at": row["indexed_at"],
            }
            for row in rows
        ]

    def delete_file(self, path: str) -> bool:
        with self.connect() as db:
            return self._delete_indexed_file(db, path)

    def update_tags(self, path: str, tags: list[str]) -> bool:
        cleaned = sorted({str(tag).strip() for tag in tags if str(tag).strip()})
        with self.connect() as db:
            return db.execute("UPDATE files SET tags=? WHERE path=?", (json.dumps(cleaned, ensure_ascii=False), path)).rowcount > 0

    def search(
        self, query: str, project: str | None = None, limit: int = 20,
        root: str | None = None, roots: list[str] | None = None,
    ) -> list[dict]:
        query = query.strip()
        if not query:
            return []
        terms = re.findall(r"[一-龠々ぁ-んァ-ヶーA-Za-z0-9_-]{2,}", query) or [query]
        normalized_terms = [unicodedata.normalize("NFKC", term).casefold() for term in terms]
        match_query = " AND ".join(f'"{term.replace(chr(34), chr(34) * 2)}"' for term in terms)
        params: list[object] = []
        project_sql = ""
        if project and project != "Unknown":
            project_sql = " AND (f.project = ? OR f.work_title = ?)"
            params.extend([project, project])
        requested_roots = list(roots or []) + ([root] if root else [])
        normalized_roots = []
        for requested_root in requested_roots:
            root_path = os.path.abspath(requested_root)
            if os.path.isfile(root_path):
                root_path = os.path.dirname(root_path)
            normalized_roots.append(unicodedata.normalize("NFC", root_path).casefold().rstrip(os.sep))
        # 登録ルートで絞る場合、範囲外の旧索引が先に並んでも対象候補へ到達させる。
        candidate_limit = 50000 if normalized_roots else max(100, min(max(1, limit) * 20, 5000))
        select_sql = f"""
            SELECT f.path,f.name,f.project,f.doc_type,f.content_hash,f.work_id,f.work_title,
                   f.version_role,f.manifest_path,f.segment_order
        """
        order_sql = """
            ORDER BY CASE f.version_role
                WHEN 'CURRENT_SEGMENT' THEN 0 WHEN 'STANDALONE' THEN 1
                WHEN 'UNREFERENCED' THEN 2 ELSE 3 END,
                f.doc_type='SETTING' DESC, f.work_title, f.segment_order, f.name LIMIT ?
        """
        # FTS5 の trigram tokenizer は日本語2文字を索引化できない。
        # その場合はファイル目録を候補集合として原本を直接照合する。
        use_fts = all(len(term) >= 3 for term in normalized_terms)
        if use_fts:
            sql = select_sql + f" FROM file_fts JOIN files f ON f.id=file_fts.rowid WHERE file_fts MATCH ?{project_sql}" + order_sql
            params.insert(0, match_query)
        else:
            sql = select_sql + f" FROM files f WHERE 1=1{project_sql}" + order_sql
        params.append(candidate_limit)
        with self.connect() as db:
            try:
                rows = db.execute(sql, params).fetchall()
            except sqlite3.OperationalError:
                # 記号を含む検索などFTS構文にできない入力も、黙って0件にしない。
                fallback_params = params[1:] if use_fts else params
                fallback_sql = select_sql + f" FROM files f WHERE 1=1{project_sql}" + order_sql
                rows = db.execute(fallback_sql, fallback_params).fetchall()
        results = []
        seen_hashes: dict[str, int] = {}
        for row in rows:
            normalized_path = unicodedata.normalize("NFC", os.path.abspath(row["path"])).casefold()
            if normalized_roots and not any(
                normalized_path == candidate or normalized_path.startswith(candidate + os.sep)
                for candidate in normalized_roots
            ):
                continue
            try:
                content = safe_read(row["path"])
            except (OSError, UnicodeError):
                continue
            normalized_content = unicodedata.normalize("NFKC", content).casefold()
            if not all(term in normalized_content for term in normalized_terms):
                continue
            if row["content_hash"] in seen_hashes:
                results[seen_hashes[row["content_hash"]]]["exact_duplicate_count"] += 1
                continue
            # NFKCで文字長が変わる場合があるため、抜粋位置は原文で再探索する。
            original_offsets = [content.casefold().find(term.casefold()) for term in terms]
            valid_offsets = [offset for offset in original_offsets if offset >= 0]
            offset = min(valid_offsets) if valid_offsets else 0
            start = max(0, offset - 300)
            end = min(len(content), offset + 900)
            if start:
                newline = content.find("\n", start, offset)
                if newline >= 0:
                    start = newline + 1
            if end < len(content):
                newline = content.rfind("\n", offset, end)
                if newline > offset:
                    end = newline
            results.append(
                {"file": row["name"], "full_path": row["path"], "project": row["project"],
                 "doc_type": row["doc_type"], "line": content.count("\n", 0, offset) + 1,
                 "offset": offset, "content": content[start:end], "matched_terms": terms,
                 "work_id": row["work_id"], "work_title": row["work_title"],
                 "version_role": row["version_role"], "manifest_path": row["manifest_path"],
                 "segment_order": row["segment_order"], "exact_duplicate_count": 1}
            )
            seen_hashes[row["content_hash"]] = len(results) - 1
            if len(results) >= max(1, min(limit, 100)):
                break
        return results

    def reference_sheet(self, query: str, project: str | None = None, limit: int = 12) -> str:
        results = self.search(query, project=project, limit=limit)
        if not results:
            return "該当する根拠はローカル資料内に見つかりませんでした。"
        parts = ["# ローカル資料の検索結果", f"検索語: {query}", ""]
        for result in results:
            parts.extend([
                f"## {result['file']}（{result['work_title']} / {result['version_role']} / {result['doc_type']} / L{result['line']}）",
                result["content"].strip(),
                f"出典: {result['full_path']}",
                f"完全一致の重複: {result['exact_duplicate_count']}件",
                "",
            ])
        return "\n".join(parts)

    def facts_for_project(self, project: str | None = None) -> list[dict]:
        sql = "SELECT * FROM facts"
        params: tuple = ()
        if project and project != "Unknown":
            sql += " WHERE project = ?"
            params = (project,)
        sql += " ORDER BY subject,predicate,file_path,line"
        with self.connect() as db:
            return [dict(row) for row in db.execute(sql, params)]

    def files_for_project(self, project: str | None = None) -> list[dict]:
        """記憶パック向けに本文を含まない原本メタデータだけを返す。"""
        sql = """SELECT path,name,project,doc_type,content_hash,mtime_ns,size,tags,indexed_at,
                 work_id,work_title,version_role,manifest_path,segment_order FROM files"""
        params: tuple = ()
        if project and project != "Unknown":
            sql += " WHERE project = ?"
            params = (project,)
        sql += " ORDER BY doc_type,name COLLATE NOCASE"
        with self.connect() as db:
            return [dict(row) for row in db.execute(sql, params)]

    def facts_under_root(self, root: str, work_title: str | None = None) -> list[dict]:
        """同名作品の混線を避け、指定フォルダ配下の候補だけを返す。"""
        prefix = os.path.abspath(root).rstrip(os.sep) + os.sep + "%"
        sql = """SELECT facts.* FROM facts
                 JOIN files ON files.path=facts.file_path
                 WHERE facts.file_path LIKE ?"""
        params: list[str] = [prefix]
        if work_title:
            sql += " AND COALESCE(NULLIF(files.work_title,''),files.project)=?"
            params.append(work_title)
        sql += " ORDER BY facts.subject,facts.predicate,facts.file_path,facts.line"
        with self.connect() as db:
            return [dict(row) for row in db.execute(sql, tuple(params))]

    def files_under_root(self, root: str) -> list[dict]:
        """指定フォルダ配下の、本文を含まない原本メタデータを返す。"""
        prefix = os.path.abspath(root).rstrip(os.sep) + os.sep + "%"
        with self.connect() as db:
            return [
                dict(row)
                for row in db.execute(
                    """SELECT path,name,project,doc_type,content_hash,mtime_ns,size,tags,indexed_at,
                       work_id,work_title,version_role,manifest_path,segment_order
                       FROM files WHERE path LIKE ? ORDER BY doc_type,name COLLATE NOCASE""",
                    (prefix,),
                )
            ]

    def confirm_fact(self, fact_id: int, confirmed: bool) -> bool:
        """AIの推測ではなく、筆者の操作でだけ候補を確定する。"""
        return self.update_fact_decision(fact_id, "CONFIRMED" if confirmed else "UNREVIEWED")

    def update_fact_decision(self, fact_id: int, status: str, note: str = "") -> bool:
        status = str(status).upper()
        if status not in DECISION_STATUSES:
            raise ValueError(f"invalid decision status: {status}")
        with self.connect() as db:
            return db.execute(
                """UPDATE facts SET confirmed=?,decision_status=?,decision_note=?,
                   decided_at=CASE WHEN ?='UNREVIEWED' THEN NULL ELSE CURRENT_TIMESTAMP END
                   WHERE id=?""",
                (1 if status == "CONFIRMED" else 0, status, str(note).strip(), status, fact_id),
            ).rowcount > 0

    def update_fact_kind(self, fact_id: int, kind: str) -> bool:
        kind = str(kind).upper()
        if kind not in ENTITY_KINDS:
            raise ValueError(f"invalid entity kind: {kind}")
        with self.connect() as db:
            return db.execute("UPDATE facts SET entity_kind=? WHERE id=?", (kind, fact_id)).rowcount > 0

    def ledger_under_root(self, root: str, work_title: str | None = None) -> dict:
        raw_facts = self.facts_under_root(root, work_title)
        status_priority = {
            "CONFIRMED": 6, "CONFLICT": 5, "PROVISIONAL": 4, "CONSIDERING": 3,
            "REJECTED": 2, "RETIRED": 1, "UNREVIEWED": 0,
        }
        grouped: dict[tuple[str, str, str], dict] = {}
        for fact in raw_facts:
            key = (fact["subject"].strip(), fact["predicate"], fact["value"].strip())
            source = {"file_path": fact["file_path"], "line": fact["line"]}
            if key not in grouped:
                grouped[key] = {**fact, "sources": [source], "duplicate_count": 1}
                continue
            current = grouped[key]
            current["sources"].append(source)
            current["duplicate_count"] += 1
            if status_priority.get(fact["decision_status"], 0) > status_priority.get(current["decision_status"], 0):
                grouped[key] = {**fact, "sources": current["sources"], "duplicate_count": current["duplicate_count"]}
        facts = list(grouped.values())
        counts = {status: 0 for status in sorted(DECISION_STATUSES)}
        subjects: dict[str, list[dict]] = {}
        for fact in facts:
            counts[fact["decision_status"]] = counts.get(fact["decision_status"], 0) + 1
            subjects.setdefault(fact["subject"], []).append(fact)
        return {
            "facts": facts,
            "subjects": [
                {"subject": subject, "facts": subject_facts}
                for subject, subject_facts in sorted(subjects.items(), key=lambda item: item[0])
            ],
            "counts": counts,
            "total": len(facts),
            "work_title": work_title or "",
            "kind_counts": {
                kind: sum(1 for fact in facts if fact.get("entity_kind", "PERSON") == kind)
                for kind in sorted(ENTITY_KINDS)
            },
        }

    def project_of(self, path: str) -> str:
        if not path:
            return "Unknown"
        with self.connect() as db:
            row = db.execute("SELECT project FROM files WHERE path = ?", (os.path.abspath(path),)).fetchone()
        return row["project"] if row else "Unknown"

    def story_states(self, project: str | None = None) -> dict:
        states = {"characters": {}, "terms": {}, "locations": {}, "timeline": []}
        for fact in self.facts_for_project(project):
            if fact.get("decision_status") != "CONFIRMED":
                continue
            subject = fact["subject"]
            character = states["characters"].setdefault(
                subject, {"status": "alive", "attributes": {}, "source": fact["file_path"], "aliases": []}
            )
            predicate = fact["predicate"]
            value = fact["value"]
            if predicate == "alias":
                character["aliases"].append(value)
            elif predicate == "status":
                if any(word in value.lower() for word in ("死亡", "死去", "故人", "dead")):
                    character["status"] = "dead"
                elif any(word in value.lower() for word in ("生存", "健在", "alive")):
                    character["status"] = "alive"
            elif predicate in {"eye_color", "hair", "origin", "weapon", "affiliation"}:
                character["attributes"][predicate] = value
            elif predicate in {"death_chapter", "first_chapter"}:
                character[predicate] = value
        return states
