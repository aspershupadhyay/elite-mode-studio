/**
 * frames/index.ts — Public API for Fabric.js Image Frames.
 *
 * Re-exports:
 *   frame-shapes.ts  — FRAME_SHAPES, LETTERS, DIGITS, FrameShapeConfig, getShapeConfig
 *   frame-image.ts   — loadFileIntoFrame, applyImageToFrame
 *   frame-utils.ts   — refitFrame, clearFrameImage, findFrameAtPoint,
 *                      highlightFrame, clearFrameHighlight
 *
 * Also defines:
 *   FrameAddOptions — options bag for addFrame()
 *   addFrame()      — creates and adds a new frame to the canvas
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import { FRAME_SHAPES } from './frame-shapes'

// ── Re-exports ────────────────────────────────────────────────────────────────
export type { FrameShapeConfig } from './frame-shapes'
export { FRAME_SHAPES, LETTERS, DIGITS, getShapeConfig } from './frame-shapes'
export { applyImageToFrame, loadFileIntoFrame, loadURLIntoFrame } from './frame-image'
export { refitFrame, clearFrameImage, findFrameAtPoint, highlightFrame, clearFrameHighlight } from './frame-utils'

// ── Frame placeholder gradient (shown when no image is loaded) ────────────────
function makePlaceholderFill(w: number, h: number): fabric.Gradient<'linear'> {
  return new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: 0, y1: 0, x2: 0, y2: h },
    colorStops: [
      { offset: 0,   color: '#1E1E2E' },
      { offset: 1,   color: '#111120' },
    ],
  })
}

// ── Build a letter/digit frame group ─────────────────────────────────────────
// Uses a Rect + Text clipPath inside a Group so the letter shape masks the image.
function buildLetterFrame(char: string, w: number, h: number, accent: string): fabric.Group {
  const fontSize = Math.min(w, h) * 1.0
  const letterClip = new fabric.Text(char, {
    fontSize,
    fontWeight: '900',
    fontFamily: 'Impact, Arial Black, sans-serif',
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
  })
  const bgRect = new fabric.Rect({
    width: w, height: h,
    fill: makePlaceholderFill(w, h),
    originX: 'center', originY: 'center',
    left: 0, top: 0,
    clipPath: letterClip,
  })
  const borderRect = new fabric.Rect({
    width: w, height: h,
    fill: 'transparent',
    stroke: accent, strokeWidth: 1.5, strokeDashArray: [6, 4],
    originX: 'center', originY: 'center', left: 0, top: 0,
  })
  return new fabric.Group([bgRect, borderRect], {})
}

// ── FrameAddOptions ───────────────────────────────────────────────────────────
export interface FrameAddOptions {
  /** Canvas X position for the new frame center (defaults to 0) */
  cx?: number
  /** Canvas Y position for the new frame center (defaults to 0) */
  cy?: number
  /** Width of the frame in canvas units (defaults to 500) */
  width?: number
  /** Height of the frame in canvas units (defaults to 500) */
  height?: number
  /** Accent colour used for the dashed border (defaults to '#0BDA76') */
  accent?: string
}

// ── Create a new frame on the canvas ─────────────────────────────────────────
/**
 * addFrame — instantiates a shape-frame, sets all Elite metadata properties,
 * adds it to `canvas`, makes it the active object, and returns it.
 *
 * @param canvas  — Fabric canvas instance
 * @param shape   — shape key from FRAME_SHAPES, or a single uppercase letter/digit
 * @param options — positioning, sizing, and accent colour overrides
 */
export function addFrame(
  canvas: FabricCanvas,
  shape: string,
  options: FrameAddOptions = {},
): FabricObject {
  const cx     = options.cx     ?? 0
  const cy     = options.cy     ?? 0
  const w      = options.width  || 500
  const h      = options.height || 500
  const accent = options.accent || '#0BDA76'

  let frameObj: FabricObject

  // Letter / digit frame
  if (shape.length === 1 && /[A-Z0-9]/.test(shape)) {
    frameObj = buildLetterFrame(shape, w, h, accent)
    frameObj.set({ left: cx, top: cy, originX: 'center', originY: 'center' })
  } else {
    const shapeDef = FRAME_SHAPES[shape]
    if (!shapeDef) {
      throw new Error(`addFrame: unknown shape key "${shape}"`)
    }
    frameObj = shapeDef.make(w, h)
    frameObj.set({
      fill:   makePlaceholderFill(w, h),
      stroke: accent,
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      left:  cx, top: cy,
      originX: 'center', originY: 'center',
    })
  }

  // Store frame metadata via Elite custom properties
  const shapeLabel =
    FRAME_SHAPES[shape]?.label ||
    (shape.length === 1 ? `${shape} Image Frame` : `${shape} Image Frame`)

  frameObj.eliteType         = 'frame'
  frameObj.eliteLabel        = shapeLabel
  frameObj.eliteFrameShape   = shape
  frameObj.eliteFrameW       = w
  frameObj.eliteFrameH       = h
  frameObj.eliteFitMode      = 'fill'
  frameObj.eliteImageSrc     = undefined
  frameObj.eliteImageOffsetX = 0
  frameObj.eliteImageOffsetY = 0
  frameObj.eliteImageScale   = 1

  // Frames sit flush — no padding gap between frame edge and selection handles
  frameObj.set({ padding: 0 })

  canvas.add(frameObj)
  canvas.setActiveObject(frameObj)
  canvas.renderAll()
  return frameObj
}

// ── Backward-compatible positional overload ───────────────────────────────────
/**
 * addFrameAt — mirrors the original `addFrame(canvas, cx, cy, shapeKey, frameW, frameH, accent)`
 * positional signature so that existing callers in Canvas.jsx don't need to change.
 */
export function addFrameAt(
  canvas: FabricCanvas,
  cx: number,
  cy: number,
  shapeKey: string,
  frameW?: number,
  frameH?: number,
  accent?: string,
): FabricObject {
  return addFrame(canvas, shapeKey, { cx, cy, width: frameW, height: frameH, accent })
}
