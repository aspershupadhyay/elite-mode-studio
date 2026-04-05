/**
 * TemplateGallery.tsx
 *
 * Browse, load, and delete canvas templates.
 * All templates are user-created and live in localStorage via templateStorage.js.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { getTemplates, deleteTemplate } from '../../studio/data/templateStorage'
import type { CanvasHandle } from '../../types/canvas'

// ── Template type (matches templateStorage.js shape) ─────────────────────────

export interface StoredTemplate {
  id: string
  name: string
  canvas_json?: string
  thumbnail?: string | null
  width?: number
  height?: number
  created_at: string
  updated_at?: string
}

/** Payload passed to onLoadTemplate when the user picks a template. */
export interface LoadTemplatePayload {
  id: string
  canvas_json: string
  width: number
  height: number
  name: string
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TemplateGalleryProps {
  onLoadTemplate?: (payload: LoadTemplatePayload) => void
  refreshKey?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function getPlatformLabel(w: number, h: number): string {
  if (w === 1080 && h === 1350) return 'IG Feed'
  if (w === 1080 && h === 1080) return 'IG Square'
  if (w === 1080 && h === 1920) return 'IG Story'
  if (w === 1280 && h === 720)  return 'YT Thumb'
  if (w === 1200 && h === 675)  return 'X Post'
  if (w === 1200 && h === 627)  return 'LinkedIn'
  return `${w}×${h}`
}

// ── NewTemplateCard ───────────────────────────────────────────────────────────

interface NewTemplateCardProps {
  onClick: () => void
}

function NewTemplateCard({ onClick }: NewTemplateCardProps): React.ReactElement {
  const [hov, setHov] = useState<boolean>(false)
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
      <p style={{ fontSize: 12, fontWeight: 600, color: hov ? 'var(--green)' : '#555', margin: 0 }}>
        New Template
      </p>
    </div>
  )
}

// ── TemplateCard ──────────────────────────────────────────────────────────────

interface TemplateCardProps {
  tmpl: StoredTemplate
  onUse: (tmpl: StoredTemplate) => void
  onDelete: (id: string) => void
}

function TemplateCard({ tmpl, onUse, onDelete }: TemplateCardProps): React.ReactElement {
  const [hov, setHov]            = useState<boolean>(false)
  const [confirmDel, setConfirm] = useState<boolean>(false)
  const platform = getPlatformLabel(tmpl.width ?? 1080, tmpl.height ?? 1350)

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (confirmDel) {
      onDelete(tmpl.id)
    } else {
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
               style={{
                 width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                 transform: hov ? 'scale(1.04)' : 'scale(1)', transition: 'transform .3s',
               }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%', background: '#111',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 11, color: '#333' }}>{tmpl.width}×{tmpl.height}</span>
          </div>
        )}

        {/* Platform pill */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          padding: '3px 8px', borderRadius: 20, fontSize: 9, fontWeight: 600,
          background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)',
          color: '#777', border: '1px solid rgba(255,255,255,.06)',
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>{platform}</div>

        {/* Hover action overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.1) 50%, transparent 100%)',
          opacity: hov ? 1 : 0, transition: 'opacity .18s',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', padding: 12, gap: 7,
        }}>
          <button
            onClick={e => { e.stopPropagation(); onUse(tmpl) }}
            style={{
              padding: '8px 0', borderRadius: 8, border: 'none',
              background: 'var(--green,#0BDA76)', color: '#000',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%',
            }}>
            Open in Studio
          </button>
          <button onClick={handleDelete} style={{
            padding: '6px 0', borderRadius: 8, width: '100%', fontSize: 11,
            fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
            border: `1px solid ${confirmDel ? 'rgba(239,68,68,.6)' : 'rgba(255,255,255,.1)'}`,
            background: confirmDel ? 'rgba(239,68,68,.15)' : 'rgba(0,0,0,.4)',
            color: confirmDel ? '#EF4444' : '#666',
          }}>
            {confirmDel ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Name + meta strip */}
      <div style={{ padding: '11px 13px 13px' }}>
        <p style={{
          fontSize: 13, fontWeight: 600, color: '#E8E8E8', margin: '0 0 3px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{tmpl.name}</p>
        <p style={{ fontSize: 10, color: '#3A3A3A', margin: 0, fontFamily: 'monospace' }}>
          {tmpl.width}×{tmpl.height} · {timeAgo(tmpl.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── TemplateGallery ───────────────────────────────────────────────────────────

export default function TemplateGallery({ onLoadTemplate, refreshKey = 0 }: TemplateGalleryProps): React.ReactElement {
  const [saved,   setSaved]   = useState<StoredTemplate[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setSaved(await getTemplates() as unknown as StoredTemplate[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load, refreshKey])

  useEffect(() => {
    const handler = (): void => { void load() }
    window.addEventListener('templatesChange', handler)
    return (): void => { window.removeEventListener('templatesChange', handler) }
  }, [load])

  const handleDelete = async (id: string): Promise<void> => {
    await deleteTemplate(id)
    setSaved(prev => prev.filter(t => t.id !== id))
  }

  const handleUse = (tmpl: StoredTemplate): void => {
    onLoadTemplate?.({
      id:         tmpl.id,
      canvas_json: tmpl.canvas_json || '__default__',
      width:      tmpl.width  || 1080,
      height:     tmpl.height || 1350,
      name:       tmpl.name,
    })
  }

  const openStudio = (): void => onLoadTemplate?.({
    id: '__new__', canvas_json: '__default__', width: 1080, height: 1350, name: 'New Template',
  })

  const total = saved.length

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Templates
              </h1>
              <span style={{
                padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: 'var(--green-dim)', border: '1px solid var(--green-border)',
                color: 'var(--green)',
              }}>{total}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              {saved.length === 0
                ? 'No templates yet · save custom designs from Design Studio'
                : `${saved.length} saved template${saved.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <button onClick={openStudio} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', borderRadius: 9,
            background: 'var(--green)', border: 'none',
            color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Template
          </button>
        </div>
        <div style={{ height: 1, background: 'var(--border)' }}/>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 28px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--green)', animation: 'pulse 1.2s infinite',
                animationDelay: `${i * .2}s`,
              }}/>
            ))}
          </div>
        ) : saved.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: 300, gap: 14,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: '#111', border: '1px solid #222',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                   stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 5px' }}>
                No templates yet
              </p>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
                Open Design Studio, build your layout, then save it as a template.
              </p>
            </div>
            <button onClick={openStudio} style={{
              padding: '8px 20px', borderRadius: 9,
              background: 'var(--green)', border: 'none',
              color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              Open Studio
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16,
          }}>
            {saved.map(tmpl => (
              <TemplateCard
                key={tmpl.id}
                tmpl={tmpl}
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
