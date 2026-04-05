/**
 * snapping.ts — Figma-style smart snap guide system
 *
 * findSnaps(movingObj, canvas, userGuides)
 *   Returns snap positions, all active guide lines, object-to-object distance measurements
 *
 * Snap sources (priority order):
 *   1. Canvas center (H and V)
 *   2. Canvas edges (4 sides) + rule-of-thirds
 *   3. Other objects — center + 4 edges each
 *   4. Persistent ruler guides
 *
 * Guide line data format passed to GuideOverlay (canvas coordinates):
 *   { vLines: [{x, label}], hLines: [{y, label}], tooltip, nearbyDistances, active }
 */
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import type { RulerGuideSet } from '@/types/canvas'

const SNAP_PX       = 5    // snap threshold in canvas pixels (Figma-grade precision)
const MAX_SNAP_OBJS = 30   // max other objects to check (performance)

// ── Types ─────────────────────────────────────────────────────────────────────

interface BBox {
  left:   number
  top:    number
  right:  number
  bottom: number
  cx:     number
  cy:     number
  w:      number
  h:      number
}

interface SnapOffsets {
  leftDx: number
  cxDx:   number
  topDy:  number
  cyDy:   number
  b:      BBox
}

interface SnapCandidate {
  v: number
  label: string
}

interface VLine { x: number; label: string }
interface HLine { y: number; label: string }

interface DistanceMeasurement {
  type: 'h' | 'v'
  from: number
  to: number
  midY?: number
  midX?: number
  val: number
  label?: string
}

interface SnapTooltip {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapResult {
  snapX: number | null
  snapY: number | null
  vLines: VLine[]
  hLines: HLine[]
  nearbyDistances: DistanceMeasurement[]
  tooltip: SnapTooltip
  active: boolean
  mode?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bbox(obj: FabricObject): BBox {
  const r = obj.getBoundingRect()
  return {
    left:   r.left,
    top:    r.top,
    right:  r.left + r.width,
    bottom: r.top  + r.height,
    cx:     r.left + r.width  / 2,
    cy:     r.top  + r.height / 2,
    w:      r.width,
    h:      r.height,
  }
}

function snapOffsets(obj: FabricObject): SnapOffsets {
  const b = bbox(obj)
  return {
    leftDx: (obj.left ?? 0) - b.left,
    cxDx:   (obj.left ?? 0) - b.cx,
    topDy:  (obj.top  ?? 0) - b.top,
    cyDy:   (obj.top  ?? 0) - b.cy,
    b,
  }
}

function closest(
  candidates: SnapCandidate[],
  value: number,
  threshold: number,
): SnapCandidate | null {
  let best: SnapCandidate | null = null
  let bestDist = threshold
  for (const c of candidates) {
    const dist = Math.abs(c.v - value)
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return best
}

// ── Main export ───────────────────────────────────────────────────────────────

export function findSnaps(
  movingObj: FabricObject,
  fabricCanvas: FabricCanvas,
  userGuides?: RulerGuideSet,
): SnapResult {
  const W   = fabricCanvas.width  ?? 0
  const H   = fabricCanvas.height ?? 0
  const off = snapOffsets(movingObj)
  const b   = off.b

  // ── Build snap candidate lists ──────────────────────────────────────────────
  const xCandidates: SnapCandidate[] = [
    { v: 0,         label: 'Left edge'  },
    { v: W / 2,     label: 'Center'     },
    { v: W,         label: 'Right edge' },
    { v: W / 3,     label: '1/3'        },
    { v: W * 2 / 3, label: '2/3'        },
  ]
  const yCandidates: SnapCandidate[] = [
    { v: 0,         label: 'Top edge'    },
    { v: H / 2,     label: 'Center'      },
    { v: H,         label: 'Bottom edge' },
    { v: H / 3,     label: '1/3'         },
    { v: H * 2 / 3, label: '2/3'         },
  ]

  // Persistent ruler guides as snap candidates
  if (userGuides?.visible) {
    for (const xPos of (userGuides.v ?? [])) xCandidates.push({ v: xPos, label: 'Guide' })
    for (const yPos of (userGuides.h ?? [])) yCandidates.push({ v: yPos, label: 'Guide' })
  }

  // Other objects' edges + centers
  const others = fabricCanvas
    .getObjects()
    .filter((o) => o !== movingObj && o.eliteType && o.visible !== false)
    .slice(0, MAX_SNAP_OBJS)

  for (const obj of others) {
    const ob = bbox(obj)
    xCandidates.push(
      { v: ob.left,  label: 'Object left'   },
      { v: ob.cx,    label: 'Object center' },
      { v: ob.right, label: 'Object right'  },
    )
    yCandidates.push(
      { v: ob.top,    label: 'Object top'    },
      { v: ob.cy,     label: 'Object center' },
      { v: ob.bottom, label: 'Object bottom' },
    )
  }

  // ── Find best snap on each axis ─────────────────────────────────────────────
  const xSnapPoints = [
    { value: b.left,  dx: off.leftDx,       side: 'left'   },
    { value: b.cx,    dx: off.cxDx,         side: 'center' },
    { value: b.right, dx: off.leftDx - b.w, side: 'right'  },
  ]
  let bestX: { targetObjLeft: number; guideX: number; label: string } | null = null
  let bestXDist = SNAP_PX
  for (const pt of xSnapPoints) {
    const c = closest(xCandidates, pt.value, bestXDist)
    if (c) {
      bestXDist = Math.abs(c.v - pt.value)
      bestX = { targetObjLeft: c.v + pt.dx, guideX: c.v, label: c.label }
    }
  }

  const ySnapPoints = [
    { value: b.top,    dy: off.topDy,       side: 'top'    },
    { value: b.cy,     dy: off.cyDy,        side: 'center' },
    { value: b.bottom, dy: off.topDy - b.h, side: 'bottom' },
  ]
  let bestY: { targetObjTop: number; guideY: number; label: string } | null = null
  let bestYDist = SNAP_PX
  for (const pt of ySnapPoints) {
    const c = closest(yCandidates, pt.value, bestYDist)
    if (c) {
      bestYDist = Math.abs(c.v - pt.value)
      bestY = { targetObjTop: c.v + pt.dy, guideY: c.v, label: c.label }
    }
  }

  // ── Collect ALL guide lines at the snap positions ───────────────────────────
  const vLines: VLine[] = []
  if (bestX) {
    for (const c of xCandidates) {
      if (Math.abs(c.v - bestX.guideX) < 0.5 && !vLines.some((l) => l.x === c.v)) {
        vLines.push({ x: c.v, label: c.label })
      }
    }
    if (vLines.length === 0) vLines.push({ x: bestX.guideX, label: bestX.label })
  }

  const hLines: HLine[] = []
  if (bestY) {
    for (const c of yCandidates) {
      if (Math.abs(c.v - bestY.guideY) < 0.5 && !hLines.some((l) => l.y === c.v)) {
        hLines.push({ y: c.v, label: c.label })
      }
    }
    if (hLines.length === 0) hLines.push({ y: bestY.guideY, label: bestY.label })
  }

  // ── Object-to-object distance measurements ──────────────────────────────────
  const nearbyDistances: DistanceMeasurement[] = []
  const NEARBY_PX = 120  // show distance measurements within 120px
  for (const obj of others) {
    const ob = bbox(obj)

    // Only measure objects that overlap on the perpendicular axis
    // (like Figma — only show gap when objects are roughly aligned)
    const hOverlap = !(b.bottom < ob.top || b.top > ob.bottom)  // vertically overlapping
    const vOverlap = !(b.right < ob.left || b.left > ob.right)  // horizontally overlapping

    // Horizontal spacing (gap between left/right edges)
    if (hOverlap && ob.right <= b.left && b.left - ob.right <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'h',
        from: ob.right, to: b.left,
        midY: (Math.max(b.top, ob.top) + Math.min(b.bottom, ob.bottom)) / 2,
        val:  Math.round(b.left - ob.right),
      })
    }
    if (hOverlap && b.right <= ob.left && ob.left - b.right <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'h',
        from: b.right, to: ob.left,
        midY: (Math.max(b.top, ob.top) + Math.min(b.bottom, ob.bottom)) / 2,
        val:  Math.round(ob.left - b.right),
      })
    }
    // Vertical spacing (gap between top/bottom edges)
    if (vOverlap && ob.bottom <= b.top && b.top - ob.bottom <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'v',
        from: ob.bottom, to: b.top,
        midX: (Math.max(b.left, ob.left) + Math.min(b.right, ob.right)) / 2,
        val:  Math.round(b.top - ob.bottom),
      })
    }
    if (vOverlap && b.bottom <= ob.top && ob.top - b.bottom <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'v',
        from: b.bottom, to: ob.top,
        midX: (Math.max(b.left, ob.left) + Math.min(b.right, ob.right)) / 2,
        val:  Math.round(ob.top - b.bottom),
      })
    }
  }

  // ── Equal spacing detection (3+ objects in a row/column) ────────────────
  // Check if the moving object's distance to its left neighbor matches
  // the distance between other adjacent pairs of objects.
  const EQUAL_SPACING_THRESHOLD = 3 // px tolerance for "equal spacing"
  for (const dm of nearbyDistances) {
    if (dm.val <= 0) continue
    // Find other object pairs with matching spacing
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = bbox(others[i])
        const bObj = bbox(others[j])
        if (dm.type === 'h') {
          const gap1 = bObj.left - a.right
          const gap2 = a.left - bObj.right
          const gap = gap1 > 0 ? gap1 : gap2 > 0 ? gap2 : -1
          if (gap > 0 && Math.abs(gap - dm.val) < EQUAL_SPACING_THRESHOLD) {
            dm.label = 'Equal spacing'
          }
        } else {
          const gap1 = bObj.top - a.bottom
          const gap2 = a.top - bObj.bottom
          const gap = gap1 > 0 ? gap1 : gap2 > 0 ? gap2 : -1
          if (gap > 0 && Math.abs(gap - dm.val) < EQUAL_SPACING_THRESHOLD) {
            dm.label = 'Equal spacing'
          }
        }
      }
    }
  }

  // ── Pixel-perfect: round snap positions to whole pixels ────────────────
  const finalSnapX = bestX ? Math.round(bestX.targetObjLeft) : null
  const finalSnapY = bestY ? Math.round(bestY.targetObjTop) : null

  return {
    snapX:  finalSnapX,
    snapY:  finalSnapY,
    vLines,
    hLines,
    nearbyDistances,
    tooltip: {
      x: Math.round(b.left),
      y: Math.round(b.top),
      w: Math.round(b.w),
      h: Math.round(b.h),
    },
    active: true,
  }
}

export function applySnap(obj: FabricObject, snaps: SnapResult): void {
  if (snaps.snapX !== null) obj.left = snaps.snapX
  if (snaps.snapY !== null) obj.top  = snaps.snapY
  if (snaps.snapX !== null || snaps.snapY !== null) obj.setCoords()
}

export function buildResizeGuides(obj: FabricObject): SnapResult {
  const b = bbox(obj)
  return {
    vLines: [],
    hLines: [],
    nearbyDistances: [],
    tooltip: {
      x: Math.round(b.left),
      y: Math.round(b.top),
      w: Math.round(b.w),
      h: Math.round(b.h),
    },
    active: true,
    mode: 'resize',
    snapX: null,
    snapY: null,
  }
}
