/**
 * frames.js — Canva-style Image Frames for Fabric.js
 *
 * A Frame is a Fabric shape whose `fill` is a fabric.Pattern (the image).
 * Because SVG/canvas fill clips to the shape boundary automatically, any
 * shape — circle, polygon, path, even letter outlines — naturally masks the
 * image to that shape. No separate clipPath object is needed for simple shapes.
 *
 * For letter/digit frames we use a fabric.Group with a Text-based clipPath.
 *
 * Custom properties stored on every frame:
 *   eliteType        = 'frame'
 *   eliteFrameShape  = shape identifier string (e.g. 'circle', 'heart', 'A')
 *   eliteFrameW      = original frame width
 *   eliteFrameH      = original frame height
 *   eliteFitMode     = 'fill' | 'fit' | 'stretch' | 'none'
 *   eliteImageSrc    = data-URL of the loaded image (for re-fitting)
 *   eliteImageOffsetX / eliteImageOffsetY = manual pan within frame
 *   eliteImageScale  = manual zoom multiplier (1 = no extra zoom)
 */

import * as fabric from 'fabric'

// ── Frame placeholder gradient (shown when no image is loaded) ────────────────
function makePlaceholderFill(w, h) {
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

// ── SVG path generators — all centered at (0,0) with given w/h ───────────────
export const FRAME_SHAPES = {
  // ── Basic ──────────────────────────────────────────────────────────────────
  rect: {
    label: 'Rectangle Image Frame',
    category: 'basic',
    make: (w, h) => new fabric.Rect({ width: w, height: h,
      originX: 'center', originY: 'center', left: 0, top: 0, rx: 0, ry: 0 }),
  },
  'rounded-rect': {
    label: 'Rounded Rect Image Frame',
    category: 'basic',
    make: (w, h) => new fabric.Rect({ width: w, height: h,
      originX: 'center', originY: 'center', left: 0, top: 0,
      rx: Math.min(w, h) * 0.12, ry: Math.min(w, h) * 0.12 }),
  },
  circle: {
    label: 'Circle Image Frame',
    category: 'basic',
    make: (w, h) => new fabric.Circle({ radius: Math.min(w, h) / 2,
      originX: 'center', originY: 'center', left: 0, top: 0 }),
  },
  ellipse: {
    label: 'Ellipse Image Frame',
    category: 'basic',
    make: (w, h) => new fabric.Ellipse({ rx: w / 2, ry: h / 2,
      originX: 'center', originY: 'center', left: 0, top: 0 }),
  },

  // ── Geometric ──────────────────────────────────────────────────────────────
  triangle: {
    label: 'Triangle Image Frame',
    category: 'geometric',
    make: (w, h) => new fabric.Triangle({ width: w, height: h,
      originX: 'center', originY: 'center', left: 0, top: 0 }),
  },
  diamond: {
    label: 'Diamond Image Frame',
    category: 'geometric',
    make: (w, h) => {
      const hw = w / 2, hh = h / 2
      return new fabric.Polygon(
        [{ x: 0, y: -hh }, { x: hw, y: 0 }, { x: 0, y: hh }, { x: -hw, y: 0 }],
        { originX: 'center', originY: 'center', left: 0, top: 0 }
      )
    },
  },
  hexagon: {
    label: 'Hexagon Image Frame',
    category: 'geometric',
    make: (w, h) => {
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
    make: (w, h) => {
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
    make: (w, h) => {
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
    make: (w, h) => {
      const r = Math.min(w, h) / 2
      const pts = []
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
    make: (w, h) => {
      const r = Math.min(w, h) / 2
      const pts = []
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
    make: (w, h) => {
      const t = Math.min(w, h) * 0.3  // thickness of arms
      const hw = w / 2, hh = h / 2
      const pts = [
        { x: -t/2, y: -hh }, { x: t/2, y: -hh },
        { x: t/2,  y: -t/2 }, { x: hw, y: -t/2 },
        { x: hw,   y:  t/2 }, { x: t/2, y:  t/2 },
        { x: t/2,  y:  hh  }, { x: -t/2, y: hh },
        { x: -t/2, y:  t/2 }, { x: -hw, y: t/2 },
        { x: -hw,  y: -t/2 }, { x: -t/2, y: -t/2 },
      ]
      return new fabric.Polygon(pts, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },

  // ── Special (SVG Path) ─────────────────────────────────────────────────────
  heart: {
    label: 'Heart Image Frame',
    category: 'special',
    make: (w, h) => {
      // Heart centered at (0,0) filling w×h bounding box
      const s = Math.min(w, h)
      const sx = w / s, sy = h / s
      // Standard heart path, then scaled
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
    make: (w, h) => {
      const hw = w / 2, hh = h / 2
      const path = `M 0 ${-hh} L ${hw} ${-hh * 0.6} L ${hw} ${hh * 0.1} C ${hw} ${hh * 0.7} 0 ${hh} 0 ${hh} C 0 ${hh} ${-hw} ${hh * 0.7} ${-hw} ${hh * 0.1} L ${-hw} ${-hh * 0.6} Z`
      return new fabric.Path(path, { originX: 'center', originY: 'center', left: 0, top: 0 })
    },
  },
  speech: {
    label: 'Speech Bubble Image Frame',
    category: 'special',
    make: (w, h) => {
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
    make: (w, h) => {
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
    make: (w, h) => {
      const pts = []; const n = 12; const r = Math.min(w, h) / 2; const indent = r * 0.15
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
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
export const DIGITS  = '0123456789'.split('')

// ── Build frame group (placeholder or letter) ─────────────────────────────────
function buildLetterFrame(char, w, h, accent) {
  const fontSize  = Math.min(w, h) * 1.0
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

// ── Create a new frame on canvas ──────────────────────────────────────────────
export function addFrame(canvas, cx, cy, shapeKey, frameW, frameH, accent) {
  // Normalize frameH — some presets share width, height varies
  const w = frameW  || 500
  const h = frameH  || 500

  let frameObj

  // Letter / digit frame
  if (shapeKey.length === 1 && /[A-Z0-9]/.test(shapeKey)) {
    frameObj = buildLetterFrame(shapeKey, w, h, accent)
    frameObj.set({ left: cx, top: cy, originX: 'center', originY: 'center' })
  } else {
    const shapeDef = FRAME_SHAPES[shapeKey]
    if (!shapeDef) return
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

  // Store frame metadata
  const shapeLabel = FRAME_SHAPES[shapeKey]?.label
    || (shapeKey.length === 1 ? `${shapeKey} Image Frame` : `${shapeKey} Image Frame`)
  frameObj.eliteType         = 'frame'
  frameObj.eliteLabel        = shapeLabel
  frameObj.eliteFrameShape   = shapeKey
  frameObj.eliteFrameW       = w
  frameObj.eliteFrameH       = h
  frameObj.eliteFitMode      = 'fill'
  frameObj.eliteImageSrc     = null
  frameObj.eliteImageOffsetX = 0
  frameObj.eliteImageOffsetY = 0
  frameObj.eliteImageScale   = 1

  canvas.add(frameObj)
  canvas.setActiveObject(frameObj)
  canvas.renderAll()
  return frameObj
}

// ── Pattern transform calculators ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: All frame shapes use originX/Y = 'center'.
// In Fabric.js, a Pattern's coordinate (0,0) maps to the object's LOCAL origin.
// For center-origin objects, the local origin IS the center of the shape.
// So to center an image of size (iw × ih) in the frame (fw × fh), we need:
//
//   image center (iw*sx/2, ih*sy/2) → local center (0, 0)
//   ⟹ tx = -iw * sx / 2,  ty = -ih * sy / 2
//
// The old formula  tx = (fw - iw*sx)/2  was wrong — it was the top-left formula.
// ─────────────────────────────────────────────────────────────────────────────
//
// @param fw / fh   — frame's LOCAL dimensions (frame.width, frame.height — NOT scaled)
// @param iw / ih   — image's natural pixel dimensions
// @param fitMode   — 'fill' | 'fit' | 'stretch' | 'none'
// @param offsetX/Y — manual pan in local canvas units (from Properties Panel sliders)
// @param extraScale — extra zoom multiplier (from Properties Panel zoom slider)
//
// Returns patternTransform = [sx, 0, 0, sy, tx, ty]

function computePatternTransform(fw, fh, iw, ih, fitMode, offsetX, offsetY, extraScale) {
  const extra = Math.max(0.01, extraScale || 1)
  let sx, sy, tx, ty

  if (fitMode === 'fill') {
    // Cover: image fills entire frame, cropping edges if aspect ratios differ
    const scale = Math.max(fw / iw, fh / ih) * extra
    sx = scale; sy = scale
    tx = -iw * scale / 2 + offsetX
    ty = -ih * scale / 2 + offsetY

  } else if (fitMode === 'fit') {
    // Contain: entire image is visible (letterboxed inside frame)
    const scale = Math.min(fw / iw, fh / ih) * extra
    sx = scale; sy = scale
    tx = -iw * scale / 2 + offsetX
    ty = -ih * scale / 2 + offsetY

  } else if (fitMode === 'stretch') {
    // Distort image to exactly fill the frame (ignores aspect ratio)
    sx = (fw / iw) * extra
    sy = (fh / ih) * extra
    tx = -fw / 2 + offsetX    // = -iw * sx / 2
    ty = -fh / 2 + offsetY    // = -ih * sy / 2

  } else {
    // 'none' — original image size, centered in frame
    sx = extra; sy = extra
    tx = -iw * extra / 2 + offsetX
    ty = -ih * extra / 2 + offsetY
  }

  return [sx, 0, 0, sy, tx, ty]
}

// ── Apply image to an existing frame ─────────────────────────────────────────
//
// IMPLEMENTATION STRATEGY:
//   Fabric.js pattern fill clips correctly for Rect and Circle because they have
//   dedicated clip-path implementations in the renderer.  For ALL other shapes
//   (Polygon, Triangle, Path, Ellipse) the pattern bleeds outside the boundary.
//
//   Solution: use fabric.Image + frame-shape clipPath.
//   - Create a fabric.Image from imgEl, sized/positioned to fill the frame.
//   - Clone the frame shape (same geometry) as an absolutePositioned clipPath.
//   - Replace the frame object on canvas with a Fabric Group [imgRect + clipShape]
//     that moves/scales as one unit.
//
//   For fabric.Rect and fabric.Circle we keep the simpler pattern-fill approach
//   because it is more efficient and just works.
//
export function applyImageToFrame(frame, imgEl) {
  if (!frame || !imgEl) return

  // Persist for re-fitting when settings change
  frame.eliteImageSrc = imgEl.src?.startsWith('data:') ? '[data-url]' : (imgEl.src || '')
  frame._eliteImageEl = imgEl

  const fw    = frame.width  || frame.eliteFrameW || 500
  const fh    = frame.height || frame.eliteFrameH || 500
  const iw    = imgEl.naturalWidth  || imgEl.width  || 1
  const ih    = imgEl.naturalHeight || imgEl.height || 1
  const fmode = frame.eliteFitMode      || 'fill'
  const offX  = frame.eliteImageOffsetX || 0
  const offY  = frame.eliteImageOffsetY || 0
  const extra = frame.eliteImageScale   || 1

  // ── For Group (letter/digit) frames keep pattern-fill approach ────────────
  if (frame instanceof fabric.Group) {
    const transform = computePatternTransform(fw, fh, iw, ih, fmode, offX, offY, extra)
    const pattern   = new fabric.Pattern({ source: imgEl, repeat: 'no-repeat' })
    pattern.patternTransform = transform
    const innerRect = frame.getObjects()[0]
    if (innerRect && innerRect.clipPath) {
      innerRect.set('fill', pattern)
      innerRect.dirty = true
    }
    frame.dirty = true
    return
  }

  // ── For all other shapes: use fabric.Image + clipPath ─────────────────────
  // Compute image dimensions for the chosen fit mode
  let imgW, imgH, imgLeft, imgTop
  if (fmode === 'fill') {
    const scale = Math.max(fw / iw, fh / ih) * extra
    imgW = iw * scale; imgH = ih * scale
    imgLeft = -imgW / 2 + offX; imgTop = -imgH / 2 + offY
  } else if (fmode === 'fit') {
    const scale = Math.min(fw / iw, fh / ih) * extra
    imgW = iw * scale; imgH = ih * scale
    imgLeft = -imgW / 2 + offX; imgTop = -imgH / 2 + offY
  } else if (fmode === 'stretch') {
    imgW = fw * extra; imgH = fh * extra
    imgLeft = -fw / 2 + offX; imgTop = -fh / 2 + offY
  } else {
    imgW = iw * extra; imgH = ih * extra
    imgLeft = -iw * extra / 2 + offX; imgTop = -ih * extra / 2 + offY
  }

  // Build a fabric.Image (uses HTMLImageElement directly — no cross-origin issues)
  const fabricImg = new fabric.Image(imgEl, {
    left:    imgLeft,
    top:     imgTop,
    scaleX:  imgW / iw,
    scaleY:  imgH / ih,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented:    false,
  })

  // Clone the frame shape as the clipPath — must be centered at 0,0
  const clip = _cloneShapeForClip(frame)

  // Apply clipPath to the image — this masks the image to the frame shape
  fabricImg.clipPath = clip

  // Store references for re-fitting
  frame._eliteFabricImg = fabricImg
  frame._eliteClip      = clip

  // Set the frame fill to transparent (image is now layered as a clipPath'd image)
  // We reuse the frame object as a transparent hit-target and border holder
  frame.set({ fill: 'transparent', strokeWidth: 0, strokeDashArray: null })

  // If the canvas is available via frame.canvas, add the image directly below the frame
  const canvas = frame.canvas
  if (canvas) {
    // Remove old image layer if present
    if (frame._elitePrevFabricImg) {
      canvas.remove(frame._elitePrevFabricImg)
    }
    frame._elitePrevFabricImg = fabricImg

    const frameIdx = canvas.getObjects().indexOf(frame)
    canvas.insertAt(frameIdx, fabricImg)
    fabricImg.setCoords()
  }

  frame.dirty = true
}

// ── Clone a frame shape as an absolutePositioned clipPath ────────────────────
// The clip must use absolutePositioned = true so it stays fixed in canvas space
// and matches where the frame object actually is.
function _cloneShapeForClip(frame) {
  // absolutePositioned: true means the clip coordinates are in canvas (absolute) space
  // We need to compute the canvas-space center of the frame
  const center = frame.getCenterPoint()

  const base = {
    absolutePositioned: true,
    left:   center.x,
    top:    center.y,
    angle:  frame.angle  || 0,
    scaleX: frame.scaleX || 1,
    scaleY: frame.scaleY || 1,
    originX: 'center',
    originY: 'center',
    fill:    'black',   // fill = black → visible area; transparency = clipped
    stroke:  null,
    strokeWidth: 0,
  }

  const w = frame.width  || 500
  const h = frame.height || 500

  // Reconstruct the same geometry as the frame
  const type = frame.type // 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polygon' | 'path'
  if (type === 'rect') {
    return new fabric.Rect({ ...base, width: w, height: h, rx: frame.rx || 0, ry: frame.ry || 0 })
  }
  if (type === 'circle') {
    return new fabric.Circle({ ...base, radius: frame.radius || Math.min(w, h) / 2 })
  }
  if (type === 'ellipse') {
    return new fabric.Ellipse({ ...base, rx: frame.rx || w / 2, ry: frame.ry || h / 2 })
  }
  if (type === 'triangle') {
    return new fabric.Triangle({ ...base, width: w, height: h })
  }
  if (type === 'polygon') {
    // Deep-copy the points array
    const pts = (frame.points || []).map(p => ({ x: p.x, y: p.y }))
    return new fabric.Polygon(pts, base)
  }
  if (type === 'path') {
    // Re-use the same path string
    const pathData = frame.path
    return new fabric.Path(pathData, base)
  }
  // Fallback: rect
  return new fabric.Rect({ ...base, width: w, height: h })
}

// ── Re-apply stored image with updated fit mode / offsets / scale ─────────────
// Called by PropertiesPanel whenever the user changes fit mode, pan, or zoom sliders.
export function refitFrame(frame) {
  const imgEl = frame._eliteImageEl
  if (!imgEl) return
  // Re-apply fully — applyImageToFrame handles all cases correctly
  applyImageToFrame(frame, imgEl)
}

// ── Remove image from frame (revert to placeholder) ───────────────────────────
export function clearFrameImage(frame, accent) {
  const w = frame.eliteFrameW || frame.width  || 500
  const h = frame.eliteFrameH || frame.height || 500

  // Remove the floating fabric.Image layer inserted for non-rect shapes
  if (frame._elitePrevFabricImg && frame.canvas) {
    frame.canvas.remove(frame._elitePrevFabricImg)
  }
  frame._elitePrevFabricImg = null
  frame._eliteFabricImg     = null
  frame._eliteClip          = null
  frame.eliteImageSrc       = null
  frame._eliteImageEl       = null
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
    if (innerRect) { innerRect.set('fill', placeholder); innerRect.dirty = true }
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

// ── Load image from a File → apply to frame ───────────────────────────────────
export function loadFileIntoFrame(frame, file, onDone) {
  const reader = new FileReader()
  reader.onload = ev => {
    const imgEl = new Image()
    imgEl.onload = () => {
      applyImageToFrame(frame, imgEl)
      onDone?.()
    }
    imgEl.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

// ── Detect if a point on canvas is inside a frame ────────────────────────────
// Used when dropping an image onto the canvas to route it into a frame.
// Point coords must be in Fabric canvas space (not screen space).
export function findFrameAtPoint(canvas, cx, cy) {
  const objects = canvas.getObjects()
  // Iterate in reverse (top objects first) — first hit wins
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    if (obj.eliteType !== 'frame') continue
    // containsPoint works in absolute canvas coordinates
    if (obj.containsPoint({ x: cx, y: cy })) return obj
  }
  return null
}

// ── Drag-over visual feedback ─────────────────────────────────────────────────
// Highlights a frame with an accent glow when an image is dragged over it.
// Call highlightFrame(frame, accent) on dragover, clearFrameHighlight(frame) on dragleave/drop.

export function highlightFrame(frame, accent) {
  if (!frame || frame._eliteHighlighted) return
  frame._eliteHighlighted   = true
  frame._eliteOrigStroke    = frame.stroke
  frame._eliteOrigStrokeW   = frame.strokeWidth
  frame._eliteOrigDash      = frame.strokeDashArray

  frame.set({
    stroke:          accent || '#0BDA76',
    strokeWidth:     3,
    strokeDashArray: [8, 4],
    opacity:         (frame.opacity || 1) * 0.92,
  })
  frame.dirty = true
}

export function clearFrameHighlight(frame) {
  if (!frame || !frame._eliteHighlighted) return
  frame._eliteHighlighted = false
  frame.set({
    stroke:          frame._eliteOrigStroke    ?? 'transparent',
    strokeWidth:     frame._eliteOrigStrokeW   ?? 0,
    strokeDashArray: frame._eliteOrigDash      ?? undefined,
    opacity:         (frame.opacity || 1) / 0.92,  // undo the dim
  })
  frame.dirty = true
}
