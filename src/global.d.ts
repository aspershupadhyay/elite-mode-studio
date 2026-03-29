/**
 * Global type augmentations for the renderer process.
 *
 * Declares window.api as typed by preload.ts so every caller in the
 * renderer gets full IntelliSense without importing anything.
 */
import type {
  SavePngBatchRequest, SavePngBatchResult, SessionData,
  AuthStartRequest, AuthStartResult, AuthCompleteEvent, AuthValidateResult,
  StartImageGenRequest, StartImageGenResult, ImageGenProgress,
} from './types/ipc'
import type { JSX as ReactJSX } from 'react'

// ── Webview element type (Electron renderer — no Electron namespace available) ─
interface WebviewElement extends HTMLElement {
  src: string
  loadURL(url: string): void
  getURL(): string
  goBack(): void
  goForward(): void
  reload(): void
  stop?(): void
  canGoBack(): boolean
  canGoForward(): boolean
  executeJavaScript(code: string): Promise<unknown>
  addEventListener(type: 'did-start-loading', listener: () => void): void
  addEventListener(type: 'did-stop-loading',  listener: () => void): void
  addEventListener(type: 'did-fail-load',     listener: (e: Event & { errorCode?: number; errorDescription?: string; validatedURL?: string }) => void): void
  addEventListener(type: 'did-navigate',             listener: () => void): void
  addEventListener(type: 'did-navigate-in-page',     listener: () => void): void
  addEventListener(type: 'page-title-updated',       listener: (e: Event & { title?: string }) => void): void
  addEventListener(type: 'page-favicon-updated',     listener: (e: Event & { favicons?: string[] }) => void): void
  addEventListener(type: 'new-window',               listener: (e: Event & { url?: string }) => void): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
}

declare global {
  // Re-export React's JSX namespace globally so files can use JSX.Element
  // without importing React. With @types/react ≥18.3 the global JSX namespace
  // was removed; this restores it project-wide via the single global.d.ts.
  namespace JSX {
    type Element = ReactJSX.Element
    // IntrinsicElements is intentionally omitted here — we extend it below
    type ElementClass = ReactJSX.ElementClass
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>
    // Extend intrinsic elements with <webview>
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        useragent?: string
        allowpopups?: string | boolean
      }
    }
  }

  interface Window {
    api: {
      version: string
      // canvas / session
      savePngBatch:         (request: SavePngBatchRequest) => Promise<SavePngBatchResult>
      saveSession:          (data: SessionData) => void
      loadSession:          () => Promise<SessionData | null>
      downloadBrowserImage: (req: { url: string; postId: string }) => Promise<{ tmpPath: string; success: boolean }>
      // AI browser
      onAuthComplete:  (cb: () => void) => void
      openAuthPopup:   (u: string) => Promise<void>
      openExternal:    (u: string) => Promise<void>
      clearBrowserData:() => Promise<void>
      clearSiteData:   (domain: string) => Promise<{ removed: number }>
      // PKCE OAuth
      authStart:    (req: AuthStartRequest) => Promise<AuthStartResult>
      onAuthResult: (cb: (event: AuthCompleteEvent) => void) => (() => void)
      authValidate: (token: string) => Promise<AuthValidateResult>
      authLogout:   (token: string) => Promise<{ ok: boolean }>
      // Terminal logging from renderer
      log: (...args: unknown[]) => void
      // Context menu + browser events
      showContextMenu: (params: { x: number; y: number; linkUrl?: string; srcUrl?: string; selectionText?: string; isEditable?: boolean; pageURL?: string }) => Promise<void>
      onBrowserEvent:  (cb: (event: string, data?: unknown) => void) => (() => void)
      // Image generation pipeline
      startImageGen?:       (req: StartImageGenRequest) => Promise<StartImageGenResult>
      cancelImageGen?:      () => Promise<void>
      onImageGenProgress?:  (cb: (progress: ImageGenProgress) => void) => (() => void)
      getImageGenConfig?:   () => Promise<{ chatGptUrl: string }>
      setImageGenUrl?:      (url: string) => Promise<void>
    }
  }

  // WebviewElement — used by AiBrowser for the webview callback ref
  interface WebviewElement extends HTMLElement {
    src: string
    loadURL(url: string): void
    getURL(): string
    goBack(): void
    goForward(): void
    reload(): void
    stop?(): void
    canGoBack(): boolean
    canGoForward(): boolean
    executeJavaScript(code: string): Promise<unknown>
    addEventListener(type: 'did-start-loading',    listener: () => void): void
    addEventListener(type: 'did-stop-loading',     listener: () => void): void
    addEventListener(type: 'did-fail-load',        listener: (e: Event & { errorCode?: number; errorDescription?: string; validatedURL?: string }) => void): void
    addEventListener(type: 'did-navigate',         listener: () => void): void
    addEventListener(type: 'did-navigate-in-page', listener: () => void): void
    addEventListener(type: 'page-title-updated',   listener: (e: Event & { title?: string }) => void): void
    addEventListener(type: 'page-favicon-updated', listener: (e: Event & { favicons?: string[] }) => void): void
    addEventListener(type: 'new-window',           listener: (e: Event & { url?: string }) => void): void
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  }
}

export {}
