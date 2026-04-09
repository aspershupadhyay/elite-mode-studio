/**
 * Canvas.tsx — Fabric.js design surface (TypeScript shell)
 *
 * This component owns the Fabric canvas lifecycle, wires event-bindings and
 * keyboard modules, and exposes the full CanvasHandle API via useImperativeHandle.
 *
 * Heavy logic is delegated to canvas-core/ modules:
 *   fabric-init.ts     — bootstrap Fabric.Canvas
 *   history.ts         — HistoryStack (undo/redo)
 *   keyboard.ts        — keyboard shortcuts
 *   event-bindings.ts  — canvas event listeners + OS drag/drop
 *   transform.ts       — zoom / pan helpers
 *   content-apply.ts   — AI content injection
 */

import {
  useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef,
} from 'react'
import * as fabric from 'fabric'
import '@/types/fabric-custom'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'

import { BG, TEXT_PRIMARY, TEXT_MUTED, SURFACE, ELITE_CUSTOM_PROPS, getAccentColor } from '../canvas/constants'

// Register all Elite custom props into Fabric's global customProperties list.
// This guarantees they are ALWAYS included in toJSON / toObject / clone
// without needing to pass ELITE_CUSTOM_PROPS explicitly everywhere.
ELITE_CUSTOM_PROPS.forEach(p => {
  if (!fabric.FabricObject.customProperties.includes(p)) {
    fabric.FabricObject.customProperties.push(p)
  }
})
import { addDefaultElements } from '../canvas/defaults'
import { pasteFromSystemClipboard, copyToSystemClipboard } from '../canvas/clipboard'
import {
  FRAME_SHAPES,
  addFrame, applyImageToFrame, refitFrame, clearFrameImage,
  loadFileIntoFrame, findFrameAtPoint, highlightFrame, clearFrameHighlight,
} from '../canvas/frames'
import { findSnaps, applySnap, buildResizeGuides } from '../canvas/snapping'
import { registerResizeCursor } from '../canvas/resize-zone'
import { autoFormatCanvas } from '../canvas/autoFormat'
import { applyStylePatch } from '../text/spanOps'
import { pushSelectionToStore, scheduleSelectionUpdate } from '../text/SelectionManager'
import { applyGeneratedContent } from './canvas-core/content-apply'
import { getActiveProfile } from '../../utils/profileStorage'

import type { CanvasHandle, CanvasSize, RulerGuideSet, GeneratedContentArgs } from '@/types/canvas'

// ── Props ─────────────────────────────────────────────────────────────────────
export interface CanvasProps extends CanvasSize {
  onSelectionChange: (obj: FabricObject | null) => void
  onHistoryChange: () => void
  onContextMenu?: (x: number, y: number) => void
  onGuidesChange?: (data: Record<string, unknown> | null) => void
  onPanChange?: (pan: { x: number; y: number }) => void
  onZoomChange?: (zoom: number) => void
  rulerGuides: RulerGuideSet
}

// ── Component ─────────────────────────────────────────────────────────────────
const DesignCanvas = forwardRef<CanvasHandle, CanvasProps>((
  {
    width, height,
    onSelectionChange, onHistoryChange, onContextMenu,
    onGuidesChange, onPanChange, onZoomChange,
    rulerGuides,
  },
  ref,
) => {
  // ── DOM / Fabric refs ──────────────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const fabricRef    = useRef<FabricCanvas | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── History (simple arrays + pointer — avoids HistoryStack import size) ───
  const historyRef  = useRef<string[]>([])
  const historyIdx  = useRef(-1)
  const isRestoring = useRef(false)

  // Internal Fabric clipboard
  const internalClipRef = useRef<FabricObject | null>(null)

  // Deleted-layer recycle bin
  const deletedLayersRef = useRef<Array<{ label: string; type: string; json: Record<string, unknown>; deletedAt: number }>>([])

  // Pan / zoom
  const isPanning   = useRef(false)
  const isSpaceDown = useRef(false)
  const lastMouse   = useRef({ x: 0, y: 0 })

  // Always-current mirrors for stale closures
  const zoomRef = useRef(0.8)
  const panRef  = useRef({ x: 0, y: 0 })

  // Frame drag refs
  const dragOverFrameRef       = useRef<FabricObject | null>(null)
  const canvasImgDragFrameRef  = useRef<FabricObject | null>(null)

  // Ruler guides mirror
  const rulerGuidesRef = useRef(rulerGuides)
  useEffect(() => { rulerGuidesRef.current = rulerGuides }, [rulerGuides])

  // Callback mirrors
  const onPanChangeRef  = useRef(onPanChange)
  const onZoomChangeRef = useRef(onZoomChange)
  useEffect(() => { onPanChangeRef.current  = onPanChange },  [onPanChange])
  useEffect(() => { onZoomChangeRef.current = onZoomChange }, [onZoomChange])

  // Accent
  const accentRef = useRef(getAccentColor())
  const getAccent = (): string => accentRef.current

  // Auto-format
  const autoFormatEnabledRef = useRef(true)

  // ── React state ────────────────────────────────────────────────────────────
  const [zoom, setZoomState] = useState(0.8)
  const [pan,  setPan]       = useState({ x: 0, y: 0 })

  // ─────────────────────────────────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  const saveHistory = useCallback((): void => {
    const c = fabricRef.current
    if (!c || isRestoring.current) return
    const json = JSON.stringify((c as unknown as { toJSON: (props: string[]) => object }).toJSON(ELITE_CUSTOM_PROPS))
    historyRef.current = historyRef.current.slice(0, historyIdx.current + 1)
    historyRef.current.push(json)
    historyIdx.current = historyRef.current.length - 1
    if (historyRef.current.length > 50) { historyRef.current.shift(); historyIdx.current-- }
    onHistoryChange()
  }, [onHistoryChange])

  const restoreFromHistory = useCallback((): void => {
    const c   = fabricRef.current; if (!c) return
    const json = historyRef.current[historyIdx.current]; if (!json) return
    isRestoring.current = true
    c.loadFromJSON(JSON.parse(json)).then(() => {
      c.renderAll()
      isRestoring.current = false
      onSelectionChange(null)
      setTimeout(() => onHistoryChange(), 30)
    })
  }, [onSelectionChange, onHistoryChange])

  const undo = useCallback((): void => {
    if (historyIdx.current <= 0) return
    historyIdx.current--; restoreFromHistory()
  }, [restoreFromHistory])

  const redo = useCallback((): void => {
    if (historyIdx.current >= historyRef.current.length - 1) return
    historyIdx.current++; restoreFromHistory()
  }, [restoreFromHistory])

  // ─────────────────────────────────────────────────────────────────────────
  // ZOOM
  // ─────────────────────────────────────────────────────────────────────────

  const calculateZoom = useCallback((): void => {
    requestAnimationFrame(() => {
      if (!containerRef.current) return
      const cw = containerRef.current.clientWidth  - 100
      const ch = containerRef.current.clientHeight - 140
      if (cw <= 0 || ch <= 0) return
      const newZoom = Math.max(0.1, Math.min(cw / width, ch / height, 0.6))
      setZoomState(newZoom)
      zoomRef.current = newZoom
      const zeroPan = { x: 0, y: 0 }
      setPan(zeroPan); panRef.current = zeroPan
      onPanChangeRef.current?.(zeroPan)
      onZoomChangeRef.current?.(Math.round(newZoom * 100))
    })
  }, [width, height])

  // ─────────────────────────────────────────────────────────────────────────
  // SHAPE TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  const addText = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Textbox('Your text', {
      left: 80, top: Math.round(height * 0.5), width: width - 160,
      fontSize: 64, fill: TEXT_PRIMARY, fontFamily: 'Inter, sans-serif',
      fontWeight: '700', textAlign: 'left', lineHeight: 1.2, editable: true,
    })
    t.eliteType = 'text'; t.eliteLabel = 'Text'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addRect = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const r = new fabric.Rect({
      left: width * 0.2, top: height * 0.3, width: width * 0.3, height: height * 0.15,
      fill: SURFACE, stroke: getAccent(), strokeWidth: 2, strokeUniform: true, rx: 8, ry: 8,
    })
    r.eliteType = 'shape'; r.eliteLabel = 'Rectangle'
    c.add(r); c.setActiveObject(r); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addCircle = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const o = new fabric.Circle({
      left: width * 0.35, top: height * 0.35,
      radius: Math.min(width, height) * 0.08,
      fill: SURFACE, stroke: getAccent(), strokeWidth: 2, strokeUniform: true,
    })
    o.eliteType = 'shape'; o.eliteLabel = 'Circle'
    c.add(o); c.setActiveObject(o); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addLine = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const l = new fabric.Line([width * 0.15, height * 0.5, width * 0.85, height * 0.5], {
      stroke: getAccent(), strokeWidth: 3, strokeUniform: true, strokeLineCap: 'round',
    })
    l.eliteType = 'line'; l.eliteLabel = 'Line'
    c.add(l); c.setActiveObject(l); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addTriangle = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Triangle({
      left: width * 0.35, top: height * 0.3, width: width * 0.15, height: height * 0.15,
      fill: SURFACE, stroke: getAccent(), strokeWidth: 2, strokeUniform: true,
    })
    t.eliteType = 'shape'; t.eliteLabel = 'Triangle'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const _makePolygon = useCallback((pts: Array<{ x: number; y: number }>, label: string): void => {
    const c = fabricRef.current; if (!c) return
    const s = new fabric.Polygon(pts, {
      left: width * 0.35, top: height * 0.3,
      fill: SURFACE, stroke: getAccent(), strokeWidth: 2, strokeUniform: true,
    })
    s.eliteType = 'shape'; s.eliteLabel = label
    c.add(s); c.setActiveObject(s); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addStar = useCallback((): void => {
    const r = Math.min(width, height) * 0.08
    const pts: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2
      pts.push({ x: (i % 2 ? r * 0.45 : r) * Math.cos(a), y: (i % 2 ? r * 0.45 : r) * Math.sin(a) })
    }
    _makePolygon(pts, 'Star')
  }, [_makePolygon, width, height])

  const addPentagon = useCallback((): void =>
    _makePolygon(Array.from({ length: 5 }, (_, i) => ({
      x: Math.min(width, height) * 0.08 * Math.cos((2 * Math.PI / 5) * i - Math.PI / 2),
      y: Math.min(width, height) * 0.08 * Math.sin((2 * Math.PI / 5) * i - Math.PI / 2),
    })), 'Pentagon'), [_makePolygon, width, height])

  const addHexagon = useCallback((): void =>
    _makePolygon(Array.from({ length: 6 }, (_, i) => ({
      x: Math.min(width, height) * 0.08 * Math.cos((Math.PI / 3) * i),
      y: Math.min(width, height) * 0.08 * Math.sin((Math.PI / 3) * i),
    })), 'Hexagon'), [_makePolygon, width, height])

  const addDiamond = useCallback((): void => {
    const s = Math.min(width, height) * 0.1
    _makePolygon([{ x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 }], 'Diamond')
  }, [_makePolygon, width, height])

  const addArrow = useCallback((): void =>
    _makePolygon([
      { x: 0, y: -30 }, { x: 60, y: -30 }, { x: 60, y: -60 }, { x: 120, y: 0 },
      { x: 60, y: 60 }, { x: 60, y: 30 }, { x: 0, y: 30 },
    ], 'Arrow'), [_makePolygon])

  // ─────────────────────────────────────────────────────────────────────────
  // TEXT TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  const addTitle = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Textbox('Your Title', {
      left: 48, top: Math.round(height * 0.56), width: width - 96,
      fontSize: 72, fill: TEXT_PRIMARY, fontFamily: 'Inter, sans-serif',
      fontWeight: '800', textAlign: 'left', lineHeight: 1.12, charSpacing: 20, editable: true,
    })
    t.eliteType = 'title'; t.eliteLabel = 'Title'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addSubtitle = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Textbox('Subtitle text here', {
      left: 48, top: Math.round(height * 0.76), width: width - 96,
      fontSize: 26, fill: TEXT_MUTED, fontFamily: 'Inter, sans-serif',
      fontWeight: '400', textAlign: 'left', lineHeight: 1.4, editable: true,
    })
    t.eliteType = 'text'; t.eliteLabel = 'Subtitle'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addTag = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Textbox('#tag', {
      left: 48, top: height - 80, width: 200,
      fontSize: 16, fill: getAccent(), fontFamily: 'Inter, sans-serif', fontWeight: '600', editable: true,
    })
    t.eliteType = 'tag'; t.eliteLabel = 'Tag'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [height, saveHistory])

  // ─────────────────────────────────────────────────────────────────────────
  // ELEMENT TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  const addAccentLine = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const l = new fabric.Rect({ left: 0, top: height - 6, width, height: 6, fill: getAccent() })
    l.eliteType = 'line'; l.eliteLabel = 'Accent Line'
    c.add(l); c.setActiveObject(l); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addLogo = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const r = Math.round(width * 0.055); const A = getAccent()
    const outer = new fabric.Circle({ radius: r + 4, fill: 'transparent', stroke: A, strokeWidth: 3, strokeUniform: true, originX: 'center', originY: 'center', left: 0, top: 0 })
    const inner = new fabric.Circle({ radius: r, fill: '#1A1A1A', stroke: A + '44', strokeWidth: 1, strokeUniform: true, originX: 'center', originY: 'center', left: 0, top: 0 })
    const txt   = new fabric.FabricText('EM', { fontSize: Math.round(r * 0.8), fill: A, fontFamily: 'Inter, sans-serif', fontWeight: '700', originX: 'center', originY: 'center', left: 0, top: 0 })
    const g     = new fabric.Group([outer, inner, txt], { left: width / 2, top: Math.round(height * 0.49), originX: 'center', originY: 'center' })
    g.eliteType = 'logo'; g.eliteLabel = 'Logo'
    c.add(g); c.setActiveObject(g); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addGradientOverlay = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const rect = new fabric.Rect({ left: 0, top: 0, width, height, strokeWidth: 0 })
    rect.eliteType = 'gradient'; rect.eliteLabel = 'Gradient Overlay'
    rect.eliteGradColor = '#111111'; rect.eliteGradDir = 'tb'; rect.eliteGradStrength = 1
    rect.set('fill', new fabric.Gradient({
      type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: height },
      colorStops: [{ offset: 0, color: 'rgba(17,17,17,0)' }, { offset: 1, color: 'rgba(17,17,17,1)' }],
    }))
    c.add(rect); c.setActiveObject(rect); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])


  // ─────────────────────────────────────────────────────────────────────────
  // IMAGE — FILE UPLOAD
  // ─────────────────────────────────────────────────────────────────────────

  const addImageFromFile = useCallback((file: File): void => {
    const c = fabricRef.current; if (!c) return
    const reader = new FileReader()
    reader.onload = (ev): void => {
      const imgEl = new Image()
      imgEl.onload = (): void => {
        const maxW = width * 0.6; const maxH = height * 0.6
        const scale = Math.min(maxW / imgEl.width, maxH / imgEl.height, 1)
        const pattern = new fabric.Pattern({ source: imgEl, repeat: 'no-repeat' })
        ;(pattern as fabric.Pattern & { patternTransform: number[] }).patternTransform = [scale, 0, 0, scale, -imgEl.width * scale / 2, -imgEl.height * scale / 2]
        const rect = new fabric.Rect({
          left: width / 2, top: height / 2, originX: 'center', originY: 'center',
          width: imgEl.width * scale, height: imgEl.height * scale,
          fill: pattern, stroke: 'transparent', strokeWidth: 0,
        })
        const name = file.name.replace(/\.[^/.]+$/, '') || 'Image'
        rect.eliteType = 'image'; rect.eliteLabel = name
        c.add(rect); rect.setCoords(); (rect as FabricObject & { dirty?: boolean }).dirty = true
        c.setActiveObject(rect); c.renderAll(); saveHistory()
      }
      imgEl.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  }, [width, height, saveHistory])

  // ─────────────────────────────────────────────────────────────────────────
  // OBJECT OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  const deleteSelected = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const active = c.getActiveObject(); if (!active) return
    const objs = active instanceof fabric.ActiveSelection ? active.getObjects() : [active]
    if (active instanceof fabric.ActiveSelection) c.discardActiveObject()
    objs.forEach(obj => {
      deletedLayersRef.current.push({
        label: obj.eliteLabel || 'Element', type: obj.eliteType || 'shape',
        json: obj.toObject(ELITE_CUSTOM_PROPS), deletedAt: Date.now(),
      })
      c.remove(obj as FabricObject)
    })
    c.discardActiveObject(); c.renderAll(); saveHistory(); onHistoryChange()
  }, [saveHistory, onHistoryChange])

  const duplicateSelected = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const active = c.getActiveObject(); if (!active) return
    active.clone(ELITE_CUSTOM_PROPS).then((cloned: FabricObject) => {
      cloned.set({ left: (cloned.left || 0) + 30, top: (cloned.top || 0) + 30 })
      cloned.eliteLabel = (cloned.eliteLabel || '') + ' copy'
      c.add(cloned); c.setActiveObject(cloned); c.renderAll(); saveHistory()
    })
  }, [saveHistory])

  const selectAll = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    c.setActiveObject(new fabric.ActiveSelection(c.getObjects(), { canvas: c }))
    c.renderAll()
  }, [])

  const copyInternal = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    c.getActiveObject()?.clone(ELITE_CUSTOM_PROPS).then((cl: FabricObject) => { internalClipRef.current = cl })
  }, [])

  const pasteInternal = useCallback((): void => {
    const c = fabricRef.current; if (!c || !internalClipRef.current) return
    internalClipRef.current.clone(ELITE_CUSTOM_PROPS).then((cl: FabricObject) => {
      cl.set({ left: (cl.left || 0) + 30, top: (cl.top || 0) + 30 })
      c.add(cl); c.setActiveObject(cl); c.renderAll(); saveHistory()
    })
  }, [saveHistory])

  const bringToFront  = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; c.bringObjectToFront(o as FabricObject); c.renderAll(); saveHistory() }, [saveHistory])
  const sendToBack    = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; c.sendObjectToBack(o as FabricObject); c.renderAll(); saveHistory() }, [saveHistory])
  const bringForward  = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; const arr = c.getObjects(); const idx = arr.indexOf(o); if (idx < arr.length - 1) { c.moveObjectTo(o as FabricObject, idx + 1); c.renderAll(); saveHistory() } }, [saveHistory])
  const sendBackward  = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; const arr = c.getObjects(); const idx = arr.indexOf(o); if (idx > 0) { c.moveObjectTo(o as FabricObject, idx - 1); c.renderAll(); saveHistory() } }, [saveHistory])

  const flipH = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; o.set('flipX', !o.flipX); c.renderAll(); saveHistory() }, [saveHistory])
  const flipV = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; o.set('flipY', !o.flipY); c.renderAll(); saveHistory() }, [saveHistory])

  const toggleVisibility = useCallback((): void => { const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return; o.set('visible', !o.visible); c.discardActiveObject(); c.renderAll(); saveHistory() }, [saveHistory])
  const toggleLock       = useCallback((): void => {
    const c = fabricRef.current; if (!c) return; const o = c.getActiveObject(); if (!o) return
    const locked = !o.selectable
    o.set({ selectable: !locked, evented: !locked, lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked })
    if (locked) c.discardActiveObject(); c.renderAll(); saveHistory()
  }, [saveHistory])

  const groupSelected = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const sel = c.getActiveObject(); if (!(sel instanceof fabric.ActiveSelection)) return
    const objs = sel.getObjects(); if (objs.length < 2) return
    c.discardActiveObject(); objs.forEach(o => c.remove(o as FabricObject))
    const g = new fabric.Group(objs as FabricObject[])
    g.eliteType = 'group'; g.eliteLabel = 'Group'
    c.add(g); c.setActiveObject(g); c.renderAll(); saveHistory()
  }, [saveHistory])

  const ungroupSelected = useCallback((): void => {
    const c = fabricRef.current; if (!c) return
    const active = c.getActiveObject()
    if (!(active instanceof fabric.Group) || active instanceof fabric.ActiveSelection) return

    const items = [...active.getObjects()] as FabricObject[]
    const gMatrix = active.calcTransformMatrix()
    const groupOpacity = active.opacity ?? 1

    c.remove(active)
    c.discardActiveObject()

    // Preserve world position, scale, rotation, and opacity for each child
    items.forEach(item => {
      const childLocalMatrix = item.calcTransformMatrix()
      const worldMatrix = fabric.util.multiplyTransformMatrices(gMatrix, childLocalMatrix)
      const d = fabric.util.qrDecompose(worldMatrix)

      item.set({
        left:   d.translateX,
        top:    d.translateY,
        scaleX: d.scaleX,
        scaleY: d.scaleY,
        angle:  d.angle,
        skewX:  d.skewX || 0,
        skewY:  d.skewY || 0,
        flipX:  false,
        flipY:  false,
        originX: 'left',
        originY: 'top',
        // Composite opacity: child sees group opacity * its own opacity
        opacity: (item.opacity ?? 1) * groupOpacity,
      })
      item.setCoords()
      c.add(item)
    })

    // Select all ungrouped children
    if (items.length > 1) {
      c.setActiveObject(new fabric.ActiveSelection(items, { canvas: c }))
    } else if (items.length === 1) {
      c.setActiveObject(items[0])
    }
    c.renderAll()
    saveHistory()
  }, [saveHistory])

  const getDeletedLayers    = useCallback((): typeof deletedLayersRef.current => [...deletedLayersRef.current], [])
  const restoreDeletedLayer = useCallback((index: number): void => {
    const c = fabricRef.current; if (!c) return
    const items = deletedLayersRef.current; if (index < 0 || index >= items.length) return
    const item  = items[index]; deletedLayersRef.current = items.filter((_, i) => i !== index)
    fabric.util.enlivenObjects([item.json]).then((objs: unknown[]) => {
      const typedObjs = objs as FabricObject[]
      if (typedObjs.length > 0) { c.add(typedObjs[0]); c.setActiveObject(typedObjs[0]); c.renderAll(); saveHistory(); onHistoryChange() }
    })
  }, [saveHistory, onHistoryChange])

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT / IMPORT
  // ─────────────────────────────────────────────────────────────────────────

  const exportJSON = useCallback((): string => {
    const c = fabricRef.current; if (!c) return '{}'
    return JSON.stringify((c as unknown as { toJSON: (props: string[]) => object }).toJSON(ELITE_CUSTOM_PROPS), null, 2)
  }, [])

  const importJSON = useCallback((json: string): Promise<void> => {
    const c = fabricRef.current
    if (!c) return Promise.resolve()
    isRestoring.current = true
    return c.loadFromJSON(JSON.parse(json)).then(() => { c.renderAll(); isRestoring.current = false; saveHistory() })
  }, [saveHistory])

  const exportPNG = useCallback((multiplier = 3): void => {
    const c = fabricRef.current; if (!c) return
    const url = c.toDataURL({ format: 'png', quality: 1, multiplier })
    const a = document.createElement('a'); a.href = url; a.download = `design_${width}x${height}_${multiplier}x.png`; a.click()
  }, [width, height])

  const changeSize = useCallback((w: number, h: number, skipAutoFormat = false, forceAutoFormat = false): void => {
    const c = fabricRef.current; if (!c) return
    const prevW = c.width; const prevH = c.height
    c.setDimensions({ width: w, height: h })
    const shouldFormat = forceAutoFormat
      || (!skipAutoFormat && autoFormatEnabledRef.current)
    if (shouldFormat && c.getObjects().length > 0 && (prevW !== w || prevH !== h)) {
      autoFormatCanvas(c, w, h, prevW ?? null, prevH ?? null)
    }
    c.renderAll(); calculateZoom(); saveHistory()
  }, [calculateZoom, saveHistory])

  const setCanvasBg = useCallback((color: string): void => {
    const c = fabricRef.current; if (!c) return
    c.set('backgroundColor', color); c.renderAll(); saveHistory()
  }, [saveHistory])

  // ─────────────────────────────────────────────────────────────────────────
  // FRAME TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  const addFrameShape = useCallback((shapeKey: string, frameW?: number, frameH?: number): void => {
    const c = fabricRef.current; if (!c) return
    const frame = addFrame(c, shapeKey, { cx: width / 2, cy: height / 2, width: frameW || 500, height: frameH || 500, accent: accentRef.current })
    if (frame) saveHistory()
  }, [width, height, saveHistory])

  const loadImageIntoFrame = useCallback((frame: FabricObject, file: File): void => {
    const c = fabricRef.current; if (!c) return
    loadFileIntoFrame(frame, file, () => { c.renderAll(); saveHistory() })
  }, [saveHistory])

  const setFrameFitMode = useCallback((frame: FabricObject, mode: string): void => {
    if (!frame || frame.eliteType !== 'frame') return
    frame.eliteFitMode = mode as 'fill' | 'fit' | 'stretch' | 'none'
    refitFrame(frame); fabricRef.current?.renderAll(); saveHistory()
  }, [saveHistory])

  const setFrameImageOffset = useCallback((frame: FabricObject, dx: number, dy: number): void => {
    if (!frame || frame.eliteType !== 'frame') return
    frame.eliteImageOffsetX = dx; frame.eliteImageOffsetY = dy
    refitFrame(frame); fabricRef.current?.renderAll(); saveHistory()
  }, [saveHistory])

  const setFrameImageScale = useCallback((frame: FabricObject, scale: number): void => {
    if (!frame || frame.eliteType !== 'frame') return
    frame.eliteImageScale = scale; refitFrame(frame); fabricRef.current?.renderAll(); saveHistory()
  }, [saveHistory])

  const clearFrameImageFn = useCallback((frame: FabricObject): void => {
    if (!frame || frame.eliteType !== 'frame') return
    clearFrameImage(frame, accentRef.current); fabricRef.current?.renderAll(); saveHistory()
  }, [saveHistory])

  // Frame image loader helper (used inside canvas init useEffect, not a callback dep)
  function _loadFileAndApplyToFrame(frame: FabricObject, file: File, fabricCanvas: FabricCanvas, onSave: () => void): void {
    const reader = new FileReader()
    reader.onload = (ev): void => {
      const imgEl = new window.Image()
      imgEl.onload = (): void => { applyImageToFrame(frame, imgEl); fabricCanvas.renderAll(); onSave?.() }
      imgEl.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ICON TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  const addIconToCanvas = useCallback((iconData: { path: string | string[]; label: string; id: string }, color?: string, size?: number): void => {
    const c = fabricRef.current; if (!c) return
    const iconSize  = size  || Math.min(width, height) * 0.15
    const iconColor = color || accentRef.current
    const pathStrings = Array.isArray(iconData.path) ? iconData.path : [iconData.path]

    if (pathStrings.length === 1) {
      const p = new fabric.Path(pathStrings[0], {
        left: width / 2, top: height / 2, originX: 'center', originY: 'center',
        fill: 'transparent', stroke: iconColor, strokeWidth: 1.5, strokeLineCap: 'round', strokeLineJoin: 'round',
      })
      const scale = iconSize / 24
      p.set({ scaleX: scale, scaleY: scale })
      p.eliteType = 'icon'; p.eliteLabel = iconData.label
      p.eliteIconId = iconData.id; p.eliteIconPath = iconData.path as string
      c.add(p); c.setActiveObject(p); c.renderAll(); saveHistory()
    } else {
      const paths = pathStrings.map(d => new fabric.Path(d, {
        fill: 'transparent', stroke: iconColor, strokeWidth: 1.5,
        strokeLineCap: 'round', strokeLineJoin: 'round', originX: 'center', originY: 'center', left: 0, top: 0,
      }))
      const group = new fabric.Group(paths, { left: width / 2, top: height / 2, originX: 'center', originY: 'center' })
      const scale = iconSize / 24
      group.set({ scaleX: scale, scaleY: scale })
      group.eliteType = 'icon'; group.eliteLabel = iconData.label
      c.add(group); c.setActiveObject(group); c.renderAll(); saveHistory()
    }
  }, [width, height, saveHistory])

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API  (useImperativeHandle)
  // ─────────────────────────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    undo, redo,
    canUndo: () => historyIdx.current > 0,
    canRedo: () => historyIdx.current < historyRef.current.length - 1,

    addText, addRect, addCircle, addLine, addImageFromFile,
    addTriangle, addStar, addPentagon, addHexagon, addDiamond, addArrow,
    addTitle, addSubtitle, addTag,
    addAccentLine, addLogo, addGradientOverlay,
    addFrameShape, loadImageIntoFrame, setFrameFitMode,
    setFrameImageOffset, setFrameImageScale, clearFrameImage: clearFrameImageFn,
    FRAME_SHAPES,
    addIconToCanvas,

    deleteSelected, duplicateSelected, selectAll,
    copy: copyInternal, paste: pasteInternal,
    bringToFront, sendToBack, bringForward, sendBackward,
    flipHorizontal: flipH, flipV, toggleVisibility, toggleLock,
    groupSelected, ungroupSelected,
    getDeletedLayers, restoreDeletedLayer,

    addFrame: addFrameShape,
    savePngBatch: async (): Promise<void> => {
      const c = fabricRef.current; if (!c) return
      const dataUrl = c.toDataURL({ format: 'png', quality: 1, multiplier: 3 })
      const base64 = dataUrl.split(',')[1] ?? dataUrl
      if (window.api?.savePngBatch) {
        await window.api.savePngBatch({ files: [{ filename: `design_${width}x${height}.png`, base64 }] })
      } else {
        const a = document.createElement('a'); a.href = dataUrl; a.download = `design_${width}x${height}.png`; a.click()
      }
    },

    exportJSON, importJSON, exportPNG, changeSize, setCanvasBg,
    getCanvas: (): FabricCanvas | null => fabricRef.current,
    saveHistory: (): void => saveHistory(),

    setAutoFormat: (enabled: boolean): void => { autoFormatEnabledRef.current = enabled },
    getAutoFormat: (): boolean => autoFormatEnabledRef.current,
    runAutoFormat: (): void => {
      const c = fabricRef.current; if (!c) return
      autoFormatCanvas(c, c.width ?? 0, c.height ?? 0, null, null)
      c.renderAll(); saveHistory()
    },
    getThumb: (): string | null =>
      fabricRef.current?.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 0.12 }) ?? null,

    setZoom: (p: number): void => {
      const z = Math.max(0.1, Math.min(5, p / 100))
      zoomRef.current = z; setZoomState(z)
    },
    getZoom: (): number => Math.round(zoom * 100),
    zoomToFit: (): void => calculateZoom(),

    resetToDefault: (): void => {
      const c = fabricRef.current; if (!c) return
      c.clear(); c.set('backgroundColor', BG)
      addDefaultElements(c, c.width, c.height, accentRef.current)
      c.renderAll(); saveHistory()
    },

    clearCanvas: (): void => {
      const c = fabricRef.current; if (!c) return
      c.clear(); c.set('backgroundColor', BG)
      c.renderAll(); saveHistory()
    },

    updateAccentColor: (newColor: string): void => {
      accentRef.current = newColor
      const c = fabricRef.current; if (!c) return
      c.getObjects().forEach(obj => {
        if (obj.eliteType === 'tag') { obj.set('fill', newColor); (obj as FabricObject & { dirty?: boolean }).dirty = true }
      })
      c.renderAll()
    },

    applySelectionStyle: (styles: Record<string, string | number | boolean | null>): void => {
      const c = fabricRef.current; if (!c) return
      const obj = c.getActiveObject()
      if (!obj || !(obj as FabricObject & { isEditing?: boolean }).isEditing) return
      applyStylePatch(obj as unknown as import('fabric').IText, c, styles)
      pushSelectionToStore(obj as FabricObject, canvasRef.current, c)
    },

    applyGeneratedContent: (args: GeneratedContentArgs): void => {
      const c = fabricRef.current; if (!c) return
      // Lab highlight color overrides the app accent for keyword coloring
      const labColor = localStorage.getItem('lab_highlight_color')
      // Read studio-fill prefs from active profile
      const _sp = getActiveProfile().studioPrefs
      const prefs = _sp
        ? { ..._sp }
        : { title: true, highlights: true, subtitle: false, tag: false }
      applyGeneratedContent(c, args, labColor || accentRef.current || getAccentColor(), prefs)
      setTimeout(() => saveHistory(), 50)
    },

    pasteFromClipboard: (): Promise<{ success: boolean }> =>
      pasteFromSystemClipboard({ canvas: fabricRef.current, width, height, accent: accentRef.current, saveHistory }),

    getCanvasBounds: (): { left: number; top: number; width: number; height: number } | null => {
      if (!canvasRef.current || !containerRef.current) return null
      const cRect = canvasRef.current.getBoundingClientRect()
      const pRect = containerRef.current.getBoundingClientRect()
      return { left: cRect.left - pRect.left, top: cRect.top - pRect.top, width: cRect.width, height: cRect.height }
    },

    getPan: (): { x: number; y: number } => ({ ...panRef.current }),

    restoreViewport: (zoomPct: number, pan: { x: number; y: number }): void => {
      const z = Math.max(0.1, Math.min(5, zoomPct / 100))
      zoomRef.current = z
      setZoomState(z)
      panRef.current = pan
      setPan(pan)
      onPanChangeRef.current?.(pan)
      onZoomChangeRef.current?.(Math.round(z * 100))
    },
  }))

  // ─────────────────────────────────────────────────────────────────────────
  // CANVAS INIT  (runs once on mount)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width, height, backgroundColor: BG,
      selection: true, preserveObjectStacking: true,
      stopContextMenu: true, fireRightClick: true,
    })

    const initAccent = getAccentColor()
    accentRef.current = initAccent

    // ── Swift-style selection handles ──────────────────────────────────────
    const ACCENT   = '#C96A42'
    const CORNER_R = 11   // corner circle radius
    const PILL_L   = 16   // pill long-axis half
    const PILL_S   = 9    // pill short-axis half (must be > border line half-width)
    const SW       = 1.5  // handle stroke width

    // Corner renderer — bold filled circle
    const renderCornerHandle = (
      ctx: CanvasRenderingContext2D,
      left: number, top: number,
    ): void => {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.30)'
      ctx.shadowBlur  = 6
      ctx.shadowOffsetY = 2
      ctx.beginPath()
      ctx.arc(left, top, CORNER_R, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = ACCENT
      ctx.lineWidth   = SW
      ctx.stroke()
      ctx.restore()
    }

    // Mid-edge renderer — bold pill / capsule
    const renderEdgeHandle = (
      ctx: CanvasRenderingContext2D,
      left: number, top: number,
      _style: unknown,
      _obj: unknown,
      key: string,
    ): void => {
      const isHoriz = key === 'mt' || key === 'mb'
      const hw = isHoriz ? PILL_L : PILL_S
      const hh = isHoriz ? PILL_S : PILL_L
      const r  = Math.min(hw, hh)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.22)'
      ctx.shadowBlur  = 5
      ctx.shadowOffsetY = 2
      ctx.beginPath()
      ctx.roundRect(left - hw, top - hh, hw * 2, hh * 2, r)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = ACCENT
      ctx.lineWidth   = SW
      ctx.stroke()
      ctx.restore()
    }

    // Apply our renderers + hit areas to a controls map
    const applyHandleRenderers = (controls: Record<string, fabric.Control>): void => {
      ;(['tl', 'tr', 'bl', 'br'] as const).forEach(k => {
        if (!controls[k]) return
        controls[k].render = renderCornerHandle
        controls[k].sizeX  = (CORNER_R + 6) * 2
        controls[k].sizeY  = (CORNER_R + 6) * 2
      })
      ;(['mt', 'mb', 'ml', 'mr'] as const).forEach(k => {
        if (!controls[k]) return
        const key = k
        controls[k].render = (ctx, left, top, style, obj2) => renderEdgeHandle(ctx, left, top, style, obj2, key)
        controls[k].sizeX  = (k === 'ml' || k === 'mr') ? (PILL_S + 6) * 2 : (PILL_L + 6) * 2
        controls[k].sizeY  = (k === 'mt' || k === 'mb') ? (PILL_S + 6) * 2 : (PILL_L + 6) * 2
      })
      // Hide rotation handle (no ugly connector line)
      if (controls['mtr']) controls['mtr'].visible = false
    }

    // Patch controls directly on a single object
    const patchObjControls = (obj: fabric.FabricObject): void => {
      const controls = obj.controls as Record<string, fabric.Control>
      if (!controls) return
      applyHandleRenderers(controls)
    }

    // Override prototype.createControls so every new instance gets our renderers
    const proto = fabric.FabricObject.prototype as fabric.FabricObject & { createControls?: () => Record<string, fabric.Control> }
    if (typeof proto.createControls === 'function') {
      const _orig = proto.createControls
      proto.createControls = function (this: fabric.FabricObject) {
        const controls = _orig.call(this) as Record<string, fabric.Control>
        applyHandleRenderers(controls)
        return controls
      }
    }

    // Patch objects already on canvas + any added later
    canvas.getObjects().forEach(o => { patchObjControls(o) })
    canvas.on('object:added', ({ target }) => {
      patchObjControls(target as fabric.FabricObject)
    })

    // Visual defaults via ownDefaults (correct v6 API — prototype.set() is ignored)
    Object.assign(fabric.FabricObject.ownDefaults, {
      transparentCorners: false,
      cornerColor:        '#FFFFFF',
      cornerStrokeColor:  ACCENT,
      cornerSize:         CORNER_R * 2,
      cornerStyle:        'rect',
      borderColor:        ACCENT,
      borderScaleFactor:  6,
      padding:            0,
      snapAngle:          15,
      hasBorders:              true,
      hasControls:             true,
      borderOpacityWhenMoving: 1,
    })
    // editingBorderColor lives on IText.ownDefaults, not FabricObject — patch it directly
    if (fabric.IText?.ownDefaults) {
      (fabric.IText.ownDefaults as Record<string, unknown>).editingBorderColor = ACCENT
    }

    // Selection events
    canvas.on('selection:created', (e: { selected?: FabricObject[] }) => onSelectionChange(e.selected?.[0] ?? null))
    canvas.on('selection:updated', (e: { selected?: FabricObject[] }) => onSelectionChange(e.selected?.[0] ?? null))
    canvas.on('selection:cleared', () => onSelectionChange(null))
    canvas.on('object:modified',   (e: { target?: FabricObject }) => { if (e.target) onSelectionChange(e.target); saveHistory() })

    // Frame image layer sync
    const syncFrameImageLayer = (frame: FabricObject | null): void => {
      if (!frame || frame.eliteType !== 'frame') return
      const imgLayer = (frame as FabricObject & { _elitePrevFabricImg?: FabricObject; _eliteClip?: FabricObject })._elitePrevFabricImg
      const clip     = (frame as FabricObject & { _eliteClip?: FabricObject })._eliteClip
      if (!imgLayer || !clip) return
      const center = frame.getCenterPoint()
      const fw = frame.width || 500; const fh = frame.height || 500
      const fmode  = frame.eliteFitMode || 'fill'
      const offX   = frame.eliteImageOffsetX || 0; const offY = frame.eliteImageOffsetY || 0
      const extra  = frame.eliteImageScale   || 1
      const iw = imgLayer.width || 1; const ih = imgLayer.height || 1
      let imgW: number, imgH: number, imgRelLeft: number, imgRelTop: number
      if (fmode === 'fill') {
        const scale = Math.max(fw / iw, fh / ih) * extra
        imgW = iw * scale; imgH = ih * scale; imgRelLeft = -imgW / 2 + offX; imgRelTop = -imgH / 2 + offY
      } else if (fmode === 'fit') {
        const scale = Math.min(fw / iw, fh / ih) * extra
        imgW = iw * scale; imgH = ih * scale; imgRelLeft = -imgW / 2 + offX; imgRelTop = -imgH / 2 + offY
      } else if (fmode === 'stretch') {
        imgW = fw * extra; imgH = fh * extra; imgRelLeft = -fw / 2 + offX; imgRelTop = -fh / 2 + offY
      } else {
        imgW = iw * extra; imgH = ih * extra; imgRelLeft = -iw * extra / 2 + offX; imgRelTop = -ih * extra / 2 + offY
      }
      const angle = (frame.angle || 0) * Math.PI / 180
      const cos = Math.cos(angle); const sin = Math.sin(angle)
      const sx = frame.scaleX || 1; const sy = frame.scaleY || 1
      const absLeft = center.x + (imgRelLeft * cos - imgRelTop * sin) * sx
      const absTop  = center.y + (imgRelLeft * sin + imgRelTop * cos) * sy
      const origSize = (imgLayer as FabricObject & { getOriginalSize?: () => { width: number; height: number } }).getOriginalSize?.()
      imgLayer.set({
        left: absLeft, top: absTop,
        scaleX: (imgW / (origSize?.width  || imgLayer.width  || 1)) * sx,
        scaleY: (imgH / (origSize?.height || imgLayer.height || 1)) * sy,
        angle: frame.angle || 0, originX: 'left', originY: 'top',
      })
      imgLayer.setCoords()
      clip.set({ left: center.x, top: center.y, angle: frame.angle || 0, scaleX: frame.scaleX || 1, scaleY: frame.scaleY || 1 })
      clip.setCoords()
    }

    // Keep handles fully visible during drag/scale/rotate
    const keepHandlesVisible = (e: { target?: FabricObject }): void => {
      const t = e.target
      if (!t) return
      t.hasBorders = true
      t.hasControls = true
      t.setCoords()
    }
    canvas.on('object:moving',   keepHandlesVisible)
    canvas.on('object:scaling',  keepHandlesVisible)
    canvas.on('object:rotating', keepHandlesVisible)

    canvas.on('object:moving',   (e: { target?: FabricObject }) => syncFrameImageLayer(e.target ?? null))
    canvas.on('object:scaling',  (e: { target?: FabricObject }) => syncFrameImageLayer(e.target ?? null))
    canvas.on('object:rotating', (e: { target?: FabricObject }) => syncFrameImageLayer(e.target ?? null))

    // Snap guides
    canvas.on('object:moving', (e: { target?: FabricObject }) => {
      if (!e.target) return
      const snaps = findSnaps(e.target, canvas, rulerGuidesRef.current)
      applySnap(e.target, snaps)
      if (onGuidesChange && containerRef.current && canvasRef.current) {
        const cRect = canvasRef.current.getBoundingClientRect()
        const pRect = containerRef.current.getBoundingClientRect()
        onGuidesChange({ ...snaps, _originX: cRect.left - pRect.left, _originY: cRect.top - pRect.top })
      }
    })

    canvas.on('object:scaling', (e: { target?: FabricObject }) => {
      if (!e.target || !onGuidesChange || !containerRef.current || !canvasRef.current) return
      const cRect = canvasRef.current.getBoundingClientRect()
      const pRect = containerRef.current.getBoundingClientRect()
      onGuidesChange({ ...buildResizeGuides(e.target), _originX: cRect.left - pRect.left, _originY: cRect.top - pRect.top })
    })

    canvas.on('mouse:up', () => {
      onGuidesChange?.(null)
    })

    canvas.on('mouse:down', (opt) => {
      const e = (opt as unknown as { e?: MouseEvent }).e
      if (e?.button === 2 && onContextMenu) {
        e.preventDefault(); e.stopPropagation()
        onContextMenu(e.clientX, e.clientY)
      }
    })

    canvas.on('mouse:dblclick', (opt: { target?: FabricObject }) => {
      const target = opt.target; if (!target) return
      if (target.eliteType === 'frame') {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
        input.onchange = (e): void => {
          const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return
          loadFileIntoFrame(target, f, () => { canvas.renderAll(); saveHistory() })
        }
        input.click()
      }
    })

    canvas.on('text:editing:entered', () => {
      document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'
      const ta = canvasRef.current?.nextElementSibling as HTMLElement | null
      if (ta?.tagName === 'TEXTAREA') Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none', resize: 'none', overflow: 'hidden', width: '1px', height: '1px' })
      if (containerRef.current) { containerRef.current.scrollTop = 0; containerRef.current.scrollLeft = 0 }
    })

    // Inline text selection → TextStyleStore
    const notifyInlineSel = (): void =>
      pushSelectionToStore(canvas.getActiveObject() as FabricObject, canvasRef.current!, canvas)
    canvas.on('text:editing:entered',  notifyInlineSel)
    canvas.on('text:editing:exited',   () => pushSelectionToStore(null, canvasRef.current!, canvas))
    canvas.on('text:changed',          notifyInlineSel)

    let _selKeyCleanup: (() => void) | null = null
    let _selObjCleanup: (() => void) | null = null
    canvas.on('text:editing:entered', () => {
      const obj = canvas.getActiveObject()
      if (obj) {
        const selHandler = (): void => scheduleSelectionUpdate(obj as FabricObject, canvasRef.current!, canvas)
        ;(obj as FabricObject & { on: (event: string, handler: () => void) => void }).on('selection:changed', selHandler)
        _selObjCleanup = (): void => (obj as FabricObject & { off: (event: string, handler: () => void) => void }).off('selection:changed', selHandler)
      }
      const h = (): void => scheduleSelectionUpdate(canvas.getActiveObject() as FabricObject, canvasRef.current!, canvas)
      document.addEventListener('keyup', h)
      _selKeyCleanup = (): void => document.removeEventListener('keyup', h)
    })
    canvas.on('text:editing:exited', () => {
      _selKeyCleanup?.(); _selKeyCleanup = null; _selObjCleanup?.(); _selObjCleanup = null
    })
    canvas.on('mouse:up', () => {
      const obj = canvas.getActiveObject()
      if (obj && (obj as FabricObject & { isEditing?: boolean }).isEditing) {
        // 20 ms lets Fabric finish its own triple-click / word-select processing
        // before we read selectionStart/selectionEnd.
        setTimeout(() => scheduleSelectionUpdate(obj as FabricObject, canvasRef.current!, canvas), 20)
      }
    })

    // Cmd+A (select all) fires selection:changed on the IText, but add an
    // explicit keydown path so the toolbar appears without waiting for keyup.
    canvas.on('text:editing:entered', () => {
      const obj = canvas.getActiveObject()
      if (!obj) return
      const onKeyDown = (e: KeyboardEvent): void => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          // Fabric processes select-all on keydown; give it one frame.
          setTimeout(() => scheduleSelectionUpdate(obj as FabricObject, canvasRef.current!, canvas), 20)
        }
      }
      document.addEventListener('keydown', onKeyDown)
      const cleanup = (): void => document.removeEventListener('keydown', onKeyDown)
      ;(obj as FabricObject & { _cmdACleanup?: () => void })._cmdACleanup = cleanup
    })
    canvas.on('text:editing:exited', () => {
      const obj = canvas.getActiveObject()
      ;(obj as FabricObject & { _cmdACleanup?: () => void } | null)?._cmdACleanup?.()
    })

    // Hover outline — accent border drawn on lower canvas for unselected objects
    let hoveredObj: FabricObject | null = null

    canvas.on('mouse:move', (opt: { target?: FabricObject }) => {
      const target = opt.target
      const active = canvas.getActiveObjects()
      const next = (target && target.selectable && target.evented && !active.includes(target as FabricObject))
        ? target as FabricObject : null
      if (hoveredObj !== next) {
        hoveredObj = next
        canvas.requestRenderAll()
      }
    })

    canvas.on('selection:created', () => { hoveredObj = null })
    canvas.on('selection:updated', () => { hoveredObj = null })
    canvas.on('selection:cleared', () => { hoveredObj = null })

    canvas.on('after:render', (e: { ctx: CanvasRenderingContext2D }) => {
      if (!hoveredObj) return
      const lowerCtx = canvas.getContext()
      if (e.ctx !== lowerCtx) return
      if (canvas.getActiveObjects().includes(hoveredObj)) { hoveredObj = null; return }
      const HOVER_PAD = 14
      const bound = hoveredObj.getBoundingRect()
      e.ctx.save()
      e.ctx.strokeStyle = ACCENT
      e.ctx.lineWidth = 6
      e.ctx.setLineDash([])
      e.ctx.strokeRect(
        bound.left   - HOVER_PAD,
        bound.top    - HOVER_PAD,
        bound.width  + HOVER_PAD * 2,
        bound.height + HOVER_PAD * 2,
      )
      e.ctx.restore()
    })

    // Drag/drop from OS
    const canvasEl = canvasRef.current!
    const convertScreen = (sx: number, sy: number): { x: number; y: number } => {
      const rect = canvasEl.getBoundingClientRect()
      return { x: (sx - rect.left) / zoomRef.current, y: (sy - rect.top) / zoomRef.current }
    }

    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      const { x, y } = convertScreen(e.clientX, e.clientY)
      const frame = findFrameAtPoint(canvas, x, y)
      if (frame !== dragOverFrameRef.current) {
        if (dragOverFrameRef.current) clearFrameHighlight(dragOverFrameRef.current)
        if (frame) highlightFrame(frame, accentRef.current)
        dragOverFrameRef.current = frame; canvas.renderAll()
      }
    }
    const handleDragLeave = (e: DragEvent): void => {
      if (e.relatedTarget && canvasEl.contains(e.relatedTarget as Node)) return
      if (dragOverFrameRef.current) { clearFrameHighlight(dragOverFrameRef.current); canvas.renderAll() }
      dragOverFrameRef.current = null
    }
    const handleDrop = (e: DragEvent): void => {
      e.preventDefault(); e.stopPropagation()
      if (dragOverFrameRef.current) clearFrameHighlight(dragOverFrameRef.current)
      const file = e.dataTransfer?.files?.[0]
      if (!file || !file.type.startsWith('image/')) { dragOverFrameRef.current = null; canvas.renderAll(); return }
      const { x, y } = convertScreen(e.clientX, e.clientY)
      const frame = dragOverFrameRef.current ?? findFrameAtPoint(canvas, x, y)
      dragOverFrameRef.current = null; canvas.renderAll()
      if (frame) { _loadFileAndApplyToFrame(frame, file, canvas, saveHistory) }
      else { addImageFromFile(file) }
    }

    canvasEl.addEventListener('dragover',  handleDragOver)
    canvasEl.addEventListener('dragleave', handleDragLeave)
    canvasEl.addEventListener('drop',      handleDrop)

    fabricRef.current = canvas
    const cleanupResizeCursor = registerResizeCursor(canvas)

    // Start blank — DesignStudio restores session or user loads a template explicitly.
    // resetToDefault() still works for explicit "load defaults" actions.
    canvas.renderAll()
    saveHistory()
    setTimeout(() => calculateZoom(), 50)

    return (): void => {
      cleanupResizeCursor()
      canvas.dispose(); fabricRef.current = null
      canvasEl.removeEventListener('dragover',  handleDragOver)
      canvasEl.removeEventListener('dragleave', handleDragLeave)
      canvasEl.removeEventListener('drop',      handleDrop)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const down = async (e: KeyboardEvent): Promise<void> => {
      const tag = (e.target as HTMLElement)?.tagName
      const isEditingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
      const isMeta = e.metaKey || e.ctrlKey

      if (isMeta && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return }
      if (isMeta &&  e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); return }
      if (isEditingText) return

      if (isMeta && e.key === 'v') {
        e.preventDefault()
        const activeFrame = (() => { const active = fabricRef.current?.getActiveObject(); return active?.eliteType === 'frame' ? active : null })()
        if (activeFrame) {
          try {
            const items = await navigator.clipboard.read()
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith('image/'))
              if (imageType) {
                const blob = await item.getType(imageType)
                const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob) })
                const imgEl = new window.Image()
                imgEl.onload = (): void => { applyImageToFrame(activeFrame, imgEl); fabricRef.current?.renderAll(); saveHistory() }
                imgEl.src = dataUrl; return
              }
            }
          } catch {}
          pasteInternal(); return
        }
        pasteFromSystemClipboard({ canvas: fabricRef.current, width, height, accent: accentRef.current, saveHistory })
          .then((result: { success: boolean }) => { if (!result.success) pasteInternal() })
        return
      }
      if (isMeta && e.key === 'c') {
        e.preventDefault(); copyInternal()
        copyToSystemClipboard(fabricRef.current).catch(() => {}); return
      }
      if (isMeta && e.key === 'd')              { e.preventDefault(); duplicateSelected(); return }
      if (isMeta && e.key === 'a')              { e.preventDefault(); selectAll(); return }
      if (isMeta && !e.shiftKey && e.key === 'g') { e.preventDefault(); groupSelected(); return }
      if (isMeta &&  e.shiftKey && e.key === 'G') { e.preventDefault(); ungroupSelected(); return }
      if (e.key === ']')                         { e.preventDefault(); bringToFront(); return }
      if (e.key === '[')                         { e.preventDefault(); sendToBack(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = fabricRef.current?.getActiveObject()
        if (active && !(active as FabricObject & { isEditing?: boolean }).isEditing) { e.preventDefault(); deleteSelected() }
        return
      }
      if (e.key === ' ' && !isSpaceDown.current) {
        isSpaceDown.current = true; if (containerRef.current) containerRef.current.style.cursor = 'grab'
      }
      if (e.key === 'Escape') { fabricRef.current?.discardActiveObject(); fabricRef.current?.renderAll() }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key === ' ') { isSpaceDown.current = false; if (containerRef.current) containerRef.current.style.cursor = 'default' }
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return (): void => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo, copyInternal, pasteInternal, duplicateSelected, selectAll, groupSelected,
      ungroupSelected, bringToFront, sendToBack, deleteSelected, saveHistory, width, height])

  // Resize → recalc zoom
  useEffect(() => {
    window.addEventListener('resize', calculateZoom)
    return () => window.removeEventListener('resize', calculateZoom)
  }, [calculateZoom])

  // ─────────────────────────────────────────────────────────────────────────
  // PAN EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (!isSpaceDown.current && e.button !== 1) return
    e.preventDefault(); isPanning.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
  }

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (!isPanning.current) return
    e.preventDefault()
    const dx = e.clientX - lastMouse.current.x; const dy = e.clientY - lastMouse.current.y
    const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy }
    panRef.current = newPan; setPan(newPan)
    onPanChangeRef.current?.(newPan)
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = (): void => {
    if (!isPanning.current) return
    isPanning.current = false
    if (containerRef.current) containerRef.current.style.cursor = isSpaceDown.current ? 'grab' : 'default'
  }

  const handleWheel = useCallback((e: WheelEvent): void => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Cursor-centered zoom: adjust pan so zoom focuses on cursor position
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const cursorX = e.clientX - rect.left - rect.width / 2
      const cursorY = e.clientY - rect.top - rect.height / 2

      const oldZoom = zoomRef.current
      const delta = e.deltaY * -0.005
      const newZoom = Math.max(0.05, Math.min(oldZoom * (1 + delta), 4))
      const zoomRatio = newZoom / oldZoom

      // Adjust pan to keep cursor point stationary
      const newPan = {
        x: cursorX - zoomRatio * (cursorX - panRef.current.x),
        y: cursorY - zoomRatio * (cursorY - panRef.current.y),
      }

      zoomRef.current = newZoom; setZoomState(newZoom)
      panRef.current = newPan; setPan(newPan)
      onZoomChangeRef.current?.(Math.round(newZoom * 100))
      onPanChangeRef.current?.(newPan)
    } else {
      const dx = e.shiftKey ? -e.deltaY : -e.deltaX
      const dy = e.shiftKey ? 0          : -e.deltaY
      const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      panRef.current = newPan; setPan(newPan); onPanChangeRef.current?.(newPan)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return (): void => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'var(--bg)', touchAction: 'none' }}
    >
      {/* Dot grid — scales with zoom, fades at extremes */}
      <div className="absolute inset-0 pointer-events-none studio-dot-grid"
           style={{
             backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
             backgroundPosition: `${pan.x}px ${pan.y}px`,
             opacity: Math.max(0.08, Math.min(0.4, zoom * 0.3)),
           }}/>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="studio-canvas-card" style={{
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning.current ? 'none' : 'transform 0.15s ease-out',
        }}>
          <canvas ref={canvasRef}/>
        </div>
      </div>
    </div>
  )
})

DesignCanvas.displayName = 'DesignCanvas'
export default DesignCanvas
