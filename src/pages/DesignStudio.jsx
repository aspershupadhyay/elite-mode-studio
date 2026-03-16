import { useState, useCallback, useRef, useEffect } from 'react'
import DesignCanvas from '../studio/editor/Canvas.jsx'
import LayerPanel from '../studio/editor/LayerPanel.jsx'
import PropertiesPanel from '../studio/editor/PropertiesPanel.jsx'
import Toolbar from '../studio/editor/Toolbar.jsx'
import BottomToolbar from '../studio/editor/BottomToolbar.jsx'
import ContextMenu from '../studio/editor/ContextMenu.jsx'
import GuideOverlay from '../studio/components/GuideOverlay.jsx'
import RulerGuides from '../studio/components/RulerGuides.jsx'
import PagesPanel from '../studio/components/PagesPanel.jsx'
import { preloadPopularFonts } from '../studio/data/fonts.js'

const LEFT_W = 200, RIGHT_W = 260
const DEFAULT_GUIDES = { h: [], v: [], visible: true }

function InjectToast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100, padding: '8px 18px', borderRadius: 8,
      background: 'var(--green)', color: '#000',
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      boxShadow: '0 4px 20px rgba(11,218,118,0.4)',
      animation: 'slideUp .2s ease',
    }}>{msg}</div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractContentArgs(post) {
  if (!post) return null
  const { title, highlight_words, caption } = post
  const subtitle = caption
    ? caption.split('\n').find(l => l.trim().length > 10)?.slice(0, 150)
    : undefined
  const hashtagMatches = caption ? caption.match(/#[a-zA-Z0-9_]+/g) : null
  const tag = hashtagMatches ? hashtagMatches.slice(0, 5).join(' ') : undefined
  return { title, highlight_words, subtitle, tag }
}

function makePage(i, content = null, canvasJSON = null) {
  return {
    id:         `page_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    label:      content ? `Post ${i + 1}` : `Page ${i + 1}`,
    content,          // raw post data { title, highlight_words, caption, angle }
    canvasJSON,       // saved Fabric.js JSON (null = use template)
    thumbnail:  null, // data URL, captured when leaving page
    rendered:   false,// true once applyGeneratedContent has run
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DesignStudio({ pendingTemplate, pendingContent, pendingBatch, onTemplateSaved }) {
  const canvasHandleRef  = useRef(null)
  const canvasElementRef = useRef(null)
  const studioRef        = useRef(null)
  const switchingRef     = useRef(false)  // guard against re-entrant page switches

  const [canvasSize, setCanvasSize]           = useState({ width:1080, height:1350 })
  const [selectedObject, setSelectedObject]   = useState(null)
  const [fabricCanvas, setFabricCanvas]       = useState(null)
  const [activeTool, setActiveTool]           = useState('select')
  const [zoom, setZoomState]                  = useState(100)
  const [historyTick, setHistoryTick]         = useState(0)
  const [ctxMenu, setCtxMenu]                 = useState(null)
  const [loadedTemplateId, setLoadedTemplateId] = useState(null)
  const [injectMsg, setInjectMsg]             = useState('')
  const [snapGuides, setSnapGuides]           = useState(null)
  const [rulerGuides, setRulerGuides]         = useState(DEFAULT_GUIDES)
  const [pan, setPan]                         = useState({ x: 0, y: 0 })

  // ── Multi-page state ─────────────────────────────────────────────────────
  const [pages, setPages]         = useState([])        // [] means single-canvas mode
  const [activePage, setActivePage] = useState(0)
  const pagesRef = useRef([])
  const activePageRef = useRef(0)
  useEffect(() => { pagesRef.current = pages }, [pages])
  useEffect(() => { activePageRef.current = activePage }, [activePage])

  // Template JSON to use when creating blank pages in multi-page mode
  const batchTemplateRef = useRef(null)

  useEffect(() => { preloadPopularFonts() }, [])

  // Ctrl+; — toggle guide visibility
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ';') {
        e.preventDefault()
        setRulerGuides(g => ({ ...g, visible: !g.visible }))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Helper: apply content args to canvas ─────────────────────────────────
  const applyContent = useCallback((post, delayMs = 250) => {
    if (!post) return
    const args = extractContentArgs(post)
    if (!args) return
    setTimeout(() => {
      canvasHandleRef.current?.applyGeneratedContent(args)
    }, delayMs)
  }, [])

  // ── Helper: load a template JSON into canvas ──────────────────────────────
  const loadTemplate = useCallback((json, w = 1080, h = 1350) => {
    const handle = canvasHandleRef.current
    if (!handle) return
    setCanvasSize({ width: w, height: h })
    handle.changeSize(w, h)
    if (json && json !== '__default__') {
      handle.importJSON(json)
    } else {
      handle.resetToDefault?.()
    }
  }, [])

  // ── Capture thumbnail + JSON for current active page ─────────────────────
  const saveCurrentPage = useCallback(() => {
    const handle = canvasHandleRef.current
    if (!handle || pagesRef.current.length === 0) return
    const idx  = activePageRef.current
    const json  = handle.exportJSON?.()
    const thumb = handle.getThumb?.()
    setPages(prev => prev.map((p, i) =>
      i === idx ? { ...p, canvasJSON: json, thumbnail: thumb } : p
    ))
  }, [])

  // ── Switch to a different page ───────────────────────────────────────────
  const switchPage = useCallback(async (newIdx) => {
    if (switchingRef.current) return
    if (newIdx === activePageRef.current) return
    switchingRef.current = true

    // 1. Save current page state
    saveCurrentPage()

    // Small settle delay
    await new Promise(r => setTimeout(r, 80))

    const target = pagesRef.current[newIdx]
    if (!target) { switchingRef.current = false; return }

    setActivePage(newIdx)

    // 2. Load target page canvas
    if (target.canvasJSON) {
      canvasHandleRef.current?.importJSON(target.canvasJSON)
      // If content not yet applied, apply it
      if (!target.rendered && target.content) {
        applyContent(target.content, 300)
        setPages(prev => prev.map((p, i) => i === newIdx ? { ...p, rendered: true } : p))
      }
    } else {
      // No saved JSON → load from batch template + apply content
      const tmplJSON = batchTemplateRef.current
      if (tmplJSON && tmplJSON !== '__default__') {
        canvasHandleRef.current?.importJSON(tmplJSON)
      } else {
        canvasHandleRef.current?.resetToDefault?.()
      }
      if (target.content) {
        applyContent(target.content, 350)
        setPages(prev => prev.map((p, i) => i === newIdx ? { ...p, rendered: true } : p))
      }
    }

    switchingRef.current = false
    setInjectMsg(`Page ${newIdx + 1} of ${pagesRef.current.length}`)
  }, [saveCurrentPage, applyContent])

  // ── Add blank page ────────────────────────────────────────────────────────
  const addBlankPage = useCallback(() => {
    saveCurrentPage()
    const newPage = makePage(pagesRef.current.length)
    setPages(prev => [...prev, newPage])
    const newIdx = pagesRef.current.length
    setTimeout(() => {
      const tmplJSON = batchTemplateRef.current
      if (tmplJSON && tmplJSON !== '__default__') {
        canvasHandleRef.current?.importJSON(tmplJSON)
      } else {
        canvasHandleRef.current?.resetToDefault?.()
      }
      setActivePage(newIdx)
    }, 100)
  }, [saveCurrentPage])

  // ── Delete a page ─────────────────────────────────────────────────────────
  const deletePage = useCallback((idx) => {
    setPages(prev => {
      const next = prev.filter((_, i) => i !== idx)
      const newActive = Math.min(activePageRef.current, next.length - 1)
      setActivePage(newActive)
      // Load adjacent page
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

  // ── Load template from gallery ────────────────────────────────────────────
  useEffect(() => {
    if (!pendingTemplate) return
    const { canvasJSON, width, height, id } = pendingTemplate
    const w = width || 1080, h = height || 1350
    const timer = setTimeout(() => {
      loadTemplate(canvasJSON, w, h)
      setLoadedTemplateId(id || null)
      // Reset to single-canvas mode when manually loading a template
      setPages([])
      setActivePage(0)
      batchTemplateRef.current = null
    }, 150)
    return () => clearTimeout(timer)
  }, [pendingTemplate, loadTemplate])

  // ── Theme accent sync ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const color = e.detail?.accent
      if (color) canvasHandleRef.current?.updateAccentColor?.(color)
    }
    window.addEventListener('themeChange', handler)
    return () => window.removeEventListener('themeChange', handler)
  }, [])

  // ── Single-post "Send to Studio" (legacy, adds as new page if in multi-page) ──
  useEffect(() => {
    if (!pendingContent) return
    const timer = setTimeout(() => {
      const handle = canvasHandleRef.current; if (!handle) return
      const args = extractContentArgs(pendingContent)
      if (!args) return

      if (pagesRef.current.length > 0) {
        // Multi-page mode: add as a new page
        saveCurrentPage()
        const newPage = makePage(pagesRef.current.length, pendingContent)
        setPages(prev => [...prev, { ...newPage, rendered: true }])
        const newIdx = pagesRef.current.length
        setTimeout(() => {
          setActivePage(newIdx)
          handle.applyGeneratedContent(args)
          setInjectMsg('✓ Post added as new page')
        }, 150)
      } else {
        // Single-canvas mode
        handle.applyGeneratedContent(args)
        setInjectMsg('✓ Content applied to canvas')
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [pendingContent, saveCurrentPage])

  // ── Batch from ContentLab → multi-artboard mode ───────────────────────────
  useEffect(() => {
    if (!pendingBatch) return
    const { posts, templateJSON } = pendingBatch

    batchTemplateRef.current = templateJSON || null

    // Create N page objects
    const newPages = posts.map((post, i) => makePage(i, post, null))
    setPages(newPages)
    setActivePage(0)

    // Load template + render first post immediately
    const timer = setTimeout(() => {
      const handle = canvasHandleRef.current; if (!handle) return
      if (templateJSON && templateJSON !== '__default__') {
        handle.importJSON(templateJSON)
      } else {
        handle.resetToDefault?.()
      }
      if (posts[0]) {
        const args = extractContentArgs(posts[0])
        setTimeout(() => {
          handle.applyGeneratedContent(args)
          setPages(prev => prev.map((p, i) => i === 0 ? { ...p, rendered: true } : p))
          setInjectMsg(`✓ ${posts.length} posts loaded — ${posts.length} pages ready`)
        }, 300)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [pendingBatch])

  const handleSelectionChange = useCallback(obj => setSelectedObject(obj), [])
  const handleHistoryChange   = useCallback(() => {
    setHistoryTick(t => t + 1)
    const c = canvasHandleRef.current?.getCanvas()
    if (c) {
      setFabricCanvas(c)
      if (!canvasElementRef.current) canvasElementRef.current = c.getElement?.()
    }
  }, [])
  const handleSnapGuidesChange = useCallback(data => setSnapGuides(data), [])
  const handlePanChange        = useCallback(newPan => setPan({ ...newPan }), [])
  const handleSizeChange    = useCallback((w, h) => {
    setCanvasSize({ width: w, height: h })
    canvasHandleRef.current?.changeSize(w, h)
  }, [])
  const handleContextMenu   = useCallback((x, y) => setCtxMenu({ x, y }), [])
  const handleZoomChange    = useCallback(z => {
    setZoomState(z)
    canvasHandleRef.current?.setZoom(z)
  }, [])
  const handleCanvasZoom    = useCallback(z => setZoomState(z), [])
  const handleZoomFit       = useCallback(() => {
    canvasHandleRef.current?.zoomToFit()
    setTimeout(() => {
      const z = canvasHandleRef.current?.getZoom()
      if (z) setZoomState(z)
    }, 10)
  }, [])

  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
      {/* Left — Layers */}
      <div style={{ position:'absolute', top:0, bottom:0, left:0, width:LEFT_W, overflow:'hidden' }}>
        <LayerPanel canvas={fabricCanvas} selectedObject={selectedObject} canvasRef={canvasHandleRef} tick={historyTick}/>
      </div>

      {/* Center — Toolbar + Canvas + Pages */}
      <div style={{ position:'absolute', top:0, bottom:0, left:LEFT_W, right:RIGHT_W, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Toolbar
          canvasRef={canvasHandleRef}
          currentSize={canvasSize}
          onSizeChange={handleSizeChange}
          onTemplateSaved={onTemplateSaved}
          loadedTemplateId={loadedTemplateId}
          onTemplateUpdated={() => onTemplateSaved?.()}
        />

        {/* Canvas area */}
        <div ref={studioRef} style={{ flex:1, position:'relative', overflow:'hidden' }}>
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
            guides={snapGuides}
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
          onAdd={addBlankPage}
          onDelete={deletePage}
        />
      </div>

      {/* Right — Properties */}
      <div style={{ position:'absolute', top:0, bottom:0, right:0, width:RIGHT_W, overflow:'hidden' }}>
        <PropertiesPanel selectedObject={selectedObject} canvas={fabricCanvas} canvasRef={canvasHandleRef}/>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} canvasRef={canvasHandleRef}
          canvas={fabricCanvas} selectedObject={selectedObject} onClose={() => setCtxMenu(null)}/>
      )}

      {injectMsg && (
        <InjectToast msg={injectMsg} onDone={() => setInjectMsg('')}/>
      )}

      <style>{`@keyframes slideUp { from{transform:translateX(-50%) translateY(10px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }`}</style>
    </div>
  )
}
