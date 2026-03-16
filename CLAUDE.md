# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal
Social media post & carousel automation — single posts and multi-slide carousels using NVIDIA NIM LLMs, Tavily web search, and a Fabric.js Design Studio.

## Commands

### Development
```bash
# Start frontend + Electron (concurrently, auto-waits for backend)
npm run dev

# Start Python backend (separate terminal, required first)
cd backend && python3 api.py
```

### Build & Production
```bash
npm run build       # Bundle React → dist/
npm run start       # Build then launch Electron (production)
npm run electron    # Launch Electron directly (dev)
```

### Backend setup
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # Add NVIDIA_API_KEY and TAVILY_API_KEY
```

## Architecture

### Process Model
- **Electron main process** (`main.js`) spawns the Python FastAPI backend as a child process and manages the native window
- **Renderer process** is a Vite + React SPA served on port 5173
- **Backend** runs on `http://127.0.0.1:8000`; `wait-on` polls `/api/health` before opening the Electron window

### Frontend → Backend
- All HTTP calls go through `src/api.js` which exports `apiFetch()`, `apiPost()`, `apiDelete()`, and `apiStream()` (SSE)
- Returns `{ data, error }` pattern — never throws

### Page Routing
No `react-router-dom`. `App.jsx` uses a custom **PageSlot** pattern: all 7 pages mount once and toggle `display: block/none` to preserve state across navigation. Pages: WebSearch, DocRAG, ContentGen, ContentLab, DesignStudio, TemplateGallery, PostHistory, Settings.

### Design Studio (Fabric.js)
- `src/pages/DesignStudio.jsx` — orchestrator, owns all state
- `src/studio/editor/Canvas.jsx` — core Fabric.js canvas, exposed imperatively via `useImperativeHandle`
- Every canvas object has custom properties: `eliteType`, `eliteLabel`, `eliteFrameShape`
- `rulerGuides` state lives in DesignStudio, passed as prop to Canvas (snapping) and RulerGuides (rendering)
- `pan` state tracked via `onPanChange` callback from Canvas

### Content Generation Pipeline
1. User inputs topic → POST `/api/content/instagram` or `/api/content/stream-batch` (SSE)
2. Backend: Tavily web search → build context → load system prompt from `docs/elite_mode_instruction.md` → NVIDIA LLM generates structured markdown → parse fields (title, caption, image prompts, etc.)
3. "Send to Studio" → `DesignStudio.applyGeneratedContent()` applies to canvas

### SSE Streaming Events (batch generation)
`campaign_brief` → `post_started` → `web_fetched` → `post_chunk` → `post_completed` → `post_error` → `batch_done`

### Backend AI Stack
- **LLM:** `meta/llama-3.3-70b-instruct`
- **Embeddings:** `nvidia/llama-3.2-nv-embedqa-1b-v2`
- **Reranker:** `nvidia/llama-nemotron-rerank-1b-v2`
- FAISS vector store (in-memory, no persistence between sessions)
- Tavily v2 with advanced params (depth, domain filters, freshness, answer mode)

### Storage
- **Posts:** `data/posts.json` (flat file, no database)
- **Templates:** `localStorage` key `'elite_templates'`
- **Appearance:** `localStorage` key `'app_appearance'`
- **Search/AI config:** `backend/search_config.json` (JSON, deep-merged over defaults)

### Electron IPC
- `preload.js` exposes `window.api.savePngBatch()` for native file save dialogs
- `main.js` handles the IPC and child process management

### Theming
- CSS custom properties (`--bg`, `--green`, `--text`, etc.) in `index.css :root`
- 8 accent colour presets + 5 background tone presets, applied live to DOM
- `tailwind.config.js` extends with `elite` and `accent` colour tokens
