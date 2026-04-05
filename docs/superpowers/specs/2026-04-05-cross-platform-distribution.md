# Cross-Platform Distribution — Design Spec
**Date:** 2026-04-05  
**Status:** Approved

## Goal

Ship Elite Minds Studio as a self-contained distributable to macOS, Windows, and Linux without requiring Python, pip, or any developer tooling on the end-user's machine. The distributed build must be clean — no personal API keys, no post history, no runtime data.

---

## Architecture Overview

```
git push --tags v*
  └── GitHub Actions
        ├── macOS runner   → PyInstaller (arm64+x64) → electron-builder → .dmg
        ├── Windows runner → PyInstaller (.exe dir)  → electron-builder → .exe (NSIS)
        └── Linux runner   → PyInstaller (x64 dir)   → electron-builder → .AppImage
              └── artifacts → GitHub Release (auto-published)
```

In production, the Electron main process spawns the PyInstaller binary directly. In dev mode, the existing `python3 -m uvicorn` flow is unchanged.

---

## Component 1 — PyInstaller Backend Entry Point

**New file:** `backend/server.py`

A thin launcher that calls `uvicorn.run()` programmatically. This is required because PyInstaller freezes an importable module — it cannot run `python -m uvicorn` as a subprocess command.

Responsibilities:
- Accept an optional `--env-file <path>` CLI argument (for production API key config)
- Load dotenv from that path before importing `api` (so NVIDIA_API_KEY etc. are set before FastAPI startup)
- Call `uvicorn.run("api:app", host="127.0.0.1", port=8000, log_level="warning")`
- Fix `sys._MEIPASS` path (PyInstaller's temp extraction dir) so `__file__`-relative lookups work

**New file:** `backend/backend.spec`

PyInstaller spec file (`--onedir` mode). Explicit `hiddenimports` for:
- `uvicorn.lifespan.on`, `uvicorn.protocols.http.h11_impl`, `uvicorn.protocols.http.httptools_impl`, `uvicorn.protocols.websockets.auto`, `uvicorn.protocols.websockets.wsproto_impl`, `uvicorn.protocols.websockets.websockets_impl`, `uvicorn.logging`, `uvicorn.loops.auto`, `uvicorn.loops.asyncio`
- `langchain_community.vectorstores.faiss`, `langchain_nvidia_ai_endpoints`
- `faiss`, `numpy`, `PIL`, `cv2`, `pypdf`, `playwright`
- `multipart`, `python_multipart`

Output: `backend/dist/api_server/` — a folder containing the binary + shared libs. The binary is named `api_server` (Unix) / `api_server.exe` (Windows).

`backend/dist/` is gitignored.

---

## Component 2 — main.ts Update

`startBackend()` in `main.ts` needs two changes:

**Binary path detection:**
```
isDev  → python3 -m uvicorn api:app (unchanged)
!isDev → {process.resourcesPath}/api_server/api_server  (Unix)
         {process.resourcesPath}/api_server/api_server.exe  (Windows)
```

**Config file argument:**
In production, append `--env-file {app.getPath('userData')}/elite-config.env` to the binary's args. This tells the backend where to read API keys from without hardcoding them.

**First-run detection:**
After spawning, if the config file does not exist, send an IPC event `setup:needed` to the renderer. The renderer then shows the SetupModal (Component 4).

---

## Component 3 — electron-builder Config (package.json)

**extraResources change:**  
Remove raw Python source. Add the PyInstaller binary folder and the runtime prompt doc:
```json
[
  { "from": "backend/dist/api_server", "to": "api_server" },
  { "from": "docs/elite_mode_instruction.md", "to": "elite_mode_instruction.md" }
]
```
`backend/server.py` must set `ELITE_INSTRUCTION_PATH` based on `sys._MEIPASS` in frozen mode, or fall back to the relative path in dev mode, so `rag.py` can load the prompt doc correctly on all platforms.

**New platform blocks:**

`win`:
- target: `nsis` (standard Windows setup installer)
- arch: `x64`
- icon: `build/icon.ico` — must be converted from existing `build/icon.png` (a build script step; `electron-builder` can do this automatically if `build/icon.png` is 512×512, which it is)

`linux`:
- target: `AppImage`
- arch: `x64`
- icon: `build/icon.png` (already exists at 512×512)

**New scripts:**
```json
"build:backend": "cd backend && pyinstaller backend.spec",
"dist:mac":   "npm run build && electron-builder --mac",
"dist:win":   "npm run build && electron-builder --win",
"dist:linux": "npm run build && electron-builder --linux"
```

---

## Component 4 — First-Run Setup Modal

**New file:** `src/pages/settings/SetupModal.tsx`

A full-screen overlay shown once on first launch when no config file is found. Collects:
- `NVIDIA_API_KEY` (required — links to NVIDIA NIM console)
- `TAVILY_API_KEY` (required — links to Tavily console)

On submit, calls IPC `setup:save-config` with the key/value pairs. Main process writes them to `{userData}/elite-config.env` in dotenv format. On success, the modal dismisses and the app resumes normal operation.

The modal is non-dismissable (no close button, no ESC) until both keys are provided. An "I'll do this later" link is shown that skips and lets the user use features not requiring the backend.

**IPC handler in main.ts:**
`ipcMain.handle('setup:save-config', (_, keys) => { write to userData/elite-config.env })` — uses `fs.writeFileSync` into `app.getPath('userData')`.

**IPC channel names** go into `src/types/ipc.ts` per the project contract.

---

## Component 5 — Profile Editability for Built-in Presets

**Current behavior:** `saveProfile()` returns early if `profile.isPreset = true`. Presets cannot be edited or deleted.  
**New behavior:** Presets cannot be deleted, but their fields can be overridden. Delete remains blocked.

**Implementation — `profileStorage.ts`:**
- Add a separate localStorage key `elite_preset_overrides` — a `Record<id, Partial<Profile>>` map
- `getProfiles()` merges overrides onto presets at read time: `{ ...preset, ...overrides[preset.id] }`
- `saveProfile()`: if `profile.isPreset`, save only the diff (changed fields) to `elite_preset_overrides[profile.id]`, not to `elite_profiles`
- `deleteProfile()`: unchanged — still blocked for presets

**In ProfilesTab.tsx:**
- Remove the disabled/locked styling from preset profile fields
- Remove the "cannot edit preset — duplicate it first" guard text (if present)
- The delete button remains hidden/disabled for presets

This means a user who edits "Elite Mode" is saving a personal override on top of the preset, and the next app update can still update the preset's base values without losing the user's customizations.

---

## Component 6 — Data Hygiene

The following must never appear in the distributed build:

| Data | How excluded |
|------|-------------|
| `backend/.env` | Already filtered in `extraResources` (`!.env`) |
| `backend/data/*.sqlite` | Already filtered (`!data/**`) |
| `backend/search_config.json` | Already filtered (`!search_config.json`) |
| `backend/venv/` or `.venv/` | Already filtered |
| Python source (`*.py`) | Excluded by removing `backend/**` from extraResources entirely |
| `__pycache__/` | Not included (only binary goes in) |

**Runtime data location in production:**

All mutable data moves to `app.getPath('userData')`:

| Data | Key / File |
|------|-----------|
| API keys | `elite-config.env` |
| Posts (SQLite) | `elite-minds.db` (backend must accept `--db-path` arg) |
| localStorage profiles/templates | Electron's own userData (already OS-native, no change needed) |

The SQLite db path change requires `backend/server.py` to accept `--db-path` and `backend/database.py` to use it instead of a hardcoded relative path.

---

## Component 7 — GitHub Actions Release Workflow

**New file:** `.github/workflows/release.yml`

Trigger: `push` on tags matching `v*.*.*`

Three parallel jobs:

| Job | Runner | PyInstaller target | electron-builder flag | Artifact |
|-----|--------|--------------------|-----------------------|---------|
| `release-mac` | `macos-14` | `darwin` arm64 | `--mac` | `.dmg` |
| `release-win` | `windows-latest` | `win32` x64 | `--win` | `.exe` |
| `release-linux` | `ubuntu-22.04` | `linux` x64 | `--linux` | `.AppImage` |

Each job steps:
1. `actions/checkout`
2. `actions/setup-python@v5` (3.11)
3. `pip install pyinstaller && pip install -r backend/requirements.txt`
4. `pyinstaller backend/backend.spec` (from `backend/` dir)
5. `actions/setup-node@v4` (Node 20)
6. `npm ci`
7. `npm run build` (Vite)
8. `electron-builder --{platform}` (no publish flag — upload manually or via release action)
9. `actions/upload-release-asset` — attach to the GitHub Release created by the tag push

No secrets baked into the binary. The `GITHUB_TOKEN` secret (auto-provided by Actions) is used only to attach release assets.

---

## Build Order (Local Mac Dev)

```bash
# 1. Install PyInstaller once
pip install pyinstaller

# 2. Build backend binary
cd backend && pyinstaller backend.spec && cd ..

# 3. Build and package
npm run dist:mac
```

For CI, steps 1–3 run automatically on tag push.

---

## What Stays the Same

- Dev mode (`npm run dev`) — completely unchanged, still uses `python3`
- All frontend features, canvas, profiles, templates — no behavioral changes
- `backend/CLAUDE.md`, `src/CLAUDE.md` folder structure rules — unchanged
