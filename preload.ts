import { contextBridge, ipcRenderer } from 'electron'
import type {
  SavePngBatchRequest, SavePngBatchResult, SessionData,
  AuthStartRequest, AuthStartResult, AuthCompleteEvent, AuthValidateResult,
  StartImageGenRequest, StartImageGenResult, ImageGenProgress,
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
  downloadBrowserImage: (req: { url: string; postId: string }): Promise<{ tmpPath: string; success: boolean }> =>
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

  // ── Terminal logging from renderer ──────────────────────────────────────
  log: (...args: unknown[]): void => ipcRenderer.send('renderer-log', args),

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
  downloadBrowserImage: (req: { url: string; postId: string }) => Promise<{ tmpPath: string; success: boolean }>
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
  log:                  (...args: unknown[]) => void
  onBrowserEvent:       (cb: (event: string, data?: unknown) => void) => (() => void)
  startImageGen:        (req: StartImageGenRequest) => Promise<StartImageGenResult>
  cancelImageGen:       () => Promise<void>
  onImageGenProgress:   (cb: (progress: ImageGenProgress) => void) => (() => void)
  getImageGenConfig:    () => Promise<{ chatGptUrl: string }>
  setImageGenUrl:       (url: string) => Promise<void>
})
