import React from 'react'
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { PostCardData, PostContent as PostContentData } from './types'

// ── HighlightSection ──────────────────────────────────────────────────────────

interface HighlightSectionProps {
  words: string | undefined
}

function HighlightSection({ words }: HighlightSectionProps): React.ReactElement | null {
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

// ── CopyBtn ───────────────────────────────────────────────────────────────────

interface CopyBtnProps {
  text: string
}

function CopyBtn({ text }: CopyBtnProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
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

// ── CollapsibleBlock ──────────────────────────────────────────────────────────

interface CollapsibleBlockProps {
  label: string
  value: string | undefined
  mono?: boolean
}

function CollapsibleBlock({ label, value, mono = false }: CollapsibleBlockProps): React.ReactElement | null {
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

// ── SourcesList ───────────────────────────────────────────────────────────────

interface Source {
  title: string
  url?: string
}

interface SourcesListProps {
  sources: Source[] | undefined
}

function SourcesList({ sources }: SourcesListProps): React.ReactElement | null {
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

// ── Label formatter ───────────────────────────────────────────────────────────

/** Convert snake_case field keys to "Title Case Label" for display */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** True if the field key looks like an image prompt */
function isImagePromptKey(key: string): boolean {
  return key.startsWith('image_prompt') || key.endsWith('_prompt') || key.endsWith('_image')
}

// Internal keys that are never real output fields — never render these
const INTERNAL_KEYS = new Set(['sources_block', 'confidence', 'raw'])

// ── PostContent ───────────────────────────────────────────────────────────────

export interface PostContentProps {
  post: PostCardData
  expanded: boolean
}

export function PostContent({ post, expanded: _ }: PostContentProps): React.ReactElement {
  const c: PostContentData = post.content || {}

  // All output fields in order, excluding internal meta keys and empty values
  const outputEntries = Object.entries(c).filter(
    ([key, val]) => !INTERNAL_KEYS.has(key) && typeof val === 'string' && val.trim() !== ''
  ) as [string, string][]

  // Use first non-internal field as the card heading — no hardcoded 'title' assumption
  const headingEntry = outputEntries[0]
  const remainingEntries = outputEntries.slice(1)

  // topic is the Tavily search query headline — show it only as a subtitle
  // when there are no output fields at all (AI returned nothing)
  const fallbackHeading = outputEntries.length === 0 ? (post.topic || '') : ''

  return (
    <>
      {/* Heading: first output field, or search topic as fallback */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {headingEntry ? (
            <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.45, color: 'var(--text)', margin: 0 }}>
              {headingEntry[1]}
            </p>
          ) : (
            <p style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.45, color: 'var(--text3)', margin: 0, fontStyle: 'italic' }}>
              {fallbackHeading || '(no output)'}
            </p>
          )}
        </div>
        {headingEntry && <CopyBtn text={headingEntry[1]} />}
      </div>

      {/* highlight_words rendered specially if present */}
      <HighlightSection words={c.highlight_words} />

      {/* All remaining fields — fully dynamic, no hardcoded field names */}
      {remainingEntries
        .filter(([key]) => key !== 'highlight_words') // already rendered above if present
        .map(([key, val]) => (
          <CollapsibleBlock
            key={key}
            label={formatLabel(key)}
            value={val}
            mono={isImagePromptKey(key)}
          />
        ))}

      <SourcesList sources={post.sources} />

      {post.post_id && (
        <p style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', marginTop: 10 }}>
          Saved · ID: {post.post_id}
        </p>
      )}
    </>
  )
}
