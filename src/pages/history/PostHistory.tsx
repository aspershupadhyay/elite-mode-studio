import React, { useState, useEffect } from 'react'
import PageShell from '../../components/PageShell'
import { Card, Label, Btn } from '../../components/ui'
import { Trash2, Copy, Check, ChevronDown, ChevronUp, PenTool } from 'lucide-react'
import { apiFetch, apiDelete } from '../../api'
import type { Post } from '../../types/domain'

// ── Types ─────────────────────────────────────────────────────────────────────

// Matches the flat shape returned by GET /api/posts (database.py _post_row_to_dict).
// Index signature allows any extra fields from custom user schemas.
interface SavedPost {
  id: string
  topic?: string
  title?: string
  caption?: string
  hook_text?: string
  image_prompt_16x9?: string
  highlight_words?: string[]
  image_prompts?: string[]
  angle?: string
  freshness?: string
  platform?: string
  fields?: Record<string, unknown>
  created_at: string
  [key: string]: unknown   // custom schema fields come back as flat keys
}

interface PostsApiResponse {
  posts: SavedPost[]
}

// ── CopyBtn ───────────────────────────────────────────────────────────────────

interface CopyBtnProps {
  text: string
}

function CopyBtn({ text }: CopyBtnProps): React.ReactElement {
  const [copied, setCopied] = useState<boolean>(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5,
        border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)',
        fontSize: 11, cursor: 'pointer',
      }}
    >
      {copied ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy</>}
    </button>
  )
}

// ── PostCard (local, history-specific) ───────────────────────────────────────

// ── ExpandedFields — fully dynamic, renders every non-empty field ─────────────

// Keys shown in the card header — never repeat in expanded section
const HEADER_KEYS = new Set(['id', 'created_at', 'platform', 'title', 'topic', 'sources'])

function toLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fieldText(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'string') return val.trim() || null
  if (Array.isArray(val)) return val.filter(Boolean).join(', ') || null
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

function ExpandedFields({ post }: { post: SavedPost }): React.ReactElement {
  // `fields` blob is the canonical store of all generated outputs (saved since the fix).
  // Fall back to iterating flat DB columns for older posts that predate the fix.
  const entries: Array<{ key: string; text: string }> = []
  const seen = new Set<string>()

  const addEntry = (k: string, v: unknown): void => {
    if (seen.has(k) || HEADER_KEYS.has(k)) return
    const text = fieldText(v)
    if (text) { entries.push({ key: k, text }); seen.add(k) }
  }

  // Primary: fields blob has everything the LLM generated
  if (post.fields && typeof post.fields === 'object') {
    for (const [k, v] of Object.entries(post.fields)) addEntry(k, v)
  }

  // Fallback for older posts: flat DB columns
  if (entries.length === 0) {
    for (const [k, v] of Object.entries(post)) {
      if (k !== 'fields') addEntry(k, v)
    }
  }

  if (entries.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text3)' }}>No content saved for this post.</p>
  }

  return (
    <>
      {entries.map(({ key, text }) => {
        const isMono = key.toLowerCase().includes('prompt') || key.toLowerCase().includes('json')
        return (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Label>{toLabel(key)}</Label>
              <CopyBtn text={text} />
            </div>
            <p style={{
              fontSize: isMono ? 12 : 13,
              fontFamily: isMono ? 'monospace' : 'inherit',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
              color: 'var(--text2)',
              margin: 0,
            }}>
              {text}
            </p>
          </div>
        )
      })}
    </>
  )
}

// ── HistoryPostCard ───────────────────────────────────────────────────────────

interface HistoryPostCardProps {
  post: SavedPost
  onDelete: (id: string) => void
  onSendToStudio: (post: Post) => void
}

function HistoryPostCard({ post, onDelete, onSendToStudio }: HistoryPostCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState<boolean>(false)
  const date = new Date(post.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{date}</span>
            <span style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: 'rgba(225,48,108,0.1)', color: '#E1306C', fontWeight: 600,
            }}>IG</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>#{post.id.slice(0, 8)}</span>
          </div>
          <p style={{
            fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: expanded ? 'normal' : 'nowrap',
          }}>
            {post.title || post.topic || '—'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={() => onSendToStudio({
              id: post.id,
              created_at: post.created_at,
              title: post.title || '',
              caption: post.caption || '',
              highlight_words: post.highlight_words,
              image_prompts: post.image_prompts,
              angle: post.angle,
              platform: post.platform as Post['platform'],
              fields: post.fields as Record<string, string> | undefined,
            })}
            title="Send to Studio"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              border: '1px solid var(--green)', background: 'transparent',
              color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <PenTool size={11} /> Studio
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text2)', cursor: 'pointer',
            }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            onClick={() => onDelete(post.id)}
            style={{
              padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,77,77,0.3)',
              background: 'transparent', color: 'var(--red)', cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <ExpandedFields post={post} />
        </div>
      )}
    </Card>
  )
}

// ── PostHistory page ──────────────────────────────────────────────────────────

interface PostHistoryProps {
  onSendToStudio?: (post: Post) => void
}

export default function PostHistory({ onSendToStudio }: PostHistoryProps): React.ReactElement {
  const [posts, setPosts]       = useState<SavedPost[]>([])
  const [loading, setLoading]   = useState<boolean>(true)
  const [error, setError]       = useState<string>('')
  const [clearing, setClearing] = useState<boolean>(false)

  async function load(): Promise<void> {
    setLoading(true)
    const { data, error: err } = await apiFetch('/api/posts')
    if (err) setError(err)
    else setPosts((data as PostsApiResponse).posts || [])
    setLoading(false)
  }

  async function deletePost(id: string): Promise<void> {
    const { error: err } = await apiDelete(`/api/posts/${id}`)
    if (!err) setPosts(p => p.filter(x => x.id !== id))
  }

  async function clearAll(): Promise<void> {
    if (!window.confirm('Delete all saved posts? This cannot be undone.')) return
    setClearing(true)
    await apiDelete('/api/posts')
    setPosts([])
    setClearing(false)
  }

  useEffect(() => { void load() }, [])

  return (
    <PageShell title="Post History" subtitle={`${posts.length} posts saved`}>
      <div style={{ maxWidth: 760 }}>
        {error && (
          <div style={{
            padding: '12px 14px', background: 'rgba(255,77,77,0.08)',
            border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8,
            fontSize: 13, color: 'var(--red)', marginBottom: 16,
          }}>{error}</div>
        )}
        {posts.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Btn onClick={clearAll} loading={clearing} variant="secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}>
              <Trash2 size={11} style={{ display: 'inline', marginRight: 5 }} />Clear All
            </Btn>
          </div>
        )}
        {loading && <p style={{ color: 'var(--text2)', fontSize: 13 }}>Loading...</p>}
        {!loading && !error && posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ color: 'var(--text3)', fontSize: 14 }}>No posts yet.</p>
            <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
              Forge your first post in Content Generator.
            </p>
          </div>
        )}
        {posts.map(p => (
          <HistoryPostCard
            key={p.id}
            post={p}
            onDelete={deletePost}
            onSendToStudio={onSendToStudio ?? (() => {})}
          />
        ))}
      </div>
    </PageShell>
  )
}
