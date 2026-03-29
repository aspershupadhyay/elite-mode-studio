"use strict";
/**
 * browser-controller.ts
 *
 * Manages the hidden ChatGPT BrowserWindow used for image generation.
 * Responsible for:
 *  - Opening/reusing a persistent ChatGPT session window
 *  - Intercepting generated image URLs from network traffic
 *  - Emitting captured image URLs to the queue manager via callback
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatWindow = getChatWindow;
exports.showChatWindow = showChatWindow;
exports.hideChatWindow = hideChatWindow;
exports.navigateToHome = navigateToHome;
exports.onNextImage = onNextImage;
exports.clearCaptureCallback = clearCaptureCallback;
exports.destroyChatWindow = destroyChatWindow;
exports.execInWindow = execInWindow;
const electron_1 = require("electron");
const imageGenConfig_1 = require("./imageGenConfig");
const PARTITION = 'persist:ai-browser';
const CLEAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// DALL-E image URLs served by ChatGPT come through as XHR/fetch, not image resource type.
// We match the CDN pattern broadly and filter by URL shape.
const OAICDN_REGEX = /https:\/\/[^?#\s]+\.oaiusercontent\.com\/[^?#\s]+/;
let chatWin = null;
let captureCallback = null;
let interceptorInstalled = false;
// ── Network interceptor ────────────────────────────────────────────────────
// Installed once per session. Catches ALL completed requests to oaiusercontent.com
// regardless of resourceType — DALL-E images arrive as xhr/fetch, not 'image'.
function installInterceptor() {
    if (interceptorInstalled)
        return;
    interceptorInstalled = true;
    const ses = electron_1.session.fromPartition(PARTITION);
    ses.webRequest.onCompleted({ urls: ['https://*.oaiusercontent.com/*'] }, (details) => {
        if (!captureCallback)
            return;
        const url = details.url;
        if (!OAICDN_REGEX.test(url))
            return;
        if (details.statusCode !== 200)
            return;
        // Skip thumbnails/previews — real DALL-E images are always > 50KB
        // ChatGPT sends a blurry low-res preview first (~10-30KB), then the real image
        const cl = details.responseHeaders?.['content-length']?.[0]
            || details.responseHeaders?.['Content-Length']?.[0]
            || '0';
        const sizeBytes = parseInt(cl, 10);
        if (sizeBytes > 0 && sizeBytes < 50000) {
            console.log('[browser-controller] Skipping thumbnail:', sizeBytes, 'bytes');
            return;
        }
        console.log('[browser-controller] Captured image URL:', sizeBytes ? `${Math.round(sizeBytes / 1024)}KB` : 'unknown size', url.slice(0, 100));
        captureCallback(url);
    });
    console.log('[browser-controller] Network interceptor installed');
}
// ── Window lifecycle ───────────────────────────────────────────────────────
function getChatWindow() {
    if (chatWin && !chatWin.isDestroyed())
        return chatWin;
    chatWin = new electron_1.BrowserWindow({
        width: 1280,
        height: 900,
        show: true,
        title: 'Elite Mode — Image Generation',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: PARTITION,
        },
    });
    chatWin.webContents.setUserAgent(CLEAN_UA);
    chatWin.on('closed', () => { chatWin = null; });
    installInterceptor();
    console.log('[browser-controller] ChatGPT window created');
    return chatWin;
}
/** Show the window — useful so user can log in on first run. */
function showChatWindow() {
    const win = getChatWindow();
    win.show();
    win.focus();
}
function hideChatWindow() {
    // Keep window visible — user may want to review the chat
    // Just reset the title to indicate generation is done
    if (chatWin && !chatWin.isDestroyed()) {
        chatWin.setTitle('Elite Mode — Image Generation (Done)');
    }
}
/**
 * Navigate to ChatGPT and wait for the SPA UI to be interactive.
 * `did-finish-load` fires too early (HTML shell only), so we poll for
 * the presence of the prompt input element via executeJavaScript.
 */
async function navigateToHome(jobLabel) {
    const win = getChatWindow();
    const targetUrl = (0, imageGenConfig_1.getChatGptUrl)();
    win.show();
    win.focus();
    if (jobLabel)
        win.setTitle(`Elite Mode — Generating: ${jobLabel}`);
    await win.loadURL(targetUrl);
    // Wait for the React app to render the prompt input (up to 25s)
    await waitForChatInput(win, 25000);
}
/**
 * Register a callback that fires for EVERY captured DALL-E image URL.
 * Keeps firing so queue-manager can collect all CDN responses and pick
 * the best one after the render buffer. Call clearCaptureCallback() to stop.
 */
function onNextImage(cb) {
    captureCallback = cb;
}
/** Clear the capture callback. */
function clearCaptureCallback() {
    captureCallback = null;
}
/** Destroy the window on app quit. */
function destroyChatWindow() {
    if (chatWin && !chatWin.isDestroyed()) {
        chatWin.destroy();
        chatWin = null;
    }
}
/** Execute JS in the ChatGPT window. */
function execInWindow(script) {
    const win = getChatWindow();
    if (!win || win.isDestroyed())
        return Promise.reject(new Error('Window unavailable'));
    return win.webContents.executeJavaScript(script);
}
// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * Poll until the ChatGPT prompt textarea / ProseMirror editor is present in the DOM.
 * This is the reliable signal that the SPA has fully rendered.
 */
function waitForChatInput(win, timeoutMs) {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const POLL_INTERVAL = 600;
        const check = () => {
            if (win.isDestroyed()) {
                resolve();
                return;
            }
            if (Date.now() > deadline) {
                console.warn('[browser-controller] Timed out waiting for ChatGPT input — proceeding anyway');
                resolve();
                return;
            }
            win.webContents.executeJavaScript(`
        !!(
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('textarea[placeholder]') ||
          document.querySelector('#prompt-textarea')
        )
      `)
                .then((found) => {
                if (found) {
                    console.log('[browser-controller] ChatGPT input ready');
                    resolve();
                }
                else {
                    setTimeout(check, POLL_INTERVAL);
                }
            })
                .catch(() => setTimeout(check, POLL_INTERVAL));
        };
        // Give the page a moment to start loading before polling
        setTimeout(check, 1500);
    });
}
