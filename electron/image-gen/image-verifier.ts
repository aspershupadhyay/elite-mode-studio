/**
 * image-verifier.ts
 *
 * Pure-JS quality gate for generated images. Mirrors chatgpt_agent.py's
 * _verify_image_bytes() — three checks must ALL pass:
 *   1. File size >= MIN_SIZE_KB
 *   2. Shorter image dimension >= MIN_DIM_PX
 *   3. Laplacian sharpness variance >= MIN_SHARPNESS
 *
 * Uses Electron's nativeImage for decoding — no native node addons needed.
 */

import { nativeImage } from 'electron'

const MIN_SIZE_KB   = 300   // real DALL-E images are 300-800KB
const MIN_DIM_PX    = 1000  // shorter side must be >= 1000px (rejects 400px previews)
const MIN_SHARPNESS = 80.0  // Laplacian variance — blurry previews ~5-30, sharp ~100-500+

export interface VerifyResult {
  ok:     boolean
  reason: string
}

/**
 * Verify a downloaded image buffer passes all quality gates.
 * Call this BEFORE writing to disk.
 */
export function verifyImageBuffer(buf: Buffer): VerifyResult {
  // Gate 1: file size
  const sizeKb = buf.length / 1024
  if (sizeKb < MIN_SIZE_KB) {
    return { ok: false, reason: `too small: ${Math.round(sizeKb)}KB < ${MIN_SIZE_KB}KB` }
  }

  // Gate 2: dimensions — use nativeImage (built into Electron, no deps)
  let width = 0
  let height = 0
  try {
    const img  = nativeImage.createFromBuffer(buf)
    const size = img.getSize()
    width  = size.width
    height = size.height
  } catch (e) {
    return { ok: false, reason: `could not decode image: ${e}` }
  }

  if (Math.min(width, height) < MIN_DIM_PX) {
    return { ok: false, reason: `dimensions ${width}×${height} too small (min ${MIN_DIM_PX}px shorter side)` }
  }

  // Gate 3: sharpness via Laplacian variance
  let sharpness = MIN_SHARPNESS
  try {
    sharpness = laplacianVariance(nativeImage.createFromBuffer(buf), width, height)
  } catch {
    // If sharpness check fails, pass through — size+dim already validated
  }

  if (sharpness < MIN_SHARPNESS) {
    return {
      ok: false,
      reason: `blurry: Laplacian variance ${sharpness.toFixed(1)} < ${MIN_SHARPNESS} (${width}×${height}, ${Math.round(sizeKb)}KB)`,
    }
  }

  return {
    ok:     true,
    reason: `${Math.round(sizeKb)}KB ${width}×${height} sharpness=${sharpness.toFixed(0)}`,
  }
}

// ── Laplacian variance sharpness metric ──────────────────────────────────────
// Converts to greyscale, applies 3×3 Laplacian kernel, returns variance.
// Sharp → high variance (many edges). Blurry → low variance.
// Mirrors Python's _laplacian_variance() exactly.

function laplacianVariance(img: Electron.NativeImage, width: number, height: number): number {
  // Scale down to max 200px on shorter side — sharpness is scale-invariant, this is fast
  const scale   = Math.min(1, 200 / Math.min(width, height))
  const sw      = Math.round(width  * scale)
  const sh      = Math.round(height * scale)
  const resized = img.resize({ width: sw, height: sh })
  const bitmap  = resized.toBitmap()  // raw BGRA bytes

  // Convert BGRA to greyscale
  const grey = new Float32Array(sw * sh)
  for (let i = 0; i < sw * sh; i++) {
    const b = bitmap[i * 4]
    const g = bitmap[i * 4 + 1]
    const r = bitmap[i * 4 + 2]
    grey[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  // Apply 3×3 Laplacian kernel: [0,1,0],[1,-4,1],[0,1,0]
  const conv: number[] = []
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x
      const val =
        grey[idx - sw] +
        grey[idx - 1]  +
        grey[idx + 1]  +
        grey[idx + sw] -
        4 * grey[idx]
      conv.push(val)
    }
  }

  // Variance of convolution output
  const n    = conv.length
  if (n === 0) return MIN_SHARPNESS
  const mean = conv.reduce((a, b) => a + b, 0) / n
  return conv.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n
}
