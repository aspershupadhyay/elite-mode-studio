# MCP Bug-Fix & Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 9 bugs found in the MCP audit and add fire-and-forget image generation with sub-25ms response for all canvas operations.

**Architecture:** Four files changed — `mcp/server.ts` (GET helper, job system, delay reduction, pageCount fix), `src/studio/mcp/commandHandlers.ts` (null return fixes), `src/studio/mcp/commandHandlersConsolidated.ts` (content+case bug), `src/studio/mcp/canvasBridge.ts` (page op returns), plus a one-line backend addition for POST support on `/api/image-providers`.

**Tech Stack:** TypeScript (MCP server + canvas bridge), Python FastAPI (backend)

---

## File Map

| File | Changes |
|------|---------|
| `mcp/server.ts` | `callBackendGet()`, fix `check_providers`, reduce timeouts, `build_carousel` real pageCount, job store + `dispatchImageGenAsync`, `job_status` in `dispatchApp` |
| `src/studio/mcp/commandHandlers.ts` | All `return null` layer/history/zoom handlers → return `{ success, action }` |
| `src/studio/mcp/commandHandlersConsolidated.ts` | Fix `content`+`typography.case` ordering |
| `src/studio/mcp/canvasBridge.ts` | Page ops return `{ success, pageCount }` instead of null |
| `backend/api.py` | Add `@app.post("/api/image-providers")` alias |

---

### Task 1: Fix `check_providers` 404 (GET vs POST mismatch)

**Files:**
- Modify: `mcp/server.ts` (add `callBackendGet`, fix `dispatchApp`)
- Modify: `backend/api.py` (add POST alias for `/api/image-providers`)

- [ ] **Step 1: Add `callBackendGet` helper in `mcp/server.ts`**

After the `callBackend` function (around line 85), add:

```typescript
function callBackendGet(path: string, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: BACKEND_PORT, path, method: 'GET',
        headers: { 'Accept': 'application/json' } },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { detail?: string }
            if (json.detail) reject(new Error(json.detail))
            else resolve(json)
          } catch { reject(new Error(`invalid response: ${data.slice(0, 200)}`)) }
        })
      },
    )
    req.on('error', (e) => reject(new Error(`service unavailable (${e.message})`)))
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('request timed out')) })
    req.end()
  })
}
```

- [ ] **Step 2: Fix `check_providers` in `dispatchApp` to use GET**

In `dispatchApp`, change:
```typescript
// BEFORE
if (action === 'check_providers') {
  return callBackend('/api/image-providers', {}, 10_000)
}
```
To:
```typescript
// AFTER
if (action === 'check_providers') {
  return callBackendGet('/api/image-providers', 10_000)
}
```

- [ ] **Step 3: Add POST alias to backend for belt-and-suspenders**

In `backend/api.py`, immediately after the `@app.get("/api/image-providers")` function (around line 1143), add:

```python
@app.post("/api/image-providers")
async def image_providers_post():
    """POST alias — lets MCP clients that always POST still reach this endpoint."""
    return await image_providers()
```

- [ ] **Step 4: Rebuild MCP server**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app
npx tsc -p mcp/tsconfig.json --noEmit 2>&1 | head -20
```
Expected: no errors (or only pre-existing errors unrelated to these changes).

---

### Task 2: Fix `update_element content` + `typography.case` ordering

**Files:**
- Modify: `src/studio/mcp/commandHandlersConsolidated.ts` lines 110-117

- [ ] **Step 1: Fix case transform to use `patches.text` first**

Change the case-transform block (inside the `if (typo)` block):

```typescript
// BEFORE
if (typo.case !== undefined) {
  const mode = String(typo.case)
  const txt  = String(obj.text ?? patches.text ?? '')
  if      (mode === 'upper')    patches.text = txt.toUpperCase()
  else if (mode === 'lower')    patches.text = txt.toLowerCase()
  else if (mode === 'title')    patches.text = txt.replace(/\b\w/g, c => c.toUpperCase())
  else if (mode === 'sentence') patches.text = txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
}
```

```typescript
// AFTER — patches.text wins (content param may have set it already)
if (typo.case !== undefined) {
  const mode = String(typo.case)
  const txt  = String((patches.text as string | undefined) ?? obj.text ?? '')
  if      (mode === 'upper')    patches.text = txt.toUpperCase()
  else if (mode === 'lower')    patches.text = txt.toLowerCase()
  else if (mode === 'title')    patches.text = txt.replace(/\b\w/g, c => c.toUpperCase())
  else if (mode === 'sentence') patches.text = txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
}
```

---

### Task 3: Fix all `return null` handlers in `commandHandlers.ts`

**Files:**
- Modify: `src/studio/mcp/commandHandlers.ts`

- [ ] **Step 1: Fix history handlers (undo/redo)**

```typescript
// BEFORE
export function handleUndo(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.undo()
  return null
}

export function handleRedo(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.redo()
  return null
}
```

```typescript
// AFTER
export function handleUndo(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.undo()
  return { success: true, action: 'undo' }
}

export function handleRedo(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.redo()
  return { success: true, action: 'redo' }
}
```

- [ ] **Step 2: Fix zoom-to-fit handler**

```typescript
// BEFORE
export function handleZoomToFit(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.zoomToFit()
  return null
}
```

```typescript
// AFTER
export function handleZoomToFit(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.zoomToFit()
  return { success: true, zoom: 'fit' }
}
```

- [ ] **Step 3: Fix layer-order handlers (front/back/forward/backward)**

```typescript
// BEFORE
export function handleBringToFront(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.bringToFront(); return null
}

export function handleSendToBack(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.sendToBack(); return null
}

export function handleBringForward(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.bringForward(); return null
}

export function handleSendBackward(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.sendBackward(); return null
}
```

```typescript
// AFTER
export function handleBringToFront(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.bringToFront()
  return { success: true, action: 'front' }
}

export function handleSendToBack(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.sendToBack()
  return { success: true, action: 'back' }
}

export function handleBringForward(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.bringForward()
  return { success: true, action: 'forward' }
}

export function handleSendBackward(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.sendBackward()
  return { success: true, action: 'backward' }
}
```

- [ ] **Step 4: Fix transform/selection handlers (delete/duplicate/group/ungroup)**

```typescript
// BEFORE
export function handleDeleteSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.deleteSelected(); return null
}

export function handleDuplicateSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.duplicateSelected(); return null
}

export function handleGroupSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.groupSelected(); return null
}

export function handleUngroupSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.ungroupSelected(); return null
}
```

```typescript
// AFTER
export function handleDeleteSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.deleteSelected()
  return { success: true, action: 'delete' }
}

export function handleDuplicateSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.duplicateSelected()
  return { success: true, action: 'duplicate' }
}

export function handleGroupSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.groupSelected()
  return { success: true, action: 'group' }
}

export function handleUngroupSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.ungroupSelected()
  return { success: true, action: 'ungroup' }
}
```

---

### Task 4: Fix `manage_page` null returns in `canvasBridge.ts`

**Files:**
- Modify: `src/studio/mcp/canvasBridge.ts` lines 159-165

- [ ] **Step 1: Fix all page command returns**

```typescript
// BEFORE
const pageCommandMap: Record<string, () => unknown> = {
  add_canvas_page:       ()  => { po.addBlankPage(); return { pageCount: po.getPages().length + 1 } },
  duplicate_canvas_page: ()  => { po.duplicatePage(Number(params.index ?? po.getActivePage())); return null },
  switch_canvas_page:    ()  => po.switchPage(Number(params.index ?? 0)),
  delete_canvas_page:    ()  => { po.deletePage(Number(params.index ?? po.getActivePage())); return null },
  rename_canvas_page:    ()  => { po.renamePage(Number(params.index ?? po.getActivePage()), String(params.name || 'Page')); return null },
  get_canvas_pages:      ()  => po.getPages(),
}
```

```typescript
// AFTER
const pageCommandMap: Record<string, () => unknown> = {
  add_canvas_page:       ()  => { po.addBlankPage(); return { success: true, action: 'add', pageCount: po.getPages().length + 1 } },
  duplicate_canvas_page: ()  => { po.duplicatePage(Number(params.index ?? po.getActivePage())); return { success: true, action: 'duplicate', pageCount: po.getPages().length } },
  switch_canvas_page:    async ()  => { await po.switchPage(Number(params.index ?? 0)); return { success: true, action: 'switch', activeIndex: Number(params.index ?? 0) } },
  delete_canvas_page:    ()  => { po.deletePage(Number(params.index ?? po.getActivePage())); return { success: true, action: 'delete', pageCount: po.getPages().length } },
  rename_canvas_page:    ()  => { po.renamePage(Number(params.index ?? po.getActivePage()), String(params.name || 'Page')); return { success: true, action: 'rename', name: String(params.name || 'Page') } },
  get_canvas_pages:      ()  => po.getPages(),
}
```

---

### Task 5: Fix `build_carousel` misleading `pageCount`

**Files:**
- Modify: `mcp/server.ts` — `dispatchBuildCarousel` function

- [ ] **Step 1: Query actual page count after build and rename field**

At the end of `dispatchBuildCarousel`, replace the return:

```typescript
// BEFORE
return {
  slides: slides.length,
  pageCount: slides.length,
  results,
  tip: 'Pass reset_pages=true on the next call to rebuild cleanly without duplicates.',
}
```

```typescript
// AFTER — query real total so caller knows the canvas state
const allPages = (await callCanvas('get_canvas_pages', {})) as Array<unknown>
return {
  slides:     slides.length,
  totalPages: allPages.length,
  results,
  tip: 'Pass reset_pages=true on the next call to rebuild cleanly without duplicates.',
}
```

---

### Task 6: Reduce `setTimeout` delays for 2-3ms canvas ops

**Files:**
- Modify: `mcp/server.ts` — `dispatchQuery` (all_pages) and `dispatchBuildCarousel`

The 150ms delays were added as safety margins for React state to settle after page switches. Electron IPC + React state updates complete in ~15ms in practice.

- [ ] **Step 1: Reduce delays in `dispatchQuery` (all_pages loop)**

```typescript
// BEFORE
if (!page.isActive) {
  await callCanvas('switch_canvas_page', { index: page.index })
  await new Promise(r => setTimeout(r, 150))
}
```

```typescript
// AFTER
if (!page.isActive) {
  await callCanvas('switch_canvas_page', { index: page.index })
  await new Promise(r => setTimeout(r, 25))
}
```

- [ ] **Step 2: Reduce delays in `dispatchBuildCarousel`**

```typescript
// BEFORE (reset_pages loop)
await callCanvas('switch_canvas_page', { index: d })
await new Promise(r => setTimeout(r, 80))
await callCanvas('delete_canvas_page', { index: d })
// ...
await callCanvas('switch_canvas_page', { index: 0 })
await new Promise(r => setTimeout(r, 100))
// ...
// (slide creation loop)
await callCanvas('add_canvas_page', {})
await new Promise(r => setTimeout(r, 150))
```

```typescript
// AFTER
await callCanvas('switch_canvas_page', { index: d })
await new Promise(r => setTimeout(r, 15))
await callCanvas('delete_canvas_page', { index: d })
// ...
await callCanvas('switch_canvas_page', { index: 0 })
await new Promise(r => setTimeout(r, 20))
// ...
// (slide creation loop)
await callCanvas('add_canvas_page', {})
await new Promise(r => setTimeout(r, 25))
```

---

### Task 7: Fire-and-forget image generation (Option A — chatgpt only)

**Files:**
- Modify: `mcp/server.ts` — add job store, `dispatchImageGenAsync`, `job_status` action, update `dispatch` switch

**Design:**
- In-memory `Map<jobId, JobState>` — jobs survive the session, cleaned after 10 min
- `generate_image` with provider=chatgpt → returns `{ job_id, status: "queued" }` in ~2ms
- All other providers (fal/openai/stability) stay synchronous (they're already 3-15s)
- `app_control action="job_status" job_id="xxx"` → returns current status + result

- [ ] **Step 1: Add job store and types near top of dispatch section in `mcp/server.ts`**

After the `ok()` helper function, add:

```typescript
// ── Image job store (fire-and-forget for chatgpt provider) ─────────────────

type JobStatus = 'queued' | 'running' | 'done' | 'error'
interface ImageJob {
  status:    JobStatus
  prompt:    string
  provider:  string
  createdAt: number
  result?:   unknown
  error?:    string
}

const imageJobStore = new Map<string, ImageJob>()

// Auto-clean jobs older than 10 minutes to prevent memory leak
function pruneOldJobs(): void {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [id, job] of imageJobStore) {
    if (job.createdAt < cutoff) imageJobStore.delete(id)
  }
}
```

- [ ] **Step 2: Add `dispatchImageGenAsync` function**

Add this function right before `dispatchBatchImageGen`:

```typescript
async function dispatchImageGenAsync(params: Record<string, unknown>): Promise<unknown> {
  const jobId = randomUUID().slice(0, 8)
  const prompt = String(params.prompt || '')

  pruneOldJobs()
  imageJobStore.set(jobId, {
    status:    'queued',
    prompt,
    provider:  'chatgpt',
    createdAt: Date.now(),
  })

  // Fire-and-forget — do NOT await
  void dispatchImageGen(params).then(result => {
    const job = imageJobStore.get(jobId)
    if (job) imageJobStore.set(jobId, { ...job, status: 'done', result })
  }).catch((err: Error) => {
    const job = imageJobStore.get(jobId)
    if (job) imageJobStore.set(jobId, { ...job, status: 'error', error: err.message })
  })

  // Mark as running immediately
  const job = imageJobStore.get(jobId)!
  imageJobStore.set(jobId, { ...job, status: 'running' })

  return {
    job_id:  jobId,
    status:  'running',
    message: 'Image generation started. Check status with app_control action="job_status" job_id="' + jobId + '"',
  }
}
```

- [ ] **Step 3: Route chatgpt `generate_image` through the async path**

In the `dispatch` switch, change `generate_image` case:

```typescript
// BEFORE
case 'generate_image': return dispatchImageGen(params)
```

```typescript
// AFTER — chatgpt is fire-and-forget; API providers stay synchronous
case 'generate_image': {
  const provider = String(params.provider || 'chatgpt')
  return provider === 'chatgpt'
    ? dispatchImageGenAsync(params)
    : dispatchImageGen(params)
}
```

- [ ] **Step 4: Add `job_status` action to `dispatchApp`**

In `dispatchApp`, add before the final `throw`:

```typescript
if (action === 'job_status') {
  const jobId = String(params.job_id || '')
  if (!jobId) throw new Error('job_id is required for action="job_status"')
  const job = imageJobStore.get(jobId)
  if (!job) return { job_id: jobId, status: 'not_found', message: 'Job not found or expired (10 min TTL)' }
  return {
    job_id:   jobId,
    status:   job.status,
    prompt:   job.prompt,
    provider: job.provider,
    age_s:    Math.round((Date.now() - job.createdAt) / 1000),
    result:   job.result ?? null,
    error:    job.error  ?? null,
  }
}
```

- [ ] **Step 5: Add `job_status` to the `app_control` tool schema**

In the `TOOLS` array, find the `app_control` tool and add `"job_status"` to the `action` enum and update the description:

```typescript
// In the app_control tool definition, update action enum:
enum: ['navigate','get_state','settings','save_keys','appearance','check_providers','job_status'],
description: 'navigate=switch page; get_state=current page+theme; settings=check API keys; save_keys=write keys to .env; appearance=set theme; check_providers=which image AI providers have keys ready; job_status=check async image gen job (pass job_id)',
```

---

### Task 8: Build and verify

- [ ] **Step 1: Type-check mcp/server.ts**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app
npx tsc -p mcp/tsconfig.json --noEmit 2>&1
```
Expected: No errors.

- [ ] **Step 2: Type-check renderer TypeScript**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app
npx tsc --noEmit 2>&1 | head -30
```
Expected: No new errors introduced.

- [ ] **Step 3: Rebuild MCP dist**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app
npx tsc -p mcp/tsconfig.json 2>&1
```
Expected: `mcp/dist/server.js` updated.

- [ ] **Step 4: Commit**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app
git add mcp/server.ts mcp/dist/server.js \
  src/studio/mcp/commandHandlers.ts \
  src/studio/mcp/commandHandlersConsolidated.ts \
  src/studio/mcp/canvasBridge.ts \
  backend/api.py
git commit -m "fix: MCP bug fixes + perf — check_providers GET, content/case, null returns, fire-and-forget image gen, 6x faster carousel/all_pages"
```
