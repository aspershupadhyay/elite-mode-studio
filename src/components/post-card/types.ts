/**
 * Shared types for the post-card module.
 * These mirror the data shapes produced by the content generation pipeline.
 */

export type PostStatus = 'waiting' | 'generating' | 'streaming' | 'complete' | 'error'

export interface PostContent {
  title?: string
  highlight_words?: string
  caption?: string
  // All other schema fields (image_prompt_1x1, image_prompt_16x9, hook_text, etc.)
  // are stored as extra keys — indexed signature covers them.
  [key: string]: string | undefined
}

export interface PostSource {
  title: string
  url?: string
}

/** Full post data shape passed to PostCard. */
export interface PostCardData {
  status: PostStatus
  index: number
  angle?: string
  topic?: string
  streamText?: string
  sourceCount?: number
  content?: PostContent
  sources?: PostSource[]
  post_id?: string
  error?: string
  freshness?: string
  /** file:// URL of AI-generated image for this post — set when ChatGPT pipeline completes */
  generatedImageUrl?: string
  /** True while this post's image is queued/in-progress in the ChatGPT pipeline */
  imageQueued?: boolean
}

/** Payload sent to Design Studio when "Send to Studio" is clicked. */
export interface ApplyContentPayload {
  title: string
  highlight_words: string
  caption: string
  /** All AI output fields — custom fields from profile outputFields live here */
  fields?: Record<string, string>
}
