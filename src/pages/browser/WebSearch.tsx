/**
 * WebSearch.tsx — AI Browser orchestrator.
 *
 * Subcomponents live in sibling files:
 *   TabView.tsx, BrowserHome.tsx, BrowserSettings.tsx, StatusPills.tsx
 * Scripts, types, and helpers in:
 *   scripts.ts, types.ts, helpers.ts
 */

import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  ArrowLeft, ArrowRight, RotateCcw, X, Plus,
  CheckCircle, Loader,
  Globe, Lock, Home, Settings,
} from 'lucide-react'

import type { Tab, PendingPrompt, ImageGenQueueJob, AiBrowserHandle } from './types'
import { makeTab, normalise } from './helpers'
import { buildInjectorScript, IMAGE_WATCHER_JS, CHATGPT_STATUS_JS, SNAPSHOT_EXISTING_IMAGES_JS, buildMouseMoveScript } from './scripts'
import TabView from './TabView'
import BrowserSettings from './BrowserSettings'
import StatusPills from './StatusPills'

// Re-export for external consumers (App.tsx)
export type { ImageGenQueueJob, AiBrowserHandle } from './types'

// ── AiBrowser ────────────────────────────────────────────────────────────────

interface AiBrowserProps {
  onImageReady?: (postId: string, filePath: string) => void
}

const AiBrowser = forwardRef<AiBrowserHandle, AiBrowserProps>(function AiBrowser(
  { onImageReady },
  ref,
): React.ReactElement {
  const [tabs,         setTabs]         = useState<Tab[]>(() => [makeTab()])
  const [activeId,     setActiveId]     = useState<string>(() => tabs[0]?.id ?? '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prompts,      setPrompts]      = useState<PendingPrompt[]>([])
  const [toast,        setToast]        = useState<string | null>(null)

  const [dragId, setDragId]     = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const wvMap         = useRef<Map<string, WebviewElement>>(new Map())
  const activePostRef = useRef<string | null>(null)

  const autoQueueRef    = useRef<ImageGenQueueJob[]>([])
  const autoRunningRef  = useRef(false)
  const autoCancelRef   = useRef(false)
  const autoTabIdRef    = useRef<string | null>(null)
  const autoChatUrlRef  = useRef<string>('')

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0]
  const isSecure  = activeTab?.url?.startsWith('https://')

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.api.onBrowserEvent) return
    const unsub = window.api.onBrowserEvent((evt, data) => {
      const wv = wvMap.current.get(activeId)
      if (evt === 'browser:open-new-tab' && typeof data === 'string') {
        addTab(data)
      } else if (evt === 'browser:reload') {
        wv?.reload()
      } else if (evt === 'browser:go-back') {
        wv?.goBack()
      } else if (evt === 'browser:go-forward') {
        wv?.goForward()
      } else if (evt === 'browser:paste') {
        wv?.executeJavaScript(`
          (function() {
            navigator.clipboard.readText().then(t => {
              const el = document.activeElement;
              if (!el) return;
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                el.value = el.value.slice(0, start) + t + el.value.slice(end);
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
              } else if (el.isContentEditable) {
                document.execCommand('insertText', false, t);
              }
            }).catch(() => {});
          })()
        `).catch(() => {})
      }
    })
    return unsub
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.api.onAuthComplete?.(() => {
      const wv = wvMap.current.get(activeId)
      if (wv) wv.reload()
    })
  }, [activeId])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('elite_pending_prompts')
      if (raw) {
        const p = JSON.parse(raw) as PendingPrompt[]
        setPrompts(p.map(x => x.status === 'injecting' ? { ...x, status: 'pending' as const } : x))
      }
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem('elite_pending_prompts', JSON.stringify(prompts))
  }, [prompts])

  useEffect(() => {
    const h = (e: Event): void => {
      const d = (e as CustomEvent<{ postId: string; prompt: string; title: string }>).detail
      setPrompts(prev => prev.find(p => p.postId === d.postId) ? prev : [...prev, { ...d, status: 'pending' }])
    }
    window.addEventListener('elite-inject-prompt', h)
    return () => window.removeEventListener('elite-inject-prompt', h)
  }, [])

  // ── Tab management ───────────────────────────────────────────────────────

  const addTab = useCallback((url = 'elite://newtab'): void => {
    const t = makeTab(url)
    setTabs(prev => [...prev, t])
    setActiveId(t.id)
  }, [])

  const closeTab = useCallback((id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    wvMap.current.delete(id)
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = makeTab()
        setActiveId(fresh.id)
        return [fresh]
      }
      const idx  = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id)
      return next
    })
  }, [activeId])

  const updateTab = useCallback((id: string, patch: Partial<Tab>): void => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const isMod = e.ctrlKey || e.metaKey
      if (!isMod) return
      if (e.key === 't') {
        e.preventDefault()
        addTab()
      } else if (e.key === 'w') {
        e.preventDefault()
        wvMap.current.delete(activeId)
        setTabs(prev => {
          if (prev.length === 1) {
            const fresh = makeTab()
            setActiveId(fresh.id)
            return [fresh]
          }
          const idx  = prev.findIndex(t => t.id === activeId)
          const next = prev.filter(t => t.id !== activeId)
          setActiveId(next[Math.max(0, idx - 1)].id)
          return next
        })
      } else if (e.key === 'r') {
        e.preventDefault()
        wvMap.current.get(activeId)?.reload()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeId, addTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTab = useCallback((id: string, rawUrl: string): void => {
    const u = normalise(rawUrl)
    if (u === 'elite://newtab') {
      updateTab(id, { url: u, inputUrl: '', title: 'New Tab', loading: false, error: null })
      return
    }
    const tab = tabs.find(t => t.id === id)
    const patch: Partial<Tab> = { url: u, inputUrl: u, error: null, loading: true }
    if (tab?.initialUrl === 'elite://newtab') patch.initialUrl = u
    updateTab(id, patch)
    const wv = wvMap.current.get(id)
    if (wv) wv.loadURL(u)
  }, [updateTab, tabs])

  const submitUrl = useCallback((): void => {
    if (!activeTab) return
    navigateTab(activeId, activeTab.inputUrl)
  }, [activeTab, activeId, navigateTab])

  // ── Drag-to-reorder ──────────────────────────────────────────────────────

  const handleDragStart = useCallback((id: string) => setDragId(id), [])
  const handleDragOver  = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setDragOver(id) }, [])
  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragId(null); setDragOver(null)
    if (!dragId || dragId === targetId) return
    setTabs(prev => {
      const from = prev.findIndex(t => t.id === dragId)
      const to   = prev.findIndex(t => t.id === targetId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [dragId])
  const handleDragEnd = useCallback(() => { setDragId(null); setDragOver(null) }, [])

  // ── Image inject ─────────────────────────────────────────────────────────

  const handleImageFound = useCallback((tmpPath: string, postId: string): void => {
    window.api.log(`[ImageGen] ✓ Image ready — postId:${postId} path:${tmpPath}`)
    setPrompts(prev => prev.map(p => p.postId === postId ? { ...p, status: 'done', imagePath: tmpPath } : p))
    const isLocalPath = tmpPath.startsWith('/') || tmpPath.startsWith('C:\\')
    if (isLocalPath) onImageReady?.(postId, tmpPath)
  }, [onImageReady])

  // ── Auto-queue ───────────────────────────────────────────────────────────

  const runAutoQueue = useCallback(async (): Promise<void> => {
    if (autoRunningRef.current) return
    autoRunningRef.current = true
    autoCancelRef.current  = false

    const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
    const tabId = autoTabIdRef.current!
    setActiveId(tabId)

    const getWv = async (): Promise<WebviewElement | null> => {
      for (let i = 0; i < 50; i++) {
        const wv = wvMap.current.get(tabId)
        if (wv) return wv
        await sleep(200)
      }
      return null
    }

    const waitNetworkIdle = (wv: WebviewElement): Promise<boolean> => {
      return new Promise(resolve => {
        const TIMEOUT = 45_000
        let settled = false
        const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false) } }, TIMEOUT)
        const onStop = (): void => {
          let attempts = 0
          const poll = (): void => {
            if (settled) return
            wv.executeJavaScript(`(function(){
              const input = !!(
                document.querySelector('#prompt-textarea') ||
                document.querySelector('div[contenteditable="true"][data-placeholder]') ||
                document.querySelector('div[contenteditable="true"].ProseMirror') ||
                document.querySelector('div[contenteditable="true"]') ||
                document.querySelector('textarea')
              )
              const sendBtn = !!(
                document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label="Send prompt"]') ||
                document.querySelector('button[aria-label="Send message"]') ||
                Array.from(document.querySelectorAll('form button[type="button"]')).some(b => !b.disabled)
              )
              return input && sendBtn
            })()`).then(found => {
              if (found) {
                clearTimeout(timer); settled = true
                window.api.log('[ImageGen] ChatGPT input + send button ready — 2s settle buffer')
                setTimeout(() => resolve(true), 2000)
              } else if (++attempts < 60) setTimeout(poll, 500)
              else { clearTimeout(timer); settled = true; resolve(false) }
            }).catch(() => { if (++attempts < 60) setTimeout(poll, 500) })
          }
          setTimeout(poll, 600)
        }
        wv.addEventListener('did-stop-loading', onStop)
        setTimeout(onStop, 200)
      })
    }

    const clickNewChat = async (wv: WebviewElement): Promise<void> => {
      try {
        await wv.executeJavaScript(`(function(){
          var btn = document.querySelector('a[href="/"],button[aria-label*="New"],button[aria-label*="new chat" i],[data-testid="new-chat-button"]');
          if(!btn){
            var links = Array.from(document.querySelectorAll('a,button'));
            btn = links.find(function(el){ return /new.?chat/i.test(el.getAttribute('aria-label')||el.textContent||''); });
          }
          if(btn){ btn.click(); return true; }
          return false;
        })()`)
        await sleep(1200)
      } catch {}
    }

    const wv = await getWv()
    if (!wv) {
      setPrompts(prev => prev.map(p => ({ ...p, status: 'error' as const, error: 'Webview failed to mount' })))
      autoRunningRef.current = false
      return
    }

    const jobs = autoQueueRef.current
    for (let jobIdx = 0; jobIdx < jobs.length; jobIdx++) {
      if (autoCancelRef.current) break
      const job = jobs[jobIdx]

      setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'injecting' as const } : p))

      if (jobIdx > 0) {
        await clickNewChat(wv)
        const ready = await waitNetworkIdle(wv)
        if (!ready || autoCancelRef.current) {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'New chat did not load' } : p))
          continue
        }
      } else {
        const ready = await waitNetworkIdle(wv)
        if (!ready || autoCancelRef.current) {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'ChatGPT did not load — check login' } : p))
          break
        }
      }

      // Dismiss modals
      try {
        await wv.executeJavaScript(`(function(){
          var modal = document.querySelector('[data-testid="modal-personality-onboarding"],[role="dialog"]');
          if(!modal) return;
          var closeBtn = modal.querySelector('button[aria-label="Close"],button[data-testid="close-button"]');
          if(closeBtn){ closeBtn.click(); return; }
          modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        })()`)
        await sleep(400)
      } catch {}

      try { await wv.executeJavaScript(IMAGE_WATCHER_JS) } catch {}

      try {
        await wv.executeJavaScript(buildMouseMoveScript(
          '#prompt-textarea, div[contenteditable="true"][data-placeholder], div[contenteditable="true"]'
        ))
        await sleep(200 + Math.random() * 250)
      } catch {}

      activePostRef.current = job.postId

      // Snapshot which images are already on the page so the status script
      // only accepts NEW images (prevents previous job's image being re-used).
      try { await wv.executeJavaScript(SNAPSHOT_EXISTING_IMAGES_JS) } catch {}

      // Inject prompt
      setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'injecting' as const } : p))
      const prefixedPrompt = `Generate the image for the given prompt. I only need the image, no text or explanations, just generate the image:\n\n${job.prompt}`

      try {
        const raw = await wv.executeJavaScript(buildInjectorScript(prefixedPrompt))
        const res = JSON.parse(raw as string) as { success: boolean; error?: string }
        window.api.log(`[ImageGen] Inject result:`, res)
        if (!res.success) {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: res.error || 'Inject failed' } : p))
          activePostRef.current = null
          await sleep(1500)
          continue
        }
      } catch (e) {
        window.api.log(`[ImageGen][ERROR] Inject threw:`, e)
        setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: String(e) } : p))
        activePostRef.current = null
        await sleep(1500)
        continue
      }

      // ── Image capture — 3 phases: generate → render buffer → download+retry
      const RENDER_BUFFER_MS = 40_000
      const RETRY_WAIT_MS    = 30_000
      const MAX_RETRIES      = 5
      const MIN_KB           = 300

      setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'waiting_image' as const } : p))
      window.api.log(`[ImageGen] ── Starting capture loop for: ${job.title} ──`)

      const PHASE_TIMEOUT = 5 * 60 * 1000
      const deadline = Date.now() + PHASE_TIMEOUT
      let captured = false
      let generationStarted = false
      let generationDone = false
      let renderBufferStart = 0
      let currentImageUrl: string | null = null

      // Phase 1: Poll until generation complete
      while (Date.now() < deadline && !autoCancelRef.current && !generationDone) {
        await sleep(1500)
        try {
          const raw = await wv.executeJavaScript(CHATGPT_STATUS_JS)
          const st = JSON.parse(raw as string) as {
            done: boolean; generating: boolean
            imageUrl: string | null; blurry: boolean; hasChoice: boolean; found: number
          }
          if (st.hasChoice) {
            await wv.executeJavaScript(`(function(){
              var imgs = document.querySelectorAll('.grid img,[data-testid*="choice"] img,[class*="grid"] img');
              if(imgs[0]){ var btn = imgs[0].closest('button')||imgs[0].closest('[role="button"]'); if(btn) btn.click(); }
            })()`)
            await sleep(1500)
            continue
          }
          if (st.generating) generationStarted = true
          if (generationStarted && !st.generating) {
            generationDone = true
            currentImageUrl = st.imageUrl
            renderBufferStart = Date.now()
            window.api.log(`[ImageGen] Generation complete — imageUrl: ${(currentImageUrl || 'none').slice(0, 80)}`)
          }
        } catch {}
      }

      if (!generationDone) {
        setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'Generation timed out' } : p))
        continue
      }

      // Phase 2: Render buffer — wait for CDN to encode full-res
      const bufferEnd = renderBufferStart + RENDER_BUFFER_MS
      while (Date.now() < bufferEnd && !autoCancelRef.current) {
        await sleep(5000)
        try {
          const raw = await wv.executeJavaScript(CHATGPT_STATUS_JS)
          const st = JSON.parse(raw as string) as { imageUrl: string | null }
          if (st.imageUrl && st.imageUrl !== currentImageUrl) {
            window.api.log(`[ImageGen] Buffer: fresher URL found — switching`)
            currentImageUrl = st.imageUrl
          }
        } catch {}
      }

      if (!currentImageUrl) {
        setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'No image URL found in DOM' } : p))
        continue
      }

      window.api.log(`[ImageGen] Buffer complete — downloading: ${currentImageUrl.slice(0, 80)}`)

      // Phase 3: Download with retry
      for (let attempt = 1; attempt <= MAX_RETRIES && !captured && !autoCancelRef.current; attempt++) {
        if (attempt > 1) {
          window.api.log(`[ImageGen] Retry ${attempt}/${MAX_RETRIES} — waiting ${RETRY_WAIT_MS / 1000}s`)
          await sleep(RETRY_WAIT_MS)
          try {
            const raw = await wv.executeJavaScript(CHATGPT_STATUS_JS)
            const st = JSON.parse(raw as string) as { imageUrl: string | null }
            if (st.imageUrl && st.imageUrl !== currentImageUrl) {
              window.api.log(`[ImageGen] Retry ${attempt}: fresher URL found`)
              currentImageUrl = st.imageUrl
            }
          } catch {}
        }

        window.api.log(`[ImageGen] Download attempt ${attempt} — url: ${currentImageUrl!.slice(0, 80)}`)
        const { tmpPath, success, sizeKb } = await window.api.downloadBrowserImage({
          url: currentImageUrl!, postId: job.postId,
        }) as { tmpPath: string; success: boolean; sizeKb?: number }

        const kb = sizeKb ?? 0
        window.api.log(`[ImageGen] Download result: success=${success} size=${kb}KB path=${tmpPath}`)

        if (!success || !tmpPath) continue
        if (kb > 0 && kb < MIN_KB) {
          window.api.log(`[ImageGen] Attempt ${attempt}: size ${kb}KB < ${MIN_KB}KB — retrying`)
          continue
        }

        window.api.log(`[ImageGen] ✓ Quality gate passed — ${kb}KB — injecting`)
        captured = true
        handleImageFound(tmpPath, job.postId)
        break
      }

      if (!captured) {
        setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: `All ${MAX_RETRIES} attempts failed` } : p))
      }

      if (!autoCancelRef.current && jobIdx < jobs.length - 1) await sleep(2000)
    }

    autoRunningRef.current = false
    setToast('All images generated ✓')
    setTimeout(() => setToast(null), 4000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleImageFound])

  // ── Imperative API ───────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    queueBatch(jobs: ImageGenQueueJob[], chatGptUrl: string): void {
      autoChatUrlRef.current  = chatGptUrl
      autoCancelRef.current   = false
      autoRunningRef.current  = false
      autoQueueRef.current    = jobs

      const t = makeTab(chatGptUrl)
      autoTabIdRef.current = t.id
      setTabs(prev => [...prev, t])
      setActiveId(t.id)

      setPrompts(jobs.map(j => ({ postId: j.postId, prompt: j.prompt, title: j.title, status: 'pending' as const })))
      setTimeout(() => void runAutoQueue(), 150)
    },
    cancelQueue(): void {
      autoCancelRef.current  = true
      autoRunningRef.current = false
      activePostRef.current  = null
    },
  }), [runAutoQueue])

  const clearPrompts = useCallback((): void => {
    setPrompts([])
    localStorage.removeItem('elite_pending_prompts')
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--surface-0)' }}>

      {/* ══ TAB STRIP ══════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        padding: '5px 8px 0', gap: 2,
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
        minHeight: 40,
      }}>
        {tabs.map(tab => {
          const isActive  = tab.id === activeId
          const isDragged = tab.id === dragId
          const isOver    = tab.id === dragOver
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={e => handleDragOver(e, tab.id)}
              onDrop={e => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveId(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px 0 12px', minWidth: 100, maxWidth: 210, flexShrink: 0,
                borderRadius: '9px 9px 0 0', position: 'relative',
                background: isActive
                  ? 'var(--surface-2)'
                  : isOver
                    ? 'rgba(255,255,255,0.04)'
                    : 'transparent',
                border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                borderBottom: isActive ? '1px solid var(--surface-2)' : '1px solid transparent',
                marginBottom: isActive ? -1 : 0,
                cursor: 'pointer', userSelect: 'none',
                opacity: isDragged ? 0.35 : 1,
                outline: isOver && !isDragged ? '1px solid var(--accent-border)' : 'none',
                transition: 'background 0.12s, opacity 0.12s',
              }}
            >
              {/* Active accent underline */}
              {isActive && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '18%', right: '18%', height: 2,
                  background: 'linear-gradient(90deg,transparent,var(--accent),transparent)',
                  borderRadius: 1, opacity: 0.7,
                }}/>
              )}
              {tab.loading
                ? <Loader size={11} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 0.8s linear infinite' }} />
                : tab.favicon
                  ? <img src={tab.favicon} width={13} height={13} style={{ borderRadius: 3, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  : <Globe size={11} style={{ color: isActive ? 'var(--text-secondary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
              }
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {tab.title.length > 22 ? tab.title.slice(0, 22) + '…' : tab.title}
              </span>
              <button
                onClick={e => closeTab(tab.id, e)}
                title="Close tab (Ctrl+W)"
                style={{
                  background: 'none', border: 'none', padding: '2px 3px',
                  cursor: 'pointer', color: 'var(--text-tertiary)',
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                  borderRadius: 4,
                  opacity: isActive ? 0.45 : 0,
                  transition: 'opacity 0.12s, background 0.12s, color 0.12s',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.opacity = '1'
                  b.style.background = 'rgba(255,255,255,0.1)'
                  b.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.opacity = isActive ? '0.45' : '0'
                  b.style.background = 'transparent'
                  b.style.color = 'var(--text-tertiary)'
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}
        <button
          onClick={() => addTab()}
          title="New tab (Ctrl+T)"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', padding: '0 11px',
            display: 'flex', alignItems: 'center',
            borderRadius: '8px 8px 0 0', flexShrink: 0,
            transition: 'color 0.12s, background 0.12s',
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.color = 'var(--text-secondary)'
            b.style.background = 'rgba(255,255,255,0.06)'
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.color = 'var(--text-tertiary)'
            b.style.background = 'transparent'
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ══ NAV BAR ════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '5px 10px',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        {([
          { icon: ArrowLeft,  tip: 'Back',    on: activeTab?.canBack, act: () => wvMap.current.get(activeId)?.goBack()    },
          { icon: ArrowRight, tip: 'Forward', on: activeTab?.canFwd,  act: () => wvMap.current.get(activeId)?.goForward() },
          { icon: activeTab?.loading ? X : RotateCcw, tip: activeTab?.loading ? 'Stop' : 'Reload', on: true,
            act: () => activeTab?.loading ? wvMap.current.get(activeId)?.stop?.() : wvMap.current.get(activeId)?.reload() },
          { icon: Home, tip: 'New Tab', on: true, act: () => navigateTab(activeId, 'elite://newtab') },
        ] as const).map(({ icon: Icon, tip, on, act }) => (
          <button key={tip} onClick={act} title={tip} disabled={!on} style={{
            background: 'none', border: 'none', padding: '6px 7px', borderRadius: 7,
            cursor: on ? 'pointer' : 'default',
            color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'background 0.1s',
          }}
            onMouseEnter={e => { if (on) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <Icon size={14} />
          </button>
        ))}

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface-0)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 9, padding: '0 12px',
          transition: 'border-color 0.12s, box-shadow 0.12s',
        }}>
          {activeTab?.loading
            ? <Loader size={11} style={{ color: 'var(--accent)', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            : isSecure
              ? <Lock  size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
              : <Globe size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          }
          <input
            value={activeTab?.inputUrl ?? ''}
            onChange={e => updateTab(activeId, { inputUrl: e.target.value })}
            onFocus={e => e.currentTarget.select()}
            onKeyDown={e => e.key === 'Enter' && submitUrl()}
            placeholder="Search or enter URL..."
            style={{
              flex: 1, padding: '7px 0',
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          />
        </div>

        <button
          onClick={() => setSettingsOpen(p => !p)}
          title="Browser settings"
          style={{
            background: settingsOpen ? 'var(--surface-3)' : 'none',
            border: `1px solid ${settingsOpen ? 'var(--border-default)' : 'transparent'}`,
            padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
            color: settingsOpen ? 'var(--text-primary)' : 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.12s',
          }}
        >
          <Settings size={14} />
        </button>
      </div>

      {/* ══ WEBVIEW AREA ═══════════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {tabs.map(tab => (
          <TabView
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            wvMap={wvMap}
            onUpdate={updateTab}
            onNavigate={navigateTab}
            onNewTab={addTab}
            activePostRef={activePostRef}
            onImageFound={handleImageFound}
          />
        ))}
        {settingsOpen && <BrowserSettings onClose={() => setSettingsOpen(false)} />}
        <StatusPills prompts={prompts} onClear={clearPrompts} />
      </div>

      {/* ══ TOAST — only for completion/errors ═════════════════════════════ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '11px 18px', borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--accent-border)',
          boxShadow: '0 6px 30px rgba(0,0,0,0.5)',
          fontSize: 13, color: 'var(--text-primary)',
        }}>
          <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          {toast}
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', marginLeft: 4, padding: 0 }}>
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
})

export default AiBrowser
