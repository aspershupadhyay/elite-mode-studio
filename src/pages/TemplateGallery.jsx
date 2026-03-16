/**
 * TemplateGallery.jsx
 *
 * Browse, load, and delete canvas templates.
 * One default "Starter" template ships with the app.
 * All user-saved templates live in localStorage via templateStorage.js.
 */
import { useState, useEffect, useCallback } from 'react'
import { getTemplates, deleteTemplate } from '../studio/data/templateStorage.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function getPlatformLabel(w, h) {
  if (w === 1080 && h === 1350) return 'IG Feed'
  if (w === 1080 && h === 1080) return 'IG Square'
  if (w === 1080 && h === 1920) return 'IG Story'
  if (w === 1280 && h === 720)  return 'YT Thumb'
  if (w === 1200 && h === 675)  return 'X Post'
  if (w === 1200 && h === 627)  return 'LinkedIn'
  return `${w}×${h}`
}

// ── Starter template SVG thumbnail ───────────────────────────────────────────
// Clean, minimal dark card — no clutter, shows the layout concept clearly.

function StarterThumb() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg"
         style={{ width:'100%', height:'100%', display:'block' }}>
      {/* Background */}
      <rect width="270" height="338" fill="#0C0C0C"/>

      {/* Top image zone */}
      <rect width="270" height="168" fill="#141414"/>

      {/* Subtle grid */}
      {Array.from({ length:6 }, (_,i) => (
        <line key={i} x1={i*54} y1="0" x2={i*54} y2="168"
          stroke="#fff" strokeOpacity="0.03" strokeWidth="1"/>
      ))}

      {/* Fade gradient at image bottom */}
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141414" stopOpacity="0"/>
          <stop offset="100%" stopColor="#0C0C0C" stopOpacity="1"/>
        </linearGradient>
      </defs>
      <rect y="130" width="270" height="38" fill="url(#fade)"/>

      {/* Accent left bar */}
      <rect x="0" y="0" width="3" height="168" fill="var(--green, #0BDA76)"/>

      {/* Title block */}
      <rect x="20" y="186" width="210" height="11" rx="2.5" fill="#2A2A2A"/>
      <rect x="20" y="186" width="130" height="11" rx="2.5" fill="#363636"/>
      <rect x="20" y="203" width="170" height="11" rx="2.5" fill="#242424"/>

      {/* Highlight word chips */}
      <rect x="20"  y="228" width="48" height="14" rx="3" fill="var(--green, #0BDA76)" fillOpacity="0.15"/>
      <rect x="75"  y="228" width="60" height="14" rx="3" fill="var(--green, #0BDA76)" fillOpacity="0.12"/>
      <rect x="142" y="228" width="44" height="14" rx="3" fill="var(--green, #0BDA76)" fillOpacity="0.1"/>

      {/* Caption lines */}
      <rect x="20" y="258" width="230" height="6" rx="1.5" fill="#1E1E1E"/>
      <rect x="20" y="269" width="200" height="6" rx="1.5" fill="#1A1A1A"/>
      <rect x="20" y="280" width="215" height="6" rx="1.5" fill="#1E1E1E"/>
      <rect x="20" y="291" width="180" height="6" rx="1.5" fill="#1A1A1A"/>

      {/* Bottom accent bar */}
      <rect x="0" y="330" width="270" height="8" fill="var(--green, #0BDA76)"/>
    </svg>
  )
}

// ── The single built-in template ──────────────────────────────────────────────

const STARTER_TEMPLATE = {
  id:         '__default_em_classic',
  name:       'Starter',
  canvasJSON: '__default__',
  width:      1080,
  height:     1350,
  thumbnail:  null,
  createdAt:  0,
}

// ── "New template" card ───────────────────────────────────────────────────────

function NewTemplateCard({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        aspectRatio: '4/5',
        borderRadius: 14,
        border: `1.5px dashed ${hov ? 'var(--green)' : '#2A2A2A'}`,
        background: hov ? 'var(--green-dim)' : 'transparent',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, cursor: 'pointer', transition: 'all .18s',
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: hov ? 'var(--green)' : '#1A1A1A',
        border: `1px solid ${hov ? 'var(--green)' : '#2E2E2E'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .18s',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke={hov ? '#000' : 'var(--green, #0BDA76)'}
             strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <p style={{ fontSize: 12, fontWeight: 600,
        color: hov ? 'var(--green)' : '#555', margin: 0 }}>
        New Template
      </p>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ tmpl, isDefault, onUse, onDelete }) {
  const [hov, setHov]           = useState(false)
  const [confirmDel, setConfirm] = useState(false)
  const platform = isDefault ? 'IG Feed' : getPlatformLabel(tmpl.width, tmpl.height)
  const Thumb    = isDefault ? StarterThumb : null

  const handleDelete = (e) => {
    e.stopPropagation()
    if (confirmDel) { onDelete(tmpl.id) }
    else {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 2500)
    }
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setConfirm(false) }}
      onClick={() => onUse(tmpl)}
      style={{
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        background: '#0F0F0F',
        border: `1px solid ${hov ? 'var(--green-border, rgba(11,218,118,.25))' : '#1C1C1C'}`,
        boxShadow: hov ? '0 12px 40px rgba(0,0,0,.5)' : '0 2px 8px rgba(0,0,0,.3)',
        transform: hov ? 'translateY(-3px)' : 'none',
        transition: 'all .2s cubic-bezier(.4,0,.2,1)',
      }}>

      {/* Thumbnail */}
      <div style={{ aspectRatio: '4/5', background: '#0A0A0A', position: 'relative', overflow: 'hidden' }}>
        {tmpl.thumbnail ? (
          <img src={tmpl.thumbnail} alt={tmpl.name}
               style={{ width:'100%', height:'100%', objectFit:'contain', display:'block',
                        transform: hov ? 'scale(1.04)' : 'scale(1)', transition:'transform .3s' }}/>
        ) : Thumb ? (
          <div style={{ transform: hov ? 'scale(1.04)' : 'scale(1)', transition:'transform .3s',
            width:'100%', height:'100%' }}>
            <Thumb/>
          </div>
        ) : (
          <div style={{ width:'100%', height:'100%', background:'#111',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:11, color:'#333' }}>{tmpl.width}×{tmpl.height}</span>
          </div>
        )}

        {/* Platform pill */}
        <div style={{
          position:'absolute', top:10, right:10,
          padding:'3px 8px', borderRadius:20, fontSize:9, fontWeight:600,
          background:'rgba(0,0,0,.7)', backdropFilter:'blur(6px)',
          color:'#777', border:'1px solid rgba(255,255,255,.06)',
          letterSpacing:'.04em', textTransform:'uppercase',
        }}>{platform}</div>

        {/* Default badge */}
        {isDefault && (
          <div style={{
            position:'absolute', top:10, left:10,
            padding:'3px 8px', borderRadius:20, fontSize:9, fontWeight:700,
            background:'var(--green-dim,rgba(11,218,118,.1))',
            border:'1px solid var(--green-border,rgba(11,218,118,.25))',
            color:'var(--green,#0BDA76)', letterSpacing:'.06em', textTransform:'uppercase',
          }}>Default</div>
        )}

        {/* Hover action overlay */}
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.1) 50%, transparent 100%)',
          opacity: hov ? 1 : 0, transition:'opacity .18s',
          display:'flex', flexDirection:'column',
          justifyContent:'flex-end', padding:12, gap:7,
        }}>
          <button
            onClick={e => { e.stopPropagation(); onUse(tmpl) }}
            style={{
              padding:'8px 0', borderRadius:8, border:'none',
              background:'var(--green,#0BDA76)', color:'#000',
              fontSize:12, fontWeight:700, cursor:'pointer', width:'100%',
            }}>
            Open in Studio
          </button>
          {!isDefault && (
            <button onClick={handleDelete} style={{
              padding:'6px 0', borderRadius:8, width:'100%', fontSize:11,
              fontWeight:600, cursor:'pointer', transition:'all .15s',
              border:`1px solid ${confirmDel ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.1)'}`,
              background: confirmDel ? 'rgba(239,68,68,.15)' : 'rgba(0,0,0,.4)',
              color: confirmDel ? '#EF4444' : '#666',
            }}>
              {confirmDel ? 'Confirm delete' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {/* Name + meta strip */}
      <div style={{ padding:'11px 13px 13px' }}>
        <p style={{
          fontSize:13, fontWeight:600, color:'#E8E8E8', margin:'0 0 3px',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>{tmpl.name}</p>
        <p style={{ fontSize:10, color:'#3A3A3A', margin:0, fontFamily:'monospace' }}>
          {isDefault ? 'System default' : `${tmpl.width}×${tmpl.height} · ${timeAgo(tmpl.createdAt)}`}
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplateGallery({ onLoadTemplate, refreshKey = 0 }) {
  const [saved,   setSaved]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setSaved(await getTemplates())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const handleDelete = async (id) => {
    await deleteTemplate(id)
    setSaved(prev => prev.filter(t => t.id !== id))
  }

  const handleUse = (tmpl) => {
    onLoadTemplate?.({
      id:         tmpl.id,
      canvasJSON: tmpl.canvasJSON || '__default__',
      width:      tmpl.width  || 1080,
      height:     tmpl.height || 1350,
      name:       tmpl.name,
    })
  }

  const openStudio = () => handleUse(STARTER_TEMPLATE)

  // All templates shown: default first, then user saves, then "new" card
  const total = 1 + saved.length

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ padding:'24px 28px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <h1 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>
                Templates
              </h1>
              <span style={{
                padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:600,
                background:'var(--green-dim)', border:'1px solid var(--green-border)',
                color:'var(--green)',
              }}>{total}</span>
            </div>
            <p style={{ fontSize:12, color:'var(--text2)', margin:0 }}>
              {saved.length === 0
                ? '1 default template · save custom designs from Design Studio'
                : `1 default · ${saved.length} saved`}
            </p>
          </div>

          <button onClick={openStudio} style={{
            display:'flex', alignItems:'center', gap:7,
            padding:'8px 16px', borderRadius:9,
            background:'var(--green)', border:'none',
            color:'#000', fontSize:12, fontWeight:700, cursor:'pointer',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Template
          </button>
        </div>
        <div style={{ height:1, background:'var(--border)' }}/>
      </div>

      {/* Grid */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px 28px' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            height:200, gap:8 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:7, height:7, borderRadius:'50%',
                background:'var(--green)', animation:'pulse 1.2s infinite',
                animationDelay:`${i*.2}s` }}/>
            ))}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16,
          }}>
            {/* Default starter template */}
            <TemplateCard
              tmpl={STARTER_TEMPLATE}
              isDefault
              onUse={handleUse}
              onDelete={handleDelete}
            />

            {/* User-saved templates */}
            {saved.map(tmpl => (
              <TemplateCard
                key={tmpl.id}
                tmpl={tmpl}
                isDefault={false}
                onUse={handleUse}
                onDelete={handleDelete}
              />
            ))}

            {/* Add new card */}
            <NewTemplateCard onClick={openStudio}/>
          </div>
        )}
      </div>
    </div>
  )
}
