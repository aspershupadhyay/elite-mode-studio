/**
 * texture/engine.ts — Hybrid texture render engine.
 *
 * Object-level code is intentionally kept identical to the original working
 * implementation.  Character-level textures are added as a pure extension
 * that runs after the object-level pass.
 */

import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import { DEFAULT_TEXTURE } from './types'
import type { TextureParams, EliteCharTextureRange } from './types'

// ── Char pixel rect (computed from Fabric internals) ──────────────────────────
// Fabric v6 GraphemeBBox has no `top` field — it must be computed from
// cumulative getHeightOfLine() calls.  x must include _getLineLeftOffset()
// for text-alignment (center / right).
interface CharPixelRect {
  x: number   // offscreen pixel x  (= lineAlignOffset + cb.left)
  y: number   // offscreen pixel y  (= cumulative line heights)
  w: number   // char width
  h: number   // char height (fontSize)
}

// Raw Fabric v6 GraphemeBBox (only fields we use)
interface FabCharBound {
  left:         number
  width:        number
  height:       number
  kernedWidth?: number
  // NOTE: there is NO `top` field in Fabric v6 GraphemeBBox
}

// ── Extended Fabric object type ───────────────────────────────────────────────

export type TexFabObj = FabricObject & {
  eliteTextureFill?:  string
  eliteCharTextures?: string            // JSON EliteCharTextureRange[]
  _eliteOrigRender?:  (ctx: CanvasRenderingContext2D) => void
  _eliteTexImg?:      HTMLImageElement
  _eliteTexParams?:   TextureParams
  _eliteTexTile?:     HTMLCanvasElement
  _eliteTexTileKey?:  string
  _eliteTexOff?:      HTMLCanvasElement
  /** Snapshot of the white-glyph render (pre-texture-clip) used as mask for char-level textures */
  _eliteWhiteOff?:    HTMLCanvasElement
  _eliteCharTexImgs?: Map<string, HTMLImageElement>
  /** tile cache keyed by image element → (tileKey → canvas). Avoids buildTile on every frame. */
  _eliteCharTexTiles?: WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>
  _eliteCharTexOff?:  HTMLCanvasElement
  dirty?:             boolean
}

// ── Element-type helpers ──────────────────────────────────────────────────────

const SHAPE_FILL_TYPES = new Set(['shape', 'frame', 'logo', 'rect'])

export function supportsTextureFill(obj: FabricObject): boolean {
  const et = obj.eliteType
  if (!et) return ['rect','circle','path','polygon','ellipse'].includes(obj.type ?? '')
  return SHAPE_FILL_TYPES.has(et)
}

// ── Tile cache key / builder ───────────────────────────────────────────────────

function tileKey(p: TextureParams): string {
  return `${p.scale}|${p.brightness}|${p.contrast}|${p.blur}`
}

function buildTile(img: HTMLImageElement, p: TextureParams): HTMLCanvasElement {
  const scale = Math.max(0.01, p.scale / 100)
  const tw    = Math.max(1, Math.round(img.naturalWidth  * scale))
  const th    = Math.max(1, Math.round(img.naturalHeight * scale))
  const tile  = document.createElement('canvas')
  tile.width  = tw; tile.height = th
  const ctx   = tile.getContext('2d')!
  const filters: string[] = []
  if (p.brightness !== 0) filters.push(`brightness(${Math.max(0.01, 1 + p.brightness / 100)})`)
  if (p.contrast   !== 0) filters.push(`contrast(${Math.max(0.01,   1 + p.contrast   / 100)})`)
  if (p.blur       !== 0) filters.push(`blur(${p.blur}px)`)
  if (filters.length) ctx.filter = filters.join(' ')
  ctx.drawImage(img, 0, 0, tw, th)
  return tile
}

// ── Char pixel-rect iterator ──────────────────────────────────────────────────
//
// Yields offscreen-pixel bounding boxes for chars in [start, end).
//
// Why not just read cb.left / cb.top directly?
//   • Fabric v6 GraphemeBBox has NO `top` field — it must be accumulated
//     from getHeightOfLine() calls per line.
//   • cb.left is relative to the start of the line, NOT accounting for
//     _getLineLeftOffset() (text alignment: center / right shifts every line).
//
// Offscreen pixel space: (0,0) = top-left of the text block.
// The _render override places the offscreen with drawImage(off, -w/2, -h/2),
// so pixel (0,0) maps to render coord (-w/2, -h/2) — exactly where Fabric
// begins drawing the text (via _getLeftOffset() + _getTopOffset()).

function* charPixelRects(
  obj:   TexFabObj,
  start: number,
  end:   number,
): Generator<CharPixelRect> {
  const any    = obj as unknown as Record<string, unknown>
  const gLines = any._textLines as string[][] | undefined  // grapheme arrays
  const rawCB  = any.__charBounds as FabCharBound[][] | undefined
  if (!gLines || !rawCB) return

  const fab = obj as unknown as {
    getHeightOfLine:    (i: number) => number
    _getLineLeftOffset: (i: number) => number
  }

  let flat     = 0
  let lineTopY = 0

  for (let li = 0; li < gLines.length; li++) {
    const line    = gLines[li]
    const lb      = rawCB[li]
    const lineH   = fab.getHeightOfLine(li)
    const lineOff = fab._getLineLeftOffset?.(li) ?? 0

    if (!lb) { flat += line.length + 1; lineTopY += lineH; continue }

    for (let ci = 0; ci < line.length; ci++) {
      if (flat >= start && flat < end) {
        const cb = lb[ci]
        if (cb) yield { x: lineOff + cb.left, y: lineTopY, w: cb.kernedWidth ?? cb.width, h: cb.height }
      }
      flat++
    }
    flat++      // newline
    lineTopY += lineH
  }
}

// ── Core render override ──────────────────────────────────────────────────────
// installRender keeps the ORIGINAL signature (obj, img, params) so the
// object-level path is byte-for-byte identical to the version that worked.

function installRender(
  obj:    TexFabObj,
  img:    HTMLImageElement,
  params: TextureParams,
): void {
  const origRender = (obj as unknown as Record<string, (ctx: CanvasRenderingContext2D) => void>)._render
  obj._eliteOrigRender = origRender.bind(obj)
  obj._eliteTexImg     = img
  obj._eliteTexParams  = { ...params }

  // build tile eagerly on install
  if (params.mapping === 'tile') {
    obj._eliteTexTile    = buildTile(img, params)
    obj._eliteTexTileKey = tileKey(params)
  }

  ;(obj as unknown as Record<string, unknown>)._render = function (
    ctx: CanvasRenderingContext2D,
  ): void {
    const self   = obj
    const tp     = self._eliteTexParams!
    const texImg = self._eliteTexImg!
    const w      = Math.ceil(self.width  ?? 200)
    const h      = Math.ceil(self.height ?? 60)

    const isText = self.type === 'textbox' || self.type === 'i-text'

    // Step 1: text draws normally first; shapes skip (fill = texture)
    if (isText) {
      self._eliteOrigRender!(ctx)
    }

    // ── offscreen canvas (mask + texture) ─────────────────────────────────────
    if (!self._eliteTexOff || self._eliteTexOff.width !== w || self._eliteTexOff.height !== h) {
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      self._eliteTexOff = c
    }
    const off    = self._eliteTexOff
    const offCtx = off.getContext('2d')!

    offCtx.setTransform(1, 0, 0, 1, 0, 0)
    offCtx.clearRect(0, 0, w, h)
    offCtx.translate(w / 2, h / 2)

    // Step 2: render object with white fill/no stroke → alpha mask
    const savedFill   = (self as FabricObject).fill
    const savedStroke = (self as FabricObject & { stroke?: string }).stroke
    const savedSW     = (self as FabricObject & { strokeWidth?: number }).strokeWidth
    ;(self as FabricObject).fill = '#ffffff'
    ;(self as FabricObject & { stroke?: string }).stroke = ''
    ;(self as FabricObject & { strokeWidth?: number }).strokeWidth = 0
    self._eliteOrigRender!(offCtx)
    ;(self as FabricObject).fill = savedFill
    ;(self as FabricObject & { stroke?: string }).stroke = savedStroke
    ;(self as FabricObject & { strokeWidth?: number }).strokeWidth = savedSW

    // Snapshot the white-glyph render for char-level masking (Step 3 will
    // overwrite `off` with texture pixels via source-in, losing the shapes).
    // We only need this when char textures are pending.
    if (isText && self.eliteCharTextures) {
      if (!self._eliteWhiteOff || self._eliteWhiteOff.width !== w || self._eliteWhiteOff.height !== h) {
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        self._eliteWhiteOff = c
      }
      const wCtx = self._eliteWhiteOff.getContext('2d')!
      wCtx.setTransform(1, 0, 0, 1, 0, 0)
      wCtx.clearRect(0, 0, w, h)
      wCtx.drawImage(off, 0, 0)  // copy pixel buffer — not affected by offCtx transform
    }

    // Step 3: clip texture to the mask
    if (tp.mapping === 'tile') {
      const key = tileKey(tp)
      if (!self._eliteTexTile || self._eliteTexTileKey !== key) {
        self._eliteTexTile    = buildTile(texImg, tp)
        self._eliteTexTileKey = key
      }
      const tile = self._eliteTexTile
      const pat  = offCtx.createPattern(tile, 'repeat')
      if (pat) {
        const panX = (tp.offsetX / 100) * tile.width
        const panY = (tp.offsetY / 100) * tile.height
        const m    = new DOMMatrix().translate(panX - w / 2, panY - h / 2)
        if (tp.rotation !== 0) m.rotateSelf(0, 0, tp.rotation)
        pat.setTransform(m)
        offCtx.globalCompositeOperation = 'source-in'
        offCtx.fillStyle = pat
        offCtx.fillRect(-w / 2, -h / 2, w, h)
        offCtx.globalCompositeOperation = 'source-over'
      }
    } else {
      const sx   = w / texImg.naturalWidth
      const sy   = h / texImg.naturalHeight
      const base = tp.mapping === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy)
      const s    = base * (tp.scale / 100)
      const dw   = texImg.naturalWidth  * s
      const dh   = texImg.naturalHeight * s
      const dx   = -dw / 2 + (tp.offsetX / 100 - 0.5) * w
      const dy   = -dh / 2 + (tp.offsetY / 100 - 0.5) * h
      const filters: string[] = []
      if (tp.brightness !== 0) filters.push(`brightness(${Math.max(0.01, 1 + tp.brightness / 100)})`)
      if (tp.contrast   !== 0) filters.push(`contrast(${Math.max(0.01,   1 + tp.contrast   / 100)})`)
      if (tp.blur       !== 0) filters.push(`blur(${tp.blur}px)`)
      offCtx.save()
      if (filters.length) offCtx.filter = filters.join(' ')
      if (tp.rotation !== 0) offCtx.rotate((tp.rotation * Math.PI) / 180)
      offCtx.globalCompositeOperation = 'source-in'
      offCtx.drawImage(texImg, dx, dy, dw, dh)
      offCtx.restore()
      offCtx.globalCompositeOperation = 'source-over'
    }

    // Step 4: color tint
    if (tp.tintStrength > 0) {
      offCtx.globalCompositeOperation = 'source-atop'
      offCtx.globalAlpha = tp.tintStrength / 100
      offCtx.fillStyle   = tp.tintColor
      offCtx.fillRect(-w / 2, -h / 2, w, h)
      offCtx.globalCompositeOperation = 'source-over'
      offCtx.globalAlpha = 1
    }

    // Step 5: composite to main canvas
    const prevGCO   = ctx.globalCompositeOperation
    const prevAlpha = ctx.globalAlpha
    if (!isText && tp.blendMode !== 'normal') ctx.globalCompositeOperation = tp.blendMode as GlobalCompositeOperation
    ctx.globalAlpha = tp.intensity / 100
    ctx.drawImage(off, -w / 2, -h / 2)
    ctx.globalCompositeOperation = prevGCO
    ctx.globalAlpha              = prevAlpha

    // Step 6: re-draw stroke on top (shapes only)
    if (!isText && savedStroke && savedStroke !== 'transparent' && (savedSW ?? 0) > 0) {
      ;(self as FabricObject).fill = 'transparent'
      self._eliteOrigRender!(ctx)
      ;(self as FabricObject).fill = savedFill
    }

    // ── CHARACTER-LEVEL textures (text objects only — pure extension) ──────────
    if (!isText) return
    const charTexJSON = self.eliteCharTextures
    if (!charTexJSON) return

    let charRanges: EliteCharTextureRange[] = []
    try { charRanges = JSON.parse(charTexJSON) as EliteCharTextureRange[] } catch { return }
    if (!charRanges.length) return

    const selfAny = self as unknown as Record<string, unknown>
    // Guard: Fabric populates _textLines + __charBounds during layout; if
    // absent the text box hasn't been measured yet — skip and wait for next frame.
    if (!selfAny._textLines || !selfAny.__charBounds) return

    // shared offscreen for char-level masks
    if (!self._eliteCharTexOff || self._eliteCharTexOff.width !== w || self._eliteCharTexOff.height !== h) {
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      self._eliteCharTexOff = c
    }
    const cOff = self._eliteCharTexOff
    const cCtx = cOff.getContext('2d')!

    for (const range of charRanges) {
      if (!range.params?.src) continue
      const rImg = self._eliteCharTexImgs?.get(range.params.src)
      if (!rImg?.complete || !rImg.naturalWidth) continue

      cCtx.setTransform(1, 0, 0, 1, 0, 0)
      cCtx.clearRect(0, 0, w, h)

      // ── Glyph mask (two passes) ──────────────────────────────────────────────
      // Pass 1: white bounding-box rects restrict the mask to the selected range.
      // Pass 2: destination-in with the white-glyph snapshot clips to actual
      //         letter outlines — without this the texture fills solid rectangles.
      for (const pr of charPixelRects(self, range.start, range.end)) {
        cCtx.fillStyle = '#ffffff'
        cCtx.fillRect(pr.x, pr.y, pr.w, pr.h)
      }
      if (self._eliteWhiteOff) {
        cCtx.globalCompositeOperation = 'destination-in'
        cCtx.drawImage(self._eliteWhiteOff, 0, 0)
        cCtx.globalCompositeOperation = 'source-over'
      }

      // ── Texture fill (source-in clips to glyph mask) ─────────────────────────
      const rp = range.params

      if (rp.mapping === 'tile') {
        // Tile cache: WeakMap<image → Map<tileKey → canvas>> avoids buildTile
        // on every frame — a new canvas is only built when params change.
        if (!self._eliteCharTexTiles) self._eliteCharTexTiles = new WeakMap()
        let perImg = self._eliteCharTexTiles.get(rImg)
        if (!perImg) { perImg = new Map(); self._eliteCharTexTiles.set(rImg, perImg) }
        const tk = tileKey(rp)
        let rTile = perImg.get(tk)
        if (!rTile) { rTile = buildTile(rImg, rp); perImg.set(tk, rTile) }

        const pat = cCtx.createPattern(rTile, 'repeat')
        if (pat) {
          const panX = (rp.offsetX / 100) * rTile.width
          const panY = (rp.offsetY / 100) * rTile.height
          const m    = new DOMMatrix().translate(panX, panY)
          if (rp.rotation !== 0) m.rotateSelf(0, 0, rp.rotation)
          pat.setTransform(m)
          cCtx.globalCompositeOperation = 'source-in'
          cCtx.fillStyle = pat
          cCtx.fillRect(0, 0, w, h)
          cCtx.globalCompositeOperation = 'source-over'
        }
      } else {
        // fill / fit — apply brightness/contrast/blur/rotation (was missing before)
        const sx   = w / rImg.naturalWidth
        const sy   = h / rImg.naturalHeight
        const base = rp.mapping === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy)
        const s    = base * (rp.scale / 100)
        const dw   = rImg.naturalWidth  * s
        const dh   = rImg.naturalHeight * s
        // Offsets relative to center of cCtx (after translate below)
        const dx   = -dw / 2 + (rp.offsetX / 100 - 0.5) * w
        const dy   = -dh / 2 + (rp.offsetY / 100 - 0.5) * h
        const filters: string[] = []
        if (rp.brightness !== 0) filters.push(`brightness(${Math.max(0.01, 1 + rp.brightness / 100)})`)
        if (rp.contrast   !== 0) filters.push(`contrast(${Math.max(0.01, 1 + rp.contrast   / 100)})`)
        if (rp.blur       !== 0) filters.push(`blur(${rp.blur}px)`)
        cCtx.save()
        cCtx.translate(w / 2, h / 2)          // rotate around offscreen centre
        if (rp.rotation !== 0) cCtx.rotate((rp.rotation * Math.PI) / 180)
        if (filters.length) cCtx.filter = filters.join(' ')
        cCtx.globalCompositeOperation = 'source-in'
        cCtx.drawImage(rImg, dx, dy, dw, dh)
        cCtx.restore()
        cCtx.globalCompositeOperation = 'source-over'
      }

      // ── Color tint ───────────────────────────────────────────────────────────
      if (rp.tintStrength > 0) {
        cCtx.globalCompositeOperation = 'source-atop'
        cCtx.globalAlpha = rp.tintStrength / 100
        cCtx.fillStyle   = rp.tintColor
        cCtx.fillRect(0, 0, w, h)
        cCtx.globalCompositeOperation = 'source-over'
        cCtx.globalAlpha = 1
      }

      // ── Composite to main canvas — intensity + blend mode ────────────────────
      const prevGCO   = ctx.globalCompositeOperation
      const prevAlpha = ctx.globalAlpha
      if (rp.blendMode && rp.blendMode !== 'normal') {
        ctx.globalCompositeOperation = rp.blendMode as GlobalCompositeOperation
      }
      ctx.globalAlpha = (rp.intensity ?? 100) / 100
      ctx.drawImage(cOff, -w / 2, -h / 2)
      ctx.globalCompositeOperation = prevGCO
      ctx.globalAlpha              = prevAlpha
    }
  }
}

// ── Install char-only render patch (no object-level texture) ──────────────────
// Used when eliteCharTextures is set but eliteTextureFill is NOT.
// Uses a placeholder image so installRender can still install the combined
// _render; the object-level block short-circuits when _eliteTexParams.src = ''.

function ensureCharRenderPatch(obj: TexFabObj, canvas: FabricCanvas): void {
  if (obj._eliteOrigRender) {
    // Already patched — just force re-render
    obj.dirty = true
    canvas.requestRenderAll()
    return
  }
  // Install with a dummy 1×1 transparent image so installRender runs,
  // but _eliteTexParams.src = '' so the object-level block is skipped.
  const dummy = new Image(1, 1)
  dummy.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

  // We don't wait for onload since the dummy src above loads synchronously
  // (it's a valid data URL) — set properties immediately then install.
  obj._eliteTexImg    = dummy
  obj._eliteTexParams = { ...DEFAULT_TEXTURE, src: '' }  // empty src = no-op in render
  installRender(obj, dummy, { ...DEFAULT_TEXTURE, src: '' })
  obj.dirty = true
  canvas.requestRenderAll()
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Remove ALL texture effects and restore original renderer. */
export function removeTexture(obj: TexFabObj, canvas: FabricCanvas): void {
  if (obj._eliteOrigRender) {
    ;(obj as unknown as Record<string, unknown>)._render = obj._eliteOrigRender
    delete obj._eliteOrigRender
    delete obj._eliteTexImg
    delete obj._eliteTexParams
    delete obj._eliteTexTile
    delete obj._eliteTexTileKey
    delete obj._eliteTexOff
    delete obj._eliteWhiteOff
    delete obj._eliteCharTexImgs
    delete obj._eliteCharTexTiles
    delete obj._eliteCharTexOff
    obj.dirty = true
  }
  delete obj.eliteTextureFill
  delete obj.eliteCharTextures
  canvas.requestRenderAll()
}

/**
 * Apply a texture to the whole object.
 * Fast-path if same image source — just updates params without reloading.
 */
export function applyTexture(obj: TexFabObj, params: TextureParams, canvas: FabricCanvas): void {
  if (!params.src) return
  obj.eliteTextureFill = JSON.stringify(params)

  if (obj._eliteOrigRender && obj._eliteTexImg && obj._eliteTexParams?.src === params.src) {
    if (params.mapping === 'tile') {
      const newKey = tileKey(params)
      if (obj._eliteTexTileKey !== newKey) {
        obj._eliteTexTile    = buildTile(obj._eliteTexImg, params)
        obj._eliteTexTileKey = newKey
      }
    }
    obj._eliteTexParams = { ...params }
    obj.dirty = true
    canvas.requestRenderAll()
    return
  }

  const img   = new Image()
  img.onload  = (): void => {
    if (obj._eliteOrigRender) {
      // Save char-texture state before tearing down
      const charJSON = obj.eliteCharTextures
      const charImgs = obj._eliteCharTexImgs
      ;(obj as unknown as Record<string, unknown>)._render = obj._eliteOrigRender
      delete obj._eliteOrigRender
      delete obj._eliteTexImg
      delete obj._eliteTexParams
      delete obj._eliteTexTile
      delete obj._eliteTexTileKey
      delete obj._eliteTexOff
      delete obj._eliteCharTexOff
      // Restore char state (will be picked up by the new installRender)
      obj.eliteCharTextures = charJSON
      obj._eliteCharTexImgs = charImgs
    }
    installRender(obj, img, params)
    obj.dirty = true
    canvas.requestRenderAll()
  }
  img.onerror = (): void => console.error('[TextureEngine] load failed:', params.src.slice(0, 60))
  img.src = params.src
}

/** Parse saved TextureParams from obj, or return defaults. */
export function parseTexture(obj: TexFabObj): TextureParams {
  if (obj.eliteTextureFill) {
    try { return { ...DEFAULT_TEXTURE, ...(JSON.parse(obj.eliteTextureFill) as Partial<TextureParams>) } }
    catch { /* */ }
  }
  return { ...DEFAULT_TEXTURE }
}

/** Re-install texture patches after object re-selection. */
export function restoreTexturePatch(obj: TexFabObj, canvas: FabricCanvas): void {
  const p = parseTexture(obj)
  if (p.src && !obj._eliteOrigRender) applyTexture(obj, p, canvas)
  restoreCharTextures(obj, canvas)
}

// ── Character-level texture ───────────────────────────────────────────────────

export function applyCharTexture(
  obj:    TexFabObj,
  start:  number,
  end:    number,
  params: TextureParams,
  canvas: FabricCanvas,
): void {
  if (!params.src || start >= end) return

  let ranges: EliteCharTextureRange[] = []
  if (obj.eliteCharTextures) {
    try { ranges = JSON.parse(obj.eliteCharTextures) as EliteCharTextureRange[] } catch { /* */ }
  }
  ranges = ranges.filter(r => r.end <= start || r.start >= end)
  ranges.push({ start, end, params: { ...params } })
  obj.eliteCharTextures = JSON.stringify(ranges)

  if (!obj._eliteCharTexImgs) obj._eliteCharTexImgs = new Map()

  if (!obj._eliteCharTexImgs.has(params.src)) {
    const img  = new Image()
    img.onload = (): void => {
      obj._eliteCharTexImgs!.set(params.src, img)
      ensureCharRenderPatch(obj, canvas)
    }
    img.onerror = (): void => console.error('[CharTexture] load failed:', params.src.slice(0, 60))
    img.src = params.src
  } else {
    ensureCharRenderPatch(obj, canvas)
  }
}

export function removeCharTexture(
  obj:    TexFabObj,
  start:  number,
  end:    number,
  canvas: FabricCanvas,
): void {
  if (!obj.eliteCharTextures) return
  let ranges: EliteCharTextureRange[] = []
  try { ranges = JSON.parse(obj.eliteCharTextures) as EliteCharTextureRange[] } catch { /* */ }
  ranges = ranges.filter(r => !(r.start === start && r.end === end))
  if (ranges.length) {
    obj.eliteCharTextures = JSON.stringify(ranges)
  } else {
    delete obj.eliteCharTextures
    if (!obj.eliteTextureFill && obj._eliteOrigRender) {
      ;(obj as unknown as Record<string, unknown>)._render = obj._eliteOrigRender
      delete obj._eliteOrigRender
      delete obj._eliteCharTexImgs
      delete obj._eliteCharTexOff
    }
  }
  obj.dirty = true
  canvas.requestRenderAll()
}

export function removeAllCharTextures(obj: TexFabObj, canvas: FabricCanvas): void {
  delete obj.eliteCharTextures
  delete obj._eliteCharTexImgs
  delete obj._eliteCharTexTiles
  delete obj._eliteCharTexOff
  delete obj._eliteWhiteOff
  if (!obj.eliteTextureFill && obj._eliteOrigRender) {
    ;(obj as unknown as Record<string, unknown>)._render = obj._eliteOrigRender
    delete obj._eliteOrigRender
    delete obj._eliteTexOff
  }
  obj.dirty = true
  canvas.requestRenderAll()
}

export function restoreCharTextures(obj: TexFabObj, canvas: FabricCanvas): void {
  if (!obj.eliteCharTextures) return
  let ranges: EliteCharTextureRange[] = []
  try { ranges = JSON.parse(obj.eliteCharTextures) as EliteCharTextureRange[] } catch { return }
  if (!ranges.length) return

  if (!obj._eliteCharTexImgs) obj._eliteCharTexImgs = new Map()

  let pending = 0
  for (const range of ranges) {
    if (!range.params?.src) continue
    if (obj._eliteCharTexImgs.has(range.params.src)) continue
    pending++
    const img  = new Image()
    img.onload = (): void => {
      obj._eliteCharTexImgs!.set(range.params.src, img)
      if (--pending === 0) ensureCharRenderPatch(obj, canvas)
    }
    img.onerror = (): void => { pending-- }
    img.src = range.params.src
  }
  if (pending === 0) ensureCharRenderPatch(obj, canvas)
}

export function parseCharTextures(obj: TexFabObj): EliteCharTextureRange[] {
  if (!obj.eliteCharTextures) return []
  try { return JSON.parse(obj.eliteCharTextures) as EliteCharTextureRange[] }
  catch { return [] }
}

/**
 * Update the TextureParams for every existing char-texture range on this object.
 *
 * Called when the user modifies texture settings (slider drag, preset pick, etc.)
 * while NOT in text-editing/selection mode — i.e. they want to retune an already-
 * applied char texture without re-selecting the characters.
 *
 * All ranges keep their [start, end] positions; only their params are replaced.
 * If the new src differs, the image is loaded; the tile cache is always cleared
 * so stale cached tiles don't linger after brightness / scale changes.
 */
export function updateAllCharTextures(
  obj:    TexFabObj,
  params: TextureParams,
  canvas: FabricCanvas,
): void {
  if (!obj.eliteCharTextures) return
  let ranges: EliteCharTextureRange[] = []
  try { ranges = JSON.parse(obj.eliteCharTextures) as EliteCharTextureRange[] } catch { return }
  if (!ranges.length) return

  const updated = ranges.map(r => ({ ...r, params: { ...params } }))
  obj.eliteCharTextures = JSON.stringify(updated)

  // Clear tile cache — params (scale, brightness…) may have changed
  if (obj._eliteCharTexTiles && obj._eliteCharTexImgs) {
    for (const img of obj._eliteCharTexImgs.values()) {
      obj._eliteCharTexTiles.delete(img)
    }
  }

  // Load new image if src changed
  if (!obj._eliteCharTexImgs) obj._eliteCharTexImgs = new Map()
  const srcs = new Set(updated.map(r => r.params.src).filter(Boolean))
  let pending = 0
  for (const src of srcs) {
    if (obj._eliteCharTexImgs.has(src)) continue
    pending++
    const img  = new Image()
    img.onload = (): void => {
      obj._eliteCharTexImgs!.set(src, img)
      if (--pending === 0) ensureCharRenderPatch(obj, canvas)
    }
    img.onerror = (): void => { pending-- }
    img.src = src
  }
  if (pending === 0) ensureCharRenderPatch(obj, canvas)
}
