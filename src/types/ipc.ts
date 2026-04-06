/**
 * IPC channel contracts — single source of truth imported by main.ts,
 * preload.ts, and any renderer code that calls window.api.
 *
 * Rule: every channel name, request payload, and response payload is
 * defined here.  Nothing is typed inline at the call site.
 */

// ── save-png-batch ─────────────────────────────────────────────────────────

export interface PngFile {
  filename: string
  base64: string
}

export interface SavePngBatchRequest {
  files: PngFile[]
}

export interface SavePngBatchResult {
  canceled: boolean
  folder?: string
  count?: number
  paths?: string[]
}

// ── session-save / session-load ────────────────────────────────────────────

export interface SessionPage {
  id: string
  label: string
  canvasJSON: string | null
  thumbnail: string | null
  locked?: boolean
}

export interface SessionData {
  version: '1.0'
  lastModified: string
  activePageIndex: number
  /** Zoom expressed as a percentage, e.g. 80 = 80%. */
  zoom: number
  pan: { x: number; y: number }
  pages: SessionPage[]
}

// ── browser-inject-prompt ──────────────────────────────────────────────────

export interface InjectPromptRequest {
  /** The image prompt text to inject */
  prompt: string
  /** post_id this prompt belongs to — returned in result so we can attach image */
  postId: string
}

export interface InjectPromptResult {
  success: boolean
  method: 'injected' | 'clipboard' | 'failed'
  error?: string
}

// ── image-captured ─────────────────────────────────────────────────────────

export interface ImageCapturedEvent {
  postId: string
  tmpPath: string
  width: number
  height: number
  sourceUrl: string
}

// ── check-image-quality ────────────────────────────────────────────────────

export interface CheckImageQualityRequest {
  tmpPath: string
}

export interface CheckImageQualityResult {
  sharp: boolean
  score: number
  path: string
}

// ── attach-post-image ──────────────────────────────────────────────────────

export interface AttachPostImageRequest {
  postId: string
  tmpPath: string
}

export interface AttachPostImageResult {
  success: boolean
  imagePath: string
}

// ── PKCE OAuth types ───────────────────────────────────────────────────────

export interface AuthUser {
  id:         string
  email:      string
  name:       string
  avatar_url: string
  provider:   'google' | 'microsoft'
}

export interface AuthStartRequest {
  provider: 'google' | 'microsoft'
}

export interface AuthStartResult {
  ok:     boolean
  error?: string
}

export interface AuthCompleteEvent {
  ok:             boolean
  error?:         string
  session_token?: string
  expires_at?:    string
  user?:          AuthUser
}

export interface AuthValidateResult {
  ok:    boolean
  user?: AuthUser
}

// ── Image generation pipeline ──────────────────────────────────────────────

export type ImageGenStatus =
  | 'queued'
  | 'opening_browser'
  | 'injecting_prompt'
  | 'waiting_for_image'
  | 'downloading'
  | 'done'
  | 'error'

export interface ImageGenJob {
  postId: string
  pageIndex: number
  prompt: string
  /** canvas eliteType of the target object, e.g. 'image' or 'frame' */
  targetEliteType: string
}

export interface ImageGenProgress {
  postId: string
  pageIndex: number
  status: ImageGenStatus
  /** Populated when status === 'done' */
  tmpPath?: string
  error?: string
}

export interface StartImageGenRequest {
  jobs: ImageGenJob[]
}

export interface StartImageGenResult {
  accepted: number
  rejected: number
}

// ── Setup / first-run ──────────────────────────────────────────────────────

export interface SetupCheckResult {
  /** true when NVIDIA_API_KEY and TAVILY_API_KEY are both present */
  configured: boolean
  missingKeys: string[]
}

export interface SetupSaveRequest {
  nvidiaKey: string
  tavilyKey: string
}

// ── Channel map (type-level registry) ─────────────────────────────────────

export type IpcChannels = {
  'save-png-batch': {
    request: SavePngBatchRequest
    response: SavePngBatchResult
  }
  'session-save': {
    request: SessionData
    response: void
  }
  'session-load': {
    request: void
    response: SessionData | null
  }
  'browser-inject-prompt': {
    request: InjectPromptRequest
    response: InjectPromptResult
  }
  'browser-image-captured': {
    request: ImageCapturedEvent
    response: void
  }
  'browser-download-image': {
    request: { url: string; postId: string }
    response: { tmpPath: string; success: boolean }
  }
  'image-gen:start': {
    request: StartImageGenRequest
    response: StartImageGenResult
  }
  'image-gen:cancel': {
    request: void
    response: void
  }
  /** Push event: main → renderer, fired for every status change */
  'image-gen:progress': {
    request: ImageGenProgress
    response: void
  }
  'setup:check': {
    request: void
    response: SetupCheckResult
  }
  'setup:save-config': {
    request: SetupSaveRequest
    response: { ok: boolean; error?: string }
  }
}
