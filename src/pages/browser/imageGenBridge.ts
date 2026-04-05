/**
 * imageGenBridge.ts
 *
 * Renderer-side coordinator for the image generation pipeline.
 *
 * Responsibilities:
 *  - Build ImageGenJob list from a batch of posts (picking the right prompt field)
 *  - Start the queue via IPC
 *  - Listen for progress events and call per-job callbacks
 *  - Resolve image file paths (file:// URLs) so canvas can load them
 *
 * Usage:
 *   const bridge = createImageGenBridge(posts, profile, onProgress)
 *   await bridge.start()
 *   bridge.cancel()
 */

import type { Post }              from '@/types/domain'
import type { ImageGenJob, ImageGenProgress, ImageGenStatus } from '@/types/ipc'

// Fields tried in priority order when looking for an image prompt
const IMAGE_PROMPT_FIELDS = [
  'image_prompt_1x1',
  'image_prompt_9x16',
  'image_prompt_16x9',
  'image_prompt',
]

// Canvas eliteType to target when injecting the image
const DEFAULT_IMAGE_ELITE_TYPE = 'image'

export interface JobProgressState {
  postId:     string
  pageIndex:  number
  status:     ImageGenStatus
  tmpPath?:   string
  /** file:// URL ready for canvas.loadImageFromURL */
  imageUrl?:  string
  error?:     string
}

export type BridgeProgressCallback = (state: JobProgressState) => void

export interface ImageGenBridge {
  start:  () => Promise<{ accepted: number; rejected: number }>
  cancel: () => void
}

/**
 * Create a bridge instance for a given batch of posts.
 * @param posts        Array of generated posts (must have .id and .fields)
 * @param pageIndexMap Map of postId → page index in the studio
 * @param onProgress   Called on every status change per job
 * @param targetEliteType  Canvas object type to inject into (default: 'image')
 */
export function createImageGenBridge(
  posts: Post[],
  pageIndexMap: Map<string, number>,
  onProgress: BridgeProgressCallback,
  targetEliteType = DEFAULT_IMAGE_ELITE_TYPE,
): ImageGenBridge {
  let unsubscribe: (() => void) | null = null

  // ── Build job list ────────────────────────────────────────────────────────
  const jobs: ImageGenJob[] = []

  for (const post of posts) {
    const prompt = resolveImagePrompt(post)
    if (!prompt) {
      console.warn('[imageGenBridge] No image prompt for post:', post.id)
      continue
    }
    const pageIndex = pageIndexMap.get(post.id) ?? -1
    if (pageIndex < 0) {
      console.warn('[imageGenBridge] No page index for post:', post.id)
      continue
    }
    jobs.push({ postId: post.id, pageIndex, prompt, targetEliteType })
  }

  // ── Progress listener ─────────────────────────────────────────────────────
  function handleProgress(progress: ImageGenProgress): void {
    const state: JobProgressState = {
      postId:    progress.postId,
      pageIndex: progress.pageIndex,
      status:    progress.status,
      tmpPath:   progress.tmpPath,
      error:     progress.error,
    }

    // Convert tmp file path to a file:// URL for Fabric image loading
    if (progress.tmpPath) {
      state.imageUrl = `file://${progress.tmpPath}`
    }

    onProgress(state)
  }

  return {
    async start() {
      if (!jobs.length) return { accepted: 0, rejected: 0 }
      if (!window.api?.startImageGen) {
        console.error('[imageGenBridge] window.api.startImageGen not available (non-Electron env?)')
        return { accepted: 0, rejected: jobs.length }
      }

      // Subscribe to progress before starting so we don't miss early events
      unsubscribe = window.api.onImageGenProgress?.(handleProgress) ?? null

      const result = await window.api.startImageGen({ jobs })
      console.log(`[imageGenBridge] Started: ${result.accepted} accepted, ${result.rejected} rejected`)
      return result
    },

    cancel() {
      unsubscribe?.()
      unsubscribe = null
      void window.api?.cancelImageGen?.()
    },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveImagePrompt(post: Post): string | null {
  // Check post.fields first (schema-aware)
  if (post.fields) {
    for (const key of IMAGE_PROMPT_FIELDS) {
      const v = post.fields[key]
      if (v && v.trim()) return v.trim()
    }
  }
  // Fallback: check flat post properties
  const postAny = post as unknown as Record<string, unknown>
  for (const key of IMAGE_PROMPT_FIELDS) {
    const v = postAny[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
