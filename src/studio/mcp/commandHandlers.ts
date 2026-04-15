/**
 * commandHandlers.ts — MCP canvas command implementations.
 *
 * Every handler receives the raw Fabric canvas and canvasRef handle,
 * performs the operation, and returns a plain JSON-serialisable value.
 *
 * Return `null` means "success, no data". Throw to signal an error.
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import '@/types/fabric-custom'
import type { CanvasHandle } from '@/types/canvas'
import type { RefObject } from 'react'
import { getCanvasFontFamily, FONT_REGISTRY } from '../data/fonts'
import { ICON_CATEGORIES } from '../canvas/icons-data'

// Flat icon list derived from categories
const ICONS = ICON_CATEGORIES.flatMap(cat =>
  cat.icons.map(ic => ({ ...ic, category: cat.id }))
)

// ── Helpers ────────────────────────────────────────────────────────────────

function getCanvas(canvasRef: RefObject<CanvasHandle | null>): FabricCanvas {
  const c = canvasRef.current?.getCanvas()
  if (!c) throw new Error('canvas not ready')
  return c
}

function getActive(canvas: FabricCanvas): FabricObject {
  const obj = canvas.getActiveObject()
  if (!obj) throw new Error('no element selected — use select_by_label or select_by_index first')
  return obj
}

function objSummary(obj: FabricObject, index: number) {
  const w = Math.round((obj.width  || 0) * (obj.scaleX || 1))
  const h = Math.round((obj.height || 0) * (obj.scaleY || 1))
  const ext = obj as FabricObject & { fontSize?: number; fontFamily?: string; text?: string; charSpacing?: number; lineHeight?: number; textAlign?: string }
  return {
    index,
    label:    obj.eliteLabel || obj.type || `element-${index}`,
    type:     obj.eliteType  || obj.type || 'unknown',
    x:        Math.round(obj.left  || 0),
    y:        Math.round(obj.top   || 0),
    width:    w,
    height:   h,
    opacity:  obj.opacity ?? 1,
    visible:  obj.visible !== false,
    locked:   !!(obj as FabricObject & { lockMovementX?: boolean }).lockMovementX,
    fill:     typeof obj.fill === 'string' ? obj.fill : '(gradient/pattern)',
    fontSize:   ext.fontSize,
    fontFamily: ext.fontFamily,
    text:       ext.text,
    textAlign:  ext.textAlign,
    charSpacing: ext.charSpacing,
    lineHeight:  ext.lineHeight,
  }
}

function setAndSave(canvas: FabricCanvas, canvasRef: RefObject<CanvasHandle | null>, obj: FabricObject, patches: Record<string, unknown>): void {
  Object.entries(patches).forEach(([k, v]) => obj.set(k as keyof FabricObject, v as never))
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
}

// ── Canvas-level commands ──────────────────────────────────────────────────

export function handleGetCanvasState(canvasRef: RefObject<CanvasHandle | null>) {
  const canvas = getCanvas(canvasRef)
  const bg = (canvas as FabricCanvas & { backgroundColor?: string }).backgroundColor || '#111111'
  const objects = canvas.getObjects().map(objSummary)
  return {
    background: bg,
    width:  canvas.width  || 0,
    height: canvas.height || 0,
    objectCount: objects.length,
    objects,
    zoom: Math.round((canvasRef.current?.getZoom() ?? 1) * 100),
  }
}

export function handleSetBackground(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const color = String(params.color || '#111111')
  canvasRef.current?.setCanvasBg(color)
  return { background: color }
}

export function handleSetCanvasSize(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const w = Number(params.width)
  const h = Number(params.height)
  if (!w || !h) throw new Error('width and height required')
  canvasRef.current?.changeSize(w, h)
  return { width: w, height: h }
}

export function handleExportPng(canvasRef: RefObject<CanvasHandle | null>) {
  const canvas = getCanvas(canvasRef)
  const dataUrl = canvas.toDataURL({ multiplier: 1, format: 'png' })
  return { dataUrl, format: 'png' }
}

export function handleGetCanvasJson(canvasRef: RefObject<CanvasHandle | null>) {
  const json = canvasRef.current?.exportJSON()
  return { json }
}

export function handleClearCanvas(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.clearCanvas()
  return null
}

export function handleUndo(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.undo()
  return { success: true, action: 'undo' }
}

export function handleRedo(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.redo()
  return { success: true, action: 'redo' }
}

export function handleZoomToFit(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.zoomToFit()
  return { success: true, zoom: 'fit' }
}

export function handleSetZoom(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const zoom = Number(params.zoom ?? 100) / 100
  canvasRef.current?.setZoom(zoom)
  return { zoom: params.zoom }
}

// ── Add element — shared positioning helper ────────────────────────────────
//
// After any add_* call, the new element is the active object. This helper
// applies optional x/y/width/height/style overrides so the AI can place and
// style elements precisely in a single call instead of add + select + set_*.

function applyAddParams(
  canvas: FabricCanvas,
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): FabricObject | null {
  const obj = canvas.getActiveObject()
  if (!obj) return null

  // Position
  if (params.x !== undefined) obj.set('left', Number(params.x))
  if (params.y !== undefined) obj.set('top', Number(params.y))

  // Size — set via scale so Fabric layout stays consistent
  if (params.width  !== undefined && (obj.width  || 0) > 0)
    obj.set('scaleX', Number(params.width)  / (obj.width  || 1))
  if (params.height !== undefined && (obj.height || 0) > 0)
    obj.set('scaleY', Number(params.height) / (obj.height || 1))

  // Common style
  if (params.fill    !== undefined) obj.set('fill'    as keyof FabricObject, String(params.fill)    as never)
  if (params.opacity !== undefined) obj.set('opacity' as keyof FabricObject, Number(params.opacity) as never)

  // Text-specific style
  const textObj = obj as FabricObject & {
    fontSize?: number; fontFamily?: string; fontWeight?: string; textAlign?: string
    charSpacing?: number; lineHeight?: number; fill?: unknown
  }
  if (params.fontSize      !== undefined) textObj.fontSize    = Number(params.fontSize)
  if (params.fontFamily    !== undefined) textObj.fontFamily  = String(params.fontFamily)
  if (params.fontWeight    !== undefined) textObj.fontWeight  = String(params.fontWeight)
  if (params.textAlign     !== undefined) textObj.textAlign   = String(params.textAlign)
  if (params.letterSpacing !== undefined) textObj.charSpacing = Number(params.letterSpacing)
  if (params.lineHeight    !== undefined) textObj.lineHeight  = Number(params.lineHeight)
  if (params.color         !== undefined) textObj.fill        = String(params.color)

  // Label override — always applied last so it wins over any default set by addFn
  if (params.label !== undefined) {
    ;(obj as FabricObject & { eliteLabel?: string }).eliteLabel = String(params.label)
  }

  obj.setCoords()
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return obj
}

function addAndApply(
  canvasRef: RefObject<CanvasHandle | null>,
  addFn: () => void,
  params: Record<string, unknown>,
): Record<string, unknown> | null {
  addFn()
  const canvas = canvasRef.current?.getCanvas()
  if (!canvas) return null
  const obj = applyAddParams(canvas, canvasRef, params)
  if (!obj) return null
  return {
    x: Math.round(obj.left || 0), y: Math.round(obj.top || 0),
    width:  Math.round((obj.width  || 0) * (obj.scaleX || 1)),
    height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
  }
}

// ── Add element commands ───────────────────────────────────────────────────

export function handleAddText(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addText(params.text as string | undefined), params)
}

export function handleAddTitle(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addTitle(params.text as string | undefined), params)
}

export function handleAddSubtitle(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addSubtitle(params.text as string | undefined), params)
}

export function handleAddTag(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addTag(params.text as string | undefined), params)
}

export function handleAddShape(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const shape = String(params.shape || 'rect')
  const map: Record<string, () => void> = {
    rect:     () => canvasRef.current?.addRect(),
    circle:   () => canvasRef.current?.addCircle(),
    triangle: () => canvasRef.current?.addTriangle(),
    star:     () => canvasRef.current?.addStar(),
    pentagon: () => canvasRef.current?.addPentagon(),
    hexagon:  () => canvasRef.current?.addHexagon(),
    diamond:  () => canvasRef.current?.addDiamond(),
    arrow:    () => canvasRef.current?.addArrow(),
    line:     () => canvasRef.current?.addLine(),
  }
  const fn = map[shape]
  if (!fn) throw new Error(`unknown shape "${shape}". Valid: ${Object.keys(map).join(', ')}`)
  const result = addAndApply(canvasRef, fn, params)
  return { shape, ...result }
}

export function handleAddAccentLine(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addAccentLine(), params)
}

export function handleAddGradientOverlay(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addGradientOverlay(), params)
}

export function handleAddLogo(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  return addAndApply(canvasRef, () => canvasRef.current?.addLogo(), params)
}

export function handleAddFrame(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const shape = String(params.shape || 'rect')

  // If no label provided, generate a unique one (Frame-1, Frame-2, ...) to prevent target_frame collisions
  const resolvedParams: Record<string, unknown> = { ...params }
  if (!resolvedParams.label) {
    const canvas = canvasRef.current?.getCanvas()
    if (canvas) {
      const existingLabels = new Set(
        canvas.getObjects()
          .map(o => (o as FabricObject & { eliteLabel?: string }).eliteLabel)
          .filter(Boolean),
      )
      let n = 1
      while (existingLabels.has(`Frame-${n}`)) n++
      resolvedParams.label = `Frame-${n}`
    }
  }

  const result = addAndApply(canvasRef, () => canvasRef.current?.addFrame(shape), resolvedParams)

  // Frames use originX/Y='center' — addAndApply sets left=x/top=y which positions the CENTER
  // at those coords. Convert so that x,y refers to the top-left corner (AI convention).
  if (resolvedParams.x !== undefined || resolvedParams.y !== undefined) {
    const canvas = canvasRef.current?.getCanvas()
    const obj = canvas?.getActiveObject()
    if (obj && canvas) {
      const visualW = (obj.width  || 0) * (obj.scaleX || 1)
      const visualH = (obj.height || 0) * (obj.scaleY || 1)
      if (resolvedParams.x !== undefined) obj.set('left', Number(resolvedParams.x) + visualW / 2)
      if (resolvedParams.y !== undefined) obj.set('top',  Number(resolvedParams.y) + visualH / 2)
      obj.setCoords()
      canvas.renderAll()
    }
  }

  return { shape, label: resolvedParams.label, ...result }
}

export function handleAddIcon(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const query = String(params.label || params.id || '').toLowerCase()
  if (!query) throw new Error('provide label or id to search for an icon')
  const found = ICONS.find(ic => ic.label.toLowerCase().includes(query) || ic.id.toLowerCase().includes(query))
  if (!found) throw new Error(`no icon found matching "${query}". Try a different name.`)
  const color = String(params.color || '#FFFFFF')
  const size  = Number(params.size || 80)
  const result = addAndApply(
    canvasRef,
    () => canvasRef.current?.addIconToCanvas({ path: found.path, label: found.label, id: found.id }, color, size),
    params,
  )
  return { icon: found.label, ...result }
}

// ── Element query commands ─────────────────────────────────────────────────

export function handleGetElements(canvasRef: RefObject<CanvasHandle | null>) {
  const canvas = getCanvas(canvasRef)
  return canvas.getObjects().map(objSummary)
}

export function handleGetSelected(canvasRef: RefObject<CanvasHandle | null>) {
  const canvas = getCanvas(canvasRef)
  const obj    = canvas.getActiveObject()
  if (!obj) return null
  const index  = canvas.getObjects().indexOf(obj)
  return objSummary(obj, index)
}

export function handleSelectByLabel(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const label  = String(params.label || '')
  const obj    = canvas.getObjects().find(o =>
    (o.eliteLabel || '').toLowerCase() === label.toLowerCase() ||
    (o.eliteType  || '').toLowerCase() === label.toLowerCase()
  )
  if (!obj) throw new Error(`no element with label "${label}". Use get_elements to list all.`)
  canvas.setActiveObject(obj)
  canvas.renderAll()
  const index = canvas.getObjects().indexOf(obj)
  return objSummary(obj, index)
}

export function handleSelectByIndex(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const index  = Number(params.index ?? -1)
  const objs   = canvas.getObjects()
  if (index < 0 || index >= objs.length) throw new Error(`index out of range. Canvas has ${objs.length} elements (0-${objs.length - 1}).`)
  canvas.setActiveObject(objs[index])
  canvas.renderAll()
  return objSummary(objs[index], index)
}

export function handleDeselect(canvasRef: RefObject<CanvasHandle | null>) {
  const canvas = getCanvas(canvasRef)
  canvas.discardActiveObject()
  canvas.renderAll()
  return null
}

// ── Transform / position commands ─────────────────────────────────────────

export function handleSetPosition(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const patches: Record<string, unknown> = {}
  if (params.x !== undefined) patches.left = Number(params.x)
  if (params.y !== undefined) patches.top  = Number(params.y)
  setAndSave(canvas, canvasRef, obj, patches)
  return { x: obj.left, y: obj.top }
}

export function handleSetSize(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  if (params.width  !== undefined) obj.set('scaleX', Number(params.width)  / (obj.width  || 1))
  if (params.height !== undefined) obj.set('scaleY', Number(params.height) / (obj.height || 1))
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { width: Math.round((obj.width || 0) * (obj.scaleX || 1)), height: Math.round((obj.height || 0) * (obj.scaleY || 1)) }
}

export function handleSetOpacity(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  setAndSave(canvas, canvasRef, obj, { opacity: Math.min(1, Math.max(0, Number(params.opacity ?? 1))) })
  return { opacity: obj.opacity }
}

export function handleSetFill(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  setAndSave(canvas, canvasRef, obj, { fill: String(params.color || '#FFFFFF') })
  return { fill: params.color }
}

export function handleSetStroke(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const patches: Record<string, unknown> = {}
  if (params.color !== undefined) patches.stroke      = String(params.color)
  if (params.width !== undefined) patches.strokeWidth = Number(params.width)
  setAndSave(canvas, canvasRef, obj, patches)
  return { stroke: obj.stroke, strokeWidth: obj.strokeWidth }
}

export function handleSetCornerRadius(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas  = getCanvas(canvasRef)
  const obj     = getActive(canvas)
  const sX      = obj.scaleX || 1
  const sY      = obj.scaleY || 1
  const rxLocal = Number(params.radius || 0) / sX
  const ryLocal = Number(params.radius || 0) / sY
  if (obj.type === 'image') {
    const imgW = obj.width  || 0
    const imgH = obj.height || 0
    const existing = (obj as FabricObject & { clipPath?: FabricObject & { rx?: number; ry?: number; width?: number; height?: number } }).clipPath
    if (existing && existing.type === 'rect') {
      existing.set({ rx: rxLocal, ry: ryLocal, width: imgW, height: imgH })
    } else {
      const clip = new fabric.Rect({ left: -(imgW / 2), top: -(imgH / 2), width: imgW, height: imgH, rx: rxLocal, ry: ryLocal, originX: 'left', originY: 'top' })
      ;(obj as FabricObject & { clipPath?: FabricObject }).clipPath = clip
    }
  } else {
    obj.set({ rx: rxLocal, ry: ryLocal } as Partial<FabricObject>)
  }
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { radius: params.radius }
}

// ── Text style commands ────────────────────────────────────────────────────

export function handleSetTextContent(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas) as FabricObject & { text?: string }
  if (!('text' in obj)) throw new Error('selected element is not a text object')
  setAndSave(canvas, canvasRef, obj, { text: String(params.text || '') })
  return { text: params.text }
}

export function handleSetFontFamily(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas    = getCanvas(canvasRef)
  const obj       = getActive(canvas)
  const family    = String(params.family || 'Inter')
  const cssFamily = getCanvasFontFamily(family)
  obj.set('fontFamily' as keyof FabricObject, `${cssFamily}, sans-serif` as never)
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  document.fonts.load(`400 16px "${cssFamily}"`).then(() => canvas.requestRenderAll()).catch(() => canvas.renderAll())
  canvasRef.current?.saveHistory()
  return { fontFamily: family }
}

export function handleSetFontSize(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  setAndSave(canvas, canvasRef, obj, { fontSize: Number(params.size || 32) })
  return { fontSize: params.size }
}

export function handleSetFontWeight(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas  = getCanvas(canvasRef)
  const obj     = getActive(canvas)
  const weight  = String(params.weight || '400')
  const resolved = weight === 'bold' ? '700' : weight === 'regular' || weight === 'normal' ? '400' : weight
  setAndSave(canvas, canvasRef, obj, { fontWeight: resolved })
  return { fontWeight: resolved }
}

export function handleSetFontStyle(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const style  = String(params.style || 'normal')
  if (!['normal', 'italic'].includes(style)) throw new Error('style must be "normal" or "italic"')
  setAndSave(canvas, canvasRef, obj, { fontStyle: style })
  return { fontStyle: style }
}

export function handleSetTextAlign(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const align  = String(params.align || 'left')
  if (!['left', 'center', 'right', 'justify'].includes(align)) throw new Error('align must be left, center, right, or justify')
  setAndSave(canvas, canvasRef, obj, { textAlign: align })
  return { textAlign: align }
}

export function handleSetUnderline(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas   = getCanvas(canvasRef)
  const obj      = getActive(canvas)
  const enabled  = Boolean(params.enabled ?? params.underline)
  setAndSave(canvas, canvasRef, obj, { underline: enabled })
  return { underline: enabled }
}

export function handleSetLetterSpacing(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  setAndSave(canvas, canvasRef, obj, { charSpacing: Number(params.spacing ?? 0) })
  return { charSpacing: params.spacing }
}

export function handleSetLineHeight(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  setAndSave(canvas, canvasRef, obj, { lineHeight: Number(params.lineHeight ?? 1.2) })
  return { lineHeight: params.lineHeight }
}

export function handleSetTextCase(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas) as FabricObject & { text?: string }
  if (!('text' in obj) || !obj.text) throw new Error('selected element is not a text object')
  const mode = String(params.case || 'none')
  let result = obj.text
  if (mode === 'upper')       result = obj.text.toUpperCase()
  else if (mode === 'lower')  result = obj.text.toLowerCase()
  else if (mode === 'title')  result = obj.text.replace(/\b\w/g, c => c.toUpperCase())
  else if (mode === 'sentence') result = obj.text.charAt(0).toUpperCase() + obj.text.slice(1).toLowerCase()
  else if (mode !== 'none')   throw new Error('case must be upper, lower, title, sentence, or none')
  setAndSave(canvas, canvasRef, obj, { text: result })
  return { text: result }
}

export function handleSetTextColor(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const isText = ['itext', 'textbox'].includes(obj.type ?? '')
  if (!isText) throw new Error('selected element is not a text object')
  setAndSave(canvas, canvasRef, obj, { fill: String(params.color || '#FFFFFF') })
  return { fill: params.color }
}

// ── Layer order commands ───────────────────────────────────────────────────

export function handleBringToFront(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.bringToFront()
  return { success: true, action: 'front' }
}

export function handleSendToBack(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.sendToBack()
  return { success: true, action: 'back' }
}

export function handleBringForward(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.bringForward()
  return { success: true, action: 'forward' }
}

export function handleSendBackward(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.sendBackward()
  return { success: true, action: 'backward' }
}

// ── Transform commands ─────────────────────────────────────────────────────

export function handleFlipHorizontal(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.flipHorizontal(); return null
}

export function handleFlipVertical(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.flipV(); return null
}

export function handleToggleLock(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.toggleLock(); return null
}

export function handleToggleVisibility(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.toggleVisibility(); return null
}

export function handleDeleteSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.deleteSelected()
  return { success: true, action: 'delete' }
}

export function handleDuplicateSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.duplicateSelected()
  return { success: true, action: 'duplicate' }
}

export function handleGroupSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.groupSelected()
  return { success: true, action: 'group' }
}

export function handleUngroupSelected(canvasRef: RefObject<CanvasHandle | null>) {
  canvasRef.current?.ungroupSelected()
  return { success: true, action: 'ungroup' }
}

// ── Gradient overlay ───────────────────────────────────────────────────────

export function handleSetGradient(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas  = getCanvas(canvasRef)
  const obj     = getActive(canvas)
  if (obj.eliteType !== 'gradient') throw new Error('selected element is not a gradient overlay. Select the gradient overlay element first.')
  const color    = String(params.color || '#111111')
  const dir      = String(params.direction || 'tb')
  const strength = Number(params.strength ?? 1)
  const opacity  = Number(params.opacity  ?? 1)
  const w = obj.width  || 100
  const h = obj.height || 100
  const dirCoords: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
    tb:   { x1: 0, y1: 0, x2: 0, y2: h },
    bt:   { x1: 0, y1: h, x2: 0, y2: 0 },
    lr:   { x1: 0, y1: 0, x2: w, y2: 0 },
    rl:   { x1: w, y1: 0, x2: 0, y2: 0 },
    tlbr: { x1: 0, y1: 0, x2: w, y2: h },
    trbl: { x1: w, y1: 0, x2: 0, y2: h },
  }
  const coords = dirCoords[dir] ?? dirCoords.tb
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  obj.set('fill', new fabric.Gradient({
    type: 'linear', coords,
    colorStops: [
      { offset: 0, color: `rgba(${r},${g},${b},0)` },
      { offset: 1, color: `rgba(${r},${g},${b},${strength})` },
    ],
  }))
  obj.set('opacity', opacity)
  obj.eliteGradColor    = color
  obj.eliteGradDir      = dir
  obj.eliteGradStrength = strength
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { color, direction: dir, strength, opacity }
}

// ── Frame commands ─────────────────────────────────────────────────────────

export function handleSetFrameFit(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  if (obj.eliteType !== 'frame') throw new Error('selected element is not a frame. Select a frame first.')
  const mode   = String(params.mode || 'cover')
  canvasRef.current?.setFrameFitMode(obj, mode)
  return { mode }
}

export function handleUpdateAccentColor(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const color = String(params.color || '#0BDA76')
  canvasRef.current?.updateAccentColor(color)
  return { accentColor: color }
}

export function handleListFonts() {
  return FONT_REGISTRY.map(f => ({ family: f.family, category: f.category }))
}

export function handleListIcons() {
  return ICONS.map(ic => ({ id: ic.id, label: ic.label, category: ic.category }))
}

// ── Word highlight commands ────────────────────────────────────────────────

type TextWithStyles = FabricObject & {
  text?: string
  styles?: Record<number, Record<number, Record<string, unknown>>>
  get2DCursorLocation?: (pos: number, skipWrapping?: boolean) => { lineIndex: number; charIndex: number }
  initDimensions?: () => void
  dirty?: boolean
}

/**
 * Apply per-word color highlights on the selected text element.
 * params.highlights: Array<{ word: string; color: string; bold?: boolean }>
 *
 * Example: highlight_words({ highlights: [{ word: "HOSTAGE", color: "#FF0000" }, { word: "DRONE", color: "#00FF00" }] })
 */
export function handleHighlightWords(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas  = getCanvas(canvasRef)
  const obj     = getActive(canvas) as TextWithStyles

  if (!obj.text || typeof obj.text !== 'string') {
    throw new Error('selected element is not a text object')
  }

  const highlights = params.highlights as Array<{ word: string; color: string; bold?: boolean }> | undefined
  if (!Array.isArray(highlights) || highlights.length === 0) {
    throw new Error('highlights must be a non-empty array of {word, color} objects. Example: [{word:"HOSTAGE",color:"#FF0000"}]')
  }

  // Ensure text layout is computed so get2DCursorLocation works correctly
  if (obj.initDimensions) obj.initDimensions()

  const fullText = obj.text
  if (!obj.styles) obj.styles = {}

  const applied: string[] = []

  for (const h of highlights) {
    if (!h.word || !h.color) continue
    const lower    = fullText.toLowerCase()
    const wordLow  = h.word.toLowerCase()
    let from = 0

    while (true) {
      const start = lower.indexOf(wordLow, from)
      if (start === -1) break

      for (let i = start; i < start + h.word.length; i++) {
        if (!obj.get2DCursorLocation) break
        const { lineIndex, charIndex } = obj.get2DCursorLocation(i, false)
        if (!obj.styles[lineIndex]) obj.styles[lineIndex] = {}
        obj.styles[lineIndex][charIndex] = {
          ...(obj.styles[lineIndex][charIndex] || {}),
          fill: h.color,
          ...(h.bold ? { fontWeight: '700' } : {}),
        }
      }

      applied.push(h.word)
      from = start + h.word.length
    }
  }

  obj.dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { highlighted: [...new Set(applied)] }
}

/** Remove all per-character style overrides from the selected text element. */
export function handleClearWordHighlights(canvasRef: RefObject<CanvasHandle | null>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas) as TextWithStyles
  if (!('text' in obj)) throw new Error('selected element is not a text object')
  obj.styles = {}
  obj.dirty  = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return null
}
