/**
 * prompt-injector.ts
 *
 * Injects a text prompt into the active ChatGPT conversation and submits it.
 * Uses human-like character-by-character typing to avoid bot detection.
 */

import { execInWindow } from './browser-controller'

const INJECT_TIMEOUT_MS = 60_000

export interface InjectResult {
  success: boolean
  method: 'prosemirror' | 'textarea' | 'failed'
  error?: string
}

/**
 * Type a prompt into ChatGPT with human-like timing and click Send.
 * Strategy order:
 *  1. #prompt-textarea (contenteditable, Nov 2024+)
 *  2. div[contenteditable="true"] ProseMirror
 *  3. Legacy textarea fallback
 */
export async function injectPrompt(prompt: string): Promise<InjectResult> {
  // Prepare the prompt as a JSON array of characters for the in-page script
  const chars = JSON.stringify(Array.from(prompt))

  const script = `
    (async () => {
      function findInput() {
        return (
          document.querySelector('#prompt-textarea') ||
          document.querySelector('div[contenteditable="true"][data-placeholder]') ||
          document.querySelector('div[contenteditable="true"].ProseMirror') ||
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('textarea[placeholder]') ||
          document.querySelector('textarea')
        )
      }

      function findSendBtn() {
        return (
          document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('button[aria-label="Send prompt"]') ||
          document.querySelector('button[aria-label="Send message"]') ||
          [...document.querySelectorAll('form button[type="button"]')].find(b => !b.disabled)
        )
      }

      function sleep(ms) {
        return new Promise(r => setTimeout(r, ms))
      }

      const chars = ${chars}

      // Human-like delay: 50–130ms per char, occasional 200–600ms pauses
      function typingDelay(i) {
        const base = 50 + Math.random() * 80
        const c = chars[i]
        if (c === '.' || c === ',') return base + 100 + Math.random() * 150
        if (i > 0 && i % 25 === 0) return base + 200 + Math.random() * 300
        return base
      }

      const el = findInput()
      if (!el) return { ok: false, method: 'failed', error: 'No input element found' }

      el.focus()
      await sleep(300)

      // Clear any existing text
      if (el.isContentEditable) {
        document.execCommand('selectAll', false, null)
        document.execCommand('delete', false, null)
      } else {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        nativeSetter?.call(el, '')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }

      await sleep(200)

      const isContentEditable = el.isContentEditable

      for (let i = 0; i < chars.length; i++) {
        const c = chars[i]

        if (isContentEditable) {
          // Use insertText so React/ProseMirror state updates with each keystroke
          document.execCommand('insertText', false, c)
        } else {
          // For textarea: append char and fire synthetic input event
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          nativeSetter?.call(el, el.value + c)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }

        // Simulate human typing delay
        const delay = typingDelay(i, chars.length)
        await sleep(delay)
      }

      // Brief pause before hitting send (like a human reviewing)
      await sleep(400 + Math.random() * 400)

      const btn = findSendBtn()
      if (btn && !btn.disabled) {
        btn.click()
        return { ok: true, method: isContentEditable ? 'prosemirror' : 'textarea' }
      }

      // Fallback: Enter key
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
      return { ok: true, method: isContentEditable ? 'prosemirror' : 'textarea' }
    })()
  `

  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ success: false, method: 'failed', error: 'Inject timeout' }),
      INJECT_TIMEOUT_MS,
    )

    execInWindow<{ ok: boolean; method: string; error?: string }>(script)
      .then((r) => {
        clearTimeout(timer)
        resolve(r.ok
          ? { success: true, method: r.method as InjectResult['method'] }
          : { success: false, method: 'failed', error: r.error },
        )
      })
      .catch((e: Error) => {
        clearTimeout(timer)
        resolve({ success: false, method: 'failed', error: e.message })
      })
  })
}

/**
 * Dismiss ChatGPT's "Which image do you like more?" A/B comparison modal if it appears.
 * Clicks "Image 1 is better" first, falls back to "Skip" if present.
 * Returns true if the modal was found and dismissed, false if not present.
 */
export async function dismissComparisonModal(): Promise<boolean> {
  const script = `
    (() => {
      // Detect the comparison modal by its heading text
      const heading = [...document.querySelectorAll('*')].find(el =>
        el.children.length === 0 &&
        el.textContent?.trim() === 'Which image do you like more?'
      )
      if (!heading) return false

      // Try "Image 1 is better" first (prefer first option — simpler heuristic)
      const buttons = [...document.querySelectorAll('button, [role="button"]')]
      const pick1 = buttons.find(b => b.textContent?.includes('Image 1 is better'))
      if (pick1) { pick1.click(); return true }

      // Fall back to Skip
      const skip = buttons.find(b => b.textContent?.trim() === 'Skip')
      if (skip) { skip.click(); return true }

      return false
    })()
  `
  try {
    const dismissed = await execInWindow<boolean>(script)
    if (dismissed) {
      console.log('[prompt-injector] Dismissed A/B comparison modal — clicked Image 1')
    }
    return dismissed
  } catch {
    return false
  }
}

/**
 * Wait until ChatGPT finishes generating (Stop button disappears, Send button returns).
 * Returns true if generation completed, false if timed out.
 */
export function waitForResponseComplete(timeoutMs = 180_000): Promise<boolean> {
  const script = `
    new Promise((resolve) => {
      const deadline = Date.now() + ${timeoutMs}
      let generationStarted = false

      function check() {
        if (Date.now() > deadline) { resolve(false); return }

        const stopBtn = (
          document.querySelector('button[aria-label="Stop generating"]') ||
          document.querySelector('button[data-testid="stop-button"]') ||
          document.querySelector('button[aria-label="Stop streaming"]')
        )

        if (stopBtn) {
          generationStarted = true
          setTimeout(check, 1000)
          return
        }

        if (generationStarted) {
          resolve(true)
          return
        }

        // Not started yet — keep waiting
        setTimeout(check, 800)
      }

      setTimeout(check, 2000)
    })
  `
  return execInWindow<boolean>(script).catch(() => false)
}
