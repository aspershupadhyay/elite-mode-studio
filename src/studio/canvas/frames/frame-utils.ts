/**
 * frame-utils.ts — Layout, positioning, and interaction helpers for Fabric.js Image Frames.
 *
 * Contains:
 *   - refitFrame()           — re-apply stored image with current fit/pan/zoom settings
 *   - clearFrameImage()      — remove image, revert to placeholder gradient
 *   - findFrameAtPoint()     — detect if a canvas coordinate falls inside any frame
 *   - highlightFrame()       — drag-over glow feedback
 *   - clearFrameHighlight()  — remove drag-over glow
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import { applyImageToFrame } from './frame-image'

// ── Internal type helpers ──────────────────────────────────────────────────────
// Extra runtime props that live directly on frame objects (not in fabric-custom.ts)
interface FrameRuntimeProps {
  _eliteImageEl?: HTMLImageElement
  _elitePrevFabricImg?: fabric.FabricImage | null
  _eliteFabricImg?: fabric.FabricImage | null
  _eliteClip?: FabricObject | null
  _eliteHighlighted?: boolean
  _eliteOrigStroke?: string | null
  _eliteOrigStrokeW?: number
  _eliteOrigDash?: number[] | null
}

type FrameObject = FabricObject & FrameRuntimeProps

// ── Re-apply stored image with updated fit mode / offsets / scale ─────────────
// Called by PropertiesPanel whenever the user changes fit mode, pan, or zoom sliders.
export function refitFrame(frame: FabricObject): void {
  const f = frame as FrameObject
  const imgEl = f._eliteImageEl
  if (!imgEl) return
  applyImageToFrame(frame, imgEl)
}

// ── Remove image from frame (revert to placeholder) ───────────────────────────
export function clearFrameImage(frame: FabricObject, accent?: string): void {
  const f = frame as FrameObject
  const w = frame.eliteFrameW || frame.width  || 500
  const h = frame.eliteFrameH || frame.height || 500

  // Remove the floating fabric.Image layer inserted for non-rect shapes
  if (f._elitePrevFabricImg && frame.canvas) {
    frame.canvas.remove(f._elitePrevFabricImg)
  }
  f._elitePrevFabricImg = null
  f._eliteFabricImg     = null
  f._eliteClip          = null
  frame.eliteImageSrc       = undefined
  f._eliteImageEl           = undefined
  frame.eliteImageOffsetX   = 0
  frame.eliteImageOffsetY   = 0
  frame.eliteImageScale     = 1

  const placeholder = new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: 0, y1: 0, x2: 0, y2: h },
    colorStops: [
      { offset: 0, color: '#1E1E2E' },
      { offset: 1, color: '#111120' },
    ],
  })

  if (frame instanceof fabric.Group) {
    const innerRect = frame.getObjects()[0]
    if (innerRect) {
      innerRect.set('fill', placeholder)
      innerRect.dirty = true
    }
  } else {
    frame.set({
      fill: placeholder,
      stroke: accent,
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
    })
  }

  frame.dirty = true
}

// ── Detect if a point on canvas is inside a frame ────────────────────────────
// Used when dropping an image onto the canvas to route it into a frame.
// Point coords must be in Fabric canvas space (not screen space).
export function findFrameAtPoint(
  canvas: FabricCanvas,
  cx: number,
  cy: number,
): FabricObject | null {
  const objects = canvas.getObjects()
  // Iterate in reverse (top objects first) — first hit wins
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    if (obj.eliteType !== 'frame') continue
    if (obj.containsPoint(new fabric.Point(cx, cy))) return obj
  }
  return null
}

// ── Drag-over visual feedback ─────────────────────────────────────────────────
// Highlights a frame with an accent glow when an image is dragged over it.
// Call highlightFrame(frame, accent) on dragover, clearFrameHighlight(frame) on dragleave/drop.

export function highlightFrame(frame: FabricObject, accent?: string): void {
  const f = frame as FrameObject
  if (!frame || f._eliteHighlighted) return
  f._eliteHighlighted = true
  f._eliteOrigStroke  = frame.stroke as string | null
  f._eliteOrigStrokeW = frame.strokeWidth
  f._eliteOrigDash    = frame.strokeDashArray as number[] | null

  frame.set({
    stroke:          accent || '#0BDA76',
    strokeWidth:     3,
    strokeDashArray: [8, 4],
    opacity:         (frame.opacity || 1) * 0.92,
  })
  frame.dirty = true
}

export function clearFrameHighlight(frame: FabricObject): void {
  const f = frame as FrameObject
  if (!frame || !f._eliteHighlighted) return
  f._eliteHighlighted = false
  frame.set({
    stroke:          f._eliteOrigStroke    ?? 'transparent',
    strokeWidth:     f._eliteOrigStrokeW   ?? 0,
    strokeDashArray: f._eliteOrigDash      ?? undefined,
    opacity:         (frame.opacity || 1) / 0.92,  // undo the dim
  })
  frame.dirty = true
}
