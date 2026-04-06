/**
 * Application domain types.
 *
 * These map to data produced by the Python backend and stored in
 * localStorage / data/posts.json.  If Python response shapes are
 * uncertain, conservative interfaces are used and assumptions are noted.
 *
 * Assumption: all timestamp fields from the backend are ISO-8601 strings.
 * Assumption: `highlight_words` may be absent on older saved posts.
 */

// ── Content generation ─────────────────────────────────────────────────────

export type Platform = 'instagram' | 'linkedin' | 'twitter' | 'tiktok'

export type Tone =
  | 'professional'
  | 'casual'
  | 'inspirational'
  | 'educational'
  | 'humorous'

export type CaptionLength = 'short' | 'medium' | 'long'

export type PersonaId =
  | 'default'
  | 'thought_leader'
  | 'educator'
  | 'brand'
  | 'creator'
  | 'analyst'

/**
 * Lifecycle status for a post after generation.
 *
 * pending       — created but not yet rendered onto a canvas page
 * images_ready  — image URLs have been resolved; triggers re-render of the page
 * rendered      — canvas page has been fully rendered with all content + images
 */
export type PostStatus = 'pending' | 'images_ready' | 'rendered'

/** A single generated social media post. */
export interface Post {
  // ── Identity ────────────────────────────────────────────────────────────
  id: string
  created_at: string

  // ── Legacy flat fields (keep for backward compat) ───────────────────────
  // All existing code reads post.title / post.caption / etc. directly.
  // New schema-aware code reads from post.fields[fieldId] via readPostField().
  title: string
  caption: string
  highlight_words?: string[]
  image_prompts?: string[]
  angle?: string
  platform?: Platform
  /** Freshness/recency filter used when generating */
  freshness?: string

  // ── Schema-aware typed fields (populated alongside flat fields) ─────────
  /**
   * All generated field values keyed by schema fieldId.
   * Populated by Forge when building posts; mirrors and extends the flat fields above.
   * content-apply.ts readPostField() prefers this over flat fields when present.
   */
  fields?: Record<string, string>

  /**
   * Resolved image URLs keyed by slot name.
   * e.g. { primary: 'https://...', portrait: 'https://...' }
   * Populated asynchronously after generation; triggers 'images_ready' status.
   */
  images?: Record<string, string>

  /** Which schema generated this post (schema.id). */
  schemaId?: string

  /** Lifecycle status — updated as images arrive and canvas renders complete. */
  status?: PostStatus
}

/** An entry as persisted in data/posts.json */
export interface SavedPost extends Post {
  topic?: string
}

/** SSE streaming event shapes from /api/content/stream-batch */
export type BatchSseEvent =
  | { event: 'campaign_brief'; data: { name: string; angle: string; angle_brief: string } }
  | { event: 'post_started';   data: { id: string; angle: string } }
  | { event: 'web_fetched';    data: { id: string } }
  | { event: 'post_chunk';     data: { id: string; chunk: string } }
  | { event: 'post_completed'; data: { id: string; post: Post } }
  | { event: 'post_error';     data: { id: string; error: string } }
  | { event: 'batch_done';     data: Record<string, never> }

// ── Templates ──────────────────────────────────────────────────────────────

export interface Template {
  id: string
  name: string
  /** Serialised Fabric.js canvas JSON */
  canvas_json: string
  slot_schema?: Record<string, string> | null
  thumbnail: string | null
  width: number
  height: number
  created_at: string
  updated_at: string
}

// ── Multi-page carousel ────────────────────────────────────────────────────

export interface Page {
  id: string
  label: string
  content: Post | null
  /** Serialised Fabric.js canvas JSON; null until first render */
  canvasJSON: string | null
  /** Data-URL thumbnail captured when leaving the page */
  thumbnail: string | null
  /** True once applyGeneratedContent has run for this page */
  rendered: boolean
  /**
   * Extended status for progressive rendering.
   * 'rendered'      — canvas JSON + thumbnail captured
   * 'images_ready'  — post.images updated; page needs a re-render pass
   * Absent / undefined = not yet rendered (same as rendered: false)
   */
  status?: 'rendered' | 'images_ready'
}

// ── Output schema ──────────────────────────────────────────────────────────

/** A single AI output field defined by the user. */
export interface OutputField {
  id: string
  /** Human-readable label shown in the editor, e.g. "Main Title" */
  label: string
  /** snake_case key used in the prompt and parsed from the LLM response, e.g. "main_title" */
  key: string
  /** Instruction fed to the AI for this field, e.g. "punchy 8-word headline with a number" */
  instruction: string
  /** Whether this field is text or a comma-separated array (e.g. hashtags) */
  type: 'text' | 'array'
  enabled: boolean
}

/** A named collection of OutputFields that defines what the AI generates. */
export interface OutputSchema {
  id: string
  name: string
  fields: OutputField[]
  platform: string
  is_default: boolean
}

// ── Settings / preferences ─────────────────────────────────────────────────

export interface AppearanceConfig {
  theme?: 'dark' | 'light'
}

export interface StudioPrefs {
  bgHighlight: {
    enabled: boolean
    color: string
  }
}

export interface PostElementPrefs {
  title: boolean
  highlights: boolean
  subtitle: boolean
  tag: boolean
}

export interface PersonaConfig {
  id: PersonaId
  tone: Tone
  platform: Platform
  captionLength: CaptionLength
  customInstructions: string
}

// ── RAG / search ───────────────────────────────────────────────────────────

/** Assumption: Python /api/rag/query returns this shape. */
export interface RagQueryResult {
  answer: string
  sources: Array<{
    title: string
    url?: string
    snippet: string
  }>
}

/** Assumption: Python /api/search returns this shape. */
export interface WebSearchResult {
  results: Array<{
    title: string
    url: string
    content: string
    score?: number
  }>
  answer?: string
}
