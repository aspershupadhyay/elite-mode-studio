/**
 * resize-zone.ts — Canva-style border-zone cursor detection
 *
 * registerResizeCursor(canvas)
 *   Attaches a native mousemove listener that shows the correct resize cursor
 *   (n/s/e/w/ne/nw/se/sw-resize) whenever the pointer is within BORDER_ZONE px
 *   of the selected object's bounding box.  Returns a cleanup function.
 *
 * The actual control hit-area enlargement is done in Canvas.tsx by setting
 * sizeX/sizeY on fabric.FabricObject.prototype.controls at canvas init time.
 */

import type { Canvas as FabricCanvas, FabricObject } from 'fabric'

const BORDER_ZONE = 18  // design-px proximity to trigger cursor change

const CURSOR_MAP: Record<string, string> = {
  nw: 'nw-resize', ne: 'ne-resize',
  sw: 'sw-resize', se: 'se-resize',
  n:  'n-resize',  s:  's-resize',
  e:  'e-resize',  w:  'w-resize',
}

function detectBorderZone(obj: FabricObject, px: number, py: number): string | null {
  const b   = obj.getBoundingRect()
  const r   = b.left + b.width
  const bot = b.top  + b.height
  const z   = BORDER_ZONE

  // Must be within the outer proximity band
  if (px < b.left - z || px > r + z || py < b.top - z || py > bot + z) return null

  // Must NOT be deep inside the object body
  if (px > b.left + z && px < r - z && py > b.top + z && py < bot - z) return null

  const nL = Math.abs(px - b.left) <= z
  const nR = Math.abs(px - r)      <= z
  const nT = Math.abs(py - b.top)  <= z
  const nB = Math.abs(py - bot)    <= z

  if (nT && nL) return 'nw'
  if (nT && nR) return 'ne'
  if (nB && nL) return 'sw'
  if (nB && nR) return 'se'
  if (nL) return 'w'
  if (nR) return 'e'
  if (nT) return 'n'
  if (nB) return 's'
  return null
}

export function registerResizeCursor(canvas: FabricCanvas): () => void {
  const el = canvas.getElement() as HTMLCanvasElement
  let currentZone: string | null = null

  const onMouseMove = (e: MouseEvent): void => {
    const active = canvas.getActiveObject()
    if (!active?.selectable) { currentZone = null; return }

    // While Fabric is mid-transform let it own the cursor
    if ((canvas as FabricCanvas & { _currentTransform?: unknown })._currentTransform) {
      currentZone = null
      return
    }

    // Screen px → canvas design px (canvas element is at full design resolution,
    // CSS transform scale makes it appear smaller on screen)
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (el.width  / rect.width)
    const py = (e.clientY - rect.top)  * (el.height / rect.height)

    const zone = detectBorderZone(active, px, py)
    if (zone !== currentZone) {
      currentZone = zone
      if (zone) el.style.cursor = CURSOR_MAP[zone]
    }
  }

  const onMouseLeave = (): void => { currentZone = null }

  el.addEventListener('mousemove', onMouseMove)
  el.addEventListener('mouseleave', onMouseLeave)

  return (): void => {
    el.removeEventListener('mousemove', onMouseMove)
    el.removeEventListener('mouseleave', onMouseLeave)
  }
}
