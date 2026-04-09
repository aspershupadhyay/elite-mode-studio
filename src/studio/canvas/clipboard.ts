/**
 * clipboard.ts — System Clipboard → Fabric Canvas
 *
 * pasteFromSystemClipboard()
 *   Implements Figma-style paste: reads the OS clipboard and converts
 *   the content into a Fabric canvas object automatically.
 *
 * Supported clipboard payloads:
 *   • image/png, image/jpeg, image/webp, image/gif  → Fabric image rect
 *   • image/svg+xml                                  → Fabric image rect (SVG)
 *   • text/html (with <img> tag)                     → fetches the src URL
 *   • text/plain                                     → Fabric Textbox
 *
 * Returns: { success: boolean, type: 'image'|'text'|null, error?: string }
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas } from 'fabric'
import { TEXT_PRIMARY } from './constants'

// Image MIME types we accept from clipboard
const CLIPBOARD_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const

interface PasteOptions {
  canvas: FabricCanvas | null
  width: number
  height: number
  accent: string
  saveHistory: () => void
}

interface PasteResult {
  success: boolean
  type?: 'image' | 'text' | null
  error?: string
}

interface CopyResult {
  success: boolean
  error?: string
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function pasteFromSystemClipboard({
  canvas,
  width,
  height,
  accent,
  saveHistory,
}: PasteOptions): Promise<PasteResult> {
  if (!canvas) return { success: false, error: 'No canvas' }

  if (!navigator.clipboard) {
    return { success: false, error: 'Clipboard API not available' }
  }

  // ── Try full ClipboardItem API (images + rich content) ────────────────────
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      // --- Image types (right-click → Copy Image on any webpage) -----------
      for (const mimeType of CLIPBOARD_IMAGE_TYPES) {
        if (item.types.includes(mimeType)) {
          const blob = await item.getType(mimeType)
          await _pasteBlob(canvas, blob, mimeType, width, height, saveHistory)
          return { success: true, type: 'image' }
        }
      }

      // --- HTML (may contain <img src="..."> from page copy) ---------------
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html')
        const html = await blob.text()
        const src  = _extractImgSrc(html)
        if (src) {
          await _pasteImageUrl(canvas, src, width, height, saveHistory)
          return { success: true, type: 'image' }
        }
      }

      // --- Plain text -------------------------------------------------------
      if (item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain')
        const text = (await blob.text()).trim()
        if (text) {
          _pasteText(canvas, text, width, height, accent, saveHistory)
          return { success: true, type: 'text' }
        }
      }
    }
  } catch {
    // ClipboardItem API may be blocked — fall back to readText()
  }

  // ── Fallback: text-only clipboard ─────────────────────────────────────────
  try {
    const text = (await navigator.clipboard.readText()).trim()
    if (text) {
      _pasteText(canvas, text, width, height, accent, saveHistory)
      return { success: true, type: 'text' }
    }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }

  return { success: false, type: null }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function _pasteBlob(
  canvas: FabricCanvas,
  blob: Blob,
  mimeType: string,
  width: number,
  height: number,
  saveHistory: () => void,
): Promise<void> {
  const dataUrl = await _blobToDataUrl(blob)
  return _pasteDataUrl(canvas, dataUrl, mimeType, width, height, saveHistory)
}

async function _pasteImageUrl(
  canvas: FabricCanvas,
  src: string,
  width: number,
  height: number,
  saveHistory: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    const imgEl = new window.Image()
    imgEl.crossOrigin = 'anonymous'
    imgEl.onload  = () => { _addImageEl(canvas, imgEl, 'Pasted Image', width, height, saveHistory); resolve() }
    imgEl.onerror = () => resolve()
    imgEl.src = src
  })
}

async function _pasteDataUrl(
  canvas: FabricCanvas,
  dataUrl: string,
  _mimeType: string,
  width: number,
  height: number,
  saveHistory: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    const imgEl = new window.Image()
    imgEl.onload = () => { _addImageEl(canvas, imgEl, 'Pasted Image', width, height, saveHistory); resolve() }
    imgEl.src = dataUrl
  })
}

function _addImageEl(
  canvas: FabricCanvas,
  imgEl: HTMLImageElement,
  label: string,
  width: number,
  height: number,
  saveHistory: () => void,
): void {
  const maxW  = width  * 0.7
  const maxH  = height * 0.7
  const scale = Math.min(maxW / imgEl.naturalWidth, maxH / imgEl.naturalHeight, 1)

  const img = new fabric.FabricImage(imgEl, {
    left:    width  / 2,
    top:     height / 2,
    originX: 'center',
    originY: 'center',
    scaleX:  scale,
    scaleY:  scale,
  })
  img.eliteType  = 'image'
  img.eliteLabel = label

  canvas.add(img)
  canvas.setActiveObject(img)
  canvas.renderAll()
  saveHistory()
}

function _pasteText(
  canvas: FabricCanvas,
  text: string,
  width: number,
  height: number,
  _accent: string,
  saveHistory: () => void,
): void {
  const t = new fabric.Textbox(text, {
    left:       width  * 0.1,
    top:        height * 0.45,
    width:      width  * 0.8,
    fontSize:   40,
    fill:       TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontWeight: '600',
    textAlign:  'left',
    lineHeight: 1.3,
    editable:   true,
  })
  t.eliteType  = 'text'
  t.eliteLabel = 'Pasted Text'

  canvas.add(t)
  canvas.setActiveObject(t)
  canvas.renderAll()
  saveHistory()
}

function _blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function _extractImgSrc(html: string): string | null {
  const m = html.match(/src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

// ── copyToSystemClipboard ─────────────────────────────────────────────────────
/**
 * Renders ONLY the selected canvas object as a PNG (transparent background)
 * and writes it to the OS clipboard so it can be pasted into other apps.
 *
 * Returns: { success: boolean, error?: string }
 */
export async function copyToSystemClipboard(canvas: FabricCanvas | null): Promise<CopyResult> {
  if (!canvas) return { success: false, error: 'No canvas' }
  if (!navigator.clipboard?.write) return { success: false, error: 'Clipboard write not available' }

  const active = canvas.getActiveObject()
  if (!active) return { success: false, error: 'Nothing selected' }

  const SCL    = 2
  const MARGIN = 8

  // Hide all other objects and clear the background for an isolated export
  const savedBg = canvas.backgroundColor as string
  const others = canvas.getObjects().filter(o => o !== active)
  others.forEach(o => { o.visible = false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(canvas as any).backgroundColor = ''
  canvas.discardActiveObject()
  canvas.renderAll()

  const b = active.getBoundingRect()
  const fullDataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: SCL })

  // Restore canvas state
  others.forEach(o => { o.visible = true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(canvas as any).backgroundColor = savedBg
  canvas.setActiveObject(active)
  canvas.renderAll()

  // Crop to the bounding box of the selected object
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = async () => {
      const sx = Math.max(0, (b.left   - MARGIN) * SCL)
      const sy = Math.max(0, (b.top    - MARGIN) * SCL)
      const sw = Math.min(img.width  - sx, (b.width  + MARGIN * 2) * SCL)
      const sh = Math.min(img.height - sy, (b.height + MARGIN * 2) * SCL)

      const oc = document.createElement('canvas')
      oc.width  = Math.max(1, Math.round(sw))
      oc.height = Math.max(1, Math.round(sh))
      ;(oc.getContext('2d') as CanvasRenderingContext2D).drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      oc.toBlob(async (blob) => {
        if (!blob) { resolve({ success: false, error: 'Failed to create image blob' }); return }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          resolve({ success: true })
        } catch (err: unknown) {
          resolve({ success: false, error: String(err) })
        }
      }, 'image/png')
    }
    img.onerror = () => resolve({ success: false, error: 'Failed to render canvas to image' })
    img.src = fullDataUrl
  })
}
