/**
 * texture/engine.ts — Shared texture render engine for any Fabric object.
 *
 * Applies a _render-instance override that:
 *  1. Renders the object (white fill, no stroke) onto an offscreen canvas → alpha mask
 *  2. Clips the texture tile to the mask via `source-in` compositing
 *  3. Applies color tint if requested
 *  4. Draws the composited result onto the real ctx using the chosen blend mode
 *  5. Re-draws the stroke on top (for shape objects)
 *
 * Performance:
 *  - Tile is built ONCE per unique (scale, brightness, contrast, blur) combination
 *    and cached on the object. Subsequent renders reuse the cached tile.
 *  - Offscreen canvas is cached and only reallocated when object dimensions change.
 *  - Both caches are cleared in removeTexture.
 */

import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import { DEFAULT_TEXTURE } from './types'
import type { TextureParams } from './types'

// ── Extended Fabric object type ───────────────────────────────────────────────

export type TexFabObj = FabricObject & {
  eliteTextureFill?:   string
  _eliteOrigRender?:   (ctx: CanvasRenderingContext2D) => void
  _eliteTexImg?:       HTMLImageElement
  _eliteTexParams?:    TextureParams
  _eliteTexTile?:      HTMLCanvasElement  // cached built tile (tile mode)
  _eliteTexTileKey?:   string             // cache-key: "scale|brightness|contrast|blur"
  _eliteTexOff?:       HTMLCanvasElement  // cached offscreen canvas
  dirty?:              boolean
}

// ── Element-type helpers ──────────────────────────────────────────────────────

/** Types that support fill-level texture (shapes / frames). */
const SHAPE_FILL_TYPES = new Set(['shape', 'frame', 'logo', 'rect'])

/** Returns true if the object can have a fill texture (non-text). */
export function supportsTextureFill(obj: FabricObject): boolean {
  const et = obj.eliteType
  if (!et) return ['rect','circle','path','polygon','ellipse'].includes(obj.type ?? '')
  return SHAPE_FILL_TYPES.has(et)
}

// ── Tile cache key ────────────────────────────────────────────────────────────

function tileKey(p: TextureParams): string {
  return `${p.scale}|${p.brightness}|${p.contrast}|${p.blur}`
}

// ── Tile builder ──────────────────────────────────────────────────────────────

function buildTile(img: HTMLImageElement, p: TextureParams): HTMLCanvasElement {
  const scale = Math.max(0.01, p.scale / 100)
  const tw = Math.max(1, Math.round(img.naturalWidth  * scale))
  const th = Math.max(1, Math.round(img.naturalHeight * scale))
  const tile = document.createElement('canvas')
  tile.width = tw; tile.height = th
  const ctx = tile.getContext('2d')!
  const filters: string[] = []
  if (p.brightness !== 0) filters.push(`brightness(${Math.max(0.01, 1 + p.brightness / 100)})`)
  if (p.contrast   !== 0) filters.push(`contrast(${Math.max(0.01,   1 + p.contrast   / 100)})`)
  if (p.blur       !== 0) filters.push(`blur(${p.blur}px)`)
  if (filters.length) ctx.filter = filters.join(' ')
  ctx.drawImage(img, 0, 0, tw, th)
  return tile
}

// ── Core render override ──────────────────────────────────────────────────────

function installRender(obj: TexFabObj, img: HTMLImageElement, params: TextureParams): void {
  const origRender = (obj as unknown as Record<string, (ctx: CanvasRenderingContext2D) => void>)._render
  obj._eliteOrigRender = origRender.bind(obj)
  obj._eliteTexImg     = img
  obj._eliteTexParams  = { ...params }

  // Build tile eagerly on install (tile mode)
  if (params.mapping === 'tile') {
    obj._eliteTexTile    = buildTile(img, params)
    obj._eliteTexTileKey = tileKey(params)
  }

  ;(obj as unknown as Record<string, unknown>)._render = function(ctx: CanvasRenderingContext2D): void {
    const self   = obj
    const tp     = self._eliteTexParams!
    const texImg = self._eliteTexImg!
    const w      = Math.ceil(self.width  ?? 200)
    const h      = Math.ceil(self.height ?? 60)
    // Text objects need special handling: draw original content first so text is
    // always readable, then overlay the texture. Shape objects replace their fill
    // entirely with the texture, so they don't need the original render pass.
    const isText = self.type === 'textbox' || self.type === 'i-text'
    if (isText) {
      self._eliteOrigRender!(ctx)
    }

    // ── Get / resize cached offscreen canvas ─────────────────────────────────
    if (!self._eliteTexOff || self._eliteTexOff.width !== w || self._eliteTexOff.height !== h) {
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      self._eliteTexOff = c
    }
    const off    = self._eliteTexOff
    const offCtx = off.getContext('2d')!

    // Reset transform and clear pixels before each use
    offCtx.setTransform(1, 0, 0, 1, 0, 0)
    offCtx.clearRect(0, 0, w, h)
    offCtx.translate(w / 2, h / 2)

    // ── Step 1: render object to offscreen with white fill & no stroke → mask
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

    // ── Step 2 + 3: clip texture to the mask
    if (tp.mapping === 'tile') {
      // Use cached tile — rebuild only when tile-affecting params change
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
        const m = new DOMMatrix().translate(panX - w / 2, panY - h / 2)
        if (tp.rotation !== 0) m.rotateSelf(0, 0, tp.rotation)
        pat.setTransform(m)
        offCtx.globalCompositeOperation = 'source-in'
        offCtx.fillStyle = pat
        offCtx.fillRect(-w / 2, -h / 2, w, h)
        offCtx.globalCompositeOperation = 'source-over'
      }
    } else {
      // fill or fit mode
      const sx = w / texImg.naturalWidth, sy = h / texImg.naturalHeight
      const base = tp.mapping === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy)
      const s  = base * (tp.scale / 100)
      const dw = texImg.naturalWidth * s, dh = texImg.naturalHeight * s
      const dx = -dw / 2 + (tp.offsetX / 100 - 0.5) * w
      const dy = -dh / 2 + (tp.offsetY / 100 - 0.5) * h
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

    // ── Step 4: color tint overlay
    if (tp.tintStrength > 0) {
      offCtx.globalCompositeOperation = 'source-atop'
      offCtx.globalAlpha = tp.tintStrength / 100
      offCtx.fillStyle   = tp.tintColor
      offCtx.fillRect(-w / 2, -h / 2, w, h)
      offCtx.globalCompositeOperation = 'source-over'
      offCtx.globalAlpha = 1
    }

    // ── Step 5: composite onto main canvas with blend mode + intensity
    // Text objects: always use 'normal' blend mode so the texture overlays the
    // already-drawn text without multiply/screen distorting the text colours.
    // Shape objects: use the configured blend mode as intended.
    const prevGCO   = ctx.globalCompositeOperation
    const prevAlpha = ctx.globalAlpha
    if (!isText && tp.blendMode !== 'normal') ctx.globalCompositeOperation = tp.blendMode as GlobalCompositeOperation
    ctx.globalAlpha = tp.intensity / 100
    ctx.drawImage(off, -w / 2, -h / 2)
    ctx.globalCompositeOperation = prevGCO
    ctx.globalAlpha = prevAlpha

    // ── Step 6: re-draw stroke on top (shapes only — text rarely has stroke)
    if (!isText && savedStroke && savedStroke !== 'transparent' && (savedSW ?? 0) > 0) {
      ;(self as FabricObject).fill = 'transparent'
      self._eliteOrigRender!(ctx)
      ;(self as FabricObject).fill = savedFill
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Remove the texture _render patch and restore the original renderer. */
export function removeTexture(obj: TexFabObj, canvas: FabricCanvas): void {
  if (obj._eliteOrigRender) {
    ;(obj as unknown as Record<string, unknown>)._render = obj._eliteOrigRender
    delete obj._eliteOrigRender
    delete obj._eliteTexImg
    delete obj._eliteTexParams
    delete obj._eliteTexTile
    delete obj._eliteTexTileKey
    delete obj._eliteTexOff
    obj.dirty = true
  }
  delete obj.eliteTextureFill
  canvas.requestRenderAll()
}

/**
 * Apply a texture to any Fabric object's fill via _render instance override.
 *
 * @param obj    Target Fabric object (text or shape/frame)
 * @param params Texture parameters
 * @param canvas The Fabric canvas (for requestRenderAll)
 */
export function applyTexture(obj: TexFabObj, params: TextureParams, canvas: FabricCanvas): void {
  if (!params.src) return
  obj.eliteTextureFill = JSON.stringify(params)

  // Fast path: same image source — update params and re-render without reloading
  if (obj._eliteOrigRender && obj._eliteTexImg && obj._eliteTexParams?.src === params.src) {
    // Rebuild tile eagerly (outside render loop) when tile-affecting params change
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

  const img = new Image()
  img.onload = (): void => {
    // Remove any previous patch before installing the new one
    if (obj._eliteOrigRender) {
      ;(obj as unknown as Record<string, unknown>)._render = obj._eliteOrigRender
      delete obj._eliteOrigRender
      delete obj._eliteTexImg
      delete obj._eliteTexParams
      delete obj._eliteTexTile
      delete obj._eliteTexTileKey
      delete obj._eliteTexOff
    }
    installRender(obj, img, params)
    obj.dirty = true
    canvas.requestRenderAll()
  }
  img.onerror = (): void => console.error('[TextureEngine] load failed:', params.src.slice(0, 60))
  img.src = params.src
}

/** Parse saved TextureParams from the object, or return defaults. */
export function parseTexture(obj: TexFabObj): TextureParams {
  if (obj.eliteTextureFill) {
    try { return { ...DEFAULT_TEXTURE, ...(JSON.parse(obj.eliteTextureFill) as Partial<TextureParams>) } }
    catch { /* */ }
  }
  return { ...DEFAULT_TEXTURE }
}

/** Re-install texture patch after object re-selection (patch lives on instance). */
export function restoreTexturePatch(obj: TexFabObj, canvas: FabricCanvas): void {
  const p = parseTexture(obj)
  if (p.src && !obj._eliteOrigRender) applyTexture(obj, p, canvas)
}
