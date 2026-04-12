from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import tempfile, os, logging, asyncio
from rag import NvidiaRAG, TRENDING_QUERIES, FRESHNESS_CONFIG, classify_error, load_search_config, save_search_config, DOCS_DIR
from config import NVIDIA_API_KEY, TAVILY_API_KEY, LLM_MODEL, EMBED_MODEL, RERANK_MODEL, DATA_DIR
from dotenv import load_dotenv, set_key
import storage
import database
import auth
import auth_db
import time as _time
from fastapi import Header

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
    database.init_db()
    auth_db.init_auth_db()
    log.info("Database initialised.")

    # Guard: skip NvidiaRAG() entirely when keys aren't set yet.
    # Without this, TavilyClient raises mid-constructor leaving NVIDIA C-extension
    # objects (embedder/reranker) partially built; their GC cleanup SIGABRTs the
    # process (code=null), crashing the backend on every fresh install.
    _nvidia = os.environ.get("NVIDIA_API_KEY", "").strip()
    _tavily = os.environ.get("TAVILY_API_KEY", "").strip()
    if not _nvidia or not _tavily:
        log.warning("API keys not configured — running in keyless mode. Set keys in Settings.")
        pipeline = None
        return

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
    count: int = 3
    include_9x16: Optional[bool] = False
    include_hook: Optional[bool] = False
    include_category: Optional[bool] = False
    freshness: Optional[str] = "2days"

class TrendingBody(BaseModel):
    category: str
    freshness: Optional[str] = "2days"

class SettingsBody(BaseModel):
    nvidia_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None

class SearchConfigBody(BaseModel):
    tavily: Optional[dict] = None
    nvidia: Optional[dict] = None

class OutputFieldBody(BaseModel):
    """Single output field definition sent from the frontend profile."""
    id:      str
    label:   str
    type:    str             = "text"
    aiHint:  Optional[str]  = ""
    enabled: bool            = True

class GenerateBody(BaseModel):
    """Universal single-post generation request — fully profile-driven."""
    topic:               str
    system_prompt:       Optional[str]                 = ""
    output_fields:       Optional[List[OutputFieldBody]] = None
    tone:                Optional[str]                 = ""
    language:            Optional[str]                 = "en"
    post_count:          Optional[int]                 = 1
    search_enabled:      Optional[bool]                = True
    custom_instructions: Optional[str]                 = ""
    freshness:           Optional[str]                 = "2days"
    title_min_length:    Optional[int]                 = 60
    title_max_length:    Optional[int]                 = 110

class StreamBody(BaseModel):
    """Universal streaming batch request — fully profile-driven."""
    category:            str
    count:               int                            = 3
    topics:              Optional[List[str]]            = None
    system_prompt:       Optional[str]                 = ""
    output_fields:       Optional[List[OutputFieldBody]] = None
    tone:                Optional[str]                 = ""
    language:            Optional[str]                 = "en"
    search_enabled:      Optional[bool]                = True
    search_mode:         Optional[str]                 = "news"   # "news" | "general"
    custom_instructions: Optional[str]                 = ""
    freshness:           Optional[str]                 = "2days"
    title_min_length:    Optional[int]                 = 60
    title_max_length:    Optional[int]                 = 110

def err(e: Exception, status: int = 500):
    log.error("API error: %s", e)
    raise HTTPException(status_code=status, detail=classify_error(e))

@app.get("/api/health")
def health():
    # Read live from os.environ so this reflects keys saved after startup.
    nvidia = os.environ.get("NVIDIA_API_KEY", "")
    tavily = os.environ.get("TAVILY_API_KEY", "")
    missing = []
    if not nvidia or "your-key" in nvidia: missing.append("NVIDIA_API_KEY")
    if not tavily or "your-key" in tavily: missing.append("TAVILY_API_KEY")
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
    # Never return actual key values - only whether they are set
    return {
        "nvidia_api_key_set": bool(NVIDIA_API_KEY),
        "tavily_api_key_set": bool(TAVILY_API_KEY),
    }

@app.post("/api/settings")
def save_settings(body: SettingsBody):
    global pipeline
    env_path = str(DATA_DIR / ".env")
    if body.nvidia_api_key:
        set_key(env_path, "NVIDIA_API_KEY", body.nvidia_api_key)
    if body.tavily_api_key:
        set_key(env_path, "TAVILY_API_KEY", body.tavily_api_key)
    # Reload env vars so os.getenv picks up the new values immediately
    load_dotenv(env_path, override=True)
    # Reinitialize the pipeline so the new keys are used by all LangChain clients
    try:
        pipeline = NvidiaRAG()
        log.info("Pipeline reinitialized with updated API keys.")
    except Exception as e:
        log.error("Pipeline reinit failed after key update: %s", e)
        pipeline = None
        raise HTTPException(status_code=500, detail=f"Keys saved but pipeline failed to reinitialize: {e}")
    return {"status": "saved", "message": "Keys saved and pipeline reloaded — no restart needed."}

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

@app.post("/api/content/generate")
def generate_content(body: GenerateBody):
    """Profile-driven single post generation. Zero hardcoding."""
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")
    freshness = body.freshness or "2days"
    if freshness not in FRESHNESS_CONFIG:
        raise HTTPException(status_code=400, detail=f"Invalid freshness. Use: {list(FRESHNESS_CONFIG.keys())}")
    try:
        p = get_pipeline()
        fields = [f.dict() for f in (body.output_fields or [])]
        result = p.generate_content(
            topic               = body.topic,
            system_prompt       = body.system_prompt or "",
            output_fields       = fields,
            tone                = body.tone or "",
            language            = body.language or "en",
            post_count          = body.post_count or 1,
            search_enabled      = body.search_enabled if body.search_enabled is not None else True,
            custom_instructions = body.custom_instructions or "",
            freshness           = freshness,
            title_min_length    = body.title_min_length or 60,
            title_max_length    = body.title_max_length or 110,
        )
        post_id = storage.save_post(body.topic, "content", result["content"], result["sources"])
        result["post_id"] = post_id
        return result
    except Exception as e: err(e)


@app.post("/api/content/stream")
async def stream_content(body: StreamBody):
    """Profile-driven SSE streaming batch. Zero hardcoding."""
    freshness = body.freshness or "2days"
    if freshness not in FRESHNESS_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid freshness value.")
    p = get_pipeline()
    fields = [f.dict() for f in (body.output_fields or [])]
    # Inject profile fields onto pipeline instance for the batch (thread-safe per request)
    p._batch_output_fields       = fields if fields else None
    p._batch_system_prompt       = body.system_prompt or ""
    p._batch_tone                = body.tone or ""
    p._batch_custom_instructions = body.custom_instructions or ""
    p._batch_title_min_length    = body.title_min_length or 60
    p._batch_title_max_length    = body.title_max_length or 110
    p._batch_search_mode         = body.search_mode or "news"

    async def event_generator():
        try:
            async for chunk in p.stream_batch_generate(
                category            = body.category,
                count               = body.count,
                topics              = body.topics or None,
                freshness           = freshness,
                tone                = body.tone or "",
                custom_instructions = body.custom_instructions or "",
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
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


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
    if body.count < 1 or body.count < 1:
        raise HTTPException(status_code=400, detail="Count must be at least 1.")
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
    category:            str
    count:               int  = 3
    topics:              Optional[List[str]] = None  # custom topics bypass trending fetch
    include_9x16:        Optional[bool] = False
    include_hook:        Optional[bool] = False
    include_category:    Optional[bool] = False
    freshness:           Optional[str]  = "2days"
    persona:             Optional[str]  = "journalist"
    tone:                Optional[str]  = "analytical"
    platform_target:     Optional[str]  = "instagram"
    caption_length:      Optional[str]  = "medium"
    custom_instructions: Optional[str]  = ""
    title_min_length:    Optional[int]  = 50
    title_max_length:    Optional[int]  = 100

@app.post("/api/content/stream-batch")
async def stream_batch(body: StreamBatchBody):
    """
    SSE endpoint — streams N posts live as they are generated.
    Events: campaign_brief | post_started | web_fetched | post_chunk | post_completed | post_error | batch_done
    """
    if body.count < 1 or body.count < 1:
        raise HTTPException(status_code=400, detail="Count must be at least 1.")
    if body.freshness not in FRESHNESS_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid freshness value.")

    p = get_pipeline()

    async def event_generator():
        try:
            async for chunk in p.stream_batch_generate(
                category            = body.category,
                count               = body.count,
                topics              = body.topics or None,
                include_9x16        = body.include_9x16,
                include_hook        = body.include_hook,
                include_category    = body.include_category,
                freshness           = body.freshness,
                persona             = body.persona or "journalist",
                tone                = body.tone or "analytical",
                platform_target     = body.platform_target or "instagram",
                caption_length      = body.caption_length or "medium",
                custom_instructions = body.custom_instructions or "",
                title_min_length    = body.title_min_length or 50,
                title_max_length    = body.title_max_length or 100,
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
    return {"categories": sorted(TRENDING_QUERIES.keys())}

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

# ── Output schema routes ──────────────────────────────────────────────────────

class SchemaFieldBody(BaseModel):
    id: str
    label: str
    key: str
    instruction: str
    type: str
    enabled: bool

class OutputSchemaBody(BaseModel):
    name: str
    fields: List[SchemaFieldBody]
    platform: Optional[str] = "instagram"

@app.get("/api/output-schemas")
def list_output_schemas():
    return {"schemas": database.get_output_schemas()}

@app.get("/api/output-schemas/default")
def get_default_schema():
    schema = database.get_default_output_schema()
    if not schema:
        raise HTTPException(status_code=404, detail="No default output schema found.")
    return schema

@app.post("/api/output-schemas")
def create_output_schema(body: OutputSchemaBody):
    fields = [f.dict() for f in body.fields]
    if not any(f.get("key") == "title" for f in fields):
        raise HTTPException(status_code=400, detail="Schema must contain a 'title' field.")
    schema = database.save_output_schema(body.name, fields, body.platform or "instagram")
    return schema

@app.put("/api/output-schemas/{schema_id}")
def update_output_schema(schema_id: str, body: OutputSchemaBody):
    fields = [f.dict() for f in body.fields]
    # Guard: title must always be present and enabled — it is required for parsing
    if not any(f.get("key") == "title" for f in fields):
        raise HTTPException(status_code=400, detail="Schema must contain a 'title' field.")
    updated = database.update_output_schema(schema_id, body.name, fields, body.platform or "instagram")
    if not updated:
        raise HTTPException(status_code=404, detail=f"Schema '{schema_id}' not found.")
    return updated

@app.put("/api/output-schemas/{schema_id}/default")
def set_default_schema(schema_id: str):
    ok = database.set_default_output_schema(schema_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Schema '{schema_id}' not found.")
    return {"status": "ok", "default": schema_id}

@app.delete("/api/output-schemas/{schema_id}")
def delete_output_schema(schema_id: str):
    ok = database.delete_output_schema(schema_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Schema '{schema_id}' not found.")
    return {"status": "deleted"}

# ── Post routes ───────────────────────────────────────────────────────────────

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

@app.post("/api/check-image-quality")
def check_image_quality(body: dict):
    """Laplacian variance blur detection + dimension check.
    Returns sharp=True only if score > 100 AND shorter side >= 1000px."""
    tmp_path = body.get("tmp_path", "")
    if not tmp_path or not os.path.exists(tmp_path):
        raise HTTPException(status_code=400, detail="File not found")

    import cv2
    import numpy as np

    img = cv2.imread(tmp_path)
    if img is None:
        raise HTTPException(status_code=422, detail="Could not decode image")

    h, w = img.shape[:2]
    file_kb = os.path.getsize(tmp_path) // 1024
    gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    min_dim = min(w, h)

    # Both gates must pass: sharpness AND resolution
    sharp = score > 100.0 and min_dim >= 1000

    print(f"[quality] {os.path.basename(tmp_path)}: {w}x{h}px {file_kb}KB score={score:.1f} min_dim={min_dim} sharp={sharp}")

    return {
        "sharp": sharp,
        "score": score,
        "width": w,
        "height": h,
        "file_kb": file_kb,
        "path": tmp_path,
    }

@app.post("/api/posts/{post_id}/image")
def attach_post_image(post_id: str, body: dict):
    """Attach a downloaded tmp image to a post."""
    tmp_path = body.get("tmp_path", "")
    if not tmp_path or not os.path.exists(tmp_path):
        raise HTTPException(status_code=400, detail="Image file not found")
    # Copy to user data images dir
    images_dir = str(DATA_DIR / "images")
    os.makedirs(images_dir, exist_ok=True)
    ext = os.path.splitext(tmp_path)[1] or ".png"
    dest = os.path.join(images_dir, f"{post_id}{ext}")
    import shutil
    shutil.copy2(tmp_path, dest)
    # Update post record
    try:
        storage.attach_image(post_id, dest)
    except Exception:
        pass  # post may not exist in DB yet — image still saved
    return {"success": True, "image_path": dest}

# ══════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════════

# In-memory PKCE state store: state_token → { provider, code_verifier, ts }
_pkce_store: dict = {}
_PKCE_TTL = 600  # 10 minutes


def _clean_pkce() -> None:
    now = _time.time()
    for k in [k for k, v in _pkce_store.items() if now - v["ts"] > _PKCE_TTL]:
        del _pkce_store[k]


def _bearer(header: str) -> str:
    return header[7:].strip() if header.startswith("Bearer ") else header.strip()


class AuthCallbackBody(BaseModel):
    provider: str
    code: str
    state: str


class LogoutBody(BaseModel):
    token: str


@app.get("/api/auth/providers")
def get_configured_providers():
    """Return which providers have credentials configured in .env."""
    return {"providers": auth.configured_providers()}


@app.get("/api/auth/url")
def get_auth_url(provider: str):
    """Generate PKCE pair and return the provider authorization URL."""
    _clean_pkce()
    try:
        verifier, challenge = auth.generate_pkce_pair()
        state = auth.generate_state()
        _pkce_store[state] = {"provider": provider, "code_verifier": verifier, "ts": _time.time()}
        return {"url": auth.build_auth_url(provider, state, challenge), "state": state}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/callback")
async def auth_callback(body: AuthCallbackBody):
    """Validate state, exchange code, upsert user, issue session token."""
    _clean_pkce()
    entry = _pkce_store.pop(body.state, None)
    if not entry:
        raise HTTPException(status_code=400, detail="Invalid or expired state parameter.")
    if entry["provider"] != body.provider:
        raise HTTPException(status_code=400, detail="Provider mismatch.")
    try:
        profile = await auth.complete_oauth(body.provider, body.code, entry["code_verifier"])
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    user = auth_db.upsert_user(**profile)
    session = auth_db.create_session(user["id"])
    log.info("Login: %s via %s", user["email"], body.provider)
    return {"session_token": session["token"], "expires_at": session["expires_at"],
            "user": {k: user[k] for k in ("id", "email", "name", "avatar_url", "provider")}}


@app.get("/api/auth/me")
def auth_me(authorization: str = Header(default="")):
    row = auth_db.validate_session(_bearer(authorization))
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return {k: row[k] for k in ("id", "email", "name", "avatar_url", "provider")}


@app.post("/api/auth/logout")
def auth_logout(body: LogoutBody):
    auth_db.delete_session(body.token)
    return {"ok": True}


# ── Template routes ───────────────────────────────────────────────────────────

class CreateTemplateBody(BaseModel):
    name: str
    canvas_json: str
    thumbnail: Optional[str] = None
    width: Optional[int] = 1080
    height: Optional[int] = 1080
    slot_schema: Optional[dict] = None

class UpdateTemplateBody(BaseModel):
    name: Optional[str] = None
    canvas_json: Optional[str] = None
    thumbnail: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    slot_schema: Optional[dict] = None

@app.get("/api/templates")
def list_templates():
    return database.get_templates()

@app.post("/api/templates")
def create_template(body: CreateTemplateBody):
    tmpl_id = database.save_template(
        name=body.name,
        canvas_json=body.canvas_json,
        thumbnail=body.thumbnail,
        width=body.width or 1080,
        height=body.height or 1080,
        slot_schema=body.slot_schema,
    )
    tmpl = database.get_template(tmpl_id)
    if not tmpl:
        raise HTTPException(status_code=500, detail="Failed to retrieve created template.")
    return tmpl

@app.get("/api/templates/{template_id}")
def get_template(template_id: str):
    tmpl = database.get_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found.")
    return tmpl

@app.put("/api/templates/{template_id}")
def update_template(template_id: str, body: UpdateTemplateBody):
    kwargs = {k: v for k, v in body.dict().items() if v is not None}
    ok = database.update_template(template_id, **kwargs)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found.")
    return database.get_template(template_id)

@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str):
    ok = database.delete_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found.")
    return {"status": "deleted"}


# ── Skill routes ──────────────────────────────────────────────────────────────

class CreateSkillBody(BaseModel):
    name: str
    platform: Optional[str] = "instagram"
    template_id: Optional[str] = None
    output_schema: Optional[dict] = None
    ai_instructions: Optional[str] = None
    schedule_cron: Optional[str] = None

@app.get("/api/skills")
def list_skills():
    return database.get_skills()

@app.post("/api/skills")
def create_skill(body: CreateSkillBody):
    skill_id = database.save_skill(
        name=body.name,
        platform=body.platform or "instagram",
        template_id=body.template_id,
        output_schema=body.output_schema,
        ai_instructions=body.ai_instructions,
        schedule_cron=body.schedule_cron,
    )
    skills = database.get_skills()
    created = next((s for s in skills if s["id"] == skill_id), None)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to retrieve created skill.")
    return created

@app.delete("/api/skills/{skill_id}")
def delete_skill(skill_id: str):
    ok = database.delete_skill(skill_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found.")
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# MODEL / PROVIDER ROUTES
# ══════════════════════════════════════════════════════════════════════════════

from providers import PROVIDERS, FEATURES, get_provider_key
from model_registry import get_models, ALL_MODELS


@app.get("/api/providers")
def list_providers():
    """All providers with their settings schemas."""
    result = {}
    for pid, pdata in PROVIDERS.items():
        result[pid] = {
            "name":            pdata["name"],
            "env_key":         pdata.get("env_key"),
            "base_url":        pdata.get("base_url"),
            "client_type":     pdata.get("client_type"),
            "settings_schema": pdata.get("settings_schema", []),
            "key_set":         bool(get_provider_key(pid)),
        }
    return {"providers": result, "features": FEATURES}


@app.get("/api/providers/{provider}/models")
async def get_provider_models(provider: str):
    """
    Live model list for a provider (fetched from provider API + static fallback).
    Falls back gracefully if no key or provider doesn't support discovery.
    """
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    from model_discovery import discover_models
    api_key  = get_provider_key(provider)
    base_url = PROVIDERS[provider].get("base_url") or ""
    models   = await discover_models(provider, api_key, base_url)
    return {"provider": provider, "models": models, "count": len(models)}


@app.get("/api/models")
async def list_all_models(model_type: str = None, provider: str = None):
    """Static catalogue merged with live discovery for any provider with a key set."""
    from model_discovery import discover_all

    static = get_models(provider=provider or None, model_type=model_type or None)

    # Collect keys for providers that have one set
    keyed = {p: get_provider_key(p) for p in PROVIDERS if get_provider_key(p)}
    if keyed:
        try:
            live_map = await asyncio.wait_for(discover_all(keyed), timeout=6)
            seen = {m["id"] for m in static}
            for pid, live_models in live_map.items():
                if provider and pid != provider:
                    continue
                for m in live_models:
                    if m["id"] not in seen:
                        if not model_type or m.get("type") == model_type:
                            static.append(m)
                            seen.add(m["id"])
        except Exception as e:
            log.debug("Live discovery skipped: %s", e)

    return {"models": static, "count": len(static)}


class LLMFeatureConfigBody(BaseModel):
    feature:     str
    provider:    str
    model:       str
    temperature: Optional[float] = None
    max_tokens:  Optional[int]   = None
    top_p:       Optional[float] = None
    # Extended params — stored as-is in the config blob
    extra:       Optional[dict]  = None


@app.get("/api/llm-config")
def get_llm_config():
    """Per-feature LLM configs (provider, model, params)."""
    from providers import DEFAULT_PROVIDER, DEFAULT_MODEL
    cfg = load_search_config()
    features_cfg = cfg.get("llm_features", {})
    # Ensure every known feature has an entry
    for f in FEATURES:
        if f not in features_cfg:
            features_cfg[f] = {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL}
    return {"llm_features": features_cfg, "features": FEATURES}


@app.post("/api/llm-config")
def save_llm_config(body: LLMFeatureConfigBody):
    """Save model + params for one feature and hot-reload the pipeline LLM."""
    if body.feature not in FEATURES:
        raise HTTPException(status_code=400, detail=f"Unknown feature '{body.feature}'. Valid: {FEATURES}")
    if body.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {body.provider}")

    cfg = load_search_config()
    features_cfg = cfg.setdefault("llm_features", {})

    entry: dict = {"provider": body.provider, "model": body.model}
    if body.temperature is not None: entry["temperature"] = body.temperature
    if body.max_tokens  is not None: entry["max_tokens"]  = body.max_tokens
    if body.top_p       is not None: entry["top_p"]       = body.top_p
    if body.extra:                   entry.update(body.extra)

    features_cfg[body.feature] = entry
    save_search_config(cfg)

    if pipeline is not None:
        pipeline.reload_config()

    return {"status": "saved", "feature": body.feature,
            "provider": body.provider, "model": body.model}


class ProviderKeyBody(BaseModel):
    provider: str
    api_key:  str


@app.post("/api/provider-key")
def save_provider_key(body: ProviderKeyBody):
    """Persist an API key for a provider to .env and hot-reload."""
    if body.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {body.provider}")
    env_key = PROVIDERS[body.provider].get("env_key")
    if not env_key:
        raise HTTPException(status_code=400, detail=f"'{body.provider}' needs no API key.")
    env_path = str(DATA_DIR / ".env")
    set_key(env_path, env_key, body.api_key.strip())
    load_dotenv(env_path, override=True)
    if pipeline is not None:
        pipeline.reload_config()
    return {"status": "saved", "provider": body.provider}


@app.get("/api/provider-key/{provider}")
def check_provider_key(provider: str):
    """Check whether an API key is currently set for a provider."""
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    env_key  = PROVIDERS[provider].get("env_key")
    requires = bool(env_key)
    is_set   = bool(get_provider_key(provider)) if requires else True
    return {"provider": provider, "requires_key": requires, "key_set": is_set}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True,
                reload_dirs=[os.path.dirname(__file__)])
