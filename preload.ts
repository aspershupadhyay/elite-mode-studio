import { contextBridge, ipcRenderer } from 'electron'
import type {
  SavePngBatchRequest, SavePngBatchResult, SessionData,
  AuthStartRequest, AuthStartResult, AuthCompleteEvent, AuthValidateResult,
  StartImageGenRequest, StartImageGenResult, ImageGenProgress,
  SetupCheckResult, SetupSaveRequest,
} from './src/types/ipc'

contextBridge.exposeInMainWorld('api', {
  version: '1.0.0',

  // ── Canvas / session ────────────────────────────────────────────────────
  savePngBatch: (request: SavePngBatchRequest): Promise<SavePngBatchResult> =>
    ipcRenderer.invoke('save-png-batch', request),
  saveSession: (data: SessionData): void =>
    ipcRenderer.send('session-save', data),
  loadSession: (): Promise<SessionData | null> =>
    ipcRenderer.invoke('session-load'),
  downloadBrowserImage: (req: { url: string; postId: string }): Promise<{ tmpPath: string; success: boolean; sizeKb: number }> =>
    ipcRenderer.invoke('browser-download-image', req),

  // ── AI browser helpers ──────────────────────────────────────────────────
  onAuthComplete: (cb: () => void): void => { ipcRenderer.on('auth-complete', () => cb()) },
  openAuthPopup:  (u: string): Promise<void> => ipcRenderer.invoke('open-auth-popup', u),
  openExternal:   (u: string): Promise<void> => ipcRenderer.invoke('open-external', u),
  clearBrowserData: (): Promise<void> => ipcRenderer.invoke('clear-browser-data'),
  clearSiteData: (domain: string): Promise<{ removed: number }> => ipcRenderer.invoke('clear-site-data', domain),

  // ── Secure PKCE OAuth — system browser flow ─────────────────────────────
  authStart: (req: AuthStartRequest): Promise<AuthStartResult> =>
    ipcRenderer.invoke('auth:start', req),

  onAuthResult: (cb: (event: AuthCompleteEvent) => void): (() => void) => {
    const handler = (_: unknown, data: AuthCompleteEvent): void => cb(data)
    ipcRenderer.on('auth:complete', handler)
    return () => ipcRenderer.removeListener('auth:complete', handler)
  },

  authValidate: (token: string): Promise<AuthValidateResult> =>
    ipcRenderer.invoke('auth:validate', token),

  authLogout: (token: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('auth:logout', token),

  showContextMenu: (params: { x: number; y: number; linkUrl?: string; srcUrl?: string; selectionText?: string; isEditable?: boolean; pageURL?: string }): Promise<void> =>
    ipcRenderer.invoke('browser:context-menu', params),

  // ── System fonts ─────────────────────────────────────────────────────────
  getSystemFonts: (): Promise<string[]> =>
    ipcRenderer.invoke('get-system-fonts'),

  // ── Image generation pipeline ────────────────────────────────────────────
  startImageGen: (req: StartImageGenRequest): Promise<StartImageGenResult> =>
    ipcRenderer.invoke('image-gen:start', req),

  cancelImageGen: (): Promise<void> =>
    ipcRenderer.invoke('image-gen:cancel'),

  onImageGenProgress: (cb: (progress: ImageGenProgress) => void): (() => void) => {
    const handler = (_: unknown, data: ImageGenProgress): void => cb(data)
    ipcRenderer.on('image-gen:progress', handler)
    return () => ipcRenderer.removeListener('image-gen:progress', handler)
  },

  getImageGenConfig: (): Promise<{ chatGptUrl: string }> =>
    ipcRenderer.invoke('image-gen:get-config'),

  setImageGenUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('image-gen:set-url', url),

  setupCheck: (): Promise<SetupCheckResult> =>
    ipcRenderer.invoke('setup:check'),

  setupSaveConfig: (req: SetupSaveRequest): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('setup:save-config', req),

  // ── Read local file as base64 data URL (dev: file:// blocked by SOP) ───
  readLocalImage: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('read-local-image', filePath),

  // ── Backend lifecycle ────────────────────────────────────────────────────
  restartBackend: (): Promise<void> => ipcRenderer.invoke('backend:restart'),

  onBackendStatus: (cb: (status: 'starting' | 'up' | 'crashed') => void): (() => void) => {
    const handler = (_: unknown, status: 'starting' | 'up' | 'crashed'): void => cb(status)
    ipcRenderer.on('backend:status', handler)
    return () => ipcRenderer.removeListener('backend:status', handler)
  },

  // ── Terminal logging from renderer ──────────────────────────────────────
  log: (...args: unknown[]): void => ipcRenderer.send('renderer-log', args),

  // ── CDN image interception — DISABLED (replaced by will-download) ────────
  // onCdnImageCaptured: (cb: (data: { url: string; sizeBytes: number }) => void): (() => void) => {
  //   const handler = (_: unknown, data: { url: string; sizeBytes: number }): void => cb(data)
  //   ipcRenderer.on('cdn-image-captured', handler)
  //   return () => ipcRenderer.removeListener('cdn-image-captured', handler)
  // },

  // ── Strategy A: will-download interception ───────────────────────────────
  // Fires when main process intercepts a download via session.will-download.
  // Provides the saved tmp file path + size in KB after the file is fully written.
  onImageDownloadReady: (cb: (data: { tmpPath: string | null; sizeKb: number }) => void): (() => void) => {
    const handler = (_: unknown, data: { tmpPath: string | null; sizeKb: number }): void => cb(data)
    ipcRenderer.on('image-download-ready', handler)
    return () => ipcRenderer.removeListener('image-download-ready', handler)
  },

  onBrowserEvent: (cb: (event: string, data?: unknown) => void): (() => void) => {
    const evts = ['browser:open-new-tab', 'browser:paste', 'browser:reload', 'browser:go-back', 'browser:go-forward']
    const handlers = evts.map(evt => {
      const h = (_: unknown, data?: unknown): void => cb(evt, data)
      ipcRenderer.on(evt, h)
      return { evt, h }
    })
    return () => handlers.forEach(({ evt, h }) => ipcRenderer.removeListener(evt, h))
  },

} as {
  version: string
  savePngBatch:         (request: SavePngBatchRequest) => Promise<SavePngBatchResult>
  saveSession:          (data: SessionData) => void
  loadSession:          () => Promise<SessionData | null>
  downloadBrowserImage: (req: { url: string; postId: string }) => Promise<{ tmpPath: string; success: boolean; sizeKb: number }>
  onAuthComplete:       (cb: () => void) => void
  openAuthPopup:        (u: string) => Promise<void>
  openExternal:         (u: string) => Promise<void>
  clearBrowserData:     () => Promise<void>
  clearSiteData:        (domain: string) => Promise<{ removed: number }>
  authStart:            (req: AuthStartRequest) => Promise<AuthStartResult>
  onAuthResult:         (cb: (event: AuthCompleteEvent) => void) => (() => void)
  authValidate:         (token: string) => Promise<AuthValidateResult>
  authLogout:           (token: string) => Promise<{ ok: boolean }>
  showContextMenu:      (params: { x: number; y: number; linkUrl?: string; srcUrl?: string; selectionText?: string; isEditable?: boolean; pageURL?: string }) => Promise<void>
  readLocalImage:         (filePath: string) => Promise<string | null>
  log:                    (...args: unknown[]) => void
  onImageDownloadReady:   (cb: (data: { tmpPath: string | null; sizeKb: number }) => void) => (() => void)
  onBrowserEvent:         (cb: (event: string, data?: unknown) => void) => (() => void)
  startImageGen:        (req: StartImageGenRequest) => Promise<StartImageGenResult>
  cancelImageGen:       () => Promise<void>
  onImageGenProgress:   (cb: (progress: ImageGenProgress) => void) => (() => void)
  getImageGenConfig:    () => Promise<{ chatGptUrl: string }>
  setImageGenUrl:       (url: string) => Promise<void>
  setupCheck:      () => Promise<SetupCheckResult>
  setupSaveConfig: (req: SetupSaveRequest) => Promise<{ ok: boolean; error?: string }>
})
