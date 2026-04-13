/**
 * commandHandlersConsolidated.ts — Unified MCP command handlers.
 *
 * handleUpdateElement: Apply any combination of position, size, style,
 *   typography, transform, and effects in a single canvas round-trip.
 * handlePlaceImageFromURL: Place an image from any URL on the canvas.
 *
 * These replace the need for many sequential set_* calls, cutting
 * round-trip latency by an order of magnitude for complex edits.
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import '@/types/fabric-custom'
import type { CanvasHandle } from '@/types/canvas'
import type { RefObject } from 'react'
import {
  handleSelectByLabel,
  handleSelectByIndex,
  handleHighlightWords,
  handleSetGradient,
  handleSetFrameFit,
} from './commandHandlers'

// ── Local canvas helpers ───────────────────────────────────────────────────

function getCanvas(ref: RefObject<CanvasHandle | null>): FabricCanvas {
  const c = ref.current?.getCanvas()
  if (!c) throw new Error('canvas not ready')
  return c
}

function getActive(canvas: FabricCanvas): FabricObject {
  const obj = canvas.getActiveObject()
  if (!obj) throw new Error('no element selected — call select_elements first')
  return obj
}

// ── Types ──────────────────────────────────────────────────────────────────

type TextObj = FabricObject & {
  text?: string
  fontSize?: number; fontFamily?: string; fontWeight?: string
  fontStyle?: string; textAlign?: string; underline?: boolean
  charSpacing?: number; lineHeight?: number
}

type FilterObj = FabricObject & {
  filters?: unknown[]
  applyFilters?: () => void
  dirty?: boolean
}

// ── handleUpdateElement ────────────────────────────────────────────────────
//
// Single-call update for any element property.
// params.label or params.index: optionally select the element first.
// All other params are applied in one batch to minimise render calls.

export function handleUpdateElement(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): unknown {
  const canvas = getCanvas(canvasRef)

  // Optional element selection before editing
  if (typeof params.label === 'string') handleSelectByLabel(canvasRef, { label: params.label })
  else if (params.index  !== undefined) handleSelectByIndex(canvasRef, { index: params.index })

  const obj = getActive(canvas) as TextObj & FilterObj

  // Accumulate all patches — applied in a single setAndSave
  const patches: Record<string, unknown> = {}

  // Position
  if (params.x !== undefined) patches.left = Number(params.x)
  if (params.y !== undefined) patches.top  = Number(params.y)

  // Size (via fabric scale, preserving internal geometry)
  if (params.width  !== undefined) patches.scaleX = Number(params.width)  / (obj.width  || 1)
  if (params.height !== undefined) patches.scaleY = Number(params.height) / (obj.height || 1)

  // Base appearance
  if (params.opacity       !== undefined) patches.opacity = Number(params.opacity)
  if (params.fill          !== undefined) patches.fill    = String(params.fill)
  if (params.corner_radius !== undefined) { patches.rx = Number(params.corner_radius); patches.ry = patches.rx }

  // Stroke
  const stroke = params.stroke as Record<string, unknown> | undefined
  if (stroke) {
    if (stroke.color !== undefined) patches.stroke      = String(stroke.color)
    if (stroke.width !== undefined) patches.strokeWidth = Number(stroke.width)
  }

  // Text content
  if (params.content !== undefined) patches.text = String(params.content)

  // Typography (all text props batched together)
  const typo = params.typography as Record<string, unknown> | undefined
  if (typo) {
    if (typo.family         !== undefined) patches.fontFamily  = String(typo.family)
    if (typo.size           !== undefined) patches.fontSize    = Number(typo.size)
    if (typo.weight         !== undefined) patches.fontWeight  = String(typo.weight)
    if (typo.style          !== undefined) patches.fontStyle   = String(typo.style)
    if (typo.align          !== undefined) patches.textAlign   = String(typo.align)
    if (typo.underline      !== undefined) patches.underline   = Boolean(typo.underline)
    if (typo.letter_spacing !== undefined) patches.charSpacing = Number(typo.letter_spacing)
    if (typo.line_height    !== undefined) patches.lineHeight  = Number(typo.line_height)
    if (typo.color          !== undefined) patches.fill        = String(typo.color)

    if (typo.case !== undefined) {
      const mode = String(typo.case)
      // patches.text wins — content param may have already set it; fall back to current obj text
      const txt  = String((patches.text as string | undefined) ?? obj.text ?? '')
      if      (mode === 'upper')    patches.text = txt.toUpperCase()
      else if (mode === 'lower')    patches.text = txt.toLowerCase()
      else if (mode === 'title')    patches.text = txt.replace(/\b\w/g, c => c.toUpperCase())
      else if (mode === 'sentence') patches.text = txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
    }
  }

  // Visibility / lock
  if (params.visible !== undefined) patches.visible = Boolean(params.visible)
  if (params.locked  !== undefined) {
    const locked = Boolean(params.locked)
    patches.lockMovementX = locked; patches.lockMovementY = locked
    patches.lockScalingX  = locked; patches.lockScalingY  = locked
    patches.lockRotation  = locked
  }

  // Rotation + flip
  if (params.rotate !== undefined) patches.angle = Number(params.rotate)
  if (params.flip === 'horizontal') patches.flipX = !obj.flipX
  if (params.flip === 'vertical')   patches.flipY = !obj.flipY

  // Apply all basic patches in one render pass
  if (Object.keys(patches).length > 0) {
    Object.entries(patches).forEach(([k, v]) => obj.set(k as keyof FabricObject, v as never))
    obj.setCoords?.()
    ;(obj as FilterObj).dirty = true
    canvas.renderAll()
    canvasRef.current?.saveHistory()
  }

  // z_order — must use canvas layer methods after patches
  if (params.z_order !== undefined) {
    switch (String(params.z_order)) {
      case 'front':    canvas.bringObjectToFront(obj); break
      case 'back':     canvas.sendObjectToBack(obj);   break
      case 'forward':  canvas.bringObjectForward(obj); break
      case 'backward': canvas.sendObjectBackwards(obj); break
    }
    canvas.renderAll()
    canvasRef.current?.saveHistory()
  }

  // Shadow — fabric.Shadow constructor call
  if (params.shadow !== undefined) {
    const sh = params.shadow as Record<string, unknown>
    if (sh.enabled === false) {
      obj.set('shadow', null as never)
    } else {
      obj.set('shadow', new fabric.Shadow({
        color:   String(sh.color   ?? 'rgba(0,0,0,0.6)'),
        blur:    Number(sh.blur    ?? 12),
        offsetX: Number(sh.offsetX ?? 6),
        offsetY: Number(sh.offsetY ?? 6),
      }) as never)
    }
    canvas.renderAll()
    canvasRef.current?.saveHistory()
  }

  // Blur filter — Gaussian blur via fabric.filters
  if (params.blur !== undefined) {
    const radius = Math.max(0, Number(params.blur))
    const BlurFilter = (fabric.filters as Record<string, unknown> & {
      Blur: new (o: { blur: number }) => unknown
    }).Blur
    obj.filters = radius === 0 ? [] : [new BlurFilter({ blur: radius / 100 })]
    obj.applyFilters?.()
    obj.dirty = true
    canvas.renderAll()
    canvasRef.current?.saveHistory()
  }

  // Gradient overlay — delegates to existing handler
  if (params.gradient !== undefined) {
    handleSetGradient(canvasRef, params.gradient as Record<string, unknown>)
  }

  // Frame fit — delegates to existing handler
  if (params.frame_fit !== undefined) {
    handleSetFrameFit(canvasRef, { mode: params.frame_fit })
  }

  // Word highlights — delegates to existing handler
  if (params.highlights !== undefined) {
    handleHighlightWords(canvasRef, { highlights: params.highlights })
  }

  return { updated: true, label: obj.eliteLabel || obj.type || 'element' }
}

// ── handlePlaceImageFromURL ────────────────────────────────────────────────
// Places an image from any URL (https, data:, file://) onto the canvas.
// Used by the multi-provider generate_image pipeline after the API call.

export async function handlePlaceImageFromURL(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const url = String(params.url || '')
  if (!url) throw new Error('url is required')

  const canvas           = canvasRef.current?.getCanvas()
  const targetFrameLabel = params.target_frame  ? String(params.target_frame)  : null
  const replaceLabel     = params.replace_label ? String(params.replace_label) : null

  // Load into a named frame if requested
  if (targetFrameLabel && canvas) {
    const frame = canvas.getObjects().find(
      o => (o.eliteLabel || '').toLowerCase() === targetFrameLabel.toLowerCase() && o.eliteType === 'frame'
    )
    if (frame) {
      canvasRef.current?.loadImageIntoFrameFromURL(frame, url)
      canvas.renderAll()
      canvasRef.current?.saveHistory()
      return { status: 'done', url, placedIn: targetFrameLabel }
    }
  }

  // Replace existing element by label
  if (replaceLabel && canvas) {
    const existing = canvas.getObjects().find(
      o => (o.eliteLabel || '').toLowerCase() === replaceLabel.toLowerCase()
    )
    if (existing) { canvas.remove(existing); canvas.renderAll() }
  }

  canvasRef.current?.addImageFromURL(
    url,
    params.x !== undefined ? Number(params.x) : undefined,
    params.y !== undefined ? Number(params.y) : undefined,
    params.w !== undefined ? Number(params.w) : undefined,
    params.h !== undefined ? Number(params.h) : undefined,
  )
  return { status: 'done', url, replaced: replaceLabel ?? null }
}
