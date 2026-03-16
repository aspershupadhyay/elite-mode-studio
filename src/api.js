export const API = 'http://127.0.0.1:8000'

/**
 * Wrapper around fetch that always returns { data, error }.
 * Error messages are always human-readable strings — never raw JS exceptions.
 */
export async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = json.detail || json.message || `Server error ${res.status}`
      return { data: null, error: msg }
    }
    return { data: json, error: null }
  } catch (e) {
    if (e.message?.includes('fetch') || e.message?.includes('Failed')) {
      return { data: null, error: 'Cannot reach backend. Make sure python3 api.py is running in Terminal.' }
    }
    return { data: null, error: e.message || 'Unknown error' }
  }
}

export async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
}

export async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' })
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
export async function apiStream(path, body) {
  const controller = new AbortController()
  let response
  try {
    response = await fetch(`${API}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error('Cannot reach backend. Make sure the backend is running.')
  }
  if (!response.ok) {
    const json = await response.json().catch(() => ({}))
    throw new Error(json.detail || json.message || `Server error ${response.status}`)
  }
  return {
    reader: response.body.getReader(),
    abort:  () => controller.abort(),
  }
}
