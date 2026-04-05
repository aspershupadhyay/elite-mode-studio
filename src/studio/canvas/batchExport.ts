/**
 * batchExport.ts
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
 *   import { capturePostPNGs } from '../studio/canvas/batchExport'
 *   const files = await capturePostPNGs(canvasHandleRef, posts)
 *   const result = await window.api.savePngBatch(files)
 */
import type { PngFile } from '@/types/ipc'

interface PostContent {
  title?: string
  highlight_words?: string
  caption?: string
}

interface PostState {
  status: string
  content: PostContent | null
  index: number
}

interface CanvasExportHandle {
  applyContent: (args: { title: string; highlight_words: string; caption: string }) => void
  exportPNG: (multiplier: number) => string | null
}

function safeTitle(post: PostState): string {
  const title = post.content?.title ?? `post_${post.index + 1}`
  return (
    title
      .slice(0, 40)
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_') || `post_${post.index + 1}`
  )
}

/**
 * Capture N completed posts as PNGs via the active Fabric.js canvas.
 *
 * @param canvasHandle  — ref holding the Canvas.jsx imperative handle
 * @param posts         — array of post state objects from ContentLab
 * @param multiplier    — PNG resolution multiplier (default 2 = @2×)
 * @returns resolved array of { filename, base64 }
 */
export async function capturePostPNGs(
  canvasHandle: React.RefObject<CanvasExportHandle | null>,
  posts: PostState[],
  multiplier = 2,
): Promise<PngFile[]> {
  if (!canvasHandle?.current) {
    throw new Error('Canvas handle not available. Open Design Studio and load a template first.')
  }

  const handle = canvasHandle.current
  if (!handle.applyContent || !handle.exportPNG) {
    throw new Error('Canvas handle missing applyContent() or exportPNG() methods.')
  }

  const completePosts = posts.filter((p) => p.status === 'complete' && p.content)
  if (!completePosts.length) {
    throw new Error('No completed posts to export.')
  }

  const results: PngFile[] = []

  for (const post of completePosts) {
    const title           = post.content?.title           ?? ''
    const highlight_words = post.content?.highlight_words ?? ''
    const caption         = post.content?.caption         ?? ''

    // Apply the post content to the canvas template
    handle.applyContent({ title, highlight_words, caption })

    // Wait for Fabric.js to finish rendering text + highlights
    await new Promise<void>((r) => setTimeout(r, 80))

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
