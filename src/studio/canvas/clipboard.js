/**
 * clipboard.js — System Clipboard → Fabric Canvas
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
import { TEXT_PRIMARY, ELITE_CUSTOM_PROPS } from './constants.js'

// Image MIME types we accept from clipboard
const CLIPBOARD_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]

// ── Main entry point ──────────────────────────────────────────────────────────
export async function pasteFromSystemClipboard({ canvas, width, height, accent, saveHistory }) {
  if (!canvas) return { success: false, error: 'No canvas' }

  // navigator.clipboard.read() requires user permission + HTTPS / Electron context
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
  } catch (err) {
    return { success: false, error: String(err) }
  }

  return { success: false, type: null }
}

// ── Private helpers ───────────────────────────────────────────────────────────

// Convert a Blob (image) into a Fabric image rect centered on canvas
async function _pasteBlob(canvas, blob, mimeType, width, height, saveHistory) {
  const dataUrl = await _blobToDataUrl(blob)
  return _pasteDataUrl(canvas, dataUrl, mimeType, width, height, saveHistory)
}

// Load an image from an external URL into canvas
// NOTE: Cross-origin images may fail in Electron's renderer depending on CSP.
async function _pasteImageUrl(canvas, src, width, height, saveHistory) {
  // Fetch through the renderer to avoid CORS — create a proxy img element
  return new Promise(resolve => {
    const imgEl = new window.Image()
    imgEl.crossOrigin = 'anonymous'
    imgEl.onload = () => {
      _addImageEl(canvas, imgEl, 'Pasted Image', width, height, saveHistory)
      resolve()
    }
    imgEl.onerror = () => resolve() // silently skip if blocked
    imgEl.src = src
  })
}

// Place a data-URL image onto canvas
async function _pasteDataUrl(canvas, dataUrl, mimeType, width, height, saveHistory) {
  return new Promise(resolve => {
    const imgEl = new window.Image()
    imgEl.onload = () => {
      _addImageEl(canvas, imgEl, 'Pasted Image', width, height, saveHistory)
      resolve()
    }
    imgEl.src = dataUrl
  })
}

// Core: place a loaded HTMLImageElement onto the canvas as a FabricImage
function _addImageEl(canvas, imgEl, label, width, height, saveHistory) {
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

// Create a centered Textbox from plain text
function _pasteText(canvas, text, width, height, accent, saveHistory) {
  const t = new fabric.Textbox(text, {
    left:     width  * 0.1,
    top:      height * 0.45,
    width:    width  * 0.8,
    fontSize: 40,
    fill:     TEXT_PRIMARY,
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

// Blob → data URL
function _blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Pull the first <img src="…"> from an HTML string
function _extractImgSrc(html) {
  const m = html.match(/src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

// ── copyToSystemClipboard ─────────────────────────────────────────────────────
/**
 * Renders the currently selected canvas object as a cropped PNG and writes it
 * to the OS clipboard so it can be pasted into other apps (Figma-style Cmd+C).
 *
 * Returns: { success: boolean, error?: string }
 */
export async function copyToSystemClipboard(canvas) {
  if (!canvas) return { success: false, error: 'No canvas' }
  if (!navigator.clipboard?.write) return { success: false, error: 'Clipboard write not available' }

  const active = canvas.getActiveObject()
  if (!active) return { success: false, error: 'Nothing selected' }

  // Temporarily deselect so selection handles don't appear in the export
  canvas.discardActiveObject()
  canvas.renderAll()

  const b = active.getBoundingRect(true, true)

  // Export the full canvas at 2× resolution
  const fullDataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 })

  // Re-select the object
  canvas.setActiveObject(active)
  canvas.renderAll()

  // Crop to the bounding box of the selected object using an offscreen canvas
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = async () => {
      const SCL    = 2
      const MARGIN = 4
      const sx = Math.max(0, (b.left - MARGIN) * SCL)
      const sy = Math.max(0, (b.top  - MARGIN) * SCL)
      const sw = Math.min(img.width  - sx, (b.width  + MARGIN * 2) * SCL)
      const sh = Math.min(img.height - sy, (b.height + MARGIN * 2) * SCL)

      const oc = document.createElement('canvas')
      oc.width  = Math.max(1, Math.round(sw))
      oc.height = Math.max(1, Math.round(sh))
      oc.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      oc.toBlob(async (blob) => {
        if (!blob) { resolve({ success: false, error: 'Failed to create image blob' }); return }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          resolve({ success: true })
        } catch (err) {
          // ClipboardItem write may be blocked in some contexts — not a fatal error
          resolve({ success: false, error: String(err) })
        }
      }, 'image/png')
    }
    img.onerror = () => resolve({ success: false, error: 'Failed to render canvas to image' })
    img.src = fullDataUrl
  })
}
