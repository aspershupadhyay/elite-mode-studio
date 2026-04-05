/**
 * transform.ts — Zoom, pan, and canvas resize helpers.
 * All functions take a Fabric Canvas as their first argument.
 */

import type { Canvas } from 'fabric'

/** Clamp a zoom value to safe bounds [0.05, 4]. */
export function clampZoom(z: number): number {
  return Math.max(0.05, Math.min(z, 4))
}

/** Read the current zoom level from a Canvas (always 1 since we CSS-scale). */
export function getZoom(_canvas: Canvas): number {
  // We use CSS transform scaling, not Fabric zoom, so always return 1.
  return 1
}

/** Apply a CSS zoom % value (e.g. 80 → 0.8) to React state refs. */
export function setZoom(
  pct: number,
  zoomRef: { current: number },
  setZoomState: (z: number) => void,
): void {
  const z = clampZoom(pct / 100)
  zoomRef.current = z
  setZoomState(z)
}

/** Compute a zoom that fits the canvas inside the container with padding. */
export function zoomToFit(
  containerEl: HTMLDivElement | null,
  width: number,
  height: number,
  zoomRef: { current: number },
  setZoomState: (z: number) => void,
  panRef: { current: { x: number; y: number } },
  setPan: (p: { x: number; y: number }) => void,
  onPanChangeRef: { current?: ((p: { x: number; y: number }) => void) | null },
  onZoomChangeRef: { current?: ((z: number) => void) | null },
): void {
  if (!containerEl) return
  const cw = containerEl.clientWidth  - 100
  const ch = containerEl.clientHeight - 140
  if (cw <= 0 || ch <= 0) return
  const newZoom = Math.max(0.1, Math.min(cw / width, ch / height, 0.6))
  setZoomState(newZoom)
  zoomRef.current = newZoom
  const zeroPan = { x: 0, y: 0 }
  setPan(zeroPan)
  panRef.current = zeroPan
  onPanChangeRef.current?.(zeroPan)
  onZoomChangeRef.current?.(Math.round(newZoom * 100))
}

/** Resize the Fabric canvas element (in canvas units). */
export function changeCanvasSize(canvas: Canvas, w: number, h: number): void {
  canvas.setDimensions({ width: w, height: h })
}

/** Update pan ref and React state atomically. */
export function applyPan(
  delta: { x: number; y: number },
  panRef: { current: { x: number; y: number } },
  setPan: (p: { x: number; y: number }) => void,
  onPanChangeRef: { current?: ((p: { x: number; y: number }) => void) | null },
): void {
  const newPan = { x: panRef.current.x + delta.x, y: panRef.current.y + delta.y }
  panRef.current = newPan
  setPan(newPan)
  onPanChangeRef.current?.(newPan)
}
