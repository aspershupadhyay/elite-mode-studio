/**
 * autoFormat.ts — Intelligent canvas auto-layout engine
 *
 * autoFormatCanvas(canvas, newW, newH, prevW, prevH)
 *
 * Rules per eliteType:
 *   image_area  → always full width, top 55% height
 *   gradient    → always full width, 12% height, fade at image bottom
 *   logo        → top-left corner, scales with canvas width, position pinned
 *   title       → 56% top offset, full width minus padding, font scales with W
 *   text        → 76% top offset, full width minus padding, font scales with W
 *   tag         → 80px from bottom, left padding
 *   line        → full width, 6px, pinned to very bottom
 *   everything else → proportional scale from old size
 *
 * The result feels like a human manually resized and re-flowed the layout.
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas } from 'fabric'

// Base canvas size all layout percentages are relative to
const BASE_W = 1080
const BASE_H = 1350

/**
 * Re-flow all canvas objects to fit newW × newH.
 * prevW / prevH are needed for proportional scaling of untagged objects.
 */
export function autoFormatCanvas(
  canvas: FabricCanvas,
  newW: number,
  newH: number,
  prevW: number | null,
  prevH: number | null,
): void {
  if (!canvas) return

  const objects = canvas.getObjects()
  if (!objects.length) return

  // Ratios for generic proportional scaling
  const scaleW = prevW ? newW / prevW : newW / BASE_W
  const scaleH = prevH ? newH / prevH : newH / BASE_H

  // Shared layout constants
  const imgH  = Math.round(newH * 0.55)
  const gradH = Math.round(newH * 0.12)
  const pad   = Math.round(newW * 0.044)   // ≈48px at 1080

  for (const obj of objects) {
    const et = obj.eliteType

    if (et === 'image_area') {
      obj.set({ left: 0, top: 0, width: newW, height: imgH, scaleX: 1, scaleY: 1 })

    } else if (et === 'gradient') {
      obj.set({ left: 0, top: imgH - gradH, width: newW, height: gradH, scaleX: 1, scaleY: 1 })
      // Recreate gradient so the fade is correctly proportioned
      try {
        obj.set('fill', new fabric.Gradient({
          type: 'linear',
          coords: { x1: 0, y1: 0, x2: 0, y2: gradH },
          colorStops: [
            { offset: 0, color: 'rgba(17,17,17,0)' },
            { offset: 1, color: 'rgba(17,17,17,1)' },
          ],
        }))
      } catch { /* gradient recreation failed — keep existing */ }

    } else if (et === 'logo') {
      // Centered horizontally, just above the title (49% down)
      const logoScale = newW / BASE_W
      obj.set({ left: newW / 2, top: Math.round(newH * 0.49), scaleX: logoScale, scaleY: logoScale })

    } else if (et === 'title') {
      const fontSize = Math.max(20, Math.round(72 * (newW / BASE_W)))
      obj.set({
        left:     pad,
        top:      Math.round(newH * 0.56),
        width:    newW - pad * 2,
        fontSize,
      })

    } else if (et === 'text') {
      const fontSize = Math.max(11, Math.round(26 * (newW / BASE_W)))
      obj.set({
        left:     pad,
        top:      Math.round(newH * 0.76),
        width:    newW - pad * 2,
        fontSize,
      })

    } else if (et === 'tag') {
      const fontSize  = Math.max(9, Math.round(16 * (newW / BASE_W)))
      const bottomPad = Math.round(80 * (newH / BASE_H))
      obj.set({ left: pad, top: newH - bottomPad, fontSize })

    } else if (et === 'line') {
      obj.set({ left: 0, top: newH - 6, width: newW, height: 6, scaleX: 1, scaleY: 1 })

    } else if (prevW && prevH) {
      // ── Generic proportional scale for user-added elements ──────────────────
      const updates: Record<string, number> = {
        left: (obj.left ?? 0) * scaleW,
        top:  (obj.top  ?? 0) * scaleH,
      }

      const sx = obj.scaleX ?? 1
      const sy = obj.scaleY ?? 1
      if (Math.abs(sx - 1) < 0.01 && obj.width)  updates['width']  = obj.width  * scaleW
      if (Math.abs(sy - 1) < 0.01 && obj.height) updates['height'] = obj.height * scaleH

      // Scale applied transforms
      updates['scaleX'] = sx * scaleW
      updates['scaleY'] = sy * scaleH

      // Scale font size proportionally (use the smaller ratio to avoid overflow)
      const textObj = obj as typeof obj & { fontSize?: number }
      if (textObj.fontSize) {
        updates['fontSize'] = Math.max(8, Math.round(textObj.fontSize * Math.min(scaleW, scaleH)))
      }

      // Scale text wrapping width
      if ((obj.type === 'textbox' || obj.type === 'i-text') && obj.width) {
        updates['width'] = (obj.width ?? 0) * scaleW
      }

      obj.set(updates)
    }

    obj.setCoords?.()
    obj.dirty = true
  }

  canvas.renderAll()
}
