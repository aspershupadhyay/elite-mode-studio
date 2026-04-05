/**
 * browser-controller.ts
 *
 * Manages the hidden ChatGPT BrowserWindow used for image generation.
 * Responsible for:
 *  - Opening/reusing a persistent ChatGPT session window
 *  - Intercepting generated image URLs from network traffic
 *  - Emitting captured image URLs to the queue manager via callback
 */

import { BrowserWindow, session as electronSession } from 'electron'
import { getChatGptUrl } from './imageGenConfig'

const PARTITION = 'persist:ai-browser'
const CLEAN_UA    = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// DALL-E image URLs served by ChatGPT come through as XHR/fetch, not image resource type.
// We match the CDN pattern broadly and filter by URL shape.
const OAICDN_REGEX = /https:\/\/[^?#\s]+\.oaiusercontent\.com\/[^?#\s]+/

export type ImageCaptureCallback = (imageUrl: string) => void

let chatWin: BrowserWindow | null = null
let captureCallback: ImageCaptureCallback | null = null
let interceptorInstalled = false

// ── Network interceptor ────────────────────────────────────────────────────
// Installed once per session. Catches ALL completed requests to oaiusercontent.com
// regardless of resourceType — DALL-E images arrive as xhr/fetch, not 'image'.

function installInterceptor(): void {
  if (interceptorInstalled) return
  interceptorInstalled = true

  const ses = electronSession.fromPartition(PARTITION)

  ses.webRequest.onCompleted({ urls: ['https://*.oaiusercontent.com/*'] }, (details) => {
    if (!captureCallback) return

    const url = details.url
    if (!OAICDN_REGEX.test(url)) return
    if (details.statusCode !== 200) return

    // Only capture full-res images — real DALL-E images are 300-800KB.
    // cid=1 blurry previews are ~30-80KB, intermediate chunks up to ~200KB.
    // 300KB threshold guarantees we only fire when the full-res encode is on the wire.
    const cl = details.responseHeaders?.['content-length']?.[0]
      || details.responseHeaders?.['Content-Length']?.[0]
      || '0'
    const sizeBytes = parseInt(cl, 10)
    if (sizeBytes > 0 && sizeBytes < 300_000) {
      console.log('[browser-controller] Skipping preview/chunk:', Math.round(sizeBytes / 1024), 'KB')
      return
    }

    console.log('[browser-controller] Captured image URL:', sizeBytes ? `${Math.round(sizeBytes / 1024)}KB` : 'unknown size', url.slice(0, 100))
    captureCallback(url)
  })

  console.log('[browser-controller] Network interceptor installed')
}

// ── Window lifecycle ───────────────────────────────────────────────────────

export function getChatWindow(): BrowserWindow {
  if (chatWin && !chatWin.isDestroyed()) return chatWin

  chatWin = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    title: 'Elite Mode — Image Generation',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      partition:        PARTITION,
    },
  })

  chatWin.webContents.setUserAgent(CLEAN_UA)
  chatWin.on('closed', () => { chatWin = null })

  installInterceptor()
  console.log('[browser-controller] ChatGPT window created')
  return chatWin
}

/** Show the window — useful so user can log in on first run. */
export function showChatWindow(): void {
  const win = getChatWindow()
  win.show()
  win.focus()
}

export function hideChatWindow(): void {
  // Keep window visible — user may want to review the chat
  // Just reset the title to indicate generation is done
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.setTitle('Elite Mode — Image Generation (Done)')
  }
}

/**
 * Navigate to ChatGPT and wait for the SPA UI to be interactive.
 * `did-finish-load` fires too early (HTML shell only), so we poll for
 * the presence of the prompt input element via executeJavaScript.
 */
export async function navigateToHome(jobLabel?: string): Promise<void> {
  const win = getChatWindow()
  const targetUrl = getChatGptUrl()

  win.show()
  win.focus()
  if (jobLabel) win.setTitle(`Elite Mode — Generating: ${jobLabel}`)

  await win.loadURL(targetUrl)

  // Wait for the React app to render the prompt input (up to 25s)
  await waitForChatInput(win, 25_000)
}

/**
 * Register a callback that fires for EVERY captured DALL-E image URL.
 * Keeps firing so queue-manager can collect all CDN responses and pick
 * the best one after the render buffer. Call clearCaptureCallback() to stop.
 */
export function onNextImage(cb: ImageCaptureCallback): void {
  captureCallback = cb
}

/** Clear the capture callback. */
export function clearCaptureCallback(): void {
  captureCallback = null
}

/** Destroy the window on app quit. */
export function destroyChatWindow(): void {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.destroy()
    chatWin = null
  }
}

/** Execute JS in the ChatGPT window. */
export function execInWindow<T = unknown>(script: string): Promise<T> {
  const win = getChatWindow()
  if (!win || win.isDestroyed()) return Promise.reject(new Error('Window unavailable'))
  return win.webContents.executeJavaScript(script) as Promise<T>
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Poll until the ChatGPT prompt textarea / ProseMirror editor is present in the DOM.
 * This is the reliable signal that the SPA has fully rendered.
 */
function waitForChatInput(win: BrowserWindow, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const POLL_INTERVAL = 600

    const check = (): void => {
      if (win.isDestroyed()) { resolve(); return }
      if (Date.now() > deadline) {
        console.warn('[browser-controller] Timed out waiting for ChatGPT input — proceeding anyway')
        resolve()
        return
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
            console.log('[browser-controller] ChatGPT input ready')
            resolve()
          } else {
            setTimeout(check, POLL_INTERVAL)
          }
        })
        .catch(() => setTimeout(check, POLL_INTERVAL))
    }

    // Give the page a moment to start loading before polling
    setTimeout(check, 1500)
  })
}
