import os
import json
import asyncio
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import threading
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="NEXUS RAG Bridge Server")

# CORS設定 (Electronからのアクセスを許可)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 設定 ---
DB_PATH = os.path.join(os.path.dirname(__file__), "nexus_db")
COLLECTION_NAME = "nexus_novels"

# 旧RAGは任意機能として遅延起動する。通常の検索・校正は依存しない。
legacy_collection = None

def get_legacy_rag():
    global legacy_collection
    try:
        import chromadb
        import ollama
    except ImportError as error:
        raise HTTPException(status_code=503, detail=f"Optional legacy RAG is unavailable: {error}") from error
    if legacy_collection is None:
        client = chromadb.PersistentClient(path=DB_PATH)
        legacy_collection = client.get_or_create_collection(name=COLLECTION_NAME)
    return legacy_collection, ollama

# 監査の進捗管理用グローバル変数
audit_state = {
    "running": False,
    "progress": "",
    "completed": False,
    "total_files": 0,
    "current_file": 0
}

class AskRequest(BaseModel):
    query: str
    model: str = "qwen3.5:9b"
    system_prompt: str = ""
    file_path: str = ""

# --- プロセッサーの初期化 (起動時に一度だけ実行) ---
from proofreader import Proofreader
from proofreading_profile import load_profile
from knowledge_processor import KnowledgeProcessor
from deterministic_store import DeterministicStore
from memory_pack import render_memory_pack, write_memory_pack
from config_loader import get_manuscript_dirs

pr_engine = Proofreader()
kp_engine = KnowledgeProcessor()
local_store = DeterministicStore()
SOURCE_CONFIG_PATH = f"{local_store.db_path}.sources.json"

def load_source_config():
    try:
        with open(SOURCE_CONFIG_PATH, "r", encoding="utf-8") as stream:
            data = json.load(stream)
    except (OSError, ValueError):
        data = {}
    return {
        "included": sorted({os.path.abspath(path) for path in data.get("included", []) if path}),
        "excluded": sorted({os.path.abspath(path) for path in data.get("excluded", []) if path}),
    }

def save_source_config(config):
    os.makedirs(os.path.dirname(SOURCE_CONFIG_PATH), exist_ok=True)
    temporary = f"{SOURCE_CONFIG_PATH}.tmp"
    with open(temporary, "w", encoding="utf-8") as stream:
        json.dump(config, stream, ensure_ascii=False, indent=2)
    os.replace(temporary, SOURCE_CONFIG_PATH)

@app.post("/ask")
async def ask_rag(request: AskRequest):
    """
    RAG検索を行い、Ollamaの回答を非同期ストリーミングで返す
    """
    query = request.query
    model_name = request.model
    file_path = request.file_path

    project_id = kp_engine._determine_project(file_path) if file_path else "Unknown"

    try:
        print(f"💬 Query: {query} (Project: {project_id})")
        collection, ollama_module = get_legacy_rag()
        async_client = ollama_module.AsyncClient()
        
        # 1. 検索実行 (プロジェクト限定)
        response_vector = await async_client.embeddings(model="nomic-embed-text", prompt=query)
        
        where_clause = {"project": project_id} if project_id != "Unknown" else None
        
        vector_results = collection.query(
            query_embeddings=[response_vector["embedding"]], 
            where=where_clause,
            n_results=10
        )
        
        # 2. ランキング
        all_candidates = {}
        if vector_results['documents'] and vector_results['documents'][0]:
            for i, (doc, meta, doc_id) in enumerate(zip(vector_results['documents'][0], vector_results['metadatas'][0], vector_results['ids'][0])):
                score = (10 - i) + (meta.get('importance', 50) / 10)
                all_candidates[doc_id] = [doc, meta, score]

        sorted_candidates = sorted(all_candidates.values(), key=lambda x: x[2], reverse=True)[:8]
        
        # 3. コンテキスト構築 (XML形式)
        context_parts = []
        for i, (doc, meta, score) in enumerate(sorted_candidates):
            memory_xml = f"""    <memory index="{i+1}" type="{meta.get('doc_type', 'OTHER')}" importance="{meta.get('importance', 50)}" project="{meta.get('project', 'Unknown')}">
      <source>{meta.get('file', '不明')}</source>
      <path>{meta.get('path', '')}</path>
      <content>
{doc}
      </content>
    </memory>"""
            context_parts.append(memory_xml)
        
        wrapped_context = f"<creation_memory>\n" + "\n".join(context_parts) + "\n</creation_memory>"
        
        # 4. プロンプト構築
        base_system_prompt = """あなたは小説執筆の「物語整合性アドバイザー」です。提供された <creation_memory> を元に答えてください。"""
        final_system_prompt = f"{request.system_prompt}\n\n{base_system_prompt}" if request.system_prompt else base_system_prompt
        prompt = f"以下の <creation_memory> を解析し支援してください。\n\n{wrapped_context}\n\n【質問】\n{query}"

        async def generate():
            try:
                async for chunk in await async_client.chat(
                    model=model_name,
                    messages=[{'role': 'system', 'content': final_system_prompt}, {'role': 'user', 'content': prompt}],
                    stream=True
                ):
                    yield json.dumps({"message": {"content": chunk['message']['content']}, "done": chunk.get('done', False)}) + "\n"
            except Exception as e:
                yield json.dumps({"error": str(e)}) + "\n"

        return StreamingResponse(generate(), media_type="application/x-ndjson")

    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/db/propose_metadata")
async def propose_metadata(request: Request):
    """
    ファイルパスからプロジェクト名やドキュメントタイプを高速に提案する
    """
    try:
        data = await request.json()
        file_path = data.get("full_path", "") or data.get("file_path", "")
        content = data.get("content", "")
        
        metadata = kp_engine.process_file(file_path, content)
        
        return {
            "project": metadata.get("project", "Unknown"),
            "doc_type": metadata.get("doc_type", "OTHER"),
            "importance": metadata.get("importance", 50),
            "entities": metadata.get("entities", "").split(",")
        }
    except Exception as e:
        print(f"❌ Propose Error: {e}")
        return {"project": "Unknown", "doc_type": "OTHER", "importance": 50, "entities": []}

@app.post("/db/suggest_tags")
async def suggest_tags(request: Request):
    data = await request.json()
    content = data.get("content", "")
    entities = kp_engine._extract_entities("temp.txt", content)
    return {"tags": list(entities)[:15]}

@app.post("/db/update_tags")
async def update_tags(request: Request):
    """ファイルのタグ情報を更新する"""
    data = await request.json()
    full_path = data.get("full_path", "")
    tags = data.get("tags", [])
    if not full_path:
        raise HTTPException(status_code=400, detail="full_path is required")
    if local_store.update_tags(full_path, tags if isinstance(tags, list) else [tags]):
        return {"success": True, "updated": 1}
    raise HTTPException(status_code=404, detail="File not found in DB")

@app.delete("/db/items")
async def delete_db_item(full_path: str = ""):
    """フロントエンドは ?full_path=... をクエリパラメータで送る"""
    if not full_path: return {"success": False}
    deleted = local_store.delete_file(full_path)
    return {"success": deleted, "deleted": 1 if deleted else 0, "reason": None if deleted else "not found"}

@app.post("/db/ingest")
async def trigger_ingest(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    target_path = data.get("target_path")
    source_config = load_source_config()
    roots = [target_path] if target_path else [*get_manuscript_dirs(), *source_config["included"]]
    stats = await asyncio.to_thread(local_store.index_roots, roots, source_config["excluded"])
    return {"status": "completed", "stats": stats}

@app.get("/db/sources")
async def list_db_sources():
    return load_source_config()

@app.post("/db/sources")
async def add_db_source(request: Request):
    data = await request.json()
    path = os.path.abspath(str(data.get("path") or ""))
    mode = data.get("mode")
    if not path or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Folder does not exist")
    if mode not in {"include", "exclude"}:
        raise HTTPException(status_code=400, detail="mode must be include or exclude")
    config = load_source_config()
    if mode == "include":
        config["included"] = sorted(set([*config["included"], path]))
        config["excluded"] = [item for item in config["excluded"] if item != path]
        save_source_config(config)
        stats = await asyncio.to_thread(local_store.index_roots, [path], config["excluded"])
        return {**config, "stats": stats}
    config["excluded"] = sorted(set([*config["excluded"], path]))
    config["included"] = [item for item in config["included"] if item != path]
    save_source_config(config)
    deleted = await asyncio.to_thread(local_store.delete_under_root, path)
    return {**config, "deleted": deleted}

@app.delete("/db/sources")
async def remove_db_source(path: str, mode: str):
    normalized = os.path.abspath(path)
    config = load_source_config()
    key = "included" if mode == "include" else "excluded"
    config[key] = [item for item in config[key] if item != normalized]
    save_source_config(config)
    return config

@app.get("/db/items")
async def list_db_items():
    try:
        return local_store.list_files()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/db/search")
async def search_local_db(request: Request):
    data = await request.json()
    configured_roots = load_source_config()["included"]
    return {
        "results": local_store.search(
            data.get("query", ""), project=data.get("project"), limit=int(data.get("limit", 20)),
            root=data.get("target_path"), roots=None if data.get("target_path") else configured_roots,
        )
    }

@app.post("/analyze/reference_sheet")
async def generate_reference_sheet(request: AskRequest):
    """AIを使わず、出典付きの該当資料を抽出する。"""
    project_id = local_store.project_of(request.file_path) if request.file_path else None
    return {"sheet": local_store.reference_sheet(request.query, project=project_id)}

@app.post("/memory-pack/generate")
async def generate_memory_pack(request: Request):
    """本文を複製せず、外部AI向けの確定設定・候補・原本目録を書き出す。"""
    data = await request.json()
    target_path = os.path.abspath(data.get("target_path", "")) if data.get("target_path") else ""
    if not target_path or not os.path.isdir(target_path):
        raise HTTPException(status_code=400, detail="作品フォルダを開いてください")

    project = data.get("project") or local_store.project_of(target_path)
    if not project or project == "Unknown":
        project = os.path.basename(target_path.rstrip(os.sep)) or "Unknown"
    facts = local_store.facts_under_root(target_path)
    files = local_store.files_under_root(target_path)
    markdown = render_memory_pack(project, facts, files, root=target_path)
    output_dir = data.get("output_dir") or os.path.join(target_path, "NEXUS_AI_MEMORY")
    metadata = {
        "schema": "nexus.ai-memory.v1",
        "project": project,
        "confirmed_fact_ids": [fact["id"] for fact in facts if int(fact.get("confirmed", 0)) == 1],
        "candidate_fact_ids": [fact["id"] for fact in facts if int(fact.get("confirmed", 0)) != 1],
        "decisions": [
            {"id": fact["id"], "status": fact.get("decision_status", "UNREVIEWED")}
            for fact in facts
        ],
        "sources": [
            {
                "path": os.path.relpath(item["path"], target_path),
                "type": item["doc_type"],
                "version_role": item["version_role"],
                "work_title": item["work_title"],
                "sha256": item["content_hash"],
                "size": item["size"],
            }
            for item in files
        ],
    }
    written = await asyncio.to_thread(write_memory_pack, output_dir, project, markdown, metadata)
    return {
        "success": True,
        "project": project,
        "confirmed": len(metadata["confirmed_fact_ids"]),
        "candidates": len(metadata["candidate_fact_ids"]),
        "sources": len(files),
        **written,
    }

@app.post("/memory-pack/facts/confirm")
async def confirm_memory_fact(request: Request):
    """候補の判断状態は、明示的な人間の操作でのみ変更する。"""
    data = await request.json()
    fact_id = data.get("fact_id")
    if fact_id is None:
        raise HTTPException(status_code=400, detail="fact_id is required")
    status = data.get("status")
    if not status:
        status = "CONFIRMED" if bool(data.get("confirmed", True)) else "UNREVIEWED"
    try:
        updated = local_store.update_fact_decision(int(fact_id), status, data.get("note", ""))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not updated:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"success": True, "fact_id": int(fact_id), "status": status}

@app.post("/ledger/facts/classify")
async def classify_ledger_fact(request: Request):
    data = await request.json()
    if data.get("fact_id") is None:
        raise HTTPException(status_code=400, detail="fact_id is required")
    try:
        updated = local_store.update_fact_kind(int(data["fact_id"]), data.get("kind", "UNKNOWN"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not updated:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"success": True}

@app.get("/ledger")
async def get_project_ledger(target_path: str = "", work_title: str = ""):
    """筆者が確認・判断するための作品台帳を返す。"""
    if not target_path or not os.path.isdir(target_path):
        raise HTTPException(status_code=400, detail="作品フォルダを開いてください")
    return local_store.ledger_under_root(target_path, work_title or None)

# スレッドセーフな監査状態管理
audit_lock = threading.Lock()

def _update_audit_state(**kwargs):
    with audit_lock:
        audit_state.update(kwargs)

def _get_audit_state():
    with audit_lock:
        return dict(audit_state)

@app.post("/analyze/proofread")
async def combined_proofread(request: AskRequest):
    text = request.query
    file_path = request.file_path
    
    project_id = local_store.project_of(file_path) if file_path else "Unknown"
    profile = load_profile(
        file_path,
        os.path.join(os.path.dirname(__file__), "nexus_whitelist.json"),
    )
    
    # SQLiteに明示登録された設定だけを根拠として使う。
    states = local_store.story_states(project_id)
    static_corrections = pr_engine.proofread(text, materials_context=states, profile=profile)
    static_xml = pr_engine.to_xml(static_corrections)
    return {
        "corrections": static_xml,
        "issues": static_corrections,
        "engine": "deterministic",
        "ai_used": False,
        "profile": profile,
    }

@app.post("/analyze/audit/start")
async def start_full_audit(background_tasks: BackgroundTasks):
    current = _get_audit_state()
    if current["running"]: return {"status": "already_running"}
    
    def run_audit_process():
        _update_audit_state(running=True, completed=False, progress="監査実行中...")
        try:
            from audit_batch_processor import AuditBatchProcessor
            processor = AuditBatchProcessor()
            processor.run_full_audit()
            _update_audit_state(completed=True, progress="完了")
        except Exception as e:
            _update_audit_state(progress=f"エラー: {e}")
        finally:
            _update_audit_state(running=False)

    background_tasks.add_task(run_audit_process)
    return {"status": "started"}

@app.get("/analyze/audit/status")
async def get_audit_status():
    return _get_audit_state()

@app.get("/analyze/audit/report")
async def get_audit_report():
    report_path = os.path.join(os.path.dirname(__file__), "homework_list.json")
    if os.path.exists(report_path):
        with open(report_path, "r", encoding="utf-8") as f: return json.load(f)
    return []

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
