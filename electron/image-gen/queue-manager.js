"use strict";
/**
 * queue-manager.ts
 *
 * Serially processes ImageGenJobs one at a time.
 *
 * Flow per job (mirrors chatgpt_agent.py exactly):
 *  1. Navigate ChatGPT to a fresh conversation
 *  2. Collect pre-existing image URLs in DOM (baseline)
 *  3. Arm network listener BEFORE sending prompt
 *  4. Inject prompt and submit
 *  5. Wait for stop-button GONE (generation fully complete — not raced)
 *  6. 40s render buffer — CDN needs time to finish encoding the full-res image
 *     Early-exit after 5s if a URL was already captured in the network bucket
 *  7. Resolve URL: network bucket first (newest), DOM poll fallback
 *  8. Download + quality gate (size + dimensions + sharpness)
 *  9. On quality failure: wait 30s, re-scan DOM for a fresher URL ChatGPT may
 *     have swapped in, retry — up to MAX_RETRIES total
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startQueue = startQueue;
exports.cancelQueue = cancelQueue;
exports.isBusy = isBusy;
const browser_controller_1 = require("./browser-controller");
const prompt_injector_1 = require("./prompt-injector");
const image_downloader_1 = require("./image-downloader");
const MAX_RETRIES = 5;
const RETRY_WAIT_MS = 30000; // 30s between quality-gate retries
const RENDER_BUFFER_S = 40; // seconds to wait after stop-button gone
const RENDER_EARLY_EXIT_S = 5; // skip remaining buffer if URL captured this many seconds ago
const DOM_SCAN_TIMEOUT_S = 60; // seconds to poll DOM if network bucket is empty
let isRunning = false;
let cancelFlag = false;
// ── Public API ──────────────────────────────────────────────────────────────
function startQueue(jobs, emit) {
    if (isRunning) {
        console.warn('[queue-manager] Already running — ignoring new start request');
        return;
    }
    cancelFlag = false;
    isRunning = true;
    void processQueue(jobs, emit).finally(() => {
        isRunning = false;
        (0, browser_controller_1.hideChatWindow)();
    });
}
function cancelQueue() {
    cancelFlag = true;
    (0, browser_controller_1.clearCaptureCallback)();
    (0, browser_controller_1.hideChatWindow)();
    console.log('[queue-manager] Cancelled');
}
function isBusy() { return isRunning; }
// ── Core loop ───────────────────────────────────────────────────────────────
async function processQueue(jobs, emit) {
    (0, browser_controller_1.getChatWindow)(); // create window early (hidden until navigateToHome shows it)
    for (const job of jobs) {
        if (cancelFlag)
            break;
        await processJob(job, emit);
        if (!cancelFlag)
            await sleep(3000); // pace between jobs
    }
    console.log('[queue-manager] Queue complete');
}
async function processJob(job, emit) {
    const { postId, pageIndex, prompt } = job;
    const push = (status, extra = {}) => {
        console.log(`[queue-manager] ${postId} → ${status}`, extra.error ?? '');
        emit({ postId, pageIndex, status, ...extra });
    };
    try {
        // ── 1. Open ChatGPT ────────────────────────────────────────────────────
        push('opening_browser');
        await (0, browser_controller_1.navigateToHome)(`Post ${pageIndex + 1}`);
        if (cancelFlag)
            return;
        // ── 2. Baseline: collect pre-existing image URLs ───────────────────────
        const knownBefore = await collectDomUrls();
        console.log(`[queue-manager] ${knownBefore.length} pre-existing image URL(s) in DOM`);
        // ── 3. Arm network bucket BEFORE sending prompt ────────────────────────
        const netBucket = [];
        (0, browser_controller_1.onNextImage)((url) => {
            if (!netBucket.includes(url)) {
                console.log(`[queue-manager] Network captured: ${url.slice(0, 80)}...`);
                netBucket.push(url);
            }
        });
        // ── 4. Inject prompt ───────────────────────────────────────────────────
        push('injecting_prompt');
        const injectResult = await (0, prompt_injector_1.injectPrompt)(prompt);
        if (!injectResult.success) {
            (0, browser_controller_1.clearCaptureCallback)();
            push('error', { error: `Injection failed (${injectResult.method}): ${injectResult.error}` });
            return;
        }
        console.log(`[queue-manager] Prompt submitted via "${injectResult.method}"`);
        if (cancelFlag) {
            (0, browser_controller_1.clearCaptureCallback)();
            return;
        }
        // ── 5. Wait for generation to FULLY complete (stop-button gone) ────────
        // NOT raced with network capture — we wait for full completion first.
        push('waiting_for_image');
        console.log(`[queue-manager] Waiting for generation to complete...`);
        const finished = await (0, prompt_injector_1.waitForResponseComplete)(180000);
        if (!finished) {
            console.warn('[queue-manager] waitForResponseComplete timed out — continuing anyway');
        }
        if (cancelFlag) {
            (0, browser_controller_1.clearCaptureCallback)();
            return;
        }
        // ── 6. Render buffer ───────────────────────────────────────────────────
        // CDN needs time to encode the full-res image after generation completes.
        // Early-exit if URL was already captured and we've waited at least 5s.
        console.log(`[queue-manager] Render buffer — waiting for CDN encoding (max ${RENDER_BUFFER_S}s)...`);
        for (let i = 0; i < RENDER_BUFFER_S; i++) {
            if (cancelFlag) {
                (0, browser_controller_1.clearCaptureCallback)();
                return;
            }
            await sleep(1000);
            if (netBucket.length > 0 && i >= RENDER_EARLY_EXIT_S) {
                console.log(`[queue-manager] URL captured — exiting buffer at ${i + 1}s`);
                break;
            }
            if ((i + 1) % 10 === 0) {
                console.log(`[queue-manager] Buffer ${i + 1}/${RENDER_BUFFER_S}s (network captured: ${netBucket.length})`);
            }
        }
        (0, browser_controller_1.clearCaptureCallback)();
        // ── 7. Resolve image URL ───────────────────────────────────────────────
        // Network bucket first (fastest, most reliable), DOM poll as fallback.
        let url = resolveFromBucket(knownBefore, netBucket);
        if (!url) {
            console.log(`[queue-manager] Network bucket empty — polling DOM for URL...`);
            url = await pollDomForUrl(knownBefore, DOM_SCAN_TIMEOUT_S);
        }
        if (!url) {
            push('error', { error: 'No image URL found after generation — network and DOM both empty' });
            return;
        }
        // ── 8. Download + quality gate with retries ────────────────────────────
        push('downloading');
        let currentUrl = url;
        let succeeded = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 1) {
                console.log(`[queue-manager] Quality retry ${attempt}/${MAX_RETRIES} — waiting ${RETRY_WAIT_MS / 1000}s...`);
                await sleep(RETRY_WAIT_MS);
                // Re-scan DOM: ChatGPT sometimes swaps the preview for a new full-res URL
                const freshUrls = await collectDomUrls();
                const newer = freshUrls.filter(u => !knownBefore.includes(u) && u !== currentUrl);
                if (newer.length > 0) {
                    currentUrl = newer[newer.length - 1];
                    console.log(`[queue-manager] Fresher URL found in DOM — switching`);
                }
            }
            if (cancelFlag)
                return;
            const dl = await (0, image_downloader_1.downloadImageToTmp)(currentUrl, postId);
            if (dl.success) {
                push('done', { tmpPath: dl.tmpPath });
                succeeded = true;
                break;
            }
            if (dl.qualityFail) {
                // Quality gate failed — retry after waiting
                console.log(`[queue-manager] Quality gate failed (attempt ${attempt}/${MAX_RETRIES}): ${dl.reason}`);
                continue;
            }
            // Hard download error (HTTP failure, network issue) — no point retrying same URL
            push('error', { error: `Download error: ${dl.error}` });
            return;
        }
        if (!succeeded) {
            push('error', { error: `Image failed quality gate after ${MAX_RETRIES} retries — blurry or too small` });
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[queue-manager] Unexpected error:', msg);
        push('error', { error: msg });
        (0, browser_controller_1.clearCaptureCallback)();
    }
}
// ── Helpers ──────────────────────────────────────────────────────────────────
/** Pick the newest URL from the network bucket not seen before generation. */
function resolveFromBucket(knownBefore, netBucket) {
    for (let i = netBucket.length - 1; i >= 0; i--) {
        if (!knownBefore.includes(netBucket[i]))
            return netBucket[i];
    }
    return null;
}
/** Poll the ChatGPT DOM every 3s until a new image URL appears. */
async function pollDomForUrl(knownBefore, timeoutS) {
    const deadline = Date.now() + timeoutS * 1000;
    while (Date.now() < deadline) {
        const urls = await collectDomUrls();
        const fresh = urls.filter(u => !knownBefore.includes(u));
        if (fresh.length > 0) {
            console.log(`[queue-manager] DOM poll: found ${fresh.length} new URL(s)`);
            return fresh[fresh.length - 1];
        }
        await sleep(3000);
    }
    return null;
}
/**
 * Scan the ChatGPT DOM for all real oaiusercontent.com image src attributes.
 * Mirrors chatgpt_agent.py's _collect_real_urls().
 */
async function collectDomUrls() {
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
  `;
    try {
        const result = await (0, browser_controller_1.execInWindow)(script);
        return Array.isArray(result) ? result : [];
    }
    catch {
        return [];
    }
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
