/**
 * PagesPanel — Canva-style horizontal page strip at the bottom of Design Studio.
 * Shows N artboard thumbnails. Click to switch. "+" to add blank page. × to delete.
 */
import { Plus, X } from 'lucide-react'

// Angle colours reused from PostCard (kept local to avoid circular import)
const ANGLE_COLORS = {
  news_analysis:  { bg: '#0a2a1a', color: '#34d399' },
  data_driven:    { bg: '#0a1a2a', color: '#60a5fa' },
  emotional_hook: { bg: '#2a0a1a', color: '#f472b6' },
  controversy:    { bg: '#2a1a0a', color: '#fb923c' },
  call_to_action: { bg: '#1a0a2a', color: '#a78bfa' },
}

const PANEL_H = 108

export default function PagesPanel({ pages, activePage, onSwitch, onAdd, onDelete }) {
  if (!pages || pages.length === 0) return null

  return (
    <div style={{
      height: PANEL_H,
      background: 'var(--bg2)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 14px',
      overflowX: 'auto',
      flexShrink: 0,
      scrollbarWidth: 'thin',
    }}>

      {pages.map((page, i) => {
        const isActive = i === activePage
        const ac = ANGLE_COLORS[page.content?.angle]

        return (
          <div
            key={page.id}
            onClick={() => onSwitch(i)}
            style={{
              position: 'relative',
              flexShrink: 0,
              width: 64,
              height: 84,
              borderRadius: 6,
              border: `2px solid ${isActive ? 'var(--green)' : 'var(--border)'}`,
              cursor: 'pointer',
              overflow: 'hidden',
              transition: 'border-color .15s, transform .1s',
              display: 'flex',
              flexDirection: 'column',
              transform: isActive ? 'scale(1.04)' : 'scale(1)',
              boxShadow: isActive ? '0 0 0 1px var(--green)33' : 'none',
            }}
            title={page.label}
          >
            {/* Thumbnail OR colour preview */}
            {page.thumbnail
              ? (
                <img
                  src={page.thumbnail}
                  alt=""
                  style={{ width: '100%', height: 68, objectFit: 'cover', display: 'block' }}
                  draggable={false}
                />
              )
              : (
                <div style={{
                  flex: 1,
                  background: ac ? ac.bg : 'var(--bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  color: ac ? ac.color : 'var(--text3)',
                  letterSpacing: '-1px',
                }}>
                  {i + 1}
                </div>
              )
            }

            {/* Label strip */}
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              color: isActive ? 'var(--green)' : 'var(--text3)',
              padding: '2px 4px',
              background: 'var(--bg2)',
              borderTop: '1px solid var(--border)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'center',
            }}>
              {page.label || `${i + 1}`}
            </div>

            {/* Delete button — top-right on hover */}
            {pages.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(i) }}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 16, height: 16, borderRadius: 4,
                  background: 'rgba(0,0,0,0.7)', border: 'none',
                  color: 'var(--text2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity .15s',
                  padding: 0,
                }}
                className="page-del-btn"
              >
                <X size={9} />
              </button>
            )}
          </div>
        )
      })}

      {/* Add blank page */}
      <div
        onClick={onAdd}
        style={{
          flexShrink: 0,
          width: 64,
          height: 84,
          borderRadius: 6,
          border: '2px dashed var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          cursor: 'pointer',
          color: 'var(--text3)',
          fontSize: 10,
          fontWeight: 600,
          transition: 'border-color .15s, color .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
      >
        <Plus size={18} />
        <span>Add</span>
      </div>

      <style>{`
        div:hover .page-del-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
