import React, { useState, useEffect, useRef, useCallback, Component, createContext, useContext } from 'react'
import Sidebar, { type PageId, type BackendStatus } from './components/Sidebar'
import AiBrowser from './pages/browser/WebSearch'
import type { AiBrowserHandle, ImageGenQueueJob } from './pages/browser/WebSearch'
import DocRAG from './pages/doc-rag/DocRAG'
import Forge from './pages/forge/Forge'
import DesignStudio from './pages/studio/DesignStudio'
import TemplateGallery from './pages/templates/TemplateGallery'
import PostHistory from './pages/history/PostHistory'
import Settings from './pages/settings/Settings'
import SetupModal from './pages/settings/SetupModal'
import Login from './pages/auth/Login'
import { apiFetch } from './api'
import type { LoadTemplatePayload } from './pages/templates/TemplateGallery'
import { bootstrapAuth, subscribeAuth, getAuthState, logout } from './auth'
import type { AuthState } from './auth'
import { bootstrapSchemas, getActiveSchema } from './utils/schemaStorage'
import type { ContentSchemaConfig } from './types/schema'
import { bootstrapProfiles } from './utils/profileStorage'
import type { Post } from './types/domain'

// ── Schema context ────────────────────────────────────────────────────────────

interface SchemaContextValue {
  activeSchema: ContentSchemaConfig
  /** Call this after saving/changing schemas to refresh the context value */
  refreshSchema: () => void
}

export const SchemaContext = createContext<SchemaContextValue>({
  activeSchema:  getActiveSchema(),
  refreshSchema: () => {},
})

/** Hook for any component that needs the active schema */
export function useActiveSchema(): SchemaContextValue {
  return useContext(SchemaContext)
}

// Boot: seed defaults into localStorage if not already present.
// Runs once synchronously before React renders.
bootstrapSchemas()
bootstrapProfiles()

// ── Apply saved theme on startup ──────────────────────────────────────────────
;(function applyStoredTheme() {
  try {
    const theme = localStorage.getItem('app_theme') ?? 'dark'
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
  } catch { /* use default dark */ }
})()

// ── Pending data shapes ───────────────────────────────────────────────────────

interface PendingTemplate extends LoadTemplatePayload {
  _ts: number
}

interface PendingContent {
  title?: string
  highlight_words?: string | string[]
  caption?: string
  _ts: number
  [key: string]: unknown
}

interface PendingBatch {
  _ts: number
  [key: string]: unknown
}

interface HealthApiResponse {
  missing_keys?: string[]
}

// ── PageErrorBoundary ─────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

class PageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[PageErrorBoundary]', error, info)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 14, padding: 40,
        }}>
          <div style={{
            fontSize: 13, color: 'var(--status-red)', textAlign: 'center',
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12, padding: '20px 28px', maxWidth: 480,
          }}>
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14, letterSpacing: '-0.01em' }}>Page error</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '7px 18px', borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
              transition: 'all 100ms',
            }}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── BackendBanner ─────────────────────────────────────────────────────────────

interface BackendBannerProps {
  status: BackendStatus
}

function BackendBanner({ status }: BackendBannerProps): React.ReactElement | null {
  if (status === 'ok') return null
  const isDown = status === 'down'
  return (
    <div style={{
      padding: '7px 20px',
      fontSize: 11,
      fontWeight: 500,
      textAlign: 'center',
      background: isDown ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
      color: isDown ? 'var(--status-red)' : 'var(--status-amber)',
      borderBottom: `0.5px solid ${isDown ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
      letterSpacing: '0.01em',
    }}>
      {isDown
        ? 'Backend offline — run: cd backend && python3 api.py'
        : 'Backend degraded — check API keys in Settings'}
    </div>
  )
}

// ── PageSlot ──────────────────────────────────────────────────────────────────

interface PageSlotProps {
  active: boolean
  children: React.ReactNode
}

function PageSlot({ active, children }: PageSlotProps): React.ReactElement {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: active ? 'block' : 'none',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const [page, setPage]               = useState<PageId>('forge')
  const [backendStatus, setStatus]    = useState<BackendStatus>('checking')
  const [pendingTemplate, setPending] = useState<PendingTemplate | undefined>(undefined)
  const [pendingContent, setContent]  = useState<PendingContent | undefined>(undefined)
  const [pendingBatch, setPendingBatch] = useState<PendingBatch | undefined>(undefined)
  const [galleryRefreshKey, setGalleryRefreshKey] = useState<number>(0)
  const [authState, setAuthState] = useState<AuthState>(getAuthState)
  const [activeSchema, setActiveSchema] = useState<ContentSchemaConfig>(getActiveSchema)
  const [setupNeeded,  setSetupNeeded]  = useState(false)
  const [setupMissing, setSetupMissing] = useState<string[]>([])

  const refreshSchema = (): void => { setActiveSchema(getActiveSchema()) }

  useEffect(() => {
    // Wait 3 s for backend to start, then check if API keys are configured
    const t = setTimeout(async () => {
      try {
        const result = await window.api.setupCheck()
        if (!result.configured) {
          setSetupMissing(result.missingKeys)
          setSetupNeeded(true)
        }
      } catch {
        // Backend not up yet — skip silently
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // ── Image generation pipeline ─────────────────────────────────────────────
  // generatedImages: postId → file:// URL — fed to Forge (PostCard) + Studio (canvas)
  // imageGenQueue: set of postIds currently in-flight in the ChatGPT pipeline
  const [generatedImages, setGeneratedImages] = useState<Map<string, string>>(new Map())
  const [imageGenQueue, setImageGenQueue] = useState<Set<string>>(new Set())
  const aiBrowserRef = useRef<AiBrowserHandle | null>(null)

  // Called by AiBrowser when an image finishes capturing & passes quality check.
  // Reads the local file via IPC (file:// is blocked from http:// origin in dev).
  const handleImageReady = useCallback((postId: string, filePath: string): void => {
    void (async () => {
      const dataUrl = await window.api?.readLocalImage?.(filePath) ?? `file://${filePath}`
      if (!dataUrl) return
      setGeneratedImages(prev => {
        const next = new Map(prev)
        next.set(postId, dataUrl)
        return next
      })
      // Remove from queue so PostCard shimmer stops
      setImageGenQueue(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    })()
  }, [])

  const startImageGenForBatch = useCallback(async (posts: Post[]): Promise<void> => {
    const IMAGE_PROMPT_FIELDS = ['image_prompt_1x1', 'image_prompt_9x16', 'image_prompt_16x9', 'image_prompt']

    const jobs: ImageGenQueueJob[] = []
    posts.forEach((p, i) => {
      const fields = p.fields ?? {}
      let prompt = ''
      for (const key of IMAGE_PROMPT_FIELDS) {
        if (fields[key]?.trim()) { prompt = fields[key].trim(); break }
      }
      if (prompt) jobs.push({ postId: p.id, prompt, title: p.title || `Post ${i + 1}`, pageIndex: i })
    })

    if (!jobs.length) {
      console.warn('[App] No posts have image_prompt_* fields — skipping image gen')
      return
    }

    // Mark all these posts as in-flight so PostCards show the scanning shimmer
    setImageGenQueue(new Set(jobs.map(j => j.postId)))

    // Read the ChatGPT URL from config (saved in Settings)
    const cfg = await window.api?.getImageGenConfig?.().catch(() => null)
    const chatGptUrl = cfg?.chatGptUrl ?? 'https://chatgpt.com/g/g-p-695fa0174ec88191a103a44f86864e61-image-generation/project'

    // Switch to AI Browser tab — the auto-queue runs inside the webview there
    setPage('web')

    // Give the page slot a tick to become visible before the browser starts loading
    setTimeout(() => {
      aiBrowserRef.current?.queueBatch(jobs, chatGptUrl)
    }, 300)
  }, [])

  // Keep schema in sync when any component calls setActiveSchema() or saveSchema()
  useEffect(() => {
    const handler = (): void => { setActiveSchema(getActiveSchema()) }
    window.addEventListener('schemasChange', handler)
    return (): void => { window.removeEventListener('schemasChange', handler) }
  }, [])

  useEffect(() => {
    bootstrapAuth()
    return subscribeAuth(setAuthState)
  }, [])

  useEffect(() => {
    void apiFetch('/api/health').then(({ data, error }) => {
      if (error) { setStatus('down'); return }
      setStatus((data as HealthApiResponse)?.missing_keys?.length ? 'degraded' : 'ok')
    })
  }, [])

  const handleLoadTemplate = (templateData: LoadTemplatePayload): void => {
    setPending({ ...templateData, _ts: Date.now() })
    setPage('studio')
  }

  // Called from ContentGen when user hits "Send to Studio" (single post)
  const handleApplyContent = (post: import('./types/domain').Post): void => {
    setContent({ ...post, _ts: Date.now() })
    setPage('studio')
  }

  // Called from Forge when batch generation completes (N posts → N pages)
  const handleBatchToStudio = (posts: Post[], templateJSON?: string): void => {
    // 1. Reset previous image gen state
    aiBrowserRef.current?.cancelQueue()
    setGeneratedImages(new Map())

    // 2. Send text content to Studio (canvas pre-render)
    setPendingBatch({ posts, templateJSON, _ts: Date.now() })
    setPage('studio')

    // 3. After Studio has had time to render, switch to AI Browser and start image gen
    setTimeout(() => void startImageGenForBatch(posts), 1500)
  }

  if (authState.status === 'checking') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0, #0a0a0a)' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green, #10b981)', animation: 'pulse 1.2s infinite', animationDelay: `${i*0.2}s` }} />)}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.15}}`}</style>
        </div>
      </div>
    )
  }

  if (authState.status === 'logged_out' || authState.status === 'logging_in') {
    return <Login status={authState.status} error={authState.error} />
  }

  return (
    <SchemaContext.Provider value={{ activeSchema, refreshSchema }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
        <BackendBanner status={backendStatus} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          <Sidebar current={page} onNav={setPage} backendStatus={backendStatus} user={authState.user} onLogout={() => { void logout() }} />
          <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <PageSlot active={page === 'web'}>
              <PageErrorBoundary>
                <AiBrowser ref={aiBrowserRef} onImageReady={handleImageReady} />
              </PageErrorBoundary>
            </PageSlot>
            <PageSlot active={page === 'doc'}>
              <PageErrorBoundary><DocRAG /></PageErrorBoundary>
            </PageSlot>
            <PageSlot active={page === 'forge'}>
              <PageErrorBoundary>
                <Forge
                  onSendToStudio={handleApplyContent}
                  onBatchToStudio={handleBatchToStudio}
                  generatedImages={generatedImages}
                  imageGenQueue={imageGenQueue}
                />
              </PageErrorBoundary>
            </PageSlot>
            <PageSlot active={page === 'studio'}>
              <PageErrorBoundary>
                <DesignStudio
                  pendingTemplate={pendingTemplate as import('./types/domain').Template | undefined}
                  pendingContent={pendingContent as import('./types/domain').Post | undefined}
                  pendingBatch={pendingBatch as { posts: Post[]; templateJSON?: string } | undefined}
                  onTemplateSaved={() => { setGalleryRefreshKey(k => k + 1); setPage('templates') }}
                  isActive={page === 'studio'}
                  generatedImages={generatedImages}
                />
              </PageErrorBoundary>
            </PageSlot>
            <PageSlot active={page === 'templates'}>
              <PageErrorBoundary>
                <TemplateGallery onLoadTemplate={handleLoadTemplate} refreshKey={galleryRefreshKey}/>
              </PageErrorBoundary>
            </PageSlot>
            <PageSlot active={page === 'history'}>
              <PageErrorBoundary><PostHistory onSendToStudio={handleApplyContent} /></PageErrorBoundary>
            </PageSlot>
            <PageSlot active={page === 'settings'}>
              <PageErrorBoundary>
                <Settings />
              </PageErrorBoundary>
            </PageSlot>
          </main>
        </div>

      </div>
      {setupNeeded && (
        <SetupModal
          missingKeys={setupMissing}
          onComplete={() => setSetupNeeded(false)}
        />
      )}
    </SchemaContext.Provider>
  )
}
