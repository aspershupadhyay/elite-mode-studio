/**
 * API client types — request/response shapes for every backend endpoint.
 *
 * Rule: functions in src/api.ts return ApiResult<T> for typed,
 * non-throwing HTTP calls.
 */

export interface ApiResult<T> {
  data: T | null
  error: string | null
}

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string
}

// ── RAG ────────────────────────────────────────────────────────────────────

export interface RagUploadResponse {
  message: string
  chunks: number
}

export interface RagQueryRequest {
  query: string
  top_k?: number
}

export interface RagSource {
  title: string
  url?: string
  snippet: string
}

export interface RagQueryResponse {
  answer: string
  sources: RagSource[]
}

// ── Web search ─────────────────────────────────────────────────────────────

export interface SearchRequest {
  query: string
  freshness?: string
}

export interface SearchResultItem {
  title: string
  url: string
  content: string
  score?: number
}

export interface SearchResponse {
  results: SearchResultItem[]
  answer?: string
}

// ── Content generation ─────────────────────────────────────────────────────

export interface ContentRequest {
  topic: string
  platform?: string
  tone?: string
  freshness?: string
  /** AI persona config fields */
  persona_id?: string
  caption_length?: string
  custom_instructions?: string
  title_min?: number
  title_max?: number
}

export interface ContentResponse {
  title: string
  caption: string
  highlight_words?: string[]
  image_prompts?: string[]
  angle?: string
}

// ── Search configuration ───────────────────────────────────────────────────

/** Assumption: mirrors the backend search_config.json schema. */
export interface SearchConfig {
  search_depth?: string
  max_results?: number
  include_domains?: string[]
  exclude_domains?: string[]
  freshness_default?: string
  use_answer_mode?: boolean
}
