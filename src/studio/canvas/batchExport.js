/**
 * batchExport.js
 *
 * Loops over completed post objects, applies each to the Fabric.js canvas
 * via canvasHandle, captures a PNG at 2× resolution, then returns an array
 * of { filename, base64 } objects ready for Electron's fs.writeFileSync.
 *
 * Requirements:
 *   canvasHandle.current must expose:
 *     applyContent({ title, highlight_words, caption }) — from Canvas.jsx handle
 *     exportPNG(multiplier)                             — returns base64 string (no data: prefix)
 *
 * Usage:
 *   import { capturePostPNGs } from '../studio/canvas/batchExport.js'
 *   const files = await capturePostPNGs(canvasHandleRef, posts)
 *   const result = await window.api.savePngBatch(files)
 */

function safeTitle(post) {
  const title = post.content?.title || `post_${post.index + 1}`
  return title
    .slice(0, 40)
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '_') || `post_${post.index + 1}`
}

/**
 * Capture N completed posts as PNGs via the active Fabric.js canvas.
 *
 * @param {React.RefObject} canvasHandle  — ref holding the Canvas.jsx imperative handle
 * @param {Array}           posts         — array of post state objects from ContentLab
 * @param {number}          multiplier    — PNG resolution multiplier (default 2 = @2×)
 * @returns {Promise<Array<{ filename: string, base64: string }>>}
 */
export async function capturePostPNGs(canvasHandle, posts, multiplier = 2) {
  if (!canvasHandle?.current) {
    throw new Error('Canvas handle not available. Open Design Studio and load a template first.')
  }

  const handle = canvasHandle.current
  if (!handle.applyContent || !handle.exportPNG) {
    throw new Error('Canvas handle missing applyContent() or exportPNG() methods.')
  }

  const completePosts = posts.filter(p => p.status === 'complete' && p.content)
  if (!completePosts.length) {
    throw new Error('No completed posts to export.')
  }

  const results = []

  for (const post of completePosts) {
    const { title = '', highlight_words = '', caption = '' } = post.content

    // Apply the post content to the canvas template
    handle.applyContent({ title, highlight_words, caption })

    // Wait for Fabric.js to finish rendering text + highlights
    await new Promise(r => setTimeout(r, 80))

    // Capture PNG — base64 string without data: prefix
    const base64 = handle.exportPNG(multiplier)
    if (!base64) continue

    results.push({
      filename: `post_${post.index + 1}_${safeTitle(post)}.png`,
      base64,
    })
  }

  return results
}
