# backend/CLAUDE.md — Python Backend Rules

## Stack

- **Framework:** FastAPI (async)
- **LLM:** `meta/llama-3.3-70b-instruct` via NVIDIA NIM
- **Embeddings:** `nvidia/llama-3.2-nv-embedqa-1b-v2`
- **Reranker:** `nvidia/llama-nemotron-rerank-1b-v2`
- **Vector store:** FAISS (in-memory, no persistence between sessions)
- **Search:** Tavily v2 (depth, domain filters, freshness, answer mode)

## Folder Structure

```
backend/
  api.py          FastAPI entry — all routes, startup, CORS
  rag.py          NvidiaRAG class — LangChain + FAISS pipeline
  config.py       Environment config (NVIDIA_API_KEY, TAVILY_API_KEY, etc.)
  storage.py      Post storage interface
  database.py     SQLite post database
  auth.py         OAuth helpers
  auth_db.py      Auth token/session database
  image_agent.py  Image quality validation (Playwright)
  dedup.py        Deduplication orchestrator
  dedup_store.py  Cluster storage for dedup
  dedup_gate1.py  Gate 1 — semantic similarity check
  dedup_gate2.py  Gate 2 — regex pattern check
  dedup_gate3.py  Gate 3 — cluster size limits
  data/           Runtime data (SQLite files, etc.) — gitignored
  .env            API keys — NEVER commit (gitignored)
  .env.example    Key names only — safe to commit
```

### Rules
- **New feature** → new file(s) in `backend/`, imported by `api.py`
- Never put API keys in code — always via `.env` and `config.py`
- All routes return consistent JSON: `{ "status": "ok", … }` or raise `HTTPException`
- SSE routes use `StreamingResponse` with `text/event-stream` content type

## Content Generation Prompt

System prompt lives in `docs/elite_mode_instruction.md` — loaded at runtime by `rag.py`. Edit that file to change LLM behavior, not the Python code.

## Storage

| Data | Location | Notes |
|------|----------|-------|
| Posts | SQLite via `database.py` | Persistent across sessions |
| Templates | Frontend `localStorage` | Never stored in backend |
| Appearance | Frontend `localStorage` | Never stored in backend |
| Search config | `backend/search_config.json` | Deep-merged over defaults, gitignored |
| Vector index | In-memory FAISS | Rebuilt each session from uploaded docs |

## Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env    # Fill in NVIDIA_API_KEY and TAVILY_API_KEY
python3 api.py          # Starts on http://127.0.0.1:8000
```

Health check: `GET /api/health` — returns missing keys if any are absent.
