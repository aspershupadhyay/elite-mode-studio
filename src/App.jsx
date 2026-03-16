import { useState, useEffect, Component } from 'react'
import Sidebar from './components/Sidebar.jsx'
import WebSearch from './pages/WebSearch.jsx'
import DocRAG from './pages/DocRAG.jsx'
import ContentGen from './pages/ContentGen.jsx'
import ContentLab from './pages/ContentLab.jsx'
import DesignStudio from './pages/DesignStudio.jsx'
import TemplateGallery from './pages/TemplateGallery.jsx'
import PostHistory from './pages/PostHistory.jsx'
import Settings from './pages/Settings.jsx'
import { apiFetch } from './api.js'

// ── Error boundary — isolates per-page crashes from the whole app ─────────────
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 12, padding: 32,
        }}>
          <div style={{
            fontSize: 13, color: 'var(--red)', textAlign: 'center',
            background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)',
            borderRadius: 10, padding: '16px 24px', maxWidth: 480,
          }}>
            <p style={{ fontWeight: 700, marginBottom: 6 }}>This page encountered an error</p>
            <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text2)', fontSize: 12,
              cursor: 'pointer',
            }}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function BackendBanner({ status }) {
  if (status === 'ok') return null
  const isDown = status === 'down'
  return (
    <div style={{ padding:'8px 20px', fontSize:11, fontWeight:500, textAlign:'center',
      background: isDown?'rgba(255,77,77,0.12)':'rgba(245,166,35,0.12)',
      color: isDown?'var(--red)':'var(--amber)',
      borderBottom:`1px solid ${isDown?'rgba(255,77,77,0.25)':'rgba(245,166,35,0.25)'}`}}>
      {isDown?'Backend offline — run: cd ~/Desktop/nvidia_rag_app/backend && python3 api.py':'Backend degraded — check API keys in Settings'}
    </div>
  )
}

function PageSlot({ active, children }) {
  return (
    <div style={{
      position:'absolute', inset:0,
      display: active ? 'block' : 'none',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

export default function App() {
  const [page, setPage]               = useState('content')
  const [backendStatus, setStatus]    = useState('checking')
  const [pendingTemplate, setPending] = useState(null)
  const [pendingContent, setContent]  = useState(null)
  const [pendingBatch, setPendingBatch] = useState(null)
  // Increment to force TemplateGallery to re-fetch without unmounting
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0)

  useEffect(() => {
    apiFetch('/api/health').then(({ data, error }) => {
      if (error) { setStatus('down'); return }
      setStatus(data?.missing_keys?.length ? 'degraded' : 'ok')
    })
  }, [])

  const handleLoadTemplate = (templateData) => {
    setPending({ ...templateData, _ts: Date.now() })
    setPage('studio')
  }

  // Called from ContentGen when user hits "Send to Studio" (single post)
  const handleApplyContent = (contentData) => {
    setContent({ ...contentData, _ts: Date.now() })
    setPage('studio')
  }

  // Called from ContentLab when batch generation completes (N posts → N pages)
  const handleBatchToStudio = (batchData) => {
    setPendingBatch({ ...batchData, _ts: Date.now() })
    setPage('studio')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', background:'var(--bg)' }}>
      <BackendBanner status={backendStatus} />
      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative' }}>
        <Sidebar current={page} onNav={setPage} backendStatus={backendStatus} />
        <main style={{ flex:1, overflow:'hidden', position:'relative' }}>
          <PageSlot active={page==='web'}>
            <PageErrorBoundary><WebSearch /></PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='doc'}>
            <PageErrorBoundary><DocRAG /></PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='content'}>
            <PageErrorBoundary>
              <ContentGen onApplyContent={handleApplyContent} />
            </PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='contentlab'}>
            <PageErrorBoundary>
              <ContentLab
                onApplyContent={handleApplyContent}
                onBatchComplete={handleBatchToStudio}
              />
            </PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='studio'}>
            <PageErrorBoundary>
              <DesignStudio
                pendingTemplate={pendingTemplate}
                pendingContent={pendingContent}
                pendingBatch={pendingBatch}
                onTemplateSaved={() => { setGalleryRefreshKey(k => k + 1); setPage('templates') }}
              />
            </PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='templates'}>
            <PageErrorBoundary>
              <TemplateGallery onLoadTemplate={handleLoadTemplate} refreshKey={galleryRefreshKey}/>
            </PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='history'}>
            <PageErrorBoundary><PostHistory /></PageErrorBoundary>
          </PageSlot>
          <PageSlot active={page==='settings'}>
            <PageErrorBoundary>
              <Settings onSaved={() => setStatus('ok')} />
            </PageErrorBoundary>
          </PageSlot>
        </main>
      </div>
    </div>
  )
}
