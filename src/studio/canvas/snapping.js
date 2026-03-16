/**
 * snapping.js — Figma-style smart snap guide system
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

const SNAP_PX       = 8    // snap threshold in canvas pixels
const MAX_SNAP_OBJS = 20   // max other objects to check (performance)

// ── Helpers ───────────────────────────────────────────────────────────────────
function bbox(obj) {
  const r = obj.getBoundingRect(true, true)
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

function snapOffsets(obj) {
  const b = bbox(obj)
  return {
    leftDx: obj.left - b.left,
    cxDx:   obj.left - b.cx,
    topDy:  obj.top  - b.top,
    cyDy:   obj.top  - b.cy,
    b,
  }
}

function closest(candidates, value, threshold) {
  let best = null, bestDist = threshold
  for (const c of candidates) {
    const dist = Math.abs(c.v - value)
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return best
}

// ── Main export ───────────────────────────────────────────────────────────────
export function findSnaps(movingObj, fabricCanvas, userGuides) {
  const W   = fabricCanvas.width
  const H   = fabricCanvas.height
  const off = snapOffsets(movingObj)
  const b   = off.b

  // ── Build snap candidate lists ──────────────────────────────────────────────
  const xCandidates = [
    { v: 0,       label: 'Left edge'  },
    { v: W / 2,   label: 'Center'     },
    { v: W,       label: 'Right edge' },
    { v: W / 3,   label: '1/3'        },
    { v: W * 2/3, label: '2/3'        },
  ]
  const yCandidates = [
    { v: 0,       label: 'Top edge'    },
    { v: H / 2,   label: 'Center'      },
    { v: H,       label: 'Bottom edge' },
    { v: H / 3,   label: '1/3'         },
    { v: H * 2/3, label: '2/3'         },
  ]

  // Persistent ruler guides as snap candidates
  if (userGuides?.visible) {
    for (const xPos of (userGuides.v || [])) xCandidates.push({ v: xPos, label: 'Guide' })
    for (const yPos of (userGuides.h || [])) yCandidates.push({ v: yPos, label: 'Guide' })
  }

  // Other objects' edges + centers
  const others = fabricCanvas.getObjects()
    .filter(o => o !== movingObj && o.eliteType && o.visible !== false)
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
    { value: b.left,  dx: off.leftDx,        side: 'left'   },
    { value: b.cx,    dx: off.cxDx,          side: 'center' },
    { value: b.right, dx: off.leftDx - b.w,  side: 'right'  },
  ]
  let bestX = null, bestXDist = SNAP_PX
  for (const pt of xSnapPoints) {
    const c = closest(xCandidates, pt.value, bestXDist)
    if (c) {
      bestXDist = Math.abs(c.v - pt.value)
      bestX = { targetObjLeft: c.v + pt.dx, guideX: c.v, label: c.label }
    }
  }

  const ySnapPoints = [
    { value: b.top,    dy: off.topDy,        side: 'top'    },
    { value: b.cy,     dy: off.cyDy,         side: 'center' },
    { value: b.bottom, dy: off.topDy - b.h,  side: 'bottom' },
  ]
  let bestY = null, bestYDist = SNAP_PX
  for (const pt of ySnapPoints) {
    const c = closest(yCandidates, pt.value, bestYDist)
    if (c) {
      bestYDist = Math.abs(c.v - pt.value)
      bestY = { targetObjTop: c.v + pt.dy, guideY: c.v, label: c.label }
    }
  }

  // ── Collect ALL guide lines at the snap positions ───────────────────────────
  // Multiple objects may share the same alignment X → show one guide through all
  const vLines = []
  if (bestX) {
    for (const c of xCandidates) {
      if (Math.abs(c.v - bestX.guideX) < 0.5 && !vLines.some(l => l.x === c.v)) {
        vLines.push({ x: c.v, label: c.label })
      }
    }
    if (vLines.length === 0) vLines.push({ x: bestX.guideX, label: bestX.label })
  }

  const hLines = []
  if (bestY) {
    for (const c of yCandidates) {
      if (Math.abs(c.v - bestY.guideY) < 0.5 && !hLines.some(l => l.y === c.v)) {
        hLines.push({ y: c.v, label: c.label })
      }
    }
    if (hLines.length === 0) hLines.push({ y: bestY.guideY, label: bestY.label })
  }

  // ── Object-to-object distance measurements ─────────────────────────────────
  // Show spacing between the dragged object and nearby static objects
  const nearbyDistances = []
  const NEARBY_PX = SNAP_PX * 4  // show distances when within this many px
  for (const obj of others) {
    const ob = bbox(obj)
    // Horizontal spacing
    if (ob.right <= b.left && b.left - ob.right <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'h',
        from: ob.right, to: b.left,
        midY: Math.min(b.cy, ob.cy),
        val:  Math.round(b.left - ob.right),
      })
    }
    if (b.right <= ob.left && ob.left - b.right <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'h',
        from: b.right, to: ob.left,
        midY: Math.min(b.cy, ob.cy),
        val:  Math.round(ob.left - b.right),
      })
    }
    // Vertical spacing
    if (ob.bottom <= b.top && b.top - ob.bottom <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'v',
        from: ob.bottom, to: b.top,
        midX: Math.min(b.cx, ob.cx),
        val:  Math.round(b.top - ob.bottom),
      })
    }
    if (b.bottom <= ob.top && ob.top - b.bottom <= NEARBY_PX) {
      nearbyDistances.push({
        type: 'v',
        from: b.bottom, to: ob.top,
        midX: Math.min(b.cx, ob.cx),
        val:  Math.round(ob.top - b.bottom),
      })
    }
  }

  return {
    snapX:  bestX ? bestX.targetObjLeft : null,
    snapY:  bestY ? bestY.targetObjTop  : null,
    vLines,
    hLines,
    nearbyDistances,
    tooltip: {
      x: Math.round(b.left),
      y: Math.round(b.top),
      w: Math.round(b.w),
      h: Math.round(b.h),
    },
    active: true,   // always show tooltip + measurements while dragging
  }
}

export function applySnap(obj, snaps) {
  if (snaps.snapX !== null) obj.left = snaps.snapX
  if (snaps.snapY !== null) obj.top  = snaps.snapY
  if (snaps.snapX !== null || snaps.snapY !== null) obj.setCoords()
}

export function buildResizeGuides(obj) {
  const b = bbox(obj)
  return {
    vLines: [], hLines: [], nearbyDistances: [],
    tooltip: {
      x: Math.round(b.left),
      y: Math.round(b.top),
      w: Math.round(b.w),
      h: Math.round(b.h),
    },
    active: true,
    mode: 'resize',
  }
}
