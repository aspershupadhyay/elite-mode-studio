import type { ApiResult } from '@/types/api'
import type { OutputField } from '@/types/profile'

export const API = 'http://127.0.0.1:8000'

/**
 * Wrapper around fetch that always returns { data, error }.
 * Error messages are always human-readable strings — never raw JS exceptions.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      ...options,
    })
    const json = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) {
      const msg =
        (typeof json['detail'] === 'string' ? json['detail'] : null) ||
        (typeof json['message'] === 'string' ? json['message'] : null) ||
        `Server error ${res.status}`
      return { data: null, error: msg }
    }
    return { data: json as T, error: null }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('fetch') || msg.includes('Failed')) {
      return {
        data: null,
        error: 'Backend is starting up — please wait a moment.',
      }
    }
    return { data: null, error: msg }
  }
}

export async function apiPost<T>(
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export async function apiDelete<T>(path: string): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { method: 'DELETE' })
}

/**
 * Open a streaming SSE POST connection.
 * Returns { reader: ReadableStreamDefaultReader, abort: () => void }
 * Throws if the initial HTTP response is not 2xx.
 *
 * Usage:
 *   const { reader, abort } = await apiStream('/api/content/stream-batch', body)
 *   // read lines with reader.read(), call abort() to cancel
 */
// ── Typed request bodies for profile-driven endpoints ─────────────────────────

export interface GenerateRequest {
  topic:               string
  system_prompt?:      string
  output_fields?:      OutputField[]
  tone?:               string
  language?:           string
  post_count?:         number
  search_enabled?:     boolean
  custom_instructions?: string
  freshness?:          string
}

export interface StreamRequest {
  category:            string
  count?:              number
  topics?:             string[]
  system_prompt?:      string
  output_fields?:      OutputField[]
  tone?:               string
  language?:           string
  search_enabled?:     boolean
  custom_instructions?: string
  freshness?:          string
}

export async function apiStream(
  path: string,
  body: unknown,
): Promise<{
  reader: ReadableStreamDefaultReader<Uint8Array>
  abort: () => void
}> {
  const controller = new AbortController()
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    throw new Error('Backend is starting up — please wait a moment.')
  }
  if (!response.ok) {
    const json = await response.json().catch(() => ({})) as Record<string, unknown>
    const msg =
      (typeof json['detail'] === 'string' ? json['detail'] : null) ||
      (typeof json['message'] === 'string' ? json['message'] : null) ||
      `Server error ${response.status}`
    throw new Error(msg)
  }
  if (!response.body) {
    throw new Error('Response body is null')
  }
  return {
    reader: response.body.getReader(),
    abort: () => controller.abort(),
  }
}
