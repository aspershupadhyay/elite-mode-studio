import { useState, useCallback, useRef, useEffect } from 'react'
import DesignCanvas from '../../studio/editor/Canvas'
import LayerPanel from '../../studio/editor/LayerPanel'
import PropertiesPanel from '../../studio/editor/PropertiesPanel'
import Toolbar from '../../studio/editor/Toolbar'
import BottomToolbar from '../../studio/editor/BottomToolbar'
import ContextMenu from '../../studio/editor/ContextMenu'
import GuideOverlay from '../../studio/components/GuideOverlay'
import RulerGuides from '../../studio/components/RulerGuides'
import PagesPanel from '../../studio/components/PagesPanel'
import ShortcutsModal from '../../studio/components/ShortcutsModal'
import { preloadPopularFonts } from '../../studio/data/fonts'
import { useCanvasBridge, type PageOps } from '../../studio/mcp/canvasBridge'
import FloatingTextToolbar from '../../studio/editor/FloatingTextToolbar'
import PostElementsSelector from '../../studio/editor/PostElementsSelector'
import { applyGeneratedContentFromProfile, injectGeneratedImage } from '../../studio/editor/canvas-core/content-apply'
import { getActiveProfile } from '../../utils/profileStorage'
import type { Template, Post, Page } from '@/types/domain'
import type { CanvasHandle, GeneratedContentArgs, RulerGuideSet, PanOffset, CanvasSize } from '@/types/canvas'
import type { SessionData } from '@/types/ipc'
import type { GuideData } from '../../studio/components/GuideOverlay'
import type { Canvas as FabricCanvas } from 'fabric'

// ── Constants ────────────────────────────────────────────────────────────────

const LEFT_W         = 200
const LEFT_W_COLLAPSED = 36
const RIGHT_W = 260

const DEFAULT_GUIDES: RulerGuideSet = { h: [], v: [], visible: true }

// ── InjectToast ───────────────────────────────────────────────────────────────

interface InjectToastProps {
  msg: string
  warn?: boolean
  onDone: () => void
}

function InjectToast({ msg, warn, onDone }: InjectToastProps): React.ReactElement {
  useEffect(() => {
    const t = setTimeout(onDone, warn ? 5000 : 2500)
    return (): void => { clearTimeout(t) }
  }, [onDone, warn])

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100, padding: '10px 18px', borderRadius: 8, maxWidth: 420, textAlign: 'center',
      background: warn ? 'var(--status-amber)' : 'var(--accent)',
      color: '#000',
      fontSize: 12, fontWeight: 600,
      boxShadow: warn ? '0 4px 20px rgba(245,158,11,0.4)' : '0 4px 20px rgba(11,218,118,0.4)',
      animation: 'slideUp .2s ease',
    }}>{msg}</div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractContentArgs(post: Post | null | undefined): GeneratedContentArgs | null {
  if (!post) return null
  const { title, highlight_words, caption } = post
  const subtitle = caption
    ? caption.split('\n').find(l => l.trim().length > 10)?.slice(0, 150)
    : undefined
  const hashtagMatches = caption ? caption.match(/#[a-zA-Z0-9_]+/g) : null
  const tag = hashtagMatches ? hashtagMatches.slice(0, 5).join(' ') : undefined
  const highlightStr = Array.isArray(highlight_words) ? highlight_words.join(', ') : (highlight_words as unknown as string | undefined)
  return { title, highlight_words: highlightStr ? [highlightStr] : [], subtitle, tag }
}

function makePage(i: number, content: Post | null = null, canvasJSON: string | null = null): Page {
  return {
    id:         `page_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    label:      content ? `Post ${i + 1}` : `Page ${i + 1}`,
    content,
    canvasJSON,
    thumbnail:  null,
    rendered:   false,
  }
}

// ── BgHighlight state ─────────────────────────────────────────────────────────

interface BgHighlight {
  enabled: boolean
  color: string
}

function readBgHighlight(): BgHighlight {
  try {
    return JSON.parse(localStorage.getItem('elite_studio_prefs') || '{}').bgHighlight
      || { enabled: false, color: '#FFD93D' }
  } catch {
    return { enabled: false, color: '#FFD93D' }
  }
}

// ── Pending apply args ────────────────────────────────────────────────────────

interface PendingApplyArgs {
  args: GeneratedContentArgs
  delayMs: number
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenuState {
  x: number
  y: number
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DesignStudioProps {
  pendingTemplate?: Template
  pendingContent?: Post
  pendingBatch?: { posts: Post[]; templateJSON?: string }
  onTemplateSaved?: () => void
  isActive?: boolean
  /** Map of postId → file:// image URL — populated externally by App-level image gen */
  generatedImages?: Map<string, string>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DesignStudio({
  pendingTemplate,
  pendingContent,
  pendingBatch,
  onTemplateSaved,
  isActive,
  generatedImages,
}: DesignStudioProps): React.ReactElement {
  const canvasHandleRef  = useRef<CanvasHandle | null>(null)
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const studioRef        = useRef<HTMLDivElement | null>(null)
  const switchingRef     = useRef<boolean>(false)


  const [canvasSize, setCanvasSize]             = useState<CanvasSize>({ width: 1080, height: 1350 })
  const [selectedObject, setSelectedObject]     = useState<unknown>(null)
  const [selectionVersion, setSelectionVersion] = useState<number>(0)
  const [fabricCanvas, setFabricCanvas]         = useState<FabricCanvas | null>(null)
  const [activeTool, setActiveTool]             = useState<string>('select')
  const [zoom, setZoomState]                    = useState<number>(100)
  const [historyTick, setHistoryTick]           = useState<number>(0)
  const [ctxMenu, setCtxMenu]                   = useState<CtxMenuState | null>(null)
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null)
  const [injectMsg, setInjectMsg]               = useState<{ msg: string; warn?: boolean } | null>(null)
  const [snapGuides, setSnapGuides]             = useState<unknown>(null)
  const [rulerGuides, setRulerGuides]           = useState<RulerGuideSet>(DEFAULT_GUIDES)
  const [pan, setPan]                           = useState<PanOffset>({ x: 0, y: 0 })
  const [autoFormat, setAutoFormat]             = useState<boolean>(true)
  const [pendingApplyArgs, setPendingApplyArgs] = useState<PendingApplyArgs | null>(null)
  const [studioBgHighlight, setStudioBgHighlight] = useState<BgHighlight>(readBgHighlight)

  // ── Multi-page state ───────────────────────────────────────────────────────
  const [pages, setPages]             = useState<Page[]>([makePage(0)])
  const [activePage, setActivePage]   = useState<number>(0)
  const [pagesCollapsed, setPagesCollapsed]   = useState<boolean>(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false)
  const [layersCollapsed, setLayersCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('studio_layers_collapsed')
    return saved !== null ? saved === 'true' : true
  })
  const pagesRef         = useRef<Page[]>([])
  const activePageRef    = useRef<number>(0)
  const selectedObjRef   = useRef<unknown>(null)
  useEffect(() => { pagesRef.current      = pages },         [pages])
  useEffect(() => { activePageRef.current = activePage },    [activePage])
  useEffect(() => { selectedObjRef.current = selectedObject }, [selectedObject])

  const batchTemplateRef = useRef<string | null>(null)


  // ── Session auto-save state ────────────────────────────────────────────────
  // Guard: never write to disk before session restore has completed.
  // Without this, the blank-canvas history push on Canvas init races against
  // the async IPC load and can overwrite a valid session with an empty one.
  const autoSaveReadyRef    = useRef(false)
  const autoSaveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Session restore state ──────────────────────────────────────────────────
  const pendingSessionRef   = useRef<SessionData | null>(null)
  const sessionRestoredRef  = useRef(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => { preloadPopularFonts() }, [])

  // ── Load last session from disk on mount ──────────────────────────────────
  useEffect(() => {
    if (typeof window.api?.loadSession !== 'function') {
      setSessionLoaded(true)  // no IPC (web build) → start blank
      return
    }
    void window.api.loadSession()
      .then((session) => {
        if (session?.version === '1.0' && Array.isArray(session.pages) && session.pages.length > 0) {
          pendingSessionRef.current = session
        }
        setSessionLoaded(true)
      })
      .catch(() => setSessionLoaded(true))  // corrupt file → blank canvas
  }, [])

  // ── Restore session once canvas is initialised ────────────────────────────
  // Both fabricCanvas (canvas ready) and sessionLoaded (IPC responded) must be
  // truthy before we touch the canvas — handles the race either way.
  useEffect(() => {
    if (!fabricCanvas || !sessionLoaded) return
    if (sessionRestoredRef.current) return
    sessionRestoredRef.current = true

    const session = pendingSessionRef.current
    pendingSessionRef.current = null
    if (!session) {
      // First launch — nothing to restore, unblock auto-save immediately
      autoSaveReadyRef.current = true
      return
    }

    const restoredPages: Page[] = session.pages.map(p => ({
      id:        p.id,
      label:     p.label,
      content:   null,
      canvasJSON: p.canvasJSON,
      thumbnail: p.thumbnail,
      rendered:  true,
    }))
    setPages(restoredPages)

    const activeIdx = Math.max(0, Math.min(session.activePageIndex, session.pages.length - 1))
    setActivePage(activeIdx)

    const activePg = session.pages[activeIdx]
    if (activePg?.canvasJSON) {
      setTimeout(() => {
        canvasHandleRef.current?.importJSON(activePg.canvasJSON!)
        setTimeout(() => {
          canvasHandleRef.current?.restoreViewport(session.zoom, session.pan)
          // Restore fully settled — auto-save is now safe to run
          autoSaveReadyRef.current = true
        }, 120)
      }, 40)
    } else {
      autoSaveReadyRef.current = true
    }
  }, [fabricCanvas, sessionLoaded])

  // When the Studio tab becomes visible, recalculate zoom + redraw selection handles
  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      // Small delay ensures the container has non-zero dimensions after display:block
      setTimeout(() => {
        canvasHandleRef.current?.zoomToFit()
        canvasHandleRef.current?.getCanvas()?.renderAll()
      }, 60)
    }
    prevActiveRef.current = !!isActive
  }, [isActive])

  // Sync studio prefs (bgHighlight) from localStorage/Settings changes
  useEffect(() => {
    const sync = (): void => {
      try {
        const prefs = JSON.parse(localStorage.getItem('elite_studio_prefs') || '{}') as { bgHighlight?: BgHighlight }
        if (prefs.bgHighlight) setStudioBgHighlight(prefs.bgHighlight)
      } catch {}
    }
    window.addEventListener('studioPrefsChange', sync)
    return (): void => { window.removeEventListener('studioPrefsChange', sync) }
  }, [])

  // Ctrl+; — toggle guide visibility
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ';') {
        e.preventDefault()
        setRulerGuides(g => ({ ...g, visible: !g.visible }))
      }
    }
    window.addEventListener('keydown', handler)
    return (): void => { window.removeEventListener('keydown', handler) }
  }, [])

  // ── Auto-save (debounced 1 s, fire-and-forget via IPC) ───────────────────
  const triggerAutoSave = useCallback((): void => {
    if (!autoSaveReadyRef.current) return       // block until restore is done
    if (typeof window.api?.saveSession !== 'function') return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout((): void => {
      const handle = canvasHandleRef.current
      if (!handle) return
      const activeIdx = activePageRef.current
      const liveJSON  = handle.exportJSON?.()  ?? null
      const liveThumb = handle.getThumb?.()    ?? null
      const sessionPages = pagesRef.current.map((p, i) => ({
        id:        p.id,
        label:     p.label,
        canvasJSON: i === activeIdx ? liveJSON  : p.canvasJSON,
        thumbnail:  i === activeIdx ? liveThumb : p.thumbnail,
      }))
      const data: SessionData = {
        version:         '1.0',
        lastModified:    new Date().toISOString(),
        activePageIndex: activeIdx,
        zoom:            handle.getZoom?.()  ?? 100,
        pan:             handle.getPan?.()   ?? { x: 0, y: 0 },
        pages:           sessionPages,
      }
      window.api.saveSession(data)
    }, 1000)
  }, [])

  // ── Helper: apply content args to canvas ──────────────────────────────────

  const applyContent = useCallback((post: Post, delayMs = 250, skipSelector = false): void => {
    if (!post) return
    const args = extractContentArgs(post)
    if (!args) return
    const hasSavedPrefs = !!localStorage.getItem('elite_post_prefs')
    if (!skipSelector && !hasSavedPrefs) {
      setPendingApplyArgs({ args, delayMs })
      return
    }
    let filteredArgs: GeneratedContentArgs = args
    try {
      const prefs = JSON.parse(localStorage.getItem('elite_post_prefs') || '{}') as Record<string, boolean>
      filteredArgs = {
        title:           (prefs.title      !== false) ? args.title           : undefined,
        highlight_words: (prefs.highlights !== false) ? args.highlight_words : [],
        subtitle:        (prefs.subtitle   !== false) ? args.subtitle        : undefined,
        tag:             (prefs.tag        !== false) ? args.tag             : undefined,
      }
    } catch {}
    setTimeout(() => {
      canvasHandleRef.current?.applyGeneratedContent(filteredArgs)
    }, delayMs)
  }, [])

  const handleSelectorConfirm = useCallback((filteredArgs: GeneratedContentArgs): void => {
    setPendingApplyArgs(null)
    setTimeout(() => {
      canvasHandleRef.current?.applyGeneratedContent(filteredArgs)
    }, 100)
  }, [])

  // ── Helper: load a template JSON into canvas ──────────────────────────────

  const loadTemplate = useCallback((json: string, w = 1080, h = 1350): void => {
    const handle = canvasHandleRef.current
    if (!handle) return
    setCanvasSize({ width: w, height: h })
    handle.changeSize(w, h, true)
    if (json && json !== '__default__') {
      handle.importJSON(json)
    } else {
      handle.resetToDefault?.()
    }
  }, [])

  // ── Capture thumbnail + JSON for current active page ──────────────────────

  const saveCurrentPage = useCallback((): void => {
    const handle = canvasHandleRef.current
    if (!handle || pagesRef.current.length === 0) return
    const idx   = activePageRef.current
    const json  = handle.exportJSON?.()
    const thumb = handle.getThumb?.()
    setPages(prev => prev.map((p, i) =>
      i === idx ? { ...p, canvasJSON: json, thumbnail: thumb } : p
    ))
  }, [])

  // ── Switch to a different page ────────────────────────────────────────────

  const switchPage = useCallback(async (newIdx: number): Promise<void> => {
    if (switchingRef.current) return
    if (newIdx === activePageRef.current) return
    switchingRef.current = true

    saveCurrentPage()
    await new Promise<void>(r => setTimeout(r, 80))

    const target = pagesRef.current[newIdx]
    if (!target) { switchingRef.current = false; return }

    // Update ref BEFORE canvas ops so any handleHistoryChange triggered during
    // importJSON/.then captures the thumbnail for the correct (new) page
    activePageRef.current = newIdx
    setActivePage(newIdx)

    if (target.canvasJSON) {
      canvasHandleRef.current?.importJSON(target.canvasJSON)
      if (!target.rendered && target.content) {
        applyContent(target.content, 300)
        setPages(prev => prev.map((p, i) => i === newIdx ? { ...p, rendered: true } : p))
      }
    } else if (target.content) {
      // Page has generated content but no saved JSON yet — load batch template or default
      const tmplJSON = batchTemplateRef.current
      if (tmplJSON && tmplJSON !== '__default__') {
        canvasHandleRef.current?.importJSON(tmplJSON)
      } else {
        canvasHandleRef.current?.resetToDefault?.()
      }
      applyContent(target.content, 350)
      setPages(prev => prev.map((p, i) => i === newIdx ? { ...p, rendered: true } : p))
    } else {
      // Blank page — clear canvas, no default elements
      canvasHandleRef.current?.clearCanvas?.()
    }

    switchingRef.current = false
  }, [saveCurrentPage, applyContent])

  // ── Add blank page ────────────────────────────────────────────────────────

  const addBlankPage = useCallback((): void => {
    saveCurrentPage()
    const newIdx = pagesRef.current.length
    const newPage = makePage(newIdx)
    setPages(prev => [...prev, newPage])
    setTimeout(() => {
      // Update ref BEFORE canvas ops so handleHistoryChange captures thumb for the right page
      activePageRef.current = newIdx
      setActivePage(newIdx)
      canvasHandleRef.current?.clearCanvas?.()
    }, 100)
  }, [saveCurrentPage])

  // ── Delete a page ─────────────────────────────────────────────────────────

  const deletePage = useCallback((idx: number): void => {
    setPages(prev => {
      const next = prev.filter((_, i) => i !== idx)
      const newActive = Math.min(activePageRef.current, next.length - 1)
      // Update ref BEFORE canvas ops so handleHistoryChange captures thumb for the right page
      activePageRef.current = newActive
      setActivePage(newActive)
      const target = next[newActive]
      if (target) {
        setTimeout(() => {
          if (target.canvasJSON) {
            canvasHandleRef.current?.importJSON(target.canvasJSON)
          } else {
            canvasHandleRef.current?.resetToDefault?.()
          }
        }, 80)
      }
      return next
    })
  }, [])

  // ── Duplicate a page ──────────────────────────────────────────────────────

  const duplicatePage = useCallback((idx: number): void => {
    // Capture the live canvas JSON NOW before any state updates (pagesRef is async)
    const isActive = idx === activePageRef.current
    const liveJSON  = isActive ? (canvasHandleRef.current?.exportJSON?.() ?? null) : null
    const liveThumb = isActive ? (canvasHandleRef.current?.getThumb?.() ?? null) : null

    saveCurrentPage()
    const source = pagesRef.current[idx]
    if (!source) return

    // Use live capture for active page; fall back to stored JSON for non-active pages
    const sourceJSON  = liveJSON  ?? source.canvasJSON
    const sourceThumb = liveThumb ?? source.thumbnail

    const copy: Page = {
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: `${source.label} Copy`,
      content:    source.content,
      canvasJSON: sourceJSON,
      thumbnail:  sourceThumb,
      rendered:   source.rendered,
    }
    const newIdx = idx + 1
    setPages(prev => { const n = [...prev]; n.splice(newIdx, 0, copy); return n })
    setTimeout(() => {
      // Update ref BEFORE canvas ops so handleHistoryChange captures thumb for the right page
      activePageRef.current = newIdx
      setActivePage(newIdx)
      if (copy.canvasJSON) {
        canvasHandleRef.current?.importJSON(copy.canvasJSON)
      } else {
        canvasHandleRef.current?.clearCanvas?.()
      }
    }, 100)
  }, [saveCurrentPage])

  // ── Rename a page ─────────────────────────────────────────────────────────

  const renamePage = useCallback((idx: number, name: string): void => {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, label: name } : p))
    triggerAutoSave()
  }, [triggerAutoSave])

  // ── Reorder pages by drag ─────────────────────────────────────────────────

  const reorderPages = useCallback((fromIdx: number, toIdx: number): void => {
    if (fromIdx === toIdx) return
    setPages(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
    setActivePage(prev => {
      if (prev === fromIdx) return toIdx
      if (fromIdx < toIdx && prev > fromIdx && prev <= toIdx) return prev - 1
      if (fromIdx > toIdx && prev >= toIdx && prev < fromIdx) return prev + 1
      return prev
    })
    triggerAutoSave()
  }, [triggerAutoSave])

  // ── Add page from a saved template ────────────────────────────────────────

  const addPageFromTemplate = useCallback((templateJSON: string): void => {
    saveCurrentPage()
    const newIdx = pagesRef.current.length
    const newPage = makePage(newIdx)
    // Pre-populate canvasJSON so switchPage never falls back to resetToDefault
    newPage.canvasJSON = templateJSON
    setPages(prev => [...prev, newPage])
    setTimeout(() => {
      activePageRef.current = newIdx
      setActivePage(newIdx)
      canvasHandleRef.current?.importJSON(templateJSON)
    }, 100)
  }, [saveCurrentPage])

  // ── MCP canvas bridge — mounted here so all page callbacks are defined ──────

  const mcpGetPages = useCallback(() =>
    pagesRef.current.map((p, i) => ({ index: i, label: p.label, isActive: i === activePageRef.current }))
  , [])
  const mcpGetActivePage = useCallback(() => activePageRef.current, [])

  useCanvasBridge(canvasHandleRef, {
    addBlankPage,
    duplicatePage,
    switchPage,
    deletePage,
    renamePage,
    reorderPages,
    getPages:      mcpGetPages,
    getActivePage: mcpGetActivePage,
  })

  // ── Page keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA'].includes(tag)) return
      const isMeta = e.metaKey || e.ctrlKey

      // Helper: is the user actively editing a Fabric Textbox?
      const isFabricEditing = !!(canvasHandleRef.current?.getCanvas()?.getActiveObject() as ({ isEditing?: boolean } | null))?.isEditing

      // Cmd+/ — open/close shortcuts modal (works on all platforms)
      if (isMeta && e.key === '/') { e.preventDefault(); setShowShortcutsModal(v => !v); return }

      // F11 — toggle fullscreen
      if (e.key === 'F11') {
        e.preventDefault()
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {})
        } else {
          document.exitFullscreen().catch(() => {})
        }
        return
      }

      // Cmd+Enter — add blank page (only when not editing text)
      if (isMeta && (e.key === 'Enter' || e.key === 'Return') && !isFabricEditing) {
        e.preventDefault(); addBlankPage(); return
      }

      // Ctrl+Shift+P — toggle pages panel
      if (isMeta && e.shiftKey && e.key === 'P') { e.preventDefault(); setPagesCollapsed(v => !v); return }

      // Cmd+Shift+N — add blank page
      if (isMeta && e.shiftKey && e.key === 'N') { e.preventDefault(); addBlankPage(); return }

      // Cmd+Shift+D — duplicate current page
      if (isMeta && e.shiftKey && e.key === 'D') { e.preventDefault(); duplicatePage(activePageRef.current); return }

      // Ctrl+Shift+Backspace — delete current page (only if >1 page)
      if (isMeta && e.shiftKey && !e.altKey && e.key === 'Backspace' && !isFabricEditing) {
        e.preventDefault()
        if (pagesRef.current.length > 1) deletePage(activePageRef.current)
        return
      }

      // Ctrl+Shift+Alt+Backspace — delete ALL pages (resets to 1 blank)
      if (isMeta && e.shiftKey && e.altKey && e.key === 'Backspace' && !isFabricEditing) {
        e.preventDefault()
        canvasHandleRef.current?.clearCanvas?.()
        setPages([makePage(0)])
        setActivePage(0)
        activePageRef.current = 0
        return
      }

      // Arrow Left/Right — navigate pages when nothing is selected and not editing text
      if (!isMeta && !e.shiftKey && !isFabricEditing
          && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')
          && pagesRef.current.length > 1
          && !selectedObjRef.current) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          const next = Math.min(activePageRef.current + 1, pagesRef.current.length - 1)
          if (next !== activePageRef.current) void switchPage(next)
          return
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const prev = Math.max(activePageRef.current - 1, 0)
          if (prev !== activePageRef.current) void switchPage(prev)
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return (): void => { window.removeEventListener('keydown', handler) }
  }, [addBlankPage, duplicatePage, switchPage, deletePage])

  // ── Load template from gallery ────────────────────────────────────────────

  useEffect(() => {
    if (!pendingTemplate) return
    const { canvas_json, width, height, id } = pendingTemplate
    const w = width || 1080, h = height || 1350
    const timer = setTimeout(() => {
      loadTemplate(canvas_json, w, h)
      setLoadedTemplateId(id && id !== '__new__' ? id : null)
      setPages([makePage(0)])
      setActivePage(0)
      batchTemplateRef.current = null
    }, 150)
    return (): void => { clearTimeout(timer) }
  }, [pendingTemplate, loadTemplate])

  // ── Theme accent sync ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event): void => {
      const color = (e as CustomEvent<{ accent?: string }>).detail?.accent
      if (color) canvasHandleRef.current?.updateAccentColor?.(color)
    }
    window.addEventListener('themeChange', handler)
    return (): void => { window.removeEventListener('themeChange', handler) }
  }, [])

  // ── Single-post "Send to Studio" ──────────────────────────────────────────

  useEffect(() => {
    if (!pendingContent) return
    const timer = setTimeout(async () => {
      const handle = canvasHandleRef.current; if (!handle) return

      // Use profile-aware injection so slotMapping + heuristic fallback both work
      const applyPost = async (): Promise<void> => {
        const fc = handle.getCanvas()
        if (fc) {
          const profile = getActiveProfile()
          const result = await applyGeneratedContentFromProfile(fc, pendingContent, profile)
          if (result.usedHeuristic) {
            setInjectMsg({ msg: `⚠ ${result.reason}`, warn: true })
          } else if (result.missedFields?.length) {
            setInjectMsg({ msg: `⚠ Some fields had no canvas target: ${result.missedFields.join(', ')} — select those elements and assign a Content Slot matching the field ID`, warn: true })
          }
        } else {
          const args = extractContentArgs(pendingContent)
          if (args) handle.applyGeneratedContent(args)
        }
      }

      const existingPages = pagesRef.current
      const isFirstPageBlank = existingPages.length === 1
        && existingPages[0].content === null
        && existingPages[0].canvasJSON === null
      if (existingPages.length > 0 && !isFirstPageBlank) {
        saveCurrentPage()
        const newPage = makePage(existingPages.length, pendingContent)
        setPages(prev => [...prev, { ...newPage, rendered: true }])
        const newIdx = existingPages.length
        setTimeout(async () => {
          setActivePage(newIdx)
          await applyPost()
          if (!injectMsg) setInjectMsg({ msg: '✓ Post added as new page' })
        }, 150)
      } else {
        // Apply to the existing blank page 0
        setPages([makePage(0, pendingContent, null)])
        await applyPost()
        if (!injectMsg) setInjectMsg({ msg: '✓ Content applied to canvas' })
      }
    }, 200)
    return (): void => { clearTimeout(timer) }
  }, [pendingContent, saveCurrentPage])

  // ── Batch from ContentLab → multi-artboard mode ───────────────────────────

  useEffect(() => {
    if (!pendingBatch) return
    const { posts, templateJSON } = pendingBatch
    batchTemplateRef.current = templateJSON || null

    const newPages = posts.map((post, i) => makePage(i, post, null))
    setPages(newPages)
    setActivePage(0)

    const timer = setTimeout(async () => {
      const handle = canvasHandleRef.current; if (!handle) return

      // Load active profile ONCE for the entire batch so all pages use the same mapping
      const profile = getActiveProfile()

      // ── Step 1: load template + apply page 0 ────────────────────────────
      const loadTemplate = async (): Promise<void> => {
        if (templateJSON && templateJSON !== '__default__') {
          await handle.importJSON(templateJSON)
        } else {
          handle.resetToDefault?.()
          await new Promise<void>(r => setTimeout(r, 80))
        }
      }

      const applyPost = async (post: Post): Promise<void> => {
        const fabricCanvas = handle.getCanvas()
        if (fabricCanvas) {
          await applyGeneratedContentFromProfile(fabricCanvas, post, profile)
        } else {
          // Fallback: use CanvasHandle legacy path if direct canvas unavailable
          const args = extractContentArgs(post)
          if (args) handle.applyGeneratedContent(args)
        }
      }

      await loadTemplate()

      if (posts[0]) {
        await applyPost(posts[0])
        setPages(prev => prev.map((p, i) => i === 0 ? { ...p, status: 'rendered' } : p))
      }
      await new Promise<void>(r => setTimeout(r, 350))
      const page0JSON  = handle.exportJSON?.() ?? null
      const page0Thumb = handle.getThumb?.()   ?? null
      setPages(prev => prev.map((p, i) =>
        i === 0 ? { ...p, rendered: true, canvasJSON: page0JSON, thumbnail: page0Thumb } : p
      ))
      setInjectMsg({ msg: `✓ ${posts.length} posts loaded` })

      // ── Step 2: background pre-render pages 1..N ────────────────────────
      // Cycle through each remaining page: load template → apply content →
      // capture JSON+thumb → store. Abort if user switches page (switchingRef).
      // Updates thumbnails progressively so the strip shows correct content.
      let aborted = false
      for (let i = 1; i < posts.length; i++) {
        // If user switched pages, stop background rendering to avoid overwriting their canvas
        if (switchingRef.current || activePageRef.current !== 0) { aborted = true; break }
        const post = posts[i]
        if (!post) continue
        await loadTemplate()
        if (switchingRef.current || activePageRef.current !== 0) { aborted = true; break }
        await applyPost(post)
        await new Promise<void>(r => setTimeout(r, 350))
        const json  = handle.exportJSON?.() ?? null
        const thumb = handle.getThumb?.()   ?? null
        setPages(prev => prev.map((p, idx) =>
          idx === i ? { ...p, rendered: true, canvasJSON: json, thumbnail: thumb } : p
        ))
      }

      // ── Step 3: restore page 0 on canvas (only if not aborted by user nav) ──
      if (!aborted && page0JSON && activePageRef.current === 0) {
        await handle.importJSON(page0JSON)
      }

    }, 200)
    return (): void => { clearTimeout(timer) }
  }, [pendingBatch])

  // ── Inject images from App-level generatedImages map ─────────────────────
  // When App tells us a new image is ready for a postId, find the matching
  // page, attach the imageUrl to the post, and flip status → 'images_ready'
  // so the existing images_ready watcher re-renders that page.

  useEffect(() => {
    if (!generatedImages?.size) return
    console.log('[Studio] generatedImages updated — keys:', [...generatedImages.keys()])
    setPages(prev => prev.map(p => {
      if (!p.content?.id) return p
      const imgUrl = generatedImages.get(p.content.id)
      console.log(`[Studio] page content.id=${p.content.id} → imgUrl=${imgUrl?.slice(0, 50) ?? 'not found'}`)
      if (!imgUrl) return p
      // Skip if already applied to avoid infinite re-render
      if (p.content.images?.primary === imgUrl) return p
      const updatedContent: Post = {
        ...p.content,
        images: { ...p.content.images, primary: imgUrl },
        status: 'images_ready',
      }
      return { ...p, content: updatedContent, status: 'images_ready' }
    }))
  }, [generatedImages])

  // ── Progressive image re-render (images_ready watcher) ───────────────────
  //
  // When an external process (e.g. image scraper) resolves image URLs and
  // sets post.images + page.status = 'images_ready', this effect re-renders
  // that page: loads its saved canvasJSON, re-applies the post content with
  // images, re-exports JSON + thumbnail, and marks it 'rendered'.
  //
  // This runs off the critical path — it only touches pages whose status has
  // just flipped to 'images_ready', never disturbs the active editing page.

  const pagesRef2 = useRef<typeof pages>(pages)
  useEffect(() => { pagesRef2.current = pages }, [pages])

  useEffect(() => {
    // Include pages with no canvasJSON yet — they'll use the batch template as fallback
    const imagePendingPages = pages.filter(p => p.status === 'images_ready' && p.content)
    if (!imagePendingPages.length) return
    const handle = canvasHandleRef.current; if (!handle) return
    const profile = getActiveProfile()

    const rerenderPage = async (pageIdx: number): Promise<void> => {
      const page = pagesRef2.current[pageIdx]
      if (!page?.content) return

      const imgUrl = page.content.images?.primary
      console.log(`[Studio] images_ready page ${pageIdx} — imgUrl: ${imgUrl?.slice(0, 60) ?? 'none'} canvasJSON: ${!!page.canvasJSON}`)

      // Determine which JSON to load — prefer per-page JSON, fall back to batch template
      const jsonToLoad = page.canvasJSON ?? batchTemplateRef.current
      if (!jsonToLoad) {
        console.warn(`[Studio] page ${pageIdx} has no canvasJSON and no batch template — skipping`)
        return
      }

      // Always import the page's own JSON first.
      // Non-active pages processed earlier in the loop overwrite the canvas state,
      // so we can never rely on "the active page is already loaded" — import it fresh.
      await handle.importJSON(jsonToLoad)
      await new Promise<void>(r => setTimeout(r, 200))

      const fabricCanvas = handle.getCanvas()
      if (fabricCanvas) {
        await applyGeneratedContentFromProfile(fabricCanvas, page.content, profile)
        if (imgUrl) await injectGeneratedImage(fabricCanvas, imgUrl)
      }
      await new Promise<void>(r => setTimeout(r, 200))

      const json  = handle.exportJSON?.() ?? null
      const thumb = handle.getThumb?.()   ?? null
      setPages(prev => prev.map((p, i) =>
        i === pageIdx ? { ...p, status: 'rendered', rendered: true, canvasJSON: json, thumbnail: thumb } : p
      ))
    }

    // Process pages sequentially to avoid canvas thrashing.
    // Active page is sorted last so the canvas ends up showing it after the loop —
    // no separate restore step needed (restore used stale pagesRef2 and undid injection).
    void (async () => {
      const sortedPages = [...imagePendingPages].sort((a, b) => {
        const ai = pagesRef2.current.findIndex(p => p.id === a.id)
        const bi = pagesRef2.current.findIndex(p => p.id === b.id)
        const active = activePageRef.current
        if (ai === active) return 1
        if (bi === active) return -1
        return ai - bi
      })
      for (const page of sortedPages) {
        const idx = pagesRef2.current.findIndex(p => p.id === page.id)
        if (idx >= 0) await rerenderPage(idx)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.map(p => p.status).join(',')])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((obj: unknown): void => {
    setSelectedObject(obj)
    setSelectionVersion(v => v + 1)
  }, [])

  const handleHistoryChange = useCallback((): void => {
    setHistoryTick(t => t + 1)
    const c = canvasHandleRef.current?.getCanvas()
    if (c) {
      setFabricCanvas(c)
      if (!canvasElementRef.current) canvasElementRef.current = c.getElement?.() as HTMLCanvasElement | null ?? null
    }
    // Keep active page thumbnail fresh on every canvas change
    const thumb = canvasHandleRef.current?.getThumb?.()
    if (thumb) {
      setPages(prev => prev.map((p, i) =>
        i === activePageRef.current ? { ...p, thumbnail: thumb } : p
      ))
    }
    triggerAutoSave()
  }, [triggerAutoSave])

  const handleSnapGuidesChange = useCallback((data: unknown): void => { setSnapGuides(data) }, [])
  const handlePanChange        = useCallback((newPan: PanOffset): void => { setPan({ ...newPan }) }, [])

  const handleSizeChange = useCallback((w: number, h: number, fromPreset = false): void => {
    setCanvasSize({ width: w, height: h })
    canvasHandleRef.current?.changeSize(w, h, false, fromPreset)
  }, [])

  const handleAutoFormatToggle = useCallback((val: boolean): void => {
    setAutoFormat(val)
    canvasHandleRef.current?.setAutoFormat(val)
  }, [])

  const handleContextMenu = useCallback((x: number, y: number): void => {
    setCtxMenu({ x, y })
  }, [])

  const handleZoomChange = useCallback((z: number): void => {
    setZoomState(z)
    canvasHandleRef.current?.setZoom(z)
  }, [])

  const handleCanvasZoom = useCallback((z: number): void => { setZoomState(z) }, [])

  const handleZoomFit = useCallback((): void => {
    canvasHandleRef.current?.zoomToFit()
    setTimeout(() => {
      const z = canvasHandleRef.current?.getZoom()
      if (z) setZoomState(z)
    }, 10)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  const leftW = layersCollapsed ? LEFT_W_COLLAPSED : LEFT_W

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Left — Layers */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0,
        width: leftW, overflow: 'hidden',
        transition: 'width 160ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <LayerPanel
          canvas={fabricCanvas}
          selectedObject={selectedObject as import('fabric').FabricObject | null}
          canvasRef={canvasHandleRef}
          tick={historyTick}
          collapsed={layersCollapsed}
          onToggleCollapse={() => setLayersCollapsed(v => { const next = !v; localStorage.setItem('studio_layers_collapsed', String(next)); return next })}
        />
      </div>

      {/* Center — Toolbar + Canvas + Pages; overflow:visible so tool dropdowns escape into right panel zone */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: leftW, right: RIGHT_W,
        display: 'flex', flexDirection: 'column', overflow: 'visible',
        transition: 'left 160ms cubic-bezier(0.16,1,0.3,1)',
        zIndex: 20,
      }}>
        <Toolbar
          canvasRef={canvasHandleRef}
          currentSize={canvasSize}
          onSizeChange={handleSizeChange}
          onTemplateSaved={onTemplateSaved}
          loadedTemplateId={loadedTemplateId}
          onTemplateUpdated={() => onTemplateSaved?.()}
          autoFormat={autoFormat}
          onAutoFormatToggle={handleAutoFormatToggle}
          pageCount={pages.length}
        />

        {/* Canvas area — overflow:visible so bottom toolbar dropdowns aren't clipped */}
        <div ref={studioRef} style={{ flex: 1, position: 'relative', overflow: 'visible' }}>
          <DesignCanvas
            ref={canvasHandleRef}
            width={canvasSize.width}
            height={canvasSize.height}
            onSelectionChange={handleSelectionChange}
            onHistoryChange={handleHistoryChange}
            onContextMenu={handleContextMenu}
            onGuidesChange={handleSnapGuidesChange}
            onPanChange={handlePanChange}
            onZoomChange={handleCanvasZoom}
            rulerGuides={rulerGuides}
          />
          <GuideOverlay
            guides={snapGuides as GuideData | null}
            canvasHandle={canvasHandleRef}
            zoom={zoom / 100}
            canvasW={canvasSize.width}
            canvasH={canvasSize.height}
          />
          <RulerGuides
            canvasW={canvasSize.width}
            canvasH={canvasSize.height}
            zoom={zoom / 100}
            pan={pan}
            guides={rulerGuides}
            onGuideChange={setRulerGuides}
            studioRef={studioRef}
          />
          <BottomToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            canvasRef={canvasHandleRef}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            onZoomFit={handleZoomFit}
          />
        </div>

        {/* Pages strip — only visible in multi-page mode */}
        <PagesPanel
          pages={pages}
          activePage={activePage}
          onSwitch={switchPage}
          onAddBlank={addBlankPage}
          onDuplicate={duplicatePage}
          onDelete={deletePage}
          onRename={renamePage}
          onReorder={reorderPages}
          onAddFromTemplate={addPageFromTemplate}
          collapsed={pagesCollapsed}
          onToggleCollapse={() => setPagesCollapsed(p => !p)}
        />
      </div>

      {/* Right — Properties; z-index below center so tool dropdowns render above */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: RIGHT_W, overflow: 'hidden', zIndex: 10 }}>
        <PropertiesPanel key={selectionVersion} selectedObject={selectedObject as import('fabric').FabricObject | null} canvas={fabricCanvas} canvasRef={canvasHandleRef} />
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          canvasRef={canvasHandleRef}
          canvas={fabricCanvas}
          selectedObject={selectedObject as import('fabric').FabricObject | null}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {injectMsg && (
        <InjectToast msg={injectMsg.msg} warn={injectMsg.warn} onDone={() => setInjectMsg(null)} />
      )}

      <FloatingTextToolbar canvasRef={canvasHandleRef} />

      {showShortcutsModal && (
        <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {pendingApplyArgs && (
        <PostElementsSelector
          args={pendingApplyArgs.args}
          onConfirm={handleSelectorConfirm}
          onCancel={() => setPendingApplyArgs(null)}
        />
      )}

      <style>{`@keyframes slideUp { from{transform:translateX(-50%) translateY(10px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }`}</style>
    </div>
  )
}
