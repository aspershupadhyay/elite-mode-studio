/**
 * utils.js — Shared utility functions
 * Single source of truth for helpers used across multiple files.
 */

/**
 * Convert a hex colour string (#RRGGBB) to an "R, G, B" string
 * suitable for use in CSS rgba() expressions.
 */
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}
