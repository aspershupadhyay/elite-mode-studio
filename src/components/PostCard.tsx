import React, { useState, useEffect } from 'react'
import { Trash2, RefreshCw, PenTool, Edit2, ChevronDown, ChevronUp } from 'lucide-react'
import type { PostCardData, ApplyContentPayload } from './post-card/types'
import { PostContent } from './post-card/PostContent'

export type { PostCardData } from './post-card/types'

// ── ANGLE_META ────────────────────────────────────────────────────────────────

interface AngleMeta { label: string; color: string; bg: string }

export const ANGLE_META: Record<string, AngleMeta> = {
  news_analysis:  { label: 'News Analysis',  color: '#0BDA76', bg: 'rgba(11,218,118,0.12)'  },
  data_driven:    { label: 'Data-Driven',    color: '#38BDF8', bg: 'rgba(56,189,248,0.12)'  },
  emotional_hook: { label: 'Emotional Hook', color: '#F472B6', bg: 'rgba(244,114,182,0.12)' },
  controversy:    { label: 'Controversy',    color: '#FB923C', bg: 'rgba(251,146,60,0.12)'  },
  call_to_action: { label: 'Call to Action', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
}

function SkeletonBar({ width = '100%', height = 10 }: { width?: string | number; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 3,
      background: 'rgba(255,255,255,0.07)',
      animation: 'skeleton-shimmer 1.5s infinite',
    }} />
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PostCardProps {
  post: PostCardData
  onApplyContent?: (payload: ApplyContentPayload) => void
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onRetry?: () => void
  isExpanded?: boolean
  onExpand?: (index: number | null) => void
}

const CARD_W = 120
const CARD_H = 150

// ── PostCard — thumbnail only, no expanded panel ──────────────────────────────

export default function PostCard({
  post, onDelete, onRetry,
  isExpanded: controlledExpanded, onExpand,
}: PostCardProps): React.ReactElement {
  const [localExpanded, setLocalExpanded] = useState(false)
  const { status, index, topic, streamText, sourceCount, content, error } = post

  const expanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded
  const toggle = () => {
    if (onExpand) onExpand(expanded ? null : index)
    else setLocalExpanded(v => !v)
  }

  const c = content || {}
  // Use the first real output field value as the card preview text.
  // Never fall back to `topic` (the Tavily search headline) — that's not user content.
  const firstFieldValue = Object.entries(c).find(
    ([key, val]) => !['sources_block','confidence','raw'].includes(key) && typeof val === 'string' && val.trim()
  )?.[1] ?? ''

  const { generatedImageUrl, imageQueued } = post

  // Track when the img element has fully decoded so we only reveal on load
  const [imgLoaded, setImgLoaded] = useState(false)
  useEffect(() => { setImgLoaded(false) }, [generatedImageUrl])

  // ── Waiting ───────────────────────────────────────────────────────────────
  if (status === 'waiting') {
    return (
      <div style={{ flexShrink: 0, width: CARD_W }}>
        <div style={{
          width: CARD_W, height: CARD_H,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: '10px 10px 0 0',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '14px 12px', gap: 8, opacity: 0.5,
        }}>
          <SkeletonBar width="70%" height={10} />
          <SkeletonBar width="90%" height={9} />
          <SkeletonBar width="55%" height={9} />
        </div>
        <div style={labelStrip(false)}>Post {index + 1}</div>
      </div>
    )
  }

  // ── Generating ────────────────────────────────────────────────────────────
  if (status === 'generating') {
    return (
      <div style={{ flexShrink: 0, width: CARD_W }}>
        <div style={{
          width: CARD_W, height: CARD_H,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: '10px 10px 0 0',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: 'var(--green)',
                animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.3}s`,
              }} />
            ))}
          </div>
          <span style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.4 }}>
            {(sourceCount ?? 0) > 0 ? `${sourceCount} sources…` : 'Researching…'}
          </span>
        </div>
        <div style={labelStrip(false)}>Post {index + 1}</div>
      </div>
    )
  }

  // ── Streaming ─────────────────────────────────────────────────────────────
  if (status === 'streaming') {
    return (
      <div style={{ flexShrink: 0, width: CARD_W }}>
        <div style={{
          width: CARD_W, height: CARD_H,
          background: 'var(--bg2)', border: '1px solid rgba(11,218,118,0.3)',
          borderRadius: '10px 10px 0 0', overflow: 'hidden', padding: '10px',
        }}>
          <div style={{
            fontSize: 8.5, color: 'var(--text2)', lineHeight: 1.5,
            overflow: 'hidden', height: '100%',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {streamText}
            <span style={{ animation: 'cursor-blink 0.7s step-end infinite', color: 'var(--green)' }}>▍</span>
          </div>
        </div>
        <div style={{ ...labelStrip(false), color: 'var(--green)' }}>Post {index + 1}</div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div style={{ flexShrink: 0, width: CARD_W }}>
        <div style={{
          width: CARD_W, height: CARD_H,
          background: 'var(--bg2)', border: '1px solid rgba(255,77,77,0.3)',
          borderRadius: '10px 10px 0 0',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12,
        }}>
          <span style={{ fontSize: 9, color: 'var(--red)', textAlign: 'center', lineHeight: 1.4 }}>
            {error || 'Failed'}
          </span>
          {onRetry && (
            <button onClick={onRetry} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
              border: '1px solid rgba(255,77,77,0.4)', background: 'transparent',
              color: 'var(--red)', cursor: 'pointer',
            }}>
              <RefreshCw size={8} /> Retry
            </button>
          )}
        </div>
        <div style={{ ...labelStrip(false), color: 'var(--red)' }}>Post {index + 1}</div>
      </div>
    )
  }

  // ── Complete — thumbnail only ─────────────────────────────────────────────
  return (
    <div style={{ flexShrink: 0, width: CARD_W }}>
      <div
        className={`post-card-thumb${imageQueued && !generatedImageUrl ? ' post-card-queued' : ''}`}
        onClick={toggle}
        style={{
          position: 'relative',
          width: CARD_W, height: CARD_H,
          background: '#111',
          border: `2px solid ${expanded ? 'var(--green)' : generatedImageUrl ? 'rgba(11,218,118,0.5)' : imageQueued ? 'rgba(11,218,118,0.25)' : 'var(--border)'}`,
          borderRadius: '10px 10px 0 0',
          overflow: 'hidden', cursor: 'pointer',
          transition: 'border-color .15s',
        }}
      >
        {/* Scanning shimmer — visible while image gen is queued but not yet done */}
        {imageQueued && !generatedImageUrl && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: 'linear-gradient(105deg, transparent 40%, rgba(11,218,118,0.12) 50%, transparent 60%)',
            backgroundSize: '250% 100%',
            animation: 'img-scan 1.8s ease-in-out infinite',
          }} />
        )}

        {/* Generated image — fades + scales in once the file is decoded */}
        {generatedImageUrl && (
          <img
            src={generatedImageUrl}
            alt="Generated"
            onLoad={() => setImgLoaded(true)}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              opacity: imgLoaded ? 1 : 0,
              transform: imgLoaded ? 'scale(1)' : 'scale(1.04)',
              transition: 'opacity 0.28s ease-out, transform 0.28s ease-out',
            }}
          />
        )}

        {/* Overlay gradient so text stays readable over image */}
        <div style={{
          position: 'absolute', inset: 0,
          background: generatedImageUrl
            ? 'linear-gradient(to top, rgba(0,0,0,0.75) 40%, transparent 100%)'
            : 'transparent',
        }} />

        {/* Top-left badge */}
        <div style={{
          position: 'absolute', top: 7, left: 7, zIndex: 2,
          width: 18, height: 18, borderRadius: 5,
          background: generatedImageUrl ? 'rgba(11,218,118,0.9)' : imageQueued ? 'rgba(11,218,118,0.3)' : 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        }}>
          <PenTool size={8} color={imageQueued && !generatedImageUrl ? 'rgba(11,218,118,0.9)' : '#000'} />
        </div>

        {/* Title text overlay */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 2 }}>
          <p style={{
            margin: 0, fontSize: 9.5, fontWeight: 800,
            color: '#fff', lineHeight: 1.35,
            textTransform: 'uppercase', letterSpacing: '0.02em',
            display: '-webkit-box',
            WebkitLineClamp: generatedImageUrl ? 3 : 5,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {firstFieldValue}
          </p>
        </div>

        {onDelete && (
          <button
            className="post-thumb-del"
            onClick={e => { e.stopPropagation(); onDelete() }}
            style={{
              position: 'absolute', top: 5, right: 5, zIndex: 3,
              width: 18, height: 18, borderRadius: 5,
              background: 'rgba(0,0,0,0.8)', border: 'none',
              color: '#f87171', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity .15s', padding: 0,
            }}
          >
            <Trash2 size={9} />
          </button>
        )}
      </div>

      <div
        onClick={toggle}
        style={{
          ...labelStrip(expanded),
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <span>Post {index + 1}</span>
        {expanded
          ? <ChevronUp size={9} color="var(--green)" />
          : <ChevronDown size={9} color="var(--text3)" />
        }
      </div>

      <style>{`
        .post-card-thumb:hover .post-thumb-del { opacity: 1 !important; }
        .post-card-thumb:hover { border-color: rgba(255,255,255,0.2) !important; }
        @keyframes img-scan {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

// ── PostDetailPanel — rendered once by the parent below the card row ──────────

export interface PostDetailPanelProps {
  post: PostCardData
  onApplyContent?: (payload: ApplyContentPayload) => void
  onEdit?: () => void
  onDelete?: () => void
  onClose?: () => void
}

export function PostDetailPanel({
  post, onApplyContent, onEdit, onDelete, onClose,
}: PostDetailPanelProps): React.ReactElement {
  const c = post.content || {}
  return (
    <div style={{
      width: '100%',
      background: 'var(--bg2)',
      border: '1px solid rgba(11,218,118,0.3)',
      borderRadius: 12,
      overflow: 'hidden',
      marginTop: 16,
    }}>
      {/* Action row */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 16px 0', alignItems: 'center',
      }}>
        <button
          onClick={() => onApplyContent?.({
            title:           c.title           || '',
            highlight_words: c.highlight_words || '',
            caption:         c.caption         || '',
            fields:          Object.fromEntries(
              Object.entries(c).filter(([, v]) => typeof v === 'string' && v.trim())
            ) as Record<string, string>,
          })}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            border: '1px solid var(--green)', background: 'transparent',
            color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <PenTool size={12} /> Send to Studio
        </button>
        {onEdit && (
          <button onClick={onEdit} style={secondaryBtn}>
            <Edit2 size={12} /> Edit
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} style={dangerBtn}>
            <Trash2 size={12} /> Delete
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px 16px' }}>
        <PostContent post={post} expanded={true} />
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelStrip(active: boolean): React.CSSProperties {
  return {
    background: active ? 'rgba(11,218,118,0.07)' : 'var(--bg2)',
    border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
    borderTop: 'none',
    borderRadius: '0 0 10px 10px',
    padding: '4px 8px',
    fontSize: 10, fontWeight: 700,
    color: active ? 'var(--green)' : 'var(--text3)',
    letterSpacing: '0.02em',
    textAlign: 'center' as const,
  }
}

const secondaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap',
}

const dangerBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
  border: '1px solid rgba(255,77,77,0.3)', background: 'transparent',
  color: '#f87171', cursor: 'pointer', whiteSpace: 'nowrap',
}
