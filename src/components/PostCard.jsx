import { useState } from 'react'
import { Copy, Check, ExternalLink, Edit2, Copy as CopyIcon, Trash2,
         PenTool, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

// ── Angle meta: color + label for each campaign angle ─────────────────────────
export const ANGLE_META = {
  news_analysis:  { label: 'News Analysis',  color: '#0BDA76', bg: 'rgba(11,218,118,0.12)'  },
  data_driven:    { label: 'Data-Driven',    color: '#38BDF8', bg: 'rgba(56,189,248,0.12)'  },
  emotional_hook: { label: 'Emotional Hook', color: '#F472B6', bg: 'rgba(244,114,182,0.12)' },
  controversy:    { label: 'Controversy',    color: '#FB923C', bg: 'rgba(251,146,60,0.12)'  },
  call_to_action: { label: 'Call to Action', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AngleBadge({ angle }) {
  if (!angle) return null
  const meta = ANGLE_META[angle] || { label: angle, color: 'var(--text2)', bg: 'var(--bg3)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.color}30`,
      flexShrink: 0,
    }}>
      {meta.label}
    </span>
  )
}

function IndexBadge({ index, status }) {
  const isError = status === 'error'
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
      background: isError ? 'rgba(255,77,77,0.15)' : 'var(--green)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700,
      color: isError ? 'var(--red)' : '#000',
    }}>
      {index + 1}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 5,
        border: '1px solid var(--border)', background: 'transparent',
        color: 'var(--text2)', fontSize: 11, cursor: 'pointer', flexShrink: 0,
      }}
    >
      {copied ? <><Check size={9} />Copied</> : <><Copy size={9} />Copy</>}
    </button>
  )
}

function ActionBtn({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
        border: `1px solid ${danger ? 'rgba(255,77,77,0.3)' : 'var(--border)'}`,
        background: 'transparent',
        color: danger ? 'var(--red)' : 'var(--text2)',
        cursor: 'pointer', transition: 'all .15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = danger ? 'var(--red)' : 'var(--green)'; e.currentTarget.style.color = danger ? 'var(--red)' : 'var(--green)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = danger ? 'rgba(255,77,77,0.3)' : 'var(--border)'; e.currentTarget.style.color = danger ? 'var(--red)' : 'var(--text2)' }}
    >
      <Icon size={11} />{label}
    </button>
  )
}

function SkeletonBar({ width = '100%', height = 12, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: 4,
      background: 'var(--bg3)',
      animation: 'skeleton-shimmer 1.5s infinite',
      ...style,
    }} />
  )
}

function PulsingDots({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--green)',
            animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.3}s`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
    </div>
  )
}

// Ranked highlight words: first 2 = primary (green), rest = secondary (subtle)
function HighlightSection({ words }) {
  if (!words) return null
  const list = words.split(',').map(w => w.trim()).filter(Boolean)
  if (!list.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, marginBottom: 4 }}>
      {list.map((w, i) => (
        <span key={i} style={{
          padding: '3px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700,
          background: i < 2 ? 'var(--green-dim)'              : 'rgba(255,255,255,0.04)',
          border:     i < 2 ? '1px solid var(--green-border)' : '1px solid var(--border)',
          color:      i < 2 ? 'var(--green)'                  : 'var(--text2)',
        }}>
          {w}
          {i < 2 && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>●</span>}
        </span>
      ))}
      <span style={{ fontSize: 10, color: 'var(--text3)', alignSelf: 'center', marginLeft: 2 }}>
        ● primary
      </span>
    </div>
  )
}

function CollapsibleBlock({ label, value, mono = false }) {
  const [open, setOpen] = useState(false)
  if (!value) return null
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8,
      marginTop: 8, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '8px 12px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text2)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CopyBtn text={value} />
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>
      {open && (
        <div style={{
          padding: '0 12px 12px',
          fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
          whiteSpace: 'pre-wrap', fontFamily: mono ? 'monospace' : 'inherit',
          borderTop: '1px solid var(--border)',
          paddingTop: 10,
        }}>
          {value}
        </div>
      )}
    </div>
  )
}

function SourcesList({ sources }) {
  const [open, setOpen] = useState(false)
  if (!sources?.length) return null
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, marginTop: 8, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '8px 12px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text2)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Sources ({sources.length})
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--border)' }}>
          {sources.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
              <span style={{ color: 'var(--text3)', fontSize: 11, minWidth: 16, flexShrink: 0 }}>{i + 1}.</span>
              <div>
                <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 2, lineHeight: 1.4 }}>{s.title}</p>
                <a href={s.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  {s.url?.slice(0, 55)}…<ExternalLink size={9} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main PostCard component ────────────────────────────────────────────────────
/**
 * Props:
 *   post: { status, index, angle, topic, streamText, sourceCount,
 *           content, sources, post_id, error, freshness }
 *   onApplyContent(postData) — send to Design Studio
 *   onEdit()
 *   onDuplicate()
 *   onDelete()
 *   onRetry()
 */
export default function PostCard({ post, onApplyContent, onEdit, onDuplicate, onDelete, onRetry }) {
  const { status, index, angle, topic, streamText, sourceCount, content, sources, error } = post

  const cardBase = {
    background: 'var(--bg2)',
    border: `1px solid ${status === 'error' ? 'rgba(255,77,77,0.35)' : status === 'complete' ? 'var(--border)' : 'var(--border)'}`,
    borderRadius: 12,
    padding: 18,
    transition: 'border-color .2s',
  }

  // ── Header row (common to all states) ──────────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <IndexBadge index={index} status={status} />
      {angle && <AngleBadge angle={angle} />}
      <span style={{
        fontSize: 12, color: 'var(--text3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
      }}>
        {topic || 'Loading topic…'}
      </span>
      {/* Status badge */}
      {status === 'complete' && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
          background: 'rgba(11,218,118,0.12)', color: 'var(--green)', border: '1px solid rgba(11,218,118,0.2)',
          flexShrink: 0,
        }}>DONE</span>
      )}
    </div>
  )

  // ── Waiting ─────────────────────────────────────────────────────────────────
  if (status === 'waiting') {
    return (
      <div style={{ ...cardBase, opacity: 0.65 }}>
        {header}
        <SkeletonBar width="78%" height={15} />
        <SkeletonBar width="52%" height={11} style={{ marginTop: 8 }} />
        <SkeletonBar width="90%" height={11} style={{ marginTop: 6 }} />
        <SkeletonBar width="65%" height={11} style={{ marginTop: 6 }} />
      </div>
    )
  }

  // ── Generating (web fetch in progress) ─────────────────────────────────────
  if (status === 'generating') {
    return (
      <div style={cardBase}>
        {header}
        <PulsingDots label={
          sourceCount > 0
            ? `${sourceCount} sources loaded — building content…`
            : 'Researching web…'
        } />
      </div>
    )
  }

  // ── Streaming (LLM tokens arriving) ────────────────────────────────────────
  if (status === 'streaming') {
    return (
      <div style={cardBase}>
        {header}
        <pre style={{
          fontSize: 11, color: 'var(--text2)', whiteSpace: 'pre-wrap',
          lineHeight: 1.7, maxHeight: 260, overflowY: 'auto',
          fontFamily: 'var(--font-mono, monospace)',
          background: 'var(--bg3)', borderRadius: 6,
          padding: '10px 12px', margin: 0,
        }}>
          {streamText}
          <span style={{ animation: 'cursor-blink 0.7s step-end infinite' }}>▍</span>
        </pre>
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div style={{ ...cardBase, borderColor: 'rgba(255,77,77,0.35)' }}>
        {header}
        <div style={{
          padding: '10px 14px', borderRadius: 7,
          background: 'rgba(255,77,77,0.07)',
          border: '1px solid rgba(255,77,77,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: 'var(--red)', lineHeight: 1.5 }}>{error}</span>
          <button
            onClick={onRetry}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid rgba(255,77,77,0.4)', background: 'transparent',
              color: 'var(--red)', cursor: 'pointer',
            }}
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Complete ────────────────────────────────────────────────────────────────
  const c = content || {}
  return (
    <div style={{ ...cardBase, borderColor: 'var(--border)' }}>
      {header}

      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.45, color: 'var(--text)', margin: 0 }}>
            {c.title || '(no title)'}
          </p>
        </div>
        <CopyBtn text={c.title || ''} />
      </div>

      {/* Ranked highlights */}
      <HighlightSection words={c.highlight_words} />

      {/* Action row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, marginBottom: 6 }}>
        <ActionBtn icon={PenTool}   label="Send to Studio" onClick={() => onApplyContent?.({
          title:           c.title          || '',
          highlight_words: c.highlight_words || '',
          caption:         c.caption         || '',
        })} />
        <ActionBtn icon={Edit2}     label="Edit"      onClick={onEdit} />
        <ActionBtn icon={CopyIcon}  label="Duplicate" onClick={onDuplicate} />
        <ActionBtn icon={Trash2}    label="Delete"    onClick={onDelete} danger />
      </div>

      {/* Collapsible sections */}
      <CollapsibleBlock label="Caption"           value={c.caption} />
      <CollapsibleBlock label="Image Prompt 16×9" value={c.image_prompt_16x9} mono />
      {c.hook_text && <CollapsibleBlock label="Hook Text" value={c.hook_text} />}
      <SourcesList sources={sources} />

      {post.post_id && (
        <p style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', marginTop: 10 }}>
          Saved · ID: {post.post_id}
        </p>
      )}
    </div>
  )
}
