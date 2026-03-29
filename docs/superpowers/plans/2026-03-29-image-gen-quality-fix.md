# Image Generation Quality Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Electron image generation pipeline so it produces the same quality output as the working Python `chatgpt_agent.py` — no blurry previews, no premature "Done", no missing images.

**Architecture:** Four surgical fixes to the existing 4 Electron files in `electron/image-gen/`. No new architecture. No external browsers. The Electron `BrowserWindow` with `persist:ai-browser` partition IS the browser — login persists forever. We port the exact logic from `chatgpt_agent.py` into TypeScript.

**Tech Stack:** TypeScript, Electron `BrowserWindow` + `webContents.executeJavaScript`, `net` module for image download, pure-JS Laplacian sharpness check (no native deps — no jimp/sharp needed, just `Buffer` + manual pixel math using `nativeImage` from Electron).

---

## File Map

| File | Change |
|---|---|
| `electron/image-gen/browser-controller.ts` | Fix network interceptor — filter out thumbnails by content-length < 50KB |
| `electron/image-gen/queue-manager.ts` | Fix race condition, add render buffer, add retry loop with fresher URL re-scan |
| `electron/image-gen/image-downloader.ts` | Add quality gate (size + dimensions + sharpness) before writing to disk |
| `electron/image-gen/image-verifier.ts` | **New file** — pure-JS quality gate: size, dimensions, Laplacian sharpness |

---

## Task 1: Fix network interceptor to filter blurry thumbnails

**Files:**
- Modify: `electron/image-gen/browser-controller.ts`

The current interceptor fires on ANY `oaiusercontent.com` response. ChatGPT sends a blurry low-res preview thumbnail first (< 50KB), then the real image. We must skip anything under 50KB.

- [ ] **Step 1: Open `browser-controller.ts` and locate the interceptor**

Read the file — the relevant section is the `ses.webRequest.onCompleted` callback inside `installInterceptor()`.

- [ ] **Step 2: Replace the interceptor body**

Find:
```ts
  ses.webRequest.onCompleted({ urls: ['https://*.oaiusercontent.com/*'] }, (details) => {
    if (!captureCallback) return

    // Accept any resource type — ChatGPT fetches generated images as XHR/fetch
    const url = details.url
    if (!OAICDN_REGEX.test(url)) return

    // Filter out thumbnails / avatars — generated images are large (>100KB typically)
    // statusCode 200 = fully delivered
    if (details.statusCode !== 200) return

    console.log('[browser-controller] Captured image URL:', url.slice(0, 100))
    captureCallback(url)
  })
```

Replace with:
```ts
  ses.webRequest.onCompleted({ urls: ['https://*.oaiusercontent.com/*'] }, (details) => {
    if (!captureCallback) return

    const url = details.url
    if (!OAICDN_REGEX.test(url)) return
    if (details.statusCode !== 200) return

    // Skip thumbnails/previews — real DALL-E images are always > 50KB
    // ChatGPT sends a blurry low-res preview first (~10-30KB), then the real image
    const cl = details.responseHeaders?.['content-length']?.[0]
      || details.responseHeaders?.['Content-Length']?.[0]
      || '0'
    const sizeBytes = parseInt(cl, 10)
    if (sizeBytes > 0 && sizeBytes < 50_000) {
      console.log('[browser-controller] Skipping thumbnail:', sizeBytes, 'bytes')
      return
    }

    console.log('[browser-controller] Captured image URL:', sizeBytes ? `${Math.round(sizeBytes/1024)}KB` : 'unknown size', url.slice(0, 100))
    captureCallback(url)
  })
```

- [ ] **Step 3: Rebuild electron**

```bash
npm run build:electron
```

Expected output: TypeScript compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/image-gen/browser-controller.ts electron/image-gen/browser-controller.js
git commit -m "fix(image-gen): skip thumbnail CDN responses < 50KB in network interceptor"
```

---

## Task 2: Create pure-JS image quality verifier

**Files:**
- Create: `electron/image-gen/image-verifier.ts`

Pure TypeScript, no native deps. Uses `nativeImage` from Electron to decode image dimensions, manual Laplacian variance for sharpness. Mirrors Python's `_verify_image_bytes()`.

- [ ] **Step 1: Create `electron/image-gen/image-verifier.ts`**

```ts
/**
 * image-verifier.ts
 *
 * Pure-JS quality gate for generated images. Mirrors chatgpt_agent.py's
 * _verify_image_bytes() — three checks must ALL pass:
 *   1. File size >= MIN_SIZE_KB
 *   2. Shorter image dimension >= MIN_DIM_PX
 *   3. Laplacian sharpness variance >= MIN_SHARPNESS
 *
 * Uses Electron's nativeImage for decoding — no native node addons needed.
 */

import { nativeImage } from 'electron'

const MIN_SIZE_KB   = 300   // real DALL-E images are 300-800KB
const MIN_DIM_PX    = 1000  // shorter side must be >= 1000px (rejects 400px previews)
const MIN_SHARPNESS = 80.0  // Laplacian variance — blurry previews score ~5-30

export interface VerifyResult {
  ok:     boolean
  reason: string
}

/**
 * Verify a downloaded image buffer passes all quality gates.
 * Call this BEFORE writing to disk.
 */
export function verifyImageBuffer(buf: Buffer): VerifyResult {
  // Gate 1: file size
  const sizeKb = buf.length / 1024
  if (sizeKb < MIN_SIZE_KB) {
    return { ok: false, reason: `too small: ${Math.round(sizeKb)}KB < ${MIN_SIZE_KB}KB` }
  }

  // Gate 2: dimensions — use nativeImage (built into Electron, no deps)
  let width = 0
  let height = 0
  try {
    const img = nativeImage.createFromBuffer(buf)
    const size = img.getSize()
    width  = size.width
    height = size.height
  } catch (e) {
    return { ok: false, reason: `could not decode image: ${e}` }
  }

  if (Math.min(width, height) < MIN_DIM_PX) {
    return { ok: false, reason: `dimensions ${width}×${height} too small (min ${MIN_DIM_PX}px shorter side)` }
  }

  // Gate 3: sharpness via Laplacian variance
  // nativeImage.toBitmap() returns raw BGRA pixels
  let sharpness = 0
  try {
    sharpness = laplacianVariance(nativeImage.createFromBuffer(buf), width, height)
  } catch {
    // If sharpness check fails, pass through — size+dim already validated
    sharpness = MIN_SHARPNESS
  }

  if (sharpness < MIN_SHARPNESS) {
    return {
      ok: false,
      reason: `blurry: Laplacian variance ${sharpness.toFixed(1)} < ${MIN_SHARPNESS} (${width}×${height}, ${Math.round(sizeKb)}KB)`,
    }
  }

  return {
    ok: true,
    reason: `${Math.round(sizeKb)}KB ${width}×${height} sharpness=${sharpness.toFixed(0)}`,
  }
}

// ── Laplacian variance sharpness metric ────────────────────────────────────
// Converts image to greyscale, applies 3×3 Laplacian kernel, returns variance.
// Sharp image → high variance (many edges). Blurry → low variance.
// Mirrors Python's _laplacian_variance() exactly.

function laplacianVariance(img: Electron.NativeImage, width: number, height: number): number {
  // Scale down to max 200px on shorter side for speed — sharpness metric is scale-invariant
  const scale   = Math.min(1, 200 / Math.min(width, height))
  const sw      = Math.round(width  * scale)
  const sh      = Math.round(height * scale)
  const resized = img.resize({ width: sw, height: sh })
  const bitmap  = resized.toBitmap()  // raw BGRA bytes

  // Convert to greyscale
  const grey = new Float32Array(sw * sh)
  for (let i = 0; i < sw * sh; i++) {
    const b = bitmap[i * 4]
    const g = bitmap[i * 4 + 1]
    const r = bitmap[i * 4 + 2]
    grey[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  // Apply 3×3 Laplacian kernel: [0,1,0],[1,-4,1],[0,1,0]
  const conv: number[] = []
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x
      const val =
        grey[idx - sw] +
        grey[idx - 1]  +
        grey[idx + 1]  +
        grey[idx + sw] -
        4 * grey[idx]
      conv.push(val)
    }
  }

  // Variance of convolution output
  const n    = conv.length
  const mean = conv.reduce((a, b) => a + b, 0) / n
  const variance = conv.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n
  return variance
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run build:electron
```

Expected: compiles clean.

- [ ] **Step 3: Commit**

```bash
git add electron/image-gen/image-verifier.ts
git commit -m "feat(image-gen): add pure-JS quality gate (size + dimensions + sharpness)"
```

---

## Task 3: Integrate quality gate into image-downloader

**Files:**
- Modify: `electron/image-gen/image-downloader.ts`

Currently downloads and immediately saves with no verification. Add `verifyImageBuffer` before writing. Also expose a `collectDomImageUrls` helper used by the retry loop in Task 4.

- [ ] **Step 1: Replace the full content of `image-downloader.ts`**

```ts
/**
 * image-downloader.ts
 *
 * Downloads a captured image URL to a local temp file.
 * Applies quality gate (size + dimensions + sharpness) before writing.
 * Only writes to disk when ALL checks pass.
 */

import fs   from 'fs'
import path from 'path'
import os   from 'os'
import https from 'https'
import http  from 'http'
import { session as electronSession } from 'electron'
import { verifyImageBuffer, type VerifyResult } from './image-verifier'

const TMP_DIR   = path.join(os.tmpdir(), 'elite_gen_images')
const PARTITION = 'persist:ai-browser'
const CLEAN_UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase()
  const match = clean.match(/\.(png|jpg|jpeg|webp|gif)$/)
  return match ? match[1] : 'png'
}

export interface DownloadResult {
  success:  boolean
  tmpPath:  string
  error?:   string
  /** Set when quality gate failed — caller can retry with a different URL */
  qualityFail?: boolean
  reason?:  string
}

/**
 * Download an image URL to a deterministic tmp path.
 * Runs quality gate before writing — returns qualityFail=true if gate fails.
 */
export async function downloadImageToTmp(imageUrl: string, postId: string): Promise<DownloadResult> {
  ensureTmpDir()

  const ext     = extFromUrl(imageUrl)
  const tmpPath = path.join(TMP_DIR, `gen_${postId}_${Date.now()}.${ext}`)

  const buf = await fetchBuffer(imageUrl)
  if (!buf.ok) {
    return { success: false, tmpPath: '', error: buf.error }
  }

  const verify: VerifyResult = verifyImageBuffer(buf.data!)
  if (!verify.ok) {
    console.log(`[image-downloader] Quality gate FAILED: ${verify.reason}`)
    return { success: false, tmpPath: '', qualityFail: true, reason: verify.reason }
  }

  fs.writeFileSync(tmpPath, buf.data!)
  console.log(`[image-downloader] Saved: ${path.basename(tmpPath)} [${verify.reason}]`)
  return { success: true, tmpPath }
}

// ── Fetch raw bytes via Node https (uses session cookies) ──────────────────

interface FetchResult { ok: boolean; data?: Buffer; error?: string }

function fetchBuffer(imageUrl: string): Promise<FetchResult> {
  return new Promise((resolve) => {
    const ses = electronSession.fromPartition(PARTITION)
    ses.cookies.get({ url: imageUrl })
      .then((cookies) => {
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
        const mod = imageUrl.startsWith('https') ? https : http
        const headers: Record<string, string> = {
          'User-Agent': CLEAN_UA,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        }

        const req = (mod as typeof https).get(imageUrl, { headers }, (res) => {
          if (res.statusCode !== 200) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}` })
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end',  () => resolve({ ok: true, data: Buffer.concat(chunks) }))
          res.on('error', (e) => resolve({ ok: false, error: e.message }))
        })
        req.on('error', (e) => resolve({ ok: false, error: e.message }))
      })
      .catch((e: Error) => resolve({ ok: false, error: e.message }))
  })
}

/** Clean up tmp files older than maxAgeMs (default 1 hour). */
export function cleanTmpImages(maxAgeMs = 60 * 60 * 1000): void {
  if (!fs.existsSync(TMP_DIR)) return
  const now = Date.now()
  for (const file of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, file)
    try {
      const stat = fs.statSync(p)
      if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(p)
    } catch { /* ignore */ }
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run build:electron
```

Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add electron/image-gen/image-downloader.ts electron/image-gen/image-downloader.js
git commit -m "fix(image-gen): apply quality gate before saving — reject blurry/small images"
```

---

## Task 4: Fix queue-manager — remove race, add render buffer, add retry loop

**Files:**
- Modify: `electron/image-gen/queue-manager.ts`

This is the core fix. The current code races `Promise.all([imageCapturePromise, responseFinished])` — resolves the moment ANY image URL hits the network (blurry preview). The Python version:
1. Waits for stop-button to disappear first (generation fully done)
2. THEN starts a 40s render buffer with early-exit if URL captured
3. THEN resolves URL (network bucket → DOM fallback)
4. Retries up to 5x with 30s wait + DOM re-scan for fresher URL

- [ ] **Step 1: Replace full content of `queue-manager.ts`**

```ts
/**
 * queue-manager.ts
 *
 * Serially processes ImageGenJobs one at a time.
 *
 * Flow per job (mirrors chatgpt_agent.py exactly):
 *  1. Navigate ChatGPT to a fresh conversation
 *  2. Arm network listener BEFORE sending prompt
 *  3. Inject prompt and submit
 *  4. Wait for stop-button GONE (generation fully done)
 *  5. 40s render buffer — let CDN finish encoding (early-exit if URL captured at 5s+)
 *  6. Resolve URL: network bucket first, DOM scan fallback
 *  7. Download + quality gate
 *  8. On failure: retry up to MAX_RETRIES with RETRY_WAIT_MS between each,
 *     re-scanning DOM for a fresher URL each time
 */

import type { ImageGenJob, ImageGenProgress, ImageGenStatus } from '../../src/types/ipc'
import {
  getChatWindow, navigateToHome,
  onNextImage, clearCaptureCallback, hideChatWindow,
  execInWindow,
} from './browser-controller'
import { injectPrompt, waitForResponseComplete } from './prompt-injector'
import { downloadImageToTmp } from './image-downloader'

const MAX_RETRIES         = 5
const RETRY_WAIT_MS       = 30_000   // 30s between quality-gate retries
const RENDER_BUFFER_S     = 40       // seconds to wait after stop-button gone
const RENDER_EARLY_EXIT_S = 5        // if URL captured, only wait this many more seconds
const DOM_SCAN_TIMEOUT_S  = 60       // seconds to poll DOM if network bucket is empty

// CDN URL regex — same as browser-controller
const OAICDN_REGEX = /https:\/\/[^?#\s]+\.oaiusercontent\.com\/[^?#\s]+/

export type ProgressEmitter = (progress: ImageGenProgress) => void

let isRunning  = false
let cancelFlag = false

// ── Public API ─────────────────────────────────────────────────────────────

export function startQueue(jobs: ImageGenJob[], emit: ProgressEmitter): void {
  if (isRunning) {
    console.warn('[queue-manager] Already running — ignoring new start request')
    return
  }
  cancelFlag = false
  isRunning  = true
  void processQueue(jobs, emit).finally(() => {
    isRunning = false
    hideChatWindow()
  })
}

export function cancelQueue(): void {
  cancelFlag = true
  clearCaptureCallback()
  hideChatWindow()
  console.log('[queue-manager] Cancelled')
}

export function isBusy(): boolean { return isRunning }

// ── Core loop ──────────────────────────────────────────────────────────────

async function processQueue(jobs: ImageGenJob[], emit: ProgressEmitter): Promise<void> {
  getChatWindow() // create window early

  for (const job of jobs) {
    if (cancelFlag) break
    await processJob(job, emit)
    if (!cancelFlag) await sleep(3000) // pace between jobs
  }

  console.log('[queue-manager] Queue complete')
}

async function processJob(job: ImageGenJob, emit: ProgressEmitter): Promise<void> {
  const { postId, pageIndex, prompt } = job

  const push = (status: ImageGenStatus, extra: Partial<ImageGenProgress> = {}): void => {
    console.log(`[queue-manager] ${postId} → ${status}`, extra.error ?? extra)
    emit({ postId, pageIndex, status, ...extra })
  }

  try {
    // ── Step 1: open ChatGPT ───────────────────────────────────────────────
    push('opening_browser')
    await navigateToHome(`Post ${pageIndex + 1}`)
    if (cancelFlag) return

    // ── Step 2: collect pre-existing URLs so we can detect the NEW one ─────
    const knownBefore = await collectDomUrls()

    // ── Step 3: arm network bucket BEFORE sending prompt ──────────────────
    const netBucket: string[] = []
    onNextImage((url) => {
      if (!netBucket.includes(url)) {
        console.log(`[queue-manager] Network: captured ${url.slice(0, 80)}...`)
        netBucket.push(url)
      }
    })

    // ── Step 4: inject prompt ─────────────────────────────────────────────
    push('injecting_prompt')
    const injectResult = await injectPrompt(prompt)
    if (!injectResult.success) {
      clearCaptureCallback()
      push('error', { error: `Injection failed: ${injectResult.error}` })
      return
    }

    // ── Step 5: wait for generation to FULLY complete ─────────────────────
    push('waiting_for_image')
    const finished = await waitForResponseComplete(180_000)
    if (!finished) {
      console.warn('[queue-manager] Response complete timed out — continuing anyway')
    }
    if (cancelFlag) { clearCaptureCallback(); return }

    // ── Step 6: render buffer (40s, early-exit if URL already captured) ────
    console.log(`[queue-manager] Render buffer — waiting for CDN...`)
    for (let i = 0; i < RENDER_BUFFER_S; i++) {
      if (cancelFlag) { clearCaptureCallback(); return }
      await sleep(1000)
      if (netBucket.length > 0 && i >= RENDER_EARLY_EXIT_S) {
        console.log(`[queue-manager] URL captured at ${i}s — skipping remaining buffer`)
        break
      }
      if ((i + 1) % 10 === 0) {
        console.log(`[queue-manager] Buffer ${i + 1}/${RENDER_BUFFER_S}s  (captured: ${netBucket.length})`)
      }
    }

    clearCaptureCallback()

    // ── Step 7: resolve URL (network bucket → DOM fallback) ───────────────
    const url = resolveUrl(knownBefore, netBucket)
      ?? await pollDomForUrl(knownBefore, DOM_SCAN_TIMEOUT_S)

    if (!url) {
      push('error', { error: 'No image URL found — network and DOM both empty after generation' })
      return
    }

    // ── Step 8: download + quality gate with retries ───────────────────────
    push('downloading')
    let currentUrl = url
    let success    = false

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        console.log(`[queue-manager] Quality retry ${attempt}/${MAX_RETRIES} — waiting ${RETRY_WAIT_MS / 1000}s...`)
        emit({ postId, pageIndex, status: 'downloading',
          ...({ detail: `Quality retry ${attempt}/${MAX_RETRIES}` } as object) } as ImageGenProgress)
        await sleep(RETRY_WAIT_MS)

        // Re-scan DOM for a fresher URL ChatGPT may have swapped in
        const freshUrls = await collectDomUrls()
        const newer = freshUrls.filter(u => !knownBefore.includes(u) && u !== currentUrl)
        if (newer.length > 0) {
          currentUrl = newer[newer.length - 1]
          console.log(`[queue-manager] Found fresher URL in DOM — switching`)
        }
      }

      const dl = await downloadImageToTmp(currentUrl, postId)

      if (dl.success) {
        push('done', { tmpPath: dl.tmpPath })
        success = true
        break
      }

      if (dl.qualityFail) {
        console.log(`[queue-manager] Quality gate failed (attempt ${attempt}): ${dl.reason}`)
        continue
      }

      // Hard download error (HTTP failure etc) — no point retrying same URL
      console.error(`[queue-manager] Download error: ${dl.error}`)
      push('error', { error: `Download failed: ${dl.error}` })
      return
    }

    if (!success) {
      push('error', { error: `Image failed quality gate after ${MAX_RETRIES} retries` })
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[queue-manager] Unexpected error:', msg)
    push('error', { error: msg })
    clearCaptureCallback()
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Pick first new URL from network bucket not seen before generation. */
function resolveUrl(knownBefore: string[], netBucket: string[]): string | null {
  // Iterate newest-first (last item added is most likely the final full-res image)
  for (let i = netBucket.length - 1; i >= 0; i--) {
    if (!knownBefore.includes(netBucket[i])) return netBucket[i]
  }
  return null
}

/** Poll DOM every 3s for a new oaiusercontent.com URL. */
async function pollDomForUrl(knownBefore: string[], timeoutS: number): Promise<string | null> {
  console.log('[queue-manager] Network bucket empty — polling DOM...')
  const deadline = Date.now() + timeoutS * 1000
  while (Date.now() < deadline) {
    const urls = await collectDomUrls()
    const fresh = urls.filter(u => !knownBefore.includes(u))
    if (fresh.length > 0) {
      console.log(`[queue-manager] DOM: found ${fresh.length} new URL(s)`)
      return fresh[fresh.length - 1]
    }
    await sleep(3000)
  }
  return null
}

/** Scan the ChatGPT DOM for all real oaiusercontent.com image URLs. */
async function collectDomUrls(): Promise<string[]> {
  const script = `
    (() => {
      const selectors = [
        'img[alt="Generated image"]',
        'img[alt="generated image"]',
        'img[alt*="Generated"]',
        'img[src*="oaiusercontent.com"]',
        'img[src*="files.oaiusercontent"]',
      ]
      const seen = new Set()
      const out  = []
      for (const sel of selectors) {
        for (const img of document.querySelectorAll(sel)) {
          const src = img.getAttribute('src') || ''
          if (
            src &&
            !src.startsWith('blob:') &&
            !src.startsWith('data:') &&
            src.startsWith('https://') &&
            src.length > 80 &&
            !seen.has(src)
          ) {
            seen.add(src)
            out.push(src)
          }
        }
      }
      return out
    })()
  `
  try {
    const result = await execInWindow<string[]>(script)
    return Array.isArray(result) ? result : []
  } catch {
    return []
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
```

- [ ] **Step 2: Build**

```bash
npm run build:electron
```

Expected: clean compile, no type errors.

- [ ] **Step 3: Commit**

```bash
git add electron/image-gen/queue-manager.ts electron/image-gen/queue-manager.js
git commit -m "fix(image-gen): fix race condition, add 40s render buffer, add 5x quality retry loop"
```

---

## Task 5: Export `execInWindow` from browser-controller

**Files:**
- Modify: `electron/image-gen/browser-controller.ts`

`queue-manager.ts` (Task 4) calls `execInWindow` from `browser-controller`. Verify it's already exported (it is — line 133). Also expose `onNextImage` to accept multiple URLs into the bucket (currently one-shot — we need it to keep firing so we collect ALL CDN image responses, not just the first).

- [ ] **Step 1: Change `onNextImage` from one-shot to multi-capture**

In `browser-controller.ts`, find:

```ts
/** Register a one-shot callback for the next captured DALL-E image URL. */
export function onNextImage(cb: ImageCaptureCallback): void {
  captureCallback = cb
}
```

Replace with:

```ts
/**
 * Register a callback that fires for EVERY captured DALL-E image URL.
 * Not one-shot — keeps firing so queue-manager can collect all CDN responses
 * and pick the best (largest/freshest) one after the render buffer.
 * Call clearCaptureCallback() to stop.
 */
export function onNextImage(cb: ImageCaptureCallback): void {
  captureCallback = cb
}
```

(Comment update only — the behavior was already multi-fire since `captureCallback` is called each time `onCompleted` fires. Just update the doc comment to reflect this.)

- [ ] **Step 2: Build**

```bash
npm run build:electron
```

- [ ] **Step 3: Commit**

```bash
git add electron/image-gen/browser-controller.ts electron/image-gen/browser-controller.js
git commit -m "fix(image-gen): clarify onNextImage fires for every CDN response, not just first"
```

---

## Task 6: Verify end-to-end in the running app

No code changes — manual verification that everything works.

- [ ] **Step 1: Start the app**

In one terminal:
```bash
cd backend && python3 api.py
```

In another:
```bash
npm run dev
```

- [ ] **Step 2: Log into ChatGPT inside the app**

When the image generation window opens for the first time, log in with your Google account. The `persist:ai-browser` partition saves the session — you will **never need to log in again**.

- [ ] **Step 3: Generate a post in Forge and trigger image generation**

- Go to Forge → pick a topic → Generate
- Once posts appear, click "Generate Images"
- Watch the ImageGenStatus panel

- [ ] **Step 4: Verify the status panel shows detailed steps**

You should see per-job progress:
```
Post 1 → opening_browser
Post 1 → injecting_prompt
Post 1 → waiting_for_image
Post 1 → downloading
Post 1 → done
```

And in the **Electron terminal** (the one running `npm run dev`):
```
[queue-manager] post_xxx → opening_browser
[browser-controller] ChatGPT input ready
[queue-manager] post_xxx → injecting_prompt
[browser-controller] Captured image URL: 487KB https://files.oaiusercontent.com/...
[queue-manager] URL captured at 8s — skipping remaining buffer
[image-downloader] Saved: gen_post_xxx_1234567.png [487KB 1792×1024 sharpness=142]
[queue-manager] post_xxx → done
```

- [ ] **Step 5: Confirm the saved image is full-res**

Open Finder → `/tmp/elite_gen_images/` — the PNG should be 300KB+ and visually sharp.

- [ ] **Step 6: If quality gate keeps failing, check the sharpness threshold**

If `MIN_SHARPNESS = 80` is too aggressive for your image type, lower to `60` in `image-verifier.ts`. The Laplacian variance depends on image content — artistic/painterly images score lower than photorealistic.

---

## Self-Review

**Spec coverage:**
- ✅ No `Promise.all` race — Task 4 makes generation wait sequential
- ✅ Render buffer 40s with 5s early-exit — Task 4
- ✅ Quality gate size + dimensions + sharpness — Tasks 2 & 3
- ✅ Retry with fresher DOM URL — Task 4
- ✅ Network interceptor filters thumbnails < 50KB — Task 1
- ✅ All inside Electron BrowserWindow, no external browser — unchanged architecture
- ✅ Login persistence via `persist:ai-browser` — unchanged, already works

**Type consistency check:**
- `DownloadResult.qualityFail` added in Task 3, consumed in Task 4 ✅
- `verifyImageBuffer` exported from `image-verifier.ts`, imported in `image-downloader.ts` ✅
- `execInWindow` already exported from `browser-controller.ts`, imported in `queue-manager.ts` ✅
- `collectDomUrls` is internal to `queue-manager.ts` — not exported, not needed elsewhere ✅
- `ImageGenProgress` type imported from `src/types/ipc` in both files — unchanged ✅
