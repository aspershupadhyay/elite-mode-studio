import { Globe, FileText, Zap, Settings, History, PenTool, Grid, FlaskConical } from 'lucide-react'

const items = [
  { id: 'web',        icon: Globe,          label: 'Web Search' },
  { id: 'doc',        icon: FileText,       label: 'Doc RAG' },
  { id: 'content',    icon: Zap,            label: 'Content Gen' },
  { id: 'contentlab', icon: FlaskConical,   label: 'Content Lab ✦' },
  { id: 'studio',     icon: PenTool,        label: 'Design Studio' },
  { id: 'templates',  icon: Grid,           label: 'Templates' },
  { id: 'history',    icon: History,        label: 'Post History' },
  { id: 'settings',   icon: Settings,       label: 'Settings' },
]

export default function Sidebar({ current, onNav, backendStatus }) {
  const statusColor = backendStatus === 'ok' ? 'var(--green)' :
                      backendStatus === 'degraded' ? 'var(--amber)' : 'var(--red)'
  return (
    <aside style={{
      width: 64, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 48, gap: 4, flexShrink: 0
    }}>
      <div style={{ marginBottom: 24, position: 'relative' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13, color: '#000'
        }}>N</div>
        {backendStatus && (
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor, border: '1.5px solid var(--bg2)'
          }}/>
        )}
      </div>
      {items.map(({ id, icon: Icon, label }) => (
        <button key={id} onClick={() => onNav(id)} title={label} style={{
          width: 44, height: 44, borderRadius: 10, border: 'none',
          background: current === id ? 'var(--green-dim)' : 'transparent',
          color: current === id ? 'var(--green)' : 'var(--text3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s', cursor: 'pointer'
        }}>
          <Icon size={18} />
        </button>
      ))}
    </aside>
  )
}
