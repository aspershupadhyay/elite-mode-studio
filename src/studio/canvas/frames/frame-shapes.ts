/**
 * frame-shapes.ts — Pure shape data and geometry for Fabric.js Image Frames.
 *
 * Contains:
 *   - FrameShapeConfig interface
 *   - FRAME_SHAPES map (all shape definitions)
 *   - LETTERS and DIGITS arrays
 *   - Helper functions: getShapeConfig
 *
 * No Fabric instantiation happens here — only pure data / geometry.
 */
import * as fabric from 'fabric'
import type { FabricObject } from 'fabric'

// ── Shape configuration interface ─────────────────────────────────────────────
export interface FrameShapeConfig {
  id: string
  label: string
  type: 'path' | 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polygon' | 'letter' | 'digit'
  pathData?: string
  points?: Array<{ x: number; y: number }>
  rx?: number
  ry?: number
}

// Internal shape definition stored in FRAME_SHAPES (includes the make factory)
interface ShapeDef {
  label: string
  category: string
  make: (w: number, h: number) => FabricObject
}

// ── SVG path generators — all centered at (0,0) with given w/h ───────────────
export const FRAME_SHAPES: Record<string, ShapeDef> = {
  // ── Basic ──────────────────────────────────────────────────────────────────
  rect: {
    label: 'Rectangle Image Frame',
    category: 'basic',
    make: (w: number, h: number): FabricObject =>
      new fabric.Rect({
        width: w, height: h,
        originX: 'center', originY: 'center', left: 0, top: 0, rx: 0, ry: 0,
      }),
  },
  'rounded-rect': {
    label: 'Rounded Rect Image Frame',
    category: 'basic',
    make: (w: number, h: number): FabricObject =>
      new fabric.Rect({
        width: w, height: h,
        originX: 'center', originY: 'center', left: 0, top: 0,
        rx: Math.min(w, h) * 0.12, ry: Math.min(w, h) * 0.12,
      }),
  },
  circle: {
    label: 'Circle Image Frame',
    category: 'basic',
    make: (w: number, h: number): FabricObject =>
      new fabric.Circle({
        radius: Math.min(w, h) / 2,
        originX: 'center', originY: 'center', left: 0, top: 0,
      }),
  },
  ellipse: {
    label: 'Ellipse Image Frame',
    category: 'basic',
    make: (w: number, h: number): FabricObject =>
      new fabric.Ellipse({
        rx: w / 2, ry: h / 2,
        originX: 'center', originY: 'center', left: 0, top: 0,
      }),
  },

  // ── Geometric ──────────────────────────────────────────────────────────────
  triangle: {
    label: 'Triangle Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject =>
      new fabric.Triangle({
        width: w, height: h,
        originX: 'center', originY: 'center', left: 0, top: 0,
      }),
  },
  diamond: {
    label: 'Diamond Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const hw = w / 2, hh = h / 2
      return new fabric.Polygon(
        [{ x: 0, y: -hh }, { x: hw, y: 0 }, { x: 0, y: hh }, { x: -hw, y: 0 }],
        { originX: 'center', originY: 'center', left: 0, top: 0 },
      )
    },
  },
  hexagon: {
    label: 'Hexagon Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const r = Math.min(w, h) / 2
      const pts = Array.from({ length: 6 }, (_, i) => ({
        x: r * Math.cos((Math.PI / 3) * i),
        y: r * Math.sin((Math.PI / 3) * i),
      }))
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  pentagon: {
    label: 'Pentagon Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const r = Math.min(w, h) / 2
      const pts = Array.from({ length: 5 }, (_, i) => ({
        x: r * Math.cos((2 * Math.PI / 5) * i - Math.PI / 2),
        y: r * Math.sin((2 * Math.PI / 5) * i - Math.PI / 2),
      }))
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  octagon: {
    label: 'Octagon Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const r = Math.min(w, h) / 2
      const pts = Array.from({ length: 8 }, (_, i) => ({
        x: r * Math.cos((Math.PI / 4) * i),
        y: r * Math.sin((Math.PI / 4) * i),
      }))
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  star: {
    label: 'Star Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const r = Math.min(w, h) / 2
      const pts: Array<{ x: number; y: number }> = []
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r * 0.45
        const angle  = (Math.PI / 5) * i - Math.PI / 2
        pts.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
      }
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  'star-4': {
    label: '4-Point Star Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const r = Math.min(w, h) / 2
      const pts: Array<{ x: number; y: number }> = []
      for (let i = 0; i < 8; i++) {
        const radius = i % 2 === 0 ? r : r * 0.35
        const angle  = (Math.PI / 4) * i - Math.PI / 4
        pts.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
      }
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  cross: {
    label: 'Cross Image Frame',
    category: 'geometric',
    make: (w: number, h: number): FabricObject => {
      const t = Math.min(w, h) * 0.3  // thickness of arms
      const hw = w / 2, hh = h / 2
      const pts = [
        { x: -t / 2, y: -hh }, { x: t / 2, y: -hh },
        { x: t / 2,  y: -t / 2 }, { x: hw, y: -t / 2 },
        { x: hw,     y:  t / 2 }, { x: t / 2, y:  t / 2 },
        { x: t / 2,  y:  hh  }, { x: -t / 2, y: hh },
        { x: -t / 2, y:  t / 2 }, { x: -hw, y: t / 2 },
        { x: -hw,    y: -t / 2 }, { x: -t / 2, y: -t / 2 },
      ]
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },

  // ── Special (SVG Path) ─────────────────────────────────────────────────────
  heart: {
    label: 'Heart Image Frame',
    category: 'special',
    make: (w: number, h: number): FabricObject => {
      // Heart centered at (0,0) filling w×h bounding box
      const s = Math.min(w, h)
      const sx = w / s, sy = h / s
      const path = `M 0 ${-s * 0.2 * sy}
        C ${-s * 0.05 * sx} ${-s * 0.45 * sy} ${-s * 0.5 * sx} ${-s * 0.45 * sy} ${-s * 0.5 * sx} ${-s * 0.1 * sy}
        C ${-s * 0.5 * sx} ${s * 0.15 * sy} ${-s * 0.25 * sx} ${s * 0.35 * sy} 0 ${s * 0.45 * sy}
        C ${s * 0.25 * sx} ${s * 0.35 * sy} ${s * 0.5 * sx} ${s * 0.15 * sy} ${s * 0.5 * sx} ${-s * 0.1 * sy}
        C ${s * 0.5 * sx} ${-s * 0.45 * sy} ${s * 0.05 * sx} ${-s * 0.45 * sy} 0 ${-s * 0.2 * sy} Z`
      return new fabric.Path(path, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  shield: {
    label: 'Shield Image Frame',
    category: 'special',
    make: (w: number, h: number): FabricObject => {
      const hw = w / 2, hh = h / 2
      const path = `M 0 ${-hh} L ${hw} ${-hh * 0.6} L ${hw} ${hh * 0.1} C ${hw} ${hh * 0.7} 0 ${hh} 0 ${hh} C 0 ${hh} ${-hw} ${hh * 0.7} ${-hw} ${hh * 0.1} L ${-hw} ${-hh * 0.6} Z`
      return new fabric.Path(path, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  speech: {
    label: 'Speech Bubble Image Frame',
    category: 'special',
    make: (w: number, h: number): FabricObject => {
      const hw = w / 2, hh = h / 2, r = Math.min(w, h) * 0.1
      const tailH = h * 0.2, mainH = hh - tailH
      const path = `M ${-hw + r} ${-hh}
        L ${hw - r} ${-hh} Q ${hw} ${-hh} ${hw} ${-hh + r}
        L ${hw} ${mainH - r} Q ${hw} ${mainH} ${hw - r} ${mainH}
        L ${w * 0.1} ${mainH} L ${-w * 0.1} ${hh}
        L ${-w * 0.1} ${mainH}
        L ${-hw + r} ${mainH} Q ${-hw} ${mainH} ${-hw} ${mainH - r}
        L ${-hw} ${-hh + r} Q ${-hw} ${-hh} ${-hw + r} ${-hh} Z`
      return new fabric.Path(path, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  arrow: {
    label: 'Arrow Image Frame',
    category: 'special',
    make: (w: number, h: number): FabricObject => {
      const hw = w / 2, hh = h / 2, thick = hh * 0.45
      const pts = [
        { x: -hw, y: -thick }, { x: hw * 0.1, y: -thick },
        { x: hw * 0.1, y: -hh }, { x: hw, y: 0 },
        { x: hw * 0.1, y: hh }, { x: hw * 0.1, y: thick },
        { x: -hw, y: thick },
      ]
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  badge: {
    label: 'Badge Image Frame',
    category: 'special',
    make: (w: number, h: number): FabricObject => {
      const pts: Array<{ x: number; y: number }> = []
      const n = 12
      const r = Math.min(w, h) / 2
      const indent = r * 0.15
      for (let i = 0; i < n * 2; i++) {
        const radius = i % 2 === 0 ? r : r - indent
        const angle  = (Math.PI / n) * i - Math.PI / 2
        pts.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
      }
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
}

// ── Letter / digit frame shapes ───────────────────────────────────────────────
// Letters use a Rect + Text clipPath inside a Group.
// The Text clipPath makes the letter shape visible against the image fill.
export const LETTERS: string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
export const DIGITS: string[]  = '0123456789'.split('')

// ── Lookup helper ─────────────────────────────────────────────────────────────
/** Return the ShapeDef for a given key, or undefined if not found. */
export function getShapeConfig(shapeKey: string): ShapeDef | undefined {
  return FRAME_SHAPES[shapeKey]
}
