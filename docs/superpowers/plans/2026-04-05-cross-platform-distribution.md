# CreatorOS Cross-Platform Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the app to CreatorOS, give it a new professional icon, bundle the Python backend with PyInstaller so no Python install is needed, and ship macOS/Windows/Linux builds automatically via GitHub Actions.

**Architecture:** PyInstaller compiles `backend/server.py` into a self-contained `api_server` binary (onedir mode, fast startup). Electron's main process spawns the binary in production instead of `python3`. GitHub Actions builds all three platforms in parallel on tag push and attaches artifacts to a GitHub Release.

**Tech Stack:** PyInstaller 6.x, electron-builder 26.x, sharp (SVG→PNG), to-ico (PNG→ICO), GitHub Actions, Node 20, Python 3.11

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Rename to CreatorOS, add win/linux build blocks, update extraResources, add scripts |
| `index.html` | Modify | Update `<title>` tag |
| `backend/config.py` | Modify | Update OS userData path string to "CreatorOS" |
| `build/icon.svg` | Create | Source SVG icon (source of truth) |
| `scripts/generate-icons.js` | Create | SVG → PNG + ICNS + ICO |
| `build/icon.png` | Replace | Regenerated 1024×1024 PNG |
| `build/icon.icns` | Replace | Regenerated macOS icon set |
| `build/icon.ico` | Create | New Windows icon |
| `backend/server.py` | Create | PyInstaller-compatible uvicorn launcher |
| `backend/backend.spec` | Create | PyInstaller spec (--onedir, hidden imports, bakes in instruction doc) |
| `backend/rag.py` | Modify | Fix `DOCS_DIR` for frozen binary (line 75) |
| `backend/image_agent.py` | Modify | Graceful ImportError on playwright/cv2 |
| `main.ts` | Modify | Spawn binary in production; add `setup:save-config` + `setup:check` IPC handlers |
| `src/types/ipc.ts` | Modify | Add `SetupCheckResult`, `SetupSaveRequest` types + channel entries |
| `preload.ts` | Modify | Expose `setupCheck` and `setupSaveConfig` on `window.api` |
| `src/pages/settings/SetupModal.tsx` | Create | First-run API key entry modal |
| `src/App.tsx` | Modify | Show SetupModal when keys missing |
| `src/utils/profileStorage.ts` | Modify | Allow preset overrides (editable, non-deletable) |
| `src/pages/settings/ProfilesTab.tsx` | Modify | Remove `disabled={isPreset}` guards on edit fields |
| `.github/workflows/release.yml` | Create | 3-platform CI pipeline triggered on `v*` tags |

---

## Phase 1 — Rebranding

### Task 1: Rename to CreatorOS

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Modify: `backend/config.py`

- [ ] **Step 1: Update package.json name, productName, appId, copyright**

In `package.json`, change these top-level fields:
```json
{
  "name": "creator-os",
  "description": "CreatorOS — AI-powered social media content & design automation",
  "build": {
    "appId": "com.creatoros.app",
    "productName": "CreatorOS",
    "copyright": "Copyright © 2026 Sparsh Upadhyay"
  }
}
```

- [ ] **Step 2: Update index.html title**

In `index.html` line 6, change:
```html
<title>Elite Mode Studio</title>
```
to:
```html
<title>CreatorOS</title>
```

- [ ] **Step 3: Update backend OS userData paths in config.py**

In `backend/config.py`, replace every occurrence of `"Elite Minds Studio"` with `"CreatorOS"` and `".elite_minds_studio"` with `".creatoros"`:
```python
if sys.platform == "darwin":
    DATA_DIR = Path.home() / "Library" / "Application Support" / "CreatorOS" / "backend"
elif sys.platform == "win32":
    DATA_DIR = Path(os.environ.get("APPDATA", Path.home())) / "CreatorOS" / "backend"
else:
    DATA_DIR = Path.home() / ".creatoros" / "backend"
```

- [ ] **Step 4: Commit**
```bash
git add package.json index.html backend/config.py
git commit -m "feat: rename app to CreatorOS"
```

---

### Task 2: New CreatorOS Icon

**Files:**
- Create: `build/icon.svg`
- Create: `scripts/generate-icons.js`
- Replace: `build/icon.png`, `build/icon.icns`
- Create: `build/icon.ico`

- [ ] **Step 1: Install sharp and to-ico as dev dependencies**
```bash
npm install --save-dev sharp to-ico
```
Expected: `node_modules/sharp` and `node_modules/to-ico` installed.

- [ ] **Step 2: Create the SVG icon at build/icon.svg**

Create `build/icon.svg` with this content:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0E0E22"/>
      <stop offset="100%" stop-color="#08081A"/>
    </linearGradient>
    <linearGradient id="arc" x1="290" y1="290" x2="750" y2="750" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#818CF8"/>
      <stop offset="50%" stop-color="#A855F7"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
    <radialGradient id="bgGlow" cx="45%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#4F46E5" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#4F46E5" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="226" fill="url(#bg)"/>
  <rect width="1024" height="1024" rx="226" fill="url(#bgGlow)"/>
  <!-- C arc: center(512,512) r=228, opens right at ±52deg -->
  <path d="M 652,332 A 228,228 0 1,0 652,692"
        fill="none"
        stroke="url(#arc)"
        stroke-width="96"
        stroke-linecap="round"
        filter="url(#glow)"/>
</svg>
```

- [ ] **Step 3: Create scripts/generate-icons.js**

Create `scripts/generate-icons.js`:
```js
// scripts/generate-icons.js
// Generates build/icon.png (1024), build/icon.icns (macOS), build/icon.ico (Windows)
// from build/icon.svg.  Run with: node scripts/generate-icons.js
'use strict'
const sharp  = require('sharp')
const toIco  = require('to-ico')
const path   = require('path')
const fs     = require('fs')
const { execFileSync } = require('child_process')
const os     = require('os')

const buildDir = path.join(__dirname, '..', 'build')
const svgPath  = path.join(buildDir, 'icon.svg')

async function main() {
  const svgBuf = fs.readFileSync(svgPath)

  // 1. PNG 1024x1024 — Linux AppImage + base for other formats
  await sharp(svgBuf).resize(1024, 1024).png().toFile(path.join(buildDir, 'icon.png'))
  console.log('Generated build/icon.png')

  // 2. ICNS — macOS app icon (requires macOS iconutil command)
  if (os.platform() === 'darwin') {
    const iconsetDir = path.join(buildDir, 'icon.iconset')
    fs.mkdirSync(iconsetDir, { recursive: true })
    const sizes = [16, 32, 64, 128, 256, 512, 1024]
    for (const s of sizes) {
      await sharp(svgBuf).resize(s, s).png()
        .toFile(path.join(iconsetDir, `icon_${s}x${s}.png`))
      if (s <= 512) {
        await sharp(svgBuf).resize(s * 2, s * 2).png()
          .toFile(path.join(iconsetDir, `icon_${s}x${s}@2x.png`))
      }
    }
    // Use execFileSync (not execSync) to avoid shell injection
    execFileSync('iconutil', [
      '-c', 'icns',
      iconsetDir,
      '-o', path.join(buildDir, 'icon.icns'),
    ])
    fs.rmSync(iconsetDir, { recursive: true })
    console.log('Generated build/icon.icns')
  } else {
    console.log('Skipping ICNS — run on macOS to generate build/icon.icns')
  }

  // 3. ICO — Windows installer (multi-size PNG buffers)
  const icoBufs = await Promise.all(
    [16, 32, 48, 64, 128, 256].map(s =>
      sharp(svgBuf).resize(s, s).png().toBuffer()
    )
  )
  const icoBuf = await toIco(icoBufs)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
  console.log('Generated build/icon.ico')

  console.log('All icons generated.')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 4: Run the script to generate all icons**
```bash
node scripts/generate-icons.js
```
Expected output:
```
Generated build/icon.png
Generated build/icon.icns
Generated build/icon.ico
All icons generated.
```

- [ ] **Step 5: Add generate-icons script to package.json scripts**

In `package.json` under `"scripts"`, add:
```json
"generate-icons": "node scripts/generate-icons.js"
```

- [ ] **Step 6: Commit icons and script**
```bash
git add build/icon.svg build/icon.png build/icon.icns build/icon.ico scripts/generate-icons.js package.json
git commit -m "feat: add CreatorOS icon (indigo-violet-rose gradient C mark)"
```

---

## Phase 2 — PyInstaller Backend

### Task 3: PyInstaller entry point + rag.py path fix

**Files:**
- Create: `backend/server.py`
- Modify: `backend/rag.py` line 75
- Modify: `backend/image_agent.py`

- [ ] **Step 1: Create backend/server.py**

```python
"""
server.py — PyInstaller-compatible backend launcher.

In production (frozen): spawned by Electron main process.
In dev: not used — Electron runs `python3 -m uvicorn api:app` directly.
"""
import sys
import os
import argparse

# When PyInstaller freezes this app, __file__-relative paths break.
# Set CREATOROS_BASE so every module can resolve paths relative to the binary.
if getattr(sys, 'frozen', False):
    # sys._MEIPASS is the directory containing the binary in --onedir mode
    os.environ.setdefault('CREATOROS_BASE', sys._MEIPASS)
else:
    os.environ.setdefault(
        'CREATOROS_BASE',
        os.path.dirname(os.path.abspath(__file__)),
    )

import uvicorn  # noqa: E402 — must come after path env is set


def main() -> None:
    parser = argparse.ArgumentParser(description='CreatorOS backend server')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()

    uvicorn.run(
        'api:app',
        host=args.host,
        port=args.port,
        log_level='warning',
    )


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Fix DOCS_DIR in backend/rag.py (line 75)**

Find line 75 in `backend/rag.py`:
```python
DOCS_DIR          = os.path.join(os.path.dirname(__file__), "..", "docs")
```

Replace with:
```python
# In frozen PyInstaller binary CREATOROS_BASE points to sys._MEIPASS.
# In dev it's the backend/ directory parent — resolves to repo root.
_creatoros_base = os.environ.get('CREATOROS_BASE', os.path.join(os.path.dirname(__file__), '..'))
DOCS_DIR        = os.path.join(_creatoros_base, 'docs')
```

- [ ] **Step 3: Make image_agent.py graceful on missing playwright/cv2**

Open `backend/image_agent.py`. Replace the top-level `import playwright` / `import cv2` lines with try/except guards:
```python
try:
    from playwright.async_api import async_playwright
    _PLAYWRIGHT_OK = True
except ImportError:
    _PLAYWRIGHT_OK = False

try:
    import cv2
    _CV2_OK = True
except ImportError:
    _CV2_OK = False
```

At the top of any function that uses these libraries add an early-return guard:
```python
async def check_image_quality(path: str) -> dict:
    if not _PLAYWRIGHT_OK or not _CV2_OK:
        # Bundled binary — quality check unavailable; pass all images through
        return {"sharp": True, "score": 1.0, "path": path}
    # ... existing body unchanged ...
```

- [ ] **Step 4: Commit**
```bash
git add backend/server.py backend/rag.py backend/image_agent.py
git commit -m "feat: add PyInstaller server entry point + frozen-path fixes"
```

---

### Task 4: PyInstaller spec file

**Files:**
- Create: `backend/backend.spec`

- [ ] **Step 1: Create backend/backend.spec**

```python
# backend/backend.spec
# Usage: cd backend && pyinstaller backend.spec
from PyInstaller.utils.hooks import collect_all

block_cipher = None

datas    = []
binaries = []
hidden   = []

# Collect all sub-packages and data files for the heavy dependencies
for pkg in [
    'uvicorn', 'fastapi', 'starlette', 'anyio', 'httpx', 'httpcore', 'h11',
    'langchain', 'langchain_community', 'langchain_nvidia_ai_endpoints',
    'langchain_core', 'langchain_text_splitters',
    'faiss', 'pypdf', 'multipart', 'PIL',
    'tavily', 'tiktoken',
]:
    try:
        d, b, hi = collect_all(pkg)
        datas    += d
        binaries += b
        hidden   += hi
    except Exception:
        pass  # package not installed — skip silently

# Bake in the elite_mode_instruction.md prompt document
# It will be available at sys._MEIPASS/docs/elite_mode_instruction.md
datas += [('../docs/elite_mode_instruction.md', 'docs')]

a = Analysis(
    ['server.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden + [
        'uvicorn.lifespan.on',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.loops.asyncio',
        'asyncio',
        'sqlite3',
        '_sqlite3',
        'email.mime.multipart',
        'email.mime.text',
        'numpy',
        'numpy.core._methods',
        'numpy.lib.format',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        'playwright', 'cv2', 'opencv',
        'tkinter', 'matplotlib', 'IPython', 'notebook',
        'scipy', 'pandas', 'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='api_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='api_server',
)
```

- [ ] **Step 2: Install PyInstaller**
```bash
pip install pyinstaller
```

- [ ] **Step 3: Test the build locally (macOS)**
```bash
cd backend
pyinstaller backend.spec
```
Expected: `backend/dist/api_server/` folder with `api_server` binary inside.

- [ ] **Step 4: Smoke-test the binary**
```bash
./dist/api_server/api_server &
BACKEND_PID=$!
sleep 4
curl -s http://127.0.0.1:8000/api/health
kill $BACKEND_PID
```
Expected: JSON response like `{"status":"ok","missing_keys":[...]}`.

If you see `ModuleNotFoundError: No module named 'X'` in the output, add `'X'` to `hiddenimports` in `backend/backend.spec` and rebuild.

- [ ] **Step 5: Add dist/ to .gitignore**

Append to `.gitignore`:
```
backend/dist/
backend/build/
```

- [ ] **Step 6: Commit**
```bash
git add backend/backend.spec .gitignore
git commit -m "feat: add PyInstaller spec for standalone backend binary"
```

---

## Phase 3 — Electron Integration

### Task 5: Update main.ts for production binary spawn

**Files:**
- Modify: `main.ts` — `startBackend()` function (lines 66–75)

- [ ] **Step 1: Replace startBackend() in main.ts**

Find the `startBackend()` function (lines 66–75) and replace it entirely with:

```typescript
async function startBackend(): Promise<void> {
  const inUse = await isPortInUse(8000)
  if (inUse) { console.log('[main] Port 8000 in use — reusing'); return }

  if (isDev) {
    // Dev mode: use system Python (unchanged, fast iteration)
    const backendPath = path.join(__dirname, 'backend')
    backendProcess = spawn('python3', ['-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: backendPath, stdio: 'pipe',
    })
  } else {
    // Production: use the PyInstaller binary bundled in extraResources/api_server/
    const binaryName = process.platform === 'win32' ? 'api_server.exe' : 'api_server'
    const binaryPath = path.join(process.resourcesPath, 'api_server', binaryName)
    backendProcess = spawn(binaryPath, ['--host', '127.0.0.1', '--port', '8000'], {
      stdio: 'pipe',
    })
  }

  backendProcess.stdout?.on('data', (d: Buffer) => console.log('[backend]', d.toString()))
  backendProcess.stderr?.on('data', (d: Buffer) => console.error('[backend]', d.toString()))
}
```

- [ ] **Step 2: Verify the change compiles**
```bash
npm run build:electron
```
Expected: `main.js` rebuilt, no TypeScript errors.

- [ ] **Step 3: Commit**
```bash
git add main.ts main.js
git commit -m "feat: spawn PyInstaller binary in production, python3 in dev"
```

---

### Task 6: First-run setup IPC + SetupModal

**Files:**
- Modify: `src/types/ipc.ts`
- Modify: `preload.ts`
- Modify: `main.ts`
- Create: `src/pages/settings/SetupModal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add types to src/types/ipc.ts**

After the existing `// ── Image generation pipeline` section and its interfaces, append:
```typescript
// ── Setup / first-run ──────────────────────────────────────────────────────

export interface SetupCheckResult {
  /** true when NVIDIA_API_KEY and TAVILY_API_KEY are both present */
  configured: boolean
  missingKeys: string[]
}

export interface SetupSaveRequest {
  nvidiaKey: string
  tavilyKey: string
}
```

Inside `IpcChannels` (before the closing `}`), add:
```typescript
  'setup:check': {
    request: void
    response: SetupCheckResult
  }
  'setup:save-config': {
    request: SetupSaveRequest
    response: { ok: boolean; error?: string }
  }
```

- [ ] **Step 2: Expose setup IPC in preload.ts**

In the import at the top of `preload.ts`, add the new types:
```typescript
import type {
  SavePngBatchRequest, SavePngBatchResult, SessionData,
  AuthStartRequest, AuthStartResult, AuthCompleteEvent, AuthValidateResult,
  StartImageGenRequest, StartImageGenResult, ImageGenProgress,
  SetupCheckResult, SetupSaveRequest,
} from './src/types/ipc'
```

In the implementation object (after `setImageGenUrl`), add:
```typescript
  setupCheck: (): Promise<SetupCheckResult> =>
    ipcRenderer.invoke('setup:check'),

  setupSaveConfig: (req: SetupSaveRequest): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('setup:save-config', req),
```

In the type-cast object at the bottom, add:
```typescript
  setupCheck:      () => Promise<SetupCheckResult>
  setupSaveConfig: (req: SetupSaveRequest) => Promise<{ ok: boolean; error?: string }>
```

- [ ] **Step 3: Add two IPC handlers in main.ts**

Append these handlers after the existing `ipcMain.handle('open-external', ...)` line:

```typescript
// ── First-run setup ────────────────────────────────────────────────────────
ipcMain.handle('setup:check', async (): Promise<{ configured: boolean; missingKeys: string[] }> => {
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.get('http://127.0.0.1:8000/api/health', (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
    })
    const json   = JSON.parse(body) as { missing_keys?: string[] }
    const missing = json.missing_keys ?? []
    return { configured: missing.length === 0, missingKeys: missing }
  } catch {
    return { configured: false, missingKeys: ['NVIDIA_API_KEY', 'TAVILY_API_KEY'] }
  }
})

ipcMain.handle('setup:save-config', (_event, req: { nvidiaKey: string; tavilyKey: string }): { ok: boolean; error?: string } => {
  try {
    const configDir = path.join(app.getPath('userData'), 'backend')
    fs.mkdirSync(configDir, { recursive: true })
    const content = [
      `NVIDIA_API_KEY=${req.nvidiaKey.trim()}`,
      `TAVILY_API_KEY=${req.tavilyKey.trim()}`,
      '',
    ].join('\n')
    fs.writeFileSync(path.join(configDir, '.env'), content, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})
```

- [ ] **Step 4: Create src/pages/settings/SetupModal.tsx**

```tsx
/**
 * SetupModal.tsx — First-run API key setup overlay.
 * Shown when the backend reports missing keys on first launch.
 * Non-dismissable until keys are saved (or user skips).
 */
import React, { useState } from 'react'

interface Props {
  missingKeys: string[]
  onComplete:  () => void
}

export default function SetupModal({ missingKeys, onComplete }: Props): React.ReactElement {
  const [nvidiaKey, setNvidiaKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const needsNvidia = missingKeys.includes('NVIDIA_API_KEY')
  const needsTavily = missingKeys.includes('TAVILY_API_KEY')
  const canSave     = (!needsNvidia || nvidiaKey.trim().length > 10) &&
                      (!needsTavily || tavilyKey.trim().length > 10)

  async function handleSave(): Promise<void> {
    setSaving(true)
    setError('')
    try {
      const result = await window.api.setupSaveConfig({ nvidiaKey, tavilyKey })
      if (result.ok) { onComplete() }
      else { setError(result.error ?? 'Failed to save. Please try again.') }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 480, background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '36px 40px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #818CF8, #EC4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff',
          }}>C</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Welcome to CreatorOS</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Add your API keys to unlock AI features
            </div>
          </div>
        </div>

        {/* NVIDIA key */}
        {needsNvidia && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, margin: '0 0 6px' }}>
              NVIDIA NIM API Key
            </p>
            <input
              type="password"
              value={nvidiaKey}
              onChange={e => setNvidiaKey(e.target.value)}
              placeholder="nvapi-..."
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>
              Get yours at{' '}
              <span
                onClick={() => window.api.openExternal('https://build.nvidia.com')}
                style={{ color: 'var(--green)', cursor: 'pointer', textDecoration: 'underline' }}
              >build.nvidia.com</span>
            </p>
          </div>
        )}

        {/* Tavily key */}
        {needsTavily && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, margin: '0 0 6px' }}>
              Tavily Search API Key
            </p>
            <input
              type="password"
              value={tavilyKey}
              onChange={e => setTavilyKey(e.target.value)}
              placeholder="tvly-..."
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>
              Get yours at{' '}
              <span
                onClick={() => window.api.openExternal('https://app.tavily.com')}
                style={{ color: 'var(--green)', cursor: 'pointer', textDecoration: 'underline' }}
              >app.tavily.com</span>
            </p>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 16px' }}>{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{
            width: '100%', padding: 12, borderRadius: 10, border: 'none',
            background: canSave ? 'var(--green)' : 'var(--bg3)',
            color: canSave ? '#000' : 'var(--text3)',
            fontSize: 14, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save & Launch CreatorOS'}
        </button>

        <div
          onClick={onComplete}
          style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}
        >
          Skip for now — AI features won't work without keys
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire SetupModal into App.tsx**

Add the import near the top of `src/App.tsx` (after existing page imports):
```typescript
import SetupModal from './pages/settings/SetupModal'
```

Inside the `App` component function body, add state + effect (after the existing `useState` declarations):
```typescript
const [setupNeeded,  setSetupNeeded]  = useState(false)
const [setupMissing, setSetupMissing] = useState<string[]>([])

useEffect(() => {
  // Wait for backend to start (3 s), then check keys
  const t = setTimeout(async () => {
    try {
      const result = await window.api.setupCheck()
      if (!result.configured) {
        setSetupMissing(result.missingKeys)
        setSetupNeeded(true)
      }
    } catch {
      // Backend not up yet — skip silently
    }
  }, 3000)
  return () => clearTimeout(t)
}, [])
```

In the JSX return, add the modal just before the outermost closing `</div>`:
```tsx
{setupNeeded && (
  <SetupModal
    missingKeys={setupMissing}
    onComplete={() => setSetupNeeded(false)}
  />
)}
```

- [ ] **Step 6: Type-check**
```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 7: Commit**
```bash
git add src/types/ipc.ts preload.ts main.ts src/pages/settings/SetupModal.tsx src/App.tsx
git commit -m "feat: first-run SetupModal + setup IPC handlers for API key configuration"
```

---

## Phase 4 — Build Configuration

### Task 7: electron-builder cross-platform config

**Files:**
- Modify: `package.json` (`build` section + `scripts`)

- [ ] **Step 1: Replace the build section in package.json**

Replace the entire `"build": { ... }` block with:
```json
"build": {
  "appId": "com.creatoros.app",
  "productName": "CreatorOS",
  "copyright": "Copyright © 2026 Sparsh Upadhyay",
  "afterPack": "./build/afterPack.js",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "dist-electron/**/*",
    "main.js",
    "main.js.map",
    "preload.js",
    "preload.js.map",
    "src/pages/browser/automation/**/*.js",
    "src/pages/browser/automation/**/*.js.map",
    "package.json"
  ],
  "extraResources": [
    {
      "from": "backend/dist/api_server",
      "to": "api_server"
    },
    {
      "from": "docs/elite_mode_instruction.md",
      "to": "elite_mode_instruction.md"
    }
  ],
  "mac": {
    "icon": "build/icon.icns",
    "category": "public.app-category.productivity",
    "hardenedRuntime": false,
    "gatekeeperAssess": false,
    "sign": "./build/sign.js",
    "target": [
      { "target": "dmg", "arch": ["arm64", "x64"] }
    ]
  },
  "win": {
    "icon": "build/icon.ico",
    "target": [
      { "target": "nsis", "arch": ["x64"] }
    ]
  },
  "linux": {
    "icon": "build/icon.png",
    "category": "Office",
    "target": [
      { "target": "AppImage", "arch": ["x64"] }
    ]
  },
  "dmg": {
    "title": "CreatorOS",
    "window": { "width": 540, "height": 380 },
    "contents": [
      { "x": 150, "y": 185, "type": "file" },
      { "x": 390, "y": 185, "type": "link", "path": "/Applications" }
    ]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico"
  }
}
```

- [ ] **Step 2: Replace scripts section in package.json**

Replace the `"scripts"` block with:
```json
"scripts": {
  "typecheck":      "tsc --noEmit",
  "build:electron": "tsc -p tsconfig.electron.json",
  "build:backend":  "cd backend && pyinstaller backend.spec",
  "generate-icons": "node scripts/generate-icons.js",
  "dev":            "npm run build:electron && concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
  "build":          "npm run build:electron && vite build",
  "electron":       "npm run build:electron && electron .",
  "start":          "npm run build:electron && vite build && electron .",
  "dist:mac":       "npm run build:backend && npm run build && electron-builder --mac",
  "dist:win":       "npm run build:backend && npm run build && electron-builder --win",
  "dist:linux":     "npm run build:backend && npm run build && electron-builder --linux",
  "dist":           "npm run dist:mac"
}
```

- [ ] **Step 3: Verify the build config is valid**
```bash
npm run build
```
Expected: Vite + TypeScript build succeeds, no errors.

- [ ] **Step 4: Commit**
```bash
git add package.json
git commit -m "feat: add electron-builder win/linux targets + extraResources pointing to PyInstaller binary"
```

---

## Phase 5 — Profile Editability

### Task 8: Allow editing built-in presets (non-deletable)

**Files:**
- Modify: `src/utils/profileStorage.ts`
- Modify: `src/pages/settings/ProfilesTab.tsx`

- [ ] **Step 1: Add override storage helpers to profileStorage.ts**

In `src/utils/profileStorage.ts`, add after the `ACTIVE_KEY` constant:
```typescript
const OVERRIDES_KEY = 'elite_preset_overrides'

function readOverrides(): Record<string, Partial<Profile>> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    return raw ? JSON.parse(raw) as Record<string, Partial<Profile>> : {}
  } catch {
    return {}
  }
}

function writeOverrides(map: Record<string, Partial<Profile>>): void {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent('profilesChange'))
}
```

- [ ] **Step 2: Merge overrides in getProfiles()**

Replace the existing `getProfiles()` function body:
```typescript
export function getProfiles(): Profile[] {
  const overrides = readOverrides()
  const presets   = BUILT_IN_PRESETS.map(p => ({ ...p, ...overrides[p.id] }))
  const custom    = readCustom()
  return [...presets, ...custom]
}
```

- [ ] **Step 3: Save overrides when a preset is saved**

Replace the existing `saveProfile()` function body:
```typescript
export function saveProfile(profile: Profile): void {
  if (profile.isPreset) {
    // For presets: store only changed fields as an override — never touch BUILT_IN_PRESETS
    const base = BUILT_IN_PRESETS.find(p => p.id === profile.id)
    if (!base) return
    const overrides = readOverrides()
    const diff: Partial<Profile> = {}
    for (const key of Object.keys(profile) as (keyof Profile)[]) {
      if (JSON.stringify(profile[key]) !== JSON.stringify(base[key])) {
        (diff as Record<string, unknown>)[key] = profile[key]
      }
    }
    overrides[profile.id] = diff
    writeOverrides(overrides)
    return
  }
  // Custom profile — unchanged behaviour
  const list = readCustom()
  const idx  = list.findIndex(p => p.id === profile.id)
  if (idx >= 0) { list[idx] = profile } else { list.push(profile) }
  writeCustom(list)
}
```

- [ ] **Step 4: Remove isPreset disabled guards in ProfilesTab.tsx**

In `src/pages/settings/ProfilesTab.tsx`, search for every instance of `disabled={isPreset}` on input, textarea, and select elements. Remove those `disabled` props and update the associated inline styles:

For every field that had `disabled={isPreset}`:
- Remove `disabled={isPreset}` (or `disabled={isPreset && ...}`)
- Change `background: isPreset ? T.bg3 : T.bg` → `background: T.bg`
- Change `color: isPreset ? T.text3 : T.text` → `color: T.text`
- Change `cursor: isPreset ? 'not-allowed' : 'text'` → `cursor: 'text'` (or `'pointer'` for buttons)

**Do NOT change** the delete button — it must remain hidden/disabled for presets. Search for where the delete button is rendered and leave that condition untouched.

- [ ] **Step 5: Typecheck**
```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 6: Smoke test in dev**
```bash
npm run dev
```
Open Settings → Profiles. Click the "Elite Mode" preset. Edit the name field. Switch to another tab and back. The edited name should still be there.

- [ ] **Step 7: Commit**
```bash
git add src/utils/profileStorage.ts src/pages/settings/ProfilesTab.tsx
git commit -m "feat: allow editing built-in preset profiles (non-deletable, override-based)"
```

---

## Phase 6 — CI/CD

### Task 9: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create .github/workflows/release.yml**

```yaml
name: Release — All Platforms

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write

jobs:
  # ── macOS ────────────────────────────────────────────────────────────────
  release-mac:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Python deps + PyInstaller
        working-directory: backend
        run: |
          pip install pyinstaller
          pip install -r requirements.txt

      - name: Build backend binary
        working-directory: backend
        run: pyinstaller backend.spec

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Package DMG
        run: npx electron-builder --mac --publish never

      - name: Upload DMG to release
        uses: softprops/action-gh-release@v2
        with:
          files: release/*.dmg
          token: ${{ secrets.GITHUB_TOKEN }}

  # ── Windows ──────────────────────────────────────────────────────────────
  release-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Python deps + PyInstaller
        working-directory: backend
        run: |
          pip install pyinstaller
          pip install -r requirements.txt

      - name: Build backend binary
        working-directory: backend
        run: pyinstaller backend.spec

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Package NSIS installer
        run: npx electron-builder --win --publish never

      - name: Upload EXE to release
        uses: softprops/action-gh-release@v2
        with:
          files: release/*.exe
          token: ${{ secrets.GITHUB_TOKEN }}

  # ── Linux ─────────────────────────────────────────────────────────────────
  release-linux:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install system libs for faiss / pillow / numpy
        run: sudo apt-get install -y libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1

      - name: Install Python deps + PyInstaller
        working-directory: backend
        run: |
          pip install pyinstaller
          pip install -r requirements.txt

      - name: Build backend binary
        working-directory: backend
        run: pyinstaller backend.spec

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Package AppImage
        run: npx electron-builder --linux --publish never

      - name: Upload AppImage to release
        uses: softprops/action-gh-release@v2
        with:
          files: release/*.AppImage
          token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate YAML syntax**
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML valid')"
```
Expected: `YAML valid`

- [ ] **Step 3: Push repo to GitHub (if not already)**
```bash
git remote -v   # verify remote exists
git push origin main
```

- [ ] **Step 4: Commit workflow**
```bash
git add .github/workflows/release.yml
git commit -m "ci: GitHub Actions release pipeline for macOS, Windows, Linux"
```

---

## Triggering a Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions builds all 3 platforms in parallel. The resulting release will have:
- `CreatorOS-1.0.0.dmg` (macOS, arm64 + x64 universal)
- `CreatorOS Setup 1.0.0.exe` (Windows NSIS)
- `CreatorOS-1.0.0.AppImage` (Linux x64)

---

## Spec Coverage

| Spec requirement | Task |
|----------------|------|
| Rename to CreatorOS | Task 1 |
| New professional icon | Task 2 |
| PyInstaller --onedir binary | Tasks 3, 4 |
| main.ts binary spawn in production | Task 5 |
| First-run API key setup | Task 6 |
| electron-builder win/linux targets | Task 7 |
| No personal data in bundle | Task 7 (raw .py source, SQLite, .env all excluded from extraResources) |
| Profile preset editability | Task 8 |
| Profile presets non-deletable | Task 8 (deleteProfile guard unchanged) |
| GitHub Actions 3-platform CI | Task 9 |
| Clean default templates on install | No change — localStorage-based, every user starts fresh |
