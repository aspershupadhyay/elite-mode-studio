# CLAUDE.md — Elite Mode Studio

Social media post & carousel automation using NVIDIA NIM LLMs, Tavily web search, and a Fabric.js Design Studio.

> Detailed rules live in directory-level CLAUDE.md files:
> - `src/CLAUDE.md` — frontend: React, TypeScript, folder structure, theming
> - `electron/CLAUDE.md` — Electron main process, IPC, browser automation
> - `backend/CLAUDE.md` — Python FastAPI, LLM, RAG, storage

---

## Commands

```bash
# Development (two terminals)
cd backend && python3 api.py          # Terminal 1 — start backend first
npm run dev                           # Terminal 2 — Electron + Vite

# Build
npm run build                         # Bundle React → dist/
npm run build:electron                # Recompile main.ts + preload.ts → .js
npm run start                         # Build then launch Electron (production)
```

## Process Model

Three separate processes — never mix their concerns:

| Process | Entry | Runtime | Role |
|---------|-------|---------|------|
| Electron main | `main.ts` → `main.js` | Node.js | Window management, IPC, spawns backend |
| Renderer | `src/main.tsx` | Browser (Vite/React) | All UI |
| Backend | `backend/api.py` | Python 3 | LLM, RAG, storage |

- Renderer ↔ Main: IPC via `preload.ts` (`window.api.*`)
- Renderer ↔ Backend: HTTP via `src/api.ts` (`apiFetch`, `apiPost`, `apiStream`)
- Main spawns backend as a child process on startup; `wait-on` polls `/api/health`

## IPC Contract

`src/types/ipc.ts` is the single source of truth for all IPC channel names and payload types. Both `main.ts` and renderer code must import from there. Never hardcode channel strings.
