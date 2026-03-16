from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import tempfile, os, logging, asyncio
from rag import NvidiaRAG, TRENDING_QUERIES, FRESHNESS_CONFIG, classify_error, load_search_config, save_search_config, DOCS_DIR
from config import NVIDIA_API_KEY, TAVILY_API_KEY, LLM_MODEL, EMBED_MODEL, RERANK_MODEL
from dotenv import load_dotenv, set_key
import storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Elite Mode RAG API", version="1.0.0")

# Restrict CORS to known local origins instead of allowing every origin.
# Electron's renderer loads from either the Vite dev server or a file:// URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "file://"],
    allow_origin_regex=r"file://.*",   # covers packaged Electron on all platforms
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy pipeline — initialised on first startup event, not at import time.
# This lets the /api/health endpoint respond even if the AI keys are invalid.
pipeline: Optional[NvidiaRAG] = None

@app.on_event("startup")
def startup():
    global pipeline
    log.info("Initializing pipeline...")
    try:
        pipeline = NvidiaRAG()
        log.info("Pipeline ready.")
    except Exception as e:
        log.error("Pipeline failed to initialise: %s. API will run in degraded mode.", e)
        pipeline = None

def get_pipeline() -> NvidiaRAG:
    """Return the pipeline or raise a clear 503 if it never initialised."""
    if pipeline is None:
        raise HTTPException(status_code=503,
            detail="AI pipeline not initialised. Check your API keys in Settings and restart the backend.")
    return pipeline

class AskBody(BaseModel):
    question: str

class InstagramBody(BaseModel):
    topic: str
    include_9x16: Optional[bool] = False
    include_hook: Optional[bool] = False
    include_category: Optional[bool] = False
    freshness: Optional[str] = "2days"
    persona: Optional[str] = "journalist"
    tone: Optional[str] = "analytical"
    platform_target: Optional[str] = "instagram"
    caption_length: Optional[str] = "medium"
    custom_instructions: Optional[str] = ""
    title_min_length: Optional[int] = 50
    title_max_length: Optional[int] = 100

class PersonaConfigBody(BaseModel):
    persona: Optional[str] = "journalist"
    tone: Optional[str] = "analytical"
    platform_target: Optional[str] = "instagram"
    caption_length: Optional[str] = "medium"
    custom_instructions: Optional[str] = ""

class OutputConfigBody(BaseModel):
    title_min_length: Optional[int] = 50
    title_max_length: Optional[int] = 100
    include_hook: Optional[bool] = False
    include_category: Optional[bool] = False
    include_9x16: Optional[bool] = False
    include_sources_block: Optional[bool] = True

class BatchBody(BaseModel):
    category: str
    count: Optional[int] = 3
    include_9x16: Optional[bool] = False
    include_hook: Optional[bool] = False
    include_category: Optional[bool] = False
    freshness: Optional[str] = "2days"

class TrendingBody(BaseModel):
    category: str
    freshness: Optional[str] = "2days"

class SettingsBody(BaseModel):
    nvidia_api_key: str
    tavily_api_key: str

class SearchConfigBody(BaseModel):
    tavily: Optional[dict] = None
    nvidia: Optional[dict] = None

def err(e: Exception, status: int = 500):
    log.error("API error: %s", e)
    raise HTTPException(status_code=status, detail=classify_error(e))

@app.get("/api/health")
def health():
    missing = []
    if not NVIDIA_API_KEY or "your-key" in NVIDIA_API_KEY: missing.append("NVIDIA_API_KEY")
    if not TAVILY_API_KEY or "your-key" in TAVILY_API_KEY: missing.append("TAVILY_API_KEY")
    return {"status": "degraded" if missing else "ok",
            "missing_keys": missing,
            "models": {"llm": LLM_MODEL, "embed": EMBED_MODEL, "rerank": RERANK_MODEL}}

@app.get("/api/test")
def test_connectivity():
    p = get_pipeline()
    results = {}
    try:
        p.tavily.search(query="test", max_results=1, search_depth="basic")
        results["tavily"] = {"ok": True}
    except Exception as e:
        results["tavily"] = {"ok": False, "error": classify_error(e)}
    try:
        from langchain_nvidia_ai_endpoints import ChatNVIDIA
        ChatNVIDIA(model=LLM_MODEL, api_key=NVIDIA_API_KEY, max_completion_tokens=10).invoke("hi")
        results["nvidia_llm"] = {"ok": True}
    except Exception as e:
        results["nvidia_llm"] = {"ok": False, "error": classify_error(e)}
    try:
        p.embedder.embed_query("test")
        results["nvidia_embed"] = {"ok": True}
    except Exception as e:
        results["nvidia_embed"] = {"ok": False, "error": classify_error(e)}
    return {"overall": "ok" if all(v["ok"] for v in results.values()) else "degraded",
            "components": results}

@app.get("/api/settings")
def get_settings():
    return {"nvidia_api_key": NVIDIA_API_KEY, "tavily_api_key": TAVILY_API_KEY}

@app.post("/api/settings")
def save_settings(body: SettingsBody):
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    set_key(env_path, "NVIDIA_API_KEY", body.nvidia_api_key)
    set_key(env_path, "TAVILY_API_KEY", body.tavily_api_key)
    load_dotenv(env_path, override=True)
    return {"status": "saved", "message": "Keys saved. Restart backend for changes to take effect."}

@app.get("/api/freshness/options")
def freshness_options():
    return {"options": [
        {"value": k, "label": v["label"]} for k, v in FRESHNESS_CONFIG.items()
    ]}

@app.post("/api/web-search")
def web_search(body: AskBody):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    try:
        return get_pipeline().web_search_ask(body.question)
    except Exception as e: err(e)

@app.post("/api/doc/upload")
async def upload_doc(file: UploadFile = File(...)):
    if file.content_type not in {"application/pdf","text/plain"}:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported.")
    try:
        suffix = ".pdf" if file.content_type == "application/pdf" else ".txt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read()); tmp_path = tmp.name
        p = get_pipeline()
        n = p.load_pdf(tmp_path) if suffix == ".pdf" else p.load_txt(tmp_path)
        os.unlink(tmp_path)
        return {"status": "loaded", "chunks": n, "filename": file.filename}
    except Exception as e: err(e)

@app.post("/api/doc/ask")
def ask_doc(body: AskBody):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    try:
        return get_pipeline().ask_doc(body.question)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e: err(e)

@app.post("/api/content/instagram")
def generate_instagram(body: InstagramBody):
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")
    if body.freshness not in FRESHNESS_CONFIG:
        raise HTTPException(status_code=400, detail=f"Invalid freshness value. Use: {list(FRESHNESS_CONFIG.keys())}")
    try:
        result = get_pipeline().generate_instagram(
            body.topic, include_9x16=body.include_9x16,
            include_hook=body.include_hook, include_category=body.include_category,
            freshness=body.freshness,
            persona=body.persona or "journalist",
            tone=body.tone or "analytical",
            platform_target=body.platform_target or "instagram",
            caption_length=body.caption_length or "medium",
            custom_instructions=body.custom_instructions or "",
            title_min_length=body.title_min_length or 50,
            title_max_length=body.title_max_length or 100,
        )
        post_id = storage.save_post(body.topic, "instagram", result["content"], result["sources"])
        result["post_id"] = post_id
        return result
    except Exception as e: err(e)

@app.post("/api/content/batch")
def batch_generate(body: BatchBody):
    if body.count < 1 or body.count > 5:
        raise HTTPException(status_code=400, detail="Count must be between 1 and 5.")
    if body.freshness not in FRESHNESS_CONFIG:
        raise HTTPException(status_code=400, detail=f"Invalid freshness value.")
    try:
        results = get_pipeline().batch_generate(
            body.category, body.count, include_9x16=body.include_9x16,
            include_hook=body.include_hook, include_category=body.include_category,
            freshness=body.freshness
        )
        saved = []
        for r in results:
            if not r.get("error") and r.get("content"):
                pid = storage.save_post(r.get("original_topic","batch"), "instagram",
                                        r["content"], r.get("sources",[]))
                r["post_id"] = pid
            saved.append(r)
        ok = sum(1 for r in saved if not r.get("error"))
        return {"results": saved, "count": ok, "failed": len(saved)-ok,
                "summary": f"{ok} posts generated, {len(saved)-ok} failed."}
    except Exception as e: err(e)

class StreamBatchBody(BaseModel):
    category:         str
    count:            Optional[int]  = 3
    include_9x16:     Optional[bool] = False
    include_hook:     Optional[bool] = False
    include_category: Optional[bool] = False
    freshness:        Optional[str]  = "2days"

@app.post("/api/content/stream-batch")
async def stream_batch(body: StreamBatchBody):
    """
    SSE endpoint — streams N posts live as they are generated.
    Events: campaign_brief | post_started | web_fetched | post_chunk | post_completed | post_error | batch_done
    """
    if body.count < 1 or body.count > 5:
        raise HTTPException(status_code=400, detail="Count must be between 1 and 5.")
    if body.freshness not in FRESHNESS_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid freshness value.")

    p = get_pipeline()

    async def event_generator():
        try:
            async for chunk in p.stream_batch_generate(
                category         = body.category,
                count            = body.count,
                include_9x16     = body.include_9x16,
                include_hook     = body.include_hook,
                include_category = body.include_category,
                freshness        = body.freshness,
            ):
                yield chunk
        except asyncio.CancelledError:
            log.info("SSE stream cancelled by client.")
            raise
        except Exception as e:
            import json as _json
            yield f"data: {_json.dumps({'type': 'post_error', 'post_index': -1, 'error': classify_error(e)})}\n\n"
            yield 'data: {"type": "batch_done"}\n\n'

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        }
    )

@app.post("/api/trending")
def get_trending(body: TrendingBody):
    if body.category not in TRENDING_QUERIES:
        raise HTTPException(status_code=400, detail=f"Unknown category. Valid: {list(TRENDING_QUERIES.keys())}")
    try:
        return {"topics": get_pipeline().get_trending(body.category, freshness=body.freshness),
                "category": body.category}
    except Exception as e: err(e)

@app.get("/api/trending/categories")
def trending_categories():
    return {"categories": list(TRENDING_QUERIES.keys())}

@app.get("/api/search-config")
def get_search_config():
    return load_search_config()

@app.post("/api/search-config")
def update_search_config(body: SearchConfigBody):
    cfg = load_search_config()
    if body.tavily:
        cfg["tavily"].update(body.tavily)
    if body.nvidia:
        cfg["nvidia"].update(body.nvidia)
    save_search_config(cfg)
    # Notify the pipeline to reload its cached config on next request
    if pipeline is not None:
        pipeline.reload_config()
    return {"status": "saved", "config": cfg}

@app.get("/api/output-config")
def get_output_config():
    cfg = load_search_config()
    return cfg.get("output", {
        "title_min_length": 50, "title_max_length": 100,
        "include_hook": False, "include_category": False,
        "include_9x16": False, "include_sources_block": True,
    })

@app.post("/api/output-config")
def save_output_config(body: OutputConfigBody):
    cfg = load_search_config()
    cfg["output"] = body.dict()
    save_search_config(cfg)
    return {"status": "saved"}

@app.get("/api/system-prompt")
def get_system_prompt():
    path = os.path.join(DOCS_DIR, "elite_mode_instruction.md")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"content": f.read(), "path": path}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="System prompt file not found.")

class SystemPromptBody(BaseModel):
    content: str

@app.post("/api/system-prompt")
def save_system_prompt(body: SystemPromptBody):
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Prompt content cannot be empty.")
    path = os.path.join(DOCS_DIR, "elite_mode_instruction.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(body.content)
    return {"status": "saved"}

@app.get("/api/persona-config")
def get_persona_config():
    cfg = load_search_config()
    return cfg.get("persona", {
        "persona": "journalist", "tone": "analytical",
        "platform_target": "instagram", "caption_length": "medium",
        "custom_instructions": ""
    })

@app.post("/api/persona-config")
def save_persona_config(body: PersonaConfigBody):
    cfg = load_search_config()
    cfg["persona"] = body.dict()
    save_search_config(cfg)
    return {"status": "saved"}

@app.get("/api/posts")
def get_posts():
    return {"posts": storage.get_posts()}

@app.delete("/api/posts/{post_id}")
def delete_post(post_id: str):
    if not storage.delete_post(post_id):
        raise HTTPException(status_code=404, detail=f"Post '{post_id}' not found.")
    return {"status": "deleted"}

@app.delete("/api/posts")
def clear_posts():
    storage.clear_posts()
    return {"status": "cleared"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
