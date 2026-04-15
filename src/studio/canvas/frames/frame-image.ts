/**
 * frame-image.ts — Image loading and application for Fabric.js Image Frames.
 *
 * Contains:
 *   - loadFileIntoFrame()  — File → FileReader → HTMLImageElement → applyImageToFrame
 *   - applyImageToFrame()  — places an HTMLImageElement inside an existing frame object
 *   - computePatternTransform() — internal pattern-transform calculator
 *   - _cloneShapeForClip()     — internal helper to clone a frame shape as a clipPath
 */
import * as fabric from 'fabric'
import type { FabricObject } from 'fabric'

// ── Pattern transform calculator ──────────────────────────────────────────────
//
// CRITICAL: All frame shapes use originX/Y = 'center'.
// In Fabric.js, a Pattern's coordinate (0,0) maps to the object's LOCAL origin.
// For center-origin objects, the local origin IS the center of the shape.
// So to center an image of size (iw × ih) in the frame (fw × fh), we need:
//
//   image center (iw*sx/2, ih*sy/2) → local center (0, 0)
//   ⟹ tx = -iw * sx / 2,  ty = -ih * sy / 2
//
// @param fw / fh   — frame's LOCAL dimensions (frame.width, frame.height — NOT scaled)
// @param iw / ih   — image's natural pixel dimensions
// @param fitMode   — 'fill' | 'fit' | 'stretch' | 'none'
// @param offsetX/Y — manual pan in local canvas units
// @param extraScale — extra zoom multiplier
//
// Returns patternTransform = [sx, 0, 0, sy, tx, ty]

function computePatternTransform(
  fw: number,
  fh: number,
  iw: number,
  ih: number,
  fitMode: string,
  offsetX: number,
  offsetY: number,
  extraScale: number,
): [number, number, number, number, number, number] {
  const extra = Math.max(0.01, extraScale || 1)
  let sx: number, sy: number, tx: number, ty: number

  if (fitMode === 'fill') {
    const scale = Math.max(fw / iw, fh / ih) * extra
    sx = scale; sy = scale
    tx = -iw * scale / 2 + offsetX
    ty = -ih * scale / 2 + offsetY

  } else if (fitMode === 'fit') {
    const scale = Math.min(fw / iw, fh / ih) * extra
    sx = scale; sy = scale
    tx = -iw * scale / 2 + offsetX
    ty = -ih * scale / 2 + offsetY

  } else if (fitMode === 'stretch') {
    sx = (fw / iw) * extra
    sy = (fh / ih) * extra
    tx = -fw / 2 + offsetX
    ty = -fh / 2 + offsetY

  } else {
    // 'none' — original image size, centered in frame
    sx = extra; sy = extra
    tx = -iw * extra / 2 + offsetX
    ty = -ih * extra / 2 + offsetY
  }

  return [sx, 0, 0, sy, tx, ty]
}

// ── Clone a frame shape as an absolutePositioned clipPath ─────────────────────
// absolutePositioned = true means clip coordinates are in canvas (absolute) space.
// Matches where the frame object actually is on the canvas.
function _cloneShapeForClip(frame: FabricObject): FabricObject {
  const center = frame.getCenterPoint()

  const base = {
    absolutePositioned: true,
    left:   center.x,
    top:    center.y,
    angle:  frame.angle  || 0,
    scaleX: frame.scaleX || 1,
    scaleY: frame.scaleY || 1,
    originX: 'center' as const,
    originY: 'center' as const,
    fill:    'black',   // fill = black → visible area; transparency = clipped
    stroke:  null,
    strokeWidth: 0,
  }

  const w = frame.width  || 500
  const h = frame.height || 500

  // Reconstruct the same geometry as the frame
  const type = frame.type
  if (type === 'rect') {
    const r = frame as fabric.Rect
    return new fabric.Rect({ ...base, width: w, height: h, rx: r.rx || 0, ry: r.ry || 0 })
  }
  if (type === 'circle') {
    const c = frame as fabric.Circle
    return new fabric.Circle({ ...base, radius: c.radius || Math.min(w, h) / 2 })
  }
  if (type === 'ellipse') {
    const e = frame as fabric.Ellipse
    return new fabric.Ellipse({ ...base, rx: e.rx || w / 2, ry: e.ry || h / 2 })
  }
  if (type === 'triangle') {
    return new fabric.Triangle({ ...base, width: w, height: h })
  }
  if (type === 'polygon') {
    const poly = frame as fabric.Polygon
    const pts = (poly.points || []).map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }))
    return new fabric.Polygon(pts, base)
  }
  if (type === 'path') {
    const pathObj = frame as fabric.Path
    const pathData = pathObj.path
    return new fabric.Path(pathData as unknown as string, base)
  }
  // Fallback: rect
  return new fabric.Rect({ ...base, width: w, height: h })
}

// ── Apply image to an existing frame ──────────────────────────────────────────
//
// IMPLEMENTATION STRATEGY:
//   Fabric.js pattern fill clips correctly for Rect and Circle because they have
//   dedicated clip-path implementations in the renderer.  For ALL other shapes
//   (Polygon, Triangle, Path, Ellipse) the pattern bleeds outside the boundary.
//
//   Solution: use fabric.Image + frame-shape clipPath.
//   - Create a fabric.Image from imgEl, sized/positioned to fill the frame.
//   - Clone the frame shape (same geometry) as an absolutePositioned clipPath.
//   - The frame object itself becomes a transparent hit-target and border holder.
//
//   For fabric.Group (letter/digit) frames we keep the simpler pattern-fill
//   approach because the inner rect's clipPath already handles masking.
//
export function applyImageToFrame(frame: FabricObject, imgEl: HTMLImageElement): void {
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
  let imgW: number, imgH: number, imgLeft: number, imgTop: number

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

  // ── Transform local offsets to canvas-absolute coordinates ────────────────
  // imgLeft/imgTop are LOCAL to the frame center (e.g. -imgW/2).
  // The fabricImg lives directly on the canvas, so we must convert to
  // canvas-absolute coords using the frame's actual position, rotation, scale.
  const center = frame.getCenterPoint()
  const fangle = (frame.angle || 0) * Math.PI / 180
  const fcos   = Math.cos(fangle)
  const fsin   = Math.sin(fangle)
  const fsx    = frame.scaleX || 1
  const fsy    = frame.scaleY || 1

  const absLeft = center.x + (imgLeft * fcos - imgTop * fsin) * fsx
  const absTop  = center.y + (imgLeft * fsin + imgTop * fcos) * fsy

  // Build a fabric.Image (uses HTMLImageElement directly — no cross-origin issues)
  const fabricImg = new fabric.FabricImage(imgEl, {
    left:    absLeft,
    top:     absTop,
    scaleX:  (imgW / iw) * fsx,
    scaleY:  (imgH / ih) * fsy,
    angle:   frame.angle || 0,
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
  ;(frame as FabricObject & {
    _eliteFabricImg: fabric.FabricImage
    _eliteClip: FabricObject
    _elitePrevFabricImg: fabric.FabricImage | null
  })._eliteFabricImg = fabricImg
  ;(frame as FabricObject & { _eliteClip: FabricObject })._eliteClip = clip

  // Set the frame fill to transparent (image is now layered as a clipPath'd image)
  frame.set({ fill: 'transparent', strokeWidth: 0, strokeDashArray: null })

  // Add the image layer directly below the frame if canvas is available
  const canvas = frame.canvas
  if (canvas) {
    const prev = (frame as FabricObject & { _elitePrevFabricImg?: fabric.FabricImage })._elitePrevFabricImg
    if (prev) {
      canvas.remove(prev)
    }
    ;(frame as FabricObject & { _elitePrevFabricImg: fabric.FabricImage })._elitePrevFabricImg = fabricImg

    const frameIdx = canvas.getObjects().indexOf(frame)
    canvas.insertAt(frameIdx, fabricImg)
    fabricImg.setCoords()
  }

  frame.dirty = true
}

// ── Load image from a File, then apply to frame ───────────────────────────────
export function loadFileIntoFrame(frame: FabricObject, file: File, onDone?: () => void): void {
  const reader = new FileReader()
  reader.onload = (ev: ProgressEvent<FileReader>) => {
    const result = ev.target?.result
    if (typeof result !== 'string') return
    const imgEl = new window.Image()
    imgEl.onload = () => {
      applyImageToFrame(frame, imgEl)
      onDone?.()
    }
    imgEl.src = result
  }
  reader.readAsDataURL(file)
}

// ── Load image from a URL (file:// or https://), then apply to frame ──────────
export function loadURLIntoFrame(frame: FabricObject, url: string, onDone?: () => void): void {
  const imgEl = new window.Image()
  imgEl.crossOrigin = 'anonymous'  // Required for external HTTPS URLs (FAL, OpenAI CDN) to avoid CORS taint
  imgEl.onload = () => {
    applyImageToFrame(frame, imgEl)
    onDone?.()
  }
  imgEl.onerror = () => { console.error('[loadURLIntoFrame] failed to load:', url.slice(0, 80)) }
  imgEl.src = url
}
