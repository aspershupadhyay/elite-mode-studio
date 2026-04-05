# src/CLAUDE.md — Frontend Rules

## Folder Structure (MANDATORY)

Every feature gets its own folder under `src/pages/`. No flat files at the `pages/` root.

```
src/
  pages/
    auth/           Login.tsx
    browser/        WebSearch.tsx, ImageGenStatus.tsx, imageGenBridge.ts
    doc-rag/        DocRAG.tsx
    forge/          Forge.tsx, PostResultsList.tsx, BatchStream.tsx
    history/        PostHistory.tsx
    settings/       Settings.tsx + all tab files (AIConfigTab, SearchTab, …)
    studio/         DesignStudio.tsx
    templates/      TemplateGallery.tsx

  studio/           Fabric.js canvas subsystem (canvas/, editor/, components/, data/, icons/, text/)
  components/       Shared UI only: Sidebar, PageShell, PostCard, PostEditorModal, ui.tsx
  types/            All TypeScript types (api, canvas, domain, fabric-custom, ipc, store, profile, schema)
  utils/            Cross-feature utilities (profileStorage, schemaStorage, promptBuilder)
  design-system/    Centralized component library — import via `../design-system`
  api.ts            HTTP client (apiFetch, apiPost, apiDelete, apiStream)
  auth.ts           Auth state machine
  utils.ts          Shared pure utilities (hexToRgb, etc.)
  App.tsx           App shell + PageSlot router
  main.tsx          React entry point
```

### Rules
- **New feature** → new folder under `src/pages/<feature-name>/`
- **Shared component** (used by 2+ features) → `src/components/`
- **Shared type** → `src/types/`
- **Shared utility** → `src/utils/`
- Never add files directly to `src/pages/` root (no flat pages)
- Never create `src/lib/` — utilities belong in `src/utils/` or the feature folder

## Page Routing

No `react-router-dom`. `App.tsx` uses **PageSlot**: all pages mount once and toggle `display: block/none` to preserve state. Add new pages by:
1. Creating `src/pages/<feature>/<Page>.tsx`
2. Adding a `PageSlot` entry in `App.tsx`
3. Adding a nav item to `Sidebar.tsx`

## TypeScript

- All source files `.ts` / `.tsx` — never `.js` / `.jsx` in `src/`
- Path alias `@/` maps to `src/` (e.g. `@/types/domain`, `@/utils/profileStorage`)
- Use `@/` for cross-feature imports; use relative paths within the same feature folder
- `tsconfig.json`: `"moduleResolution": "bundler"`, strict, `"noEmit": true`
- Fabric custom props (`eliteType`, `eliteLabel`, `eliteFrameShape`) typed via `declare module 'fabric'` in `src/types/fabric-custom.ts`

## Design Studio (Fabric.js)

- `src/pages/studio/DesignStudio.tsx` — orchestrator, owns all canvas state
- `src/studio/editor/Canvas.tsx` — core Fabric.js canvas, exposed via `useImperativeHandle`
- Canvas logic split into `src/studio/editor/canvas-core/` (fabric-init, event-bindings, keyboard, history, transform, content-apply)
- `rulerGuides` state lives in DesignStudio → passed as prop to Canvas (snapping) + RulerGuides (render)
- `pan` state tracked via `onPanChange` callback from Canvas

## Theming

- CSS custom properties (`--bg`, `--green`, `--text`, etc.) defined in `index.css :root`
- 8 accent colour presets + 5 background tone presets — applied live via `localStorage` key `'app_appearance'`
- `tailwind.config.ts` extends with `elite` and `accent` tokens
- Never hardcode hex colours in components — always use CSS vars

## Component Rules

- Use `src/components/ui.tsx` primitives (`Card`, `Btn`, `Input`, `Label`, etc.) for all UI
- Import design-system components via `../design-system` (never path-alias `@/design-system` — use relative)
- `src/api.ts` returns `{ data, error }` — never throws, always handle both branches
- No default exports from utility/type files; use named exports

## Content Generation Pipeline

1. User input → `POST /api/content/instagram` or `/api/content/stream-batch` (SSE)
2. Backend: Tavily search → context → `docs/elite_mode_instruction.md` prompt → NVIDIA LLM → structured markdown
3. "Send to Studio" → `DesignStudio.applyGeneratedContent()` applies to canvas

SSE event order: `campaign_brief` → `post_started` → `web_fetched` → `post_chunk` → `post_completed` → `post_error` → `batch_done`
