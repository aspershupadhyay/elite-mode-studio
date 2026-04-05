# electron/CLAUDE.md — Electron Main Process Rules

## Why `electron/` is Separate from `src/`

`electron/` runs in **Node.js** (Electron main process). `src/` runs in the **browser renderer**.
They are different runtimes, different TypeScript configs, and different capabilities:

| | `electron/` | `src/` |
|--|--|--|
| Runtime | Node.js | Browser sandbox |
| TS config | `tsconfig.electron.json` (CommonJS) | `tsconfig.json` (ESM/bundler) |
| APIs | `fs`, `path`, Electron, Playwright | DOM, Fetch, React |
| Output | compiled `.js` next to `.ts` | bundled into `dist/` |

**Never import `electron/` code from `src/`, or vice versa.** They communicate only through IPC.

## Folder Structure

```
electron/
  browser/              Browser automation + image gen pipeline (Node.js)
    browser-controller.ts   Opens/controls ChatGPT BrowserWindow
    queue-manager.ts        Job queue — processes image gen requests serially
    image-downloader.ts     Downloads completed images from ChatGPT
    image-verifier.ts       Quality-checks downloaded images
    imageGenConfig.ts       Persists ChatGPT URL config to JSON
    prompt-injector.ts      Injects prompts into ChatGPT via webview
    webview-preload.js      Injected into every webview (content-script-like)

  auth-preload.js         Preload for the OAuth popup window

main.ts                   Electron app entry — window, IPC handlers, child process
preload.ts                IPC bridge — exposes `window.api.*` to renderer
```

### Rules
- **New Electron feature** → new subfolder under `electron/<feature>/`
- All source is `.ts` — compiled to `.js` by `npm run build:electron`
- Compiled `.js` files are gitignored — never edit them directly
- `webview-preload.js` and `auth-preload.js` are hand-written JS (no TS source) — they run inside sandboxed webviews with restricted access

## IPC Pattern

All IPC channel names and types live in `src/types/ipc.ts`. Import from there in `main.ts`.

```ts
// main.ts — handler
ipcMain.handle('image-gen:start', (_event, req: StartImageGenRequest) => { … })

// preload.ts — bridge
startImageGen: (req) => ipcRenderer.invoke('image-gen:start', req)

// src/ renderer — caller
const result = await window.api.startImageGen(req)
```

Never define channel strings inline — always use the type from `src/types/ipc.ts`.

## Build

```bash
npm run build:electron    # tsc -p tsconfig.electron.json
                          # Compiles: main.ts, preload.ts, electron/**/*.ts → .js
```

Compiled outputs are placed next to their source (`.ts` → `.js`, same directory). They are gitignored and regenerated on every build.
