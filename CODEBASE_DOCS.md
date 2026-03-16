# NVIDIA RAG App — Full Codebase Documentation

> **App Summary:** A full-stack **Electron desktop application** that combines NVIDIA AI (LLMs + Embeddings + Reranking), Tavily web search, and a Fabric.js design studio to let users research news, generate AI-powered Instagram posts, and design social media graphics — all from one native-feeling dark-mode app.

---

## Tech Stack at a Glance

| Layer | Technology |
|---|---|
| Desktop Shell | Electron 29 |
| Frontend UI | React 18 + Vite 5 + TailwindCSS 3 |
| Canvas Engine | Fabric.js 6 |
| Backend API | Python FastAPI + Uvicorn |
| AI / LLM | NVIDIA NIM (LangChain wrapper) |
| Web Search | Tavily Python SDK |
| Vector Store | FAISS (in-memory) |
| Persistence | JSON flat file (`data/posts.json`) + localStorage |

---

## Root Directory

```
nvidia_rag_app/
├── main.js                  ← Electron main process
├── preload.js               ← Electron preload script
├── index.html               ← HTML entry point (Vite injects bundle here)
├── vite.config.js           ← Vite bundler configuration
├── tailwind.config.js       ← Tailwind CSS configuration
├── postcss.config.js        ← PostCSS pipeline (autoprefixer etc.)
├── package.json             ← Node dependencies + npm scripts
├── package-lock.json        ← Locked dependency tree
├── backend/                 ← Python FastAPI backend
├── src/                     ← React frontend source
├── data/                    ← Runtime JSON data storage
├── docs/                    ← AI system prompt files
└── node_modules/            ← Installed Node packages
```

---

## Root-Level Files

### `main.js`
The **Electron main process** — the heart of the desktop app. Responsible for:
- Spawning the Python backend server as a child process using `spawn('python3', ['-m', 'uvicorn', 'api:app', ...])`.
- Creating the main `BrowserWindow` (1440×900, hidden title bar, dark background).
- In development, loads the Vite dev server (`http://localhost:5173`); in production, loads the built `dist/index.html`.
- Intercepts window-open events and opens links in the system browser instead of a new Electron window.
- Kills the Python backend when the app closes.
- **Notable:** Uses a hardcoded `setTimeout(createWindow, 2000)` — a 2-second blind sleep to let the backend start before the window appears.

### `preload.js`
A tiny Electron **preload script** that runs in the renderer's context before the page loads. Currently only exposes `window.api = { version: '1.0.0' }` via `contextBridge`. This is where you'd safely expose Electron IPC methods to the React frontend without enabling `nodeIntegration`.

### `index.html`
The single HTML shell page. Contains `<div id="root">` where React mounts, and a `<script>` tag pointing to `src/main.jsx` (injected by Vite at build time). Standard Vite SPA entry point.

### `vite.config.js`
Vite bundler config. Enables the React plugin, sets the base path to `./` (important for Electron's `loadFile`), sets the output directory to `dist/`, sets the dev server port to `5173`, and pre-bundles `fabric` in `optimizeDeps` for faster HMR startup.

### `tailwind.config.js`
Tailwind CSS configuration. Scans all files in `src/` for class usage to generate the final CSS bundle. The design system uses custom CSS variables (`--green`, `--bg`, `--bg2` etc.) which are bridged to Tailwind utilities via `index.css` overrides.

### `postcss.config.js`
Standard PostCSS pipeline config — enables `tailwindcss` and `autoprefixer` plugins for cross-browser CSS compatibility.

### `package.json`
Node.js project manifest. Key scripts:
- `dev` — runs Vite + Electron together via `concurrently`, waiting for the dev server before launching Electron.
- `build` — bundles React with Vite into `dist/`.
- `start` — builds then runs Electron directly (production mode).
Core dependencies include `react`, `react-router-dom`, `react-markdown`, `react-dropzone`, `lucide-react` (icons), and `fabric` (canvas engine).

---

## `backend/` — Python FastAPI Server

```
backend/
├── api.py               ← FastAPI app + all HTTP route handlers
├── rag.py               ← Core AI pipeline (search → embed → rerank → generate)
├── config.py            ← Environment variable loading (API keys, model names)
├── storage.py           ← JSON-based post persistence layer
├── requirements.txt     ← Python package dependencies
├── search_config.json   ← User-customisable Tavily + NVIDIA model config
└── .env                 ← API keys (NVIDIA_API_KEY, TAVILY_API_KEY)
```

### `backend/api.py`
The **FastAPI application** — defines all HTTP endpoints the React frontend calls. Key routes:

| Endpoint | Method | What it does |
|---|---|---|
| `/api/health` | GET | Returns backend status + which API keys are missing |
| `/api/test` | GET | Live connectivity test for Tavily, NVIDIA LLM, and embeddings |
| `/api/settings` | GET / POST | Read/write API keys to `.env` file |
| `/api/web-search` | POST | Full web RAG pipeline: search → embed → rerank → answer |
| `/api/doc/upload` | POST | Upload a PDF or TXT, chunk + embed it into a FAISS index |
| `/api/doc/ask` | POST | Ask a question against the loaded document's vector store |
| `/api/content/instagram` | POST | Full Instagram post generation pipeline (search + LLM) |
| `/api/content/batch` | POST | Generate multiple posts at once from trending topics |
| `/api/trending` | POST | Fetch trending news headlines for a given category |
| `/api/trending/categories` | GET | Returns list of available trending categories |
| `/api/search-config` | GET / POST | Read/write Tavily + model config to `search_config.json` |
| `/api/posts` | GET | Retrieve saved post history |
| `/api/posts/{post_id}` | DELETE | Delete a single saved post |
| `/api/posts` | DELETE | Clear all saved posts |

Also initialises a global `NvidiaRAG` pipeline instance at module level on startup and wires up CORS middleware (currently allows all origins with `*`).

### `backend/rag.py`
The **AI intelligence engine** — the most complex file in the project. Contains the `NvidiaRAG` class and all surrounding helpers:

- **`NvidiaRAG.__init__`** — Creates the LLM (`ChatNVIDIA`), embedder (`NVIDIAEmbeddings`), reranker (`NVIDIARerank`), Tavily client, and a `RecursiveCharacterTextSplitter` (800 token chunks, 100 overlap).
- **`_fetch_web_elite`** — Full Tavily v2 search with all advanced parameters: `search_depth`, `max_results`, `chunks_per_source`, `include_answer`, `start_date/end_date` (derived from freshness), `include_domains` whitelist. Falls back to no domain filter if the first request fails.
- **`_retrieve_and_rerank`** — Takes a FAISS store, retrieves top 8 docs by similarity, then uses NVIDIA reranker to compress and reorder them by relevance.
- **`load_pdf` / `load_txt`** — Parse a file, split into chunks, embed in batches of 48, store in a FAISS index.
- **`ask_doc`** — Answer a question from the loaded document's vector store using the rerank → LLM pipeline.
- **`web_search_ask`** — Fetch web results, embed on the fly, rerank, then generate an answer.
- **`generate_instagram`** — The full content generation flow: build a search query → fetch web results → build sourced context → load the system prompt from `docs/elite_mode_instruction.md` → call LLM → parse code blocks from output → clean highlight words.
- **`batch_generate`** — Fetches trending topics for a category and calls `generate_instagram` for each one sequentially (with a 1-second sleep between each to avoid rate limits).
- **`parse_code_blocks`** — Extracts structured fields (title, caption, hook_text, image prompts, etc.) from the LLM's markdown code-block output using regex.
- **`clean_highlight_words`** — Post-processes LLM-suggested highlight words: filters stopwords, only keeps words present in the title, scores by signal strength (numbers > long words), returns top 4–5.
- **`embed_in_batches`** — Embeds documents in batches of 48 to avoid hitting NVIDIA API payload limits.
- **`load_search_config` / `save_search_config`** — Read/write the `search_config.json` file with deep merge of defaults.
- **`retry`** — Generic retry wrapper with 3 attempts and 5-second delays, used for all external API calls.
- **`FRESHNESS_CONFIG`** — Controls how date restrictions are injected into prompts and queries (`today`, `2days`, `7days`, `any`).
- **`TRENDING_QUERIES`** — Templates for trending news searches across 6 categories (Geopolitics, AI & Tech, Finance, Crypto, Defense, Climate).

### `backend/config.py`
Loads environment variables from `.env` using `python-dotenv`. Exports `NVIDIA_API_KEY`, `TAVILY_API_KEY`, and the three hardcoded model names:
- `LLM_MODEL` → `meta/llama-3.3-70b-instruct`
- `EMBED_MODEL` → `nvidia/llama-3.2-nv-embedqa-1b-v2`
- `RERANK_MODEL` → `nvidia/llama-nemotron-rerank-1b-v2`

### `backend/storage.py`
A simple **flat-file post storage** layer backed by `data/posts.json`. Each post has an `id` (first 8 chars of a UUID), `topic`, `platform`, `content` dict, `sources` list, and `created_at` ISO timestamp. Reads and writes the entire JSON file on every operation — there is no in-memory cache or database. Functions: `save_post`, `get_posts`, `delete_post`, `clear_posts`.

### `backend/requirements.txt`
Python package dependencies:
`fastapi`, `uvicorn`, `langchain-nvidia-ai-endpoints`, `langchain`, `langchain-community`, `langchain-core`, `langchain-text-splitters`, `faiss-cpu`, `python-dotenv`, `numpy`, `tavily-python`, `pypdf`, `python-multipart`.

### `backend/search_config.json`
A user-editable JSON config file that persists Tavily search parameters (depth, max results, chunks per source, answer mode, time range, include/exclude domains) and NVIDIA model choices (LLM, embed, rerank models + max tokens + top-N rerank). Loaded and merged over hardcoded defaults at runtime. Modified via the Settings page.

### `backend/.env`
Stores the user's `NVIDIA_API_KEY` and `TAVILY_API_KEY`. Written by the `/api/settings` POST endpoint using `python-dotenv`'s `set_key`.

---

## `src/` — React Frontend

```
src/
├── main.jsx                 ← React entry point + appearance pre-loader
├── App.jsx                  ← Root layout: sidebar + page slot router
├── api.js                   ← Shared HTTP fetch wrapper (apiFetch, apiPost, apiDelete)
├── index.css                ← Global styles, CSS variables, Tailwind bridge classes
├── components/
│   ├── Sidebar.jsx          ← Left icon navigation bar
│   ├── PageShell.jsx        ← Standard page layout wrapper (title + scrollable content)
│   └── ui.jsx               ← Shared UI primitives (Card, Btn, Input, Badge, Label)
├── pages/
│   ├── WebSearch.jsx        ← Web search RAG page
│   ├── DocRAG.jsx           ← Document upload + Q&A page
│   ├── ContentGen.jsx       ← Instagram post generator page
│   ├── DesignStudio.jsx     ← Design canvas page (orchestrator)
│   ├── TemplateGallery.jsx  ← Template browser page
│   ├── PostHistory.jsx      ← Saved posts viewer page
│   └── Settings.jsx         ← App settings (5 tabs)
└── studio/
    ├── canvas/              ← Low-level canvas logic
    ├── components/          ← Studio-specific UI components
    ├── data/                ← Studio static data + storage
    ├── editor/              ← Studio editor panels
    └── icons/               ← Icon library component
```

---

## `src/` Core Files

### `src/main.jsx`
The React **entry point**. Before mounting the React tree, it runs `applyStoredAppearance()` which reads `localStorage.getItem('app_appearance')` and injects CSS custom properties (`--green`, `--bg`, etc.) directly onto `document.documentElement.style`. This eliminates the flash-of-wrong-colour on startup — the background colour is set before the first React render paints. Also contains a `hexToRgb` utility used by the appearance system.

### `src/App.jsx`
The **root layout component**. Manages app-level state:
- `page` — which of the 7 pages is active (custom router without `react-router-dom`).
- `backendStatus` — `'checking'` | `'ok'` | `'degraded'` | `'down'`, checked via `/api/health` on mount.
- `pendingTemplate` — template data passed from TemplateGallery → DesignStudio.
- `pendingContent` — AI-generated content passed from ContentGen → DesignStudio.
- `galleryRefreshKey` — counter incremented to force TemplateGallery to re-fetch without unmounting.

Uses a `PageSlot` render pattern: all 7 pages are always mounted but toggled via `display: block/none`. This preserves page state when navigating away, avoiding re-mount costs.

Shows a `BackendBanner` at the top if the backend is offline or missing API keys.

### `src/api.js`
The **shared HTTP client**. Exports three functions:
- `apiFetch(path, options)` — Generic wrapper. Always returns `{ data, error }` — never throws. Catches network errors and formats them as human-readable strings.
- `apiPost(path, body)` — Shorthand for JSON POST requests.
- `apiDelete(path)` — Shorthand for DELETE requests.

All requests target `http://127.0.0.1:8000` (the local FastAPI server).

### `src/index.css`
The **global stylesheet**. Key sections:
- Imports JetBrains Mono and Inter from Google Fonts.
- **Layout lock:** `html`, `body`, and `#root` are all `position: fixed` with `overflow: hidden` — the entire app behaves like a native window, not a webpage.
- **CSS Custom Properties (`:root`):** Single source of truth for all colours (`--bg`, `--bg2`, `--bg3`, `--border`, `--green`, `--green-rgb`, `--text`, etc.). Appearance settings mutate only these vars.
- **Tailwind ↔ CSS-var bridge:** Custom utility classes like `.bg-accent`, `.text-warm`, `.bg-elite-700` that override Tailwind's static values with live CSS vars, so the Design Studio's Tailwind-based components respond to theme changes.
- **Fabric.js textarea fix:** Prevents Fabric's injected text editing `<textarea>` from causing layout reflow.
- **Electron drag region** class for the titlebar.
- Keyframe animations: `spin`, `pulse`, `slideUp`.

---

## `src/components/`

### `src/components/Sidebar.jsx`
The **left icon navigation bar** (64px wide). Renders 7 icon buttons mapped from a static `items` array. The active page's button is highlighted with `var(--green-dim)` background. Shows a coloured status dot (green/amber/red) on the app logo based on `backendStatus`. Uses Lucide icons.

### `src/components/PageShell.jsx`
A **layout wrapper** used by most pages. Renders a fixed header bar with a `title` and optional `subtitle`, and a scrollable content area below it (`overflowY: auto`). Accepts `children` rendered into the scroll zone.

### `src/components/ui.jsx`
**Shared design system primitives** used across pages:
- `Card` — A standard dark card container with border-radius 12.
- `GreenCard` — An accent-tinted card (green dim background + green border), used for positive/result states.
- `Label` — A small uppercase label for form fields and section headings.
- `Btn` — A primary or secondary button. Handles `loading` state (shows "Working..."), `disabled` state, and two variants.
- `Input` — A styled text input field.
- `Badge` — A small status pill in green, amber, or red.

---

## `src/pages/`

### `src/pages/WebSearch.jsx`
The **Web Search RAG page**. A minimal interface: text input → sends POST to `/api/web-search` → displays the LLM answer in a GreenCard + source URLs in a Card below. Shows animated loading dots during the search (Searching → Embedding → Reranking → Generating). Error states render a red error box.

### `src/pages/DocRAG.jsx`
The **Document Q&A page**. Uses `react-dropzone` for drag-and-drop file upload (PDF or TXT only, max 1 file). Sends the file as `multipart/form-data` to `/api/doc/upload`, which chunks and embeds it. Once loaded, displays a confirmation banner with filename and chunk count. The Q&A input calls `/api/doc/ask`. Results show the answer + retrieved text chunks. Note: this file uses a local `const API = 'http://127.0.0.1:8000'` instead of importing from `api.js`.

### `src/pages/ContentGen.jsx`
The **Instagram post generator page** — the most feature-rich page in the app. Key capabilities:
- **Platform toggle** (Instagram active; Twitter, LinkedIn locked as "coming soon").
- **Mode toggle** — Single post vs. Batch generation.
- **Trending picker** — Fetches live trending headlines from `/api/trending` and lets users click one as the topic.
- **Single post flow** — User enters a topic, clicks "Forge", backend fetches news → LLM generates → results render in structured blocks (Title, Highlight Words, Hook, Caption, Image Prompts, Sources).
- **Progressive batch flow** — Fetches trending topics, then generates posts one by one sequentially, showing each result as it arrives with a progress bar. Has a "Stop" button to abort mid-batch.
- **"Send to Design Studio" button** — Passes the generated title, highlight words, and caption to `App.jsx`, which forwards them to `DesignStudio`.
- Reads output settings (9x16 format, hook text, category label, freshness) from `localStorage` on every render.
- `CopyBtn` components allow one-click copying of any text block.

### `src/pages/DesignStudio.jsx`
The **canvas editor orchestrator page**. Lays out the three-panel studio UI:
- Left panel (200px): `LayerPanel` — shows all objects on the canvas with drag-to-reorder.
- Center: `Toolbar` (top) + `DesignCanvas` (Fabric.js canvas) + `BottomToolbar` (zoom controls).
- Right panel (260px): `PropertiesPanel` — context-sensitive object property editor.
- `ContextMenu` — right-click menu.
- `GuideOverlay` — smart alignment guide lines drawn as SVG on top of the canvas.
- `InjectToast` — temporary green notification when AI content is applied.

Manages three `useEffect` hooks:
1. Loads a template from the gallery when `pendingTemplate` changes.
2. Polls `CSS var(--green)` every 500ms to sync the canvas accent colour with the app theme.
3. Applies AI-generated content (`title`, `highlight_words`, `caption`) to the canvas when `pendingContent` changes.

### `src/pages/TemplateGallery.jsx`
The **template browser**. Displays a responsive CSS grid of template cards (min 210px per card). Each card shows a thumbnail (or the `DefaultThumb` SVG placeholder), aspect ratio badge, platform label, template name, and creation time. On hover, overlays an "Open in Studio" button and a "Delete" button (with two-click confirmation). Includes filter chips (All / Instagram / YouTube / Other). Always includes a built-in "EM Classic" default template and a "New Template" placeholder card. Reloads when `refreshKey` prop changes (incremented after saving from Studio).

### `src/pages/PostHistory.jsx`
The **saved posts viewer**. Fetches all posts from `/api/posts` on mount. Renders each post as a collapsible `PostCard` showing date, platform badge, confidence level, post ID, and title. Expanded view shows hook text, caption, and image prompt with copy buttons. Individual delete and "Clear All" actions available.

### `src/pages/Settings.jsx`
The **settings page** — a fully self-contained sub-app with its own design tokens (`T` object, slate/violet palette independent of the main brand colours) and its own component library. Has 5 tabs rendered in a left nav sidebar:

- **General** — Live health status card showing backend status + active model names. "Run Tests" button that calls `/api/test` to check Tavily, LLM, and embeddings connectivity individually.
- **Search Engine** — Tavily API key field, search depth/results/chunks/answer mode/time-range chips, default freshness selector, include/exclude domain list managers.
- **AI Models** — NVIDIA API key field, LLM model selector (4 options), embeddings model selector (2 options), reranking model selector (1 option), max tokens selector.
- **Output** — Toggle switches for enabling 9×16 image prompts, hook text, and category label in generated posts.
- **Appearance** — 8 accent colour presets + custom hex colour picker, 5 background tone presets, and a live preview block. Changes apply instantly to all CSS custom properties via `applyAppearance()`.

Auto-saves the search config with an 800ms debounce whenever the `searchCfg` state changes.

---

## `src/studio/` — Design Studio Engine

```
studio/
├── canvas/
│   ├── constants.js         ← Canvas design tokens + custom Fabric property names
│   ├── defaults.js          ← Default canvas layout builder (EM Classic template)
│   ├── frames.js            ← Image frame / shape logic for the canvas
│   ├── snapping.js          ← Smart object snapping and alignment guide calculation
│   ├── clipboard.js         ← Copy/paste logic for canvas objects
│   └── icons-data.js        ← SVG path data for all built-in icons
├── components/
│   ├── FrameShapePreview.jsx ← SVG preview of available frame shapes
│   ├── GuideOverlay.jsx      ← SVG overlay rendering smart alignment guide lines
│   └── IconPreview.jsx       ← Renders a single SVG icon from the icon library
├── data/
│   ├── canvasSizes.js        ← Preset canvas dimension options (IG, YT, LinkedIn etc.)
│   ├── fonts.js              ← Google Fonts registry + dynamic font loader
│   └── templateStorage.js   ← Template save/load/delete via localStorage (or Electron IPC)
└── editor/
    ├── Canvas.jsx            ← Core Fabric.js canvas component (imperative handle via ref)
    ├── Toolbar.jsx           ← Top toolbar: add objects, canvas size picker, export, save
    ├── BottomToolbar.jsx     ← Bottom bar: tool selector (select/text/rect/circle/line/frame/icon), zoom controls
    ├── LayerPanel.jsx        ← Left panel: object list with visibility/lock toggles + drag reorder
    ├── PropertiesPanel.jsx   ← Right panel: font, colour, opacity, border, shadow controls
    └── ContextMenu.jsx       ← Right-click context menu (copy/paste/delete/flip/lock)
```

### `studio/canvas/constants.js`
Defines canvas-specific design tokens: `BG` (#111111), `TEXT_PRIMARY`, `TEXT_MUTED`, `SURFACE`. Exports `ELITE_CUSTOM_PROPS` — an array of custom property names serialised into every Fabric object (like `eliteType`, `eliteLabel`, `eliteFrameShape`, etc.) to support semantic object identification. Exports `getAccentColor()` which reads `--green` from the live CSS variables.

### `studio/canvas/defaults.js`
Builds the **default "EM Classic" canvas layout** programmatically using Fabric.js API calls (not a stored JSON). Creates image frame, title text, subtitle text, tag text, and accent line layers with proper typography and positioning for a 1080×1350 Instagram post template.

### `studio/canvas/frames.js`
Logic for creating and managing **image frame objects** on the canvas — rectangular frames that can display and clip an image inside them, supporting different frame shapes and fit modes (fill/fit/stretch).

### `studio/canvas/snapping.js`
Implements **smart snapping** — calculates guide lines and snap positions when dragging or resizing objects. Detects alignment with canvas edges, canvas centre, and edges/centres of other objects. Returns guide coordinates which are rendered by `GuideOverlay`.

### `studio/canvas/clipboard.js`
Handles **copy/paste** of Fabric objects on the canvas. Serialises selected objects to JSON and deserialises them as new offset duplicates.

### `studio/canvas/icons-data.js`
A static registry of SVG path data for all built-in icons available in the Design Studio's icon picker.

### `studio/components/GuideOverlay.jsx`
Renders an absolutely positioned `<svg>` over the canvas that draws the smart alignment guide lines (horizontal and vertical) as thin coloured lines. Also shows a position/size tooltip during drag operations.

### `studio/components/FrameShapePreview.jsx`
A small SVG component used in the Toolbar to show preview thumbnails of available frame shapes (rectangle, circle, rounded rectangle, etc.).

### `studio/components/IconPreview.jsx`
Renders an individual icon from `icons-data.js` as an inline SVG, used in the icon picker grid inside the Toolbar.

### `studio/data/canvasSizes.js`
A static array of named canvas dimension presets: Instagram Feed (1080×1350), Instagram Square (1080×1080), Instagram Story (1080×1920), YouTube Thumbnail (1280×720), X/Twitter Post (1200×675), LinkedIn Post (1200×627).

### `studio/data/fonts.js`
The **Google Fonts registry**. Defines `FONT_REGISTRY` — an array of ~45 font families across 5 categories (Sans Serif, Display, Serif, Monospace, Handwriting) with their available weights. `loadGoogleFont(family)` dynamically appends a `<link>` tag to the document head (with deduplication via a `Set`). `preloadPopularFonts()` pre-loads the 10 most common fonts when the Design Studio mounts.

### `studio/data/templateStorage.js`
**Template persistence** layer. Supports two backends:
1. **Electron IPC** (if `window.electronAPI.saveTemplate` is available — currently not wired up in `preload.js`).
2. **localStorage** (current actual storage) — templates are stored as JSON strings under the key `'elite_templates'`.

Functions: `saveTemplate`, `updateTemplate`, `getTemplates`, `deleteTemplate`, `generateThumbnail` (creates a base64 PNG thumbnail from the Fabric canvas at 300px width).

### `studio/editor/Canvas.jsx`
The **core Fabric.js canvas component** — the most complex file in the frontend. Uses `useImperativeHandle` to expose an imperative API to `DesignStudio` via a `ref`:
- `addText`, `addRect`, `addCircle`, `addLine`, `addFrame`, `addIcon`
- `importJSON`, `exportJSON`, `changeSize`, `resetToDefault`
- `setZoom`, `zoomToFit`, `getZoom`
- `undo`, `redo`, `canUndo`, `canRedo`
- `applyGeneratedContent` — Finds canvas objects by their `eliteType` property (`title`, `highlight_words`, `subtitle`, `tag`) and updates their text. Applies highlight coloring to specified words.
- `updateAccentColor` — Re-applies the accent colour to all accent-typed objects.
- `exportPNG` / `exportJPEG` — High-resolution canvas export.
- `getCanvas` — Returns the raw Fabric canvas instance.

Also handles: keyboard shortcuts (Delete, Ctrl+Z/Y/C/V/D/A/G), mouse events for snapping, history tracking (undo/redo stack), context menu trigger, object selection events, guide line calculation.

### `studio/editor/Toolbar.jsx`
The **top toolbar** of the Design Studio. Contains buttons for: adding shapes (rect, circle, text, line, frame, icon), canvas size picker (dropdown of `canvasSizes.js` presets), export menu (PNG/JPEG at different resolutions), undo/redo buttons, and template save/update. Calls the imperative canvas handle for all canvas operations.

### `studio/editor/BottomToolbar.jsx`
The **bottom toolbar**. Left side: tool mode buttons (Select, Text, Rectangle, Circle, Line, Frame, Icon). Right side: zoom controls (zoom out, zoom level display/input, zoom in, fit-to-screen). Zoom changes call `canvasRef.setZoom()`.

### `studio/editor/LayerPanel.jsx`
The **left layers panel**. Lists all Fabric objects on the canvas in z-order (top = front). Each row shows the object's `eliteLabel` (or type fallback), visibility toggle (eye icon), and lock toggle (lock icon). Objects can be reordered by drag-and-drop (changes z-index via Fabric's `bringToFront/sendToBack/bringForward/sendBackwards`). Clicking a layer row selects the object on the canvas.

### `studio/editor/PropertiesPanel.jsx`
The **right properties panel** — context-sensitive editor that shows different controls depending on what's selected:
- **Text objects**: font family picker (with live Google Font loading), font size, weight, alignment, line height, letter spacing, text colour, background colour.
- **Shape objects**: fill colour, stroke colour, stroke width, opacity.
- **All objects**: X/Y position, width/height, rotation, opacity, drop shadow controls (colour, offset, blur).
- **Image frames**: fit mode selector, image upload button.
When nothing is selected, shows canvas background colour and dimensions.

### `studio/editor/ContextMenu.jsx`
A floating **right-click context menu** that appears at the cursor position. Options: Copy, Paste, Duplicate, Delete, Bring Forward, Send Backward, Flip Horizontal, Flip Vertical, Lock/Unlock. Closes on any click outside.

---

## `data/`

### `data/posts.json`
The **flat-file database** for saved posts. An array of JSON objects, each representing one generated Instagram post. Written and read by `backend/storage.py`. Persists across app restarts. Stored in the project directory (not in a user data folder).

---

## `docs/`

### `docs/elite_mode_instruction.md`
The **system prompt** for the Instagram post generator. Contains the full "Elite Mode" instructions telling the LLM exactly how to format the output (code blocks for each field: title, caption, image prompts, etc.) and how to handle factual sourcing. Contains template placeholders that are filled at runtime by `rag.py`:
- `{DATE_RULE}` → Replaced with the freshness constraint text.
- `{HOOK_BLOCK}` → Replaced with hook instructions or a skip note.
- `{CATEGORY_BLOCK}` → Replaced with category instructions or a skip note.
- `{PORTRAIT_BLOCK}` → Replaced with 9×16 portrait prompt instructions or a skip note.

---

## Performance Analysis

### What's Working Well ✅

The codebase demonstrates several smart performance decisions:

- **PageSlot pattern** in `App.jsx` — All pages mount once and toggle `display: none/block` instead of mounting/unmounting, preserving scroll position and component state.
- **Batch embedding** — `embed_in_batches()` in `rag.py` splits documents into groups of 48 to avoid hitting API payload limits.
- **Auto-save debounce** — Settings.jsx uses `setTimeout(800ms)` before saving search config, preventing an API call on every keystroke.
- **Font deduplication** — `loadGoogleFont()` tracks loaded fonts in a `Set` to avoid duplicate `<link>` tags.
- **Optimistic UI updates** — TemplateGallery deletes immediately update state without waiting for a full reload. PostHistory deletes do the same.
- **Flash-of-wrong-colour prevention** — `applyStoredAppearance()` runs synchronously before the first React render.
- **Tavily fallback** — Domain filter failures automatically retry without the domain constraint rather than failing hard.
- **Progressive batch rendering** — Batch posts render one by one as they complete, giving instant feedback instead of waiting for all posts.

---




---

*Documentation generated: March 2026*
