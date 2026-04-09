import React, { useRef, useEffect, useCallback } from 'react'
import type { Tab } from './types'
import { faviconUrl, hostname, HARD_BLOCK_DOMAINS, OAUTH_POPUP_DOMAINS } from './helpers'
import { IMAGE_WATCHER_JS, POLL_JS } from './scripts'
import BrowserHome from './BrowserHome'

interface ErrorPageProps { url: string; onRetry: () => void }

function ErrorPage({ url, onRetry }: ErrorPageProps): React.ReactElement {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 40,
      background: 'radial-gradient(ellipse 60% 40% at 50% 50%,rgba(239,68,68,0.04) 0%,transparent 70%)',
    }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, marginBottom: 24, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>✕</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Can't reach this page</h2>
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 360, textAlign: 'center', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>{hostname(url)}</strong> didn't respond.<br/>Check your connection or try again.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={onRetry} style={{ padding: '9px 22px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', cursor: 'pointer' }}>Try again</button>
        <button onClick={() => void navigator.clipboard.writeText(url)} style={{ padding: '9px 22px', borderRadius: 9, fontSize: 13, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>Copy URL</button>
      </div>
      <p style={{ marginTop: 28, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', maxWidth: 420, wordBreak: 'break-all', textAlign: 'center' }}>{url}</p>
    </div>
  )
}

export interface TabViewProps {
  tab:           Tab
  active:        boolean
  wvMap:         React.RefObject<Map<string, WebviewElement>>
  onUpdate:      (id: string, p: Partial<Tab>) => void
  onNavigate:    (id: string, url: string) => void
  onNewTab:      (url: string) => void
  activePostRef: React.RefObject<string | null>
  onImageFound:  (src: string, postId: string) => void
}

const TabView = React.memo(function TabView({
  tab, active, wvMap, onUpdate, onNavigate, onNewTab, activePostRef, onImageFound,
}: TabViewProps): React.ReactElement {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Callback ref — fires once when webview element first mounts
  const setRef = useCallback((el: WebviewElement | null): void => {
    if (!el) return
    wvMap.current.set(tab.id, el)

    el.addEventListener('did-start-loading', () => {
      onUpdate(tab.id, { loading: true, error: null })
    })

    el.addEventListener('did-stop-loading', () => {
      let u = ''
      try { u = el.getURL() } catch {}
      onUpdate(tab.id, {
        loading: false,
        url:     u || tab.url,
        canBack: el.canGoBack(),
        canFwd:  el.canGoForward(),
        favicon: faviconUrl(u || tab.url),
      })
      // Inject image watcher to monitor new images that appear in the DOM
      el.executeJavaScript(IMAGE_WATCHER_JS).catch(() => {})
      // Sync title from DOM in case page-title-updated fired before did-stop-loading
      el.executeJavaScript('document.title').then((t: unknown) => {
        if (typeof t === 'string' && t.trim()) onUpdate(tab.id, { title: t.trim() })
      }).catch(() => {})
    })

    el.addEventListener('did-fail-load', (e: Event & { errorCode?: number; errorDescription?: string; validatedURL?: string }) => {
      if (e.errorCode === -3) return  // aborted — user navigated away before load finished
      onUpdate(tab.id, { loading: false, error: e.errorDescription || 'Load failed' })
    })

    el.addEventListener('page-title-updated', (e: Event & { title?: string }) => {
      if (e.title) onUpdate(tab.id, { title: e.title })
    })

    el.addEventListener('page-favicon-updated', (e: Event & { favicons?: string[] }) => {
      if (e.favicons?.length) onUpdate(tab.id, { favicon: e.favicons[0] })
    })

    el.addEventListener('new-window', (e: Event & { url?: string }) => {
      if (!e.url) return

      // 1. Hard-block domains — always system browser (Google, Microsoft, Apple sign-in)
      try {
        const h = new URL(e.url).hostname
        if (HARD_BLOCK_DOMAINS.some(d => h.endsWith(d))) {
          window.api.openAuthPopup?.(e.url)
          return
        }
      } catch {}

      // 2. OAuth popup domains — route to system browser
      try {
        const h = new URL(e.url).hostname
        if (OAUTH_POPUP_DOMAINS.some(d => h.endsWith(d))) {
          window.api.openAuthPopup?.(e.url)
          return
        }
      } catch {}

      // 3. Everything else — open in a new in-app tab
      onNewTab(e.url)
    })

    // Context menu — uses the webview's native context-menu event (Electron 29+)
    // which provides accurate link/image/selection params from Chromium directly.
    el.addEventListener('context-menu', ((ce: Event) => {
      const e = ce as Event & {
        params?: {
          linkURL?: string; srcURL?: string; selectionText?: string
          isEditable?: boolean; pageURL?: string; mediaType?: string
        }
      }
      const p = e.params
      if (!p) return
      window.api.showContextMenu?.({
        linkUrl:       p.linkURL       || undefined,
        srcUrl:        p.srcURL        || undefined,
        selectionText: p.selectionText || undefined,
        isEditable:    p.isEditable,
        pageURL:       p.pageURL,
      })
    }) as EventListener)
  }, [tab.id, wvMap, onUpdate, onNewTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Image poll — only when there's an active injection
  useEffect(() => {
    if (!activePostRef.current) return
    const wv = wvMap.current.get(tab.id)
    if (!wv || !active) return
    pollRef.current = setInterval(async () => {
      if (!activePostRef.current) { clearInterval(pollRef.current!); pollRef.current = null; return }
      try {
        const raw = await wv.executeJavaScript(POLL_JS)
        const imgs = JSON.parse(raw as string) as Array<{ src: string }>
        if (imgs.length > 0 && activePostRef.current) { clearInterval(pollRef.current!); pollRef.current = null; onImageFound(imgs[0].src, activePostRef.current) }
      } catch {}
    }, 2000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  })

  const isHome  = tab.url === 'elite://newtab'
  const isError = !!tab.error && !tab.loading

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: active ? 'flex' : 'none',
      flexDirection: 'column',
    }}>
      {isHome ? (
        <BrowserHome onNavigate={u => onNavigate(tab.id, u)} />
      ) : isError ? (
        <ErrorPage url={tab.url} onRetry={() => onNavigate(tab.id, tab.url)} />
      ) : (
        <webview
          ref={setRef as React.Ref<HTMLElement>}
          src={tab.initialUrl}
          partition="persist:ai-browser"
          useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          allowpopups={true}
          style={{ flex: 1, border: 'none', background: '#111' }}
        />
      )}
    </div>
  )
})

export default TabView
