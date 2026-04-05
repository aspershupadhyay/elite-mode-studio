import { useState } from 'react'
import { Card, GreenCard, Label } from '../../components/ui'
import { Copy, Check, ExternalLink, Calendar, PenTool } from 'lucide-react'
import type { Post } from '@/types/domain'

// ── Static data ───────────────────────────────────────────────────────────────

const FRESH_LABELS: Record<string, string> = {
  today:  'Today only',
  '2days':'Last 2 days',
  '7days':'Last 7 days',
  any:    'No filter',
}

// ── Local interfaces ──────────────────────────────────────────────────────────

export interface OutSettings {
  include_9x16: boolean
  include_hook: boolean
  include_category: boolean
  // Extended fields used by ContentGen
  freshness?: string
  title_min_length?: number
  title_max_length?: number
  persona?: string
  tone?: string
  platform_target?: string
  caption_length?: string
  custom_instructions?: string
}

interface PostSource {
  title: string
  url?: string
}

interface BatchResultItem {
  content?: PostContent
  sources?: PostSource[]
  post_id?: string
  freshness?: string
  error?: string
  original_topic?: string
}

interface PostContent {
  title?: string
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  highlight_words?: string
  hook_text?: string
  category?: string
  caption?: string
  image_prompt_16x9?: string
  image_prompt_9x16?: string
  sources_block?: string
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PostResultsListProps {
  posts: Post[]
  onSendToStudio: (post: Post) => void
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState<boolean>(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
        background: 'transparent', color: 'var(--text2)', fontSize: 11,
        cursor: 'pointer', flexShrink: 0,
      }}>
      {copied ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy</>}
    </button>
  )
}

function Block({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }): React.ReactElement | null {
  if (!value) return null
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Label>{label}</Label><CopyBtn text={value} />
      </div>
      <p style={{
        fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text)',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>{value}</p>
    </Card>
  )
}

function HighlightWords({ words }: { words?: string }): React.ReactElement | null {
  if (!words) return null
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Label>Highlight Words</Label><CopyBtn text={words} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {words.split(',').map(w => w.trim()).filter(Boolean).map((w, i) => (
          <span key={i} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: 'var(--green-dim)', border: '1px solid var(--green-border)', color: 'var(--green)',
          }}>{w}</span>
        ))}
      </div>
    </Card>
  )
}

function LoadingSteps({ steps }: { steps: string[] }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
            animation: 'pulse 1.2s infinite', animationDelay: `${i * .3}s`,
          }} />
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{s}</span>
        </div>
      ))}
    </div>
  )
}

function ErrorBox({ msg }: { msg?: string }): React.ReactElement | null {
  if (!msg) return null
  return (
    <div style={{
      padding: '12px 14px', background: 'rgba(255,77,77,0.08)',
      border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8,
      fontSize: 13, color: 'var(--red)', marginBottom: 16, lineHeight: 1.6,
    }}>{msg}</div>
  )
}

interface PostResultProps {
  c?: PostContent
  sources?: PostSource[]
  post_id?: string
  outSettings: OutSettings
  freshness?: string
  onApplyContent?: (args: { title: string; highlight_words: string; caption: string }) => void
}

function PostResult({ c, sources, post_id, outSettings, freshness, onApplyContent }: PostResultProps): React.ReactElement {
  const conf: Record<string, string> = { HIGH: 'var(--green)', MEDIUM: 'var(--amber)', LOW: 'var(--red)' }
  return (
    <div>
      {c?.title && (
        <GreenCard style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <Label>Title</Label>
                {c.confidence && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.25)', color: conf[c.confidence] || 'var(--text2)',
                  }}>{c.confidence}</span>
                )}
                {freshness && (
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: 'rgba(11,218,118,0.1)', color: 'var(--green)',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Calendar size={9} />{FRESH_LABELS[freshness] || freshness}
                  </span>
                )}
                {c.title && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{c.title.length} chars</span>}
              </div>
              <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{c.title}</p>
            </div>
            <CopyBtn text={c.title} />
          </div>
        </GreenCard>
      )}

      {onApplyContent && c?.title && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => onApplyContent({
              title:           c.title || '',
              highlight_words: c.highlight_words || '',
              caption:         c.caption         || '',
            })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 8, background: 'var(--green)',
              border: 'none', color: '#000', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'opacity .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <PenTool size={14} />
            Send to Design Studio
          </button>
          <p style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 5 }}>
            Title + highlight words will be applied to the active canvas template
          </p>
        </div>
      )}

      <HighlightWords words={c?.highlight_words} />
      {outSettings.include_hook     && <Block label="Hook Text" value={c?.hook_text} />}
      {outSettings.include_category && <Block label="Category"  value={c?.category} />}
      <Block label="Caption"                   value={c?.caption} />
      <Block label="Image Prompt — 16x9"       value={c?.image_prompt_16x9} mono />
      {outSettings.include_9x16 && c?.image_prompt_9x16 && (
        <Block label="Image Prompt — 9x16" value={c.image_prompt_9x16} mono />
      )}
      {c?.sources_block && (
        <Card style={{ marginBottom: 12 }}>
          <Label>Verification Block</Label>
          <pre style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {c.sources_block}
          </pre>
        </Card>
      )}
      {sources && sources.length > 0 && (
        <Card>
          <Label>Web Sources</Label>
          {sources.map((s, i) => (
            <div key={i} style={{ marginBottom: 5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: 'var(--text3)', fontSize: 12, minWidth: 16 }}>{i + 1}.</span>
              <div>
                <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 1 }}>{s.title}</p>
                <a href={s.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  {s.url?.slice(0, 60)}...<ExternalLink size={9} />
                </a>
              </div>
            </div>
          ))}
        </Card>
      )}
      {post_id && (
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, textAlign: 'right' }}>
          Saved — ID: {post_id}
        </p>
      )}
    </div>
  )
}

// ── BatchResultItem display (internal) ────────────────────────────────────────

interface BatchResultsViewProps {
  batchResults: BatchResultItem[]
  batchProgressActive: boolean
  outSettings: OutSettings
  onApplyContent?: (args: { title: string; highlight_words: string; caption: string }) => void
}

export function BatchResultsView({
  batchResults,
  batchProgressActive,
  outSettings,
  onApplyContent,
}: BatchResultsViewProps): React.ReactElement | null {
  if (batchResults.length === 0) return null
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--green)', marginBottom: 16, fontWeight: 600 }}>
        {batchResults.filter(r => !r.error).length} post{batchResults.filter(r => !r.error).length !== 1 ? 's' : ''} forged
        {batchProgressActive ? ' — more incoming...' : ' — done'}
      </p>
      {batchResults.map((r, i) => (
        <div key={i} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: r.error ? 'rgba(255,77,77,0.15)' : 'var(--green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: r.error ? 'var(--red)' : '#000',
            }}>{i + 1}</div>
            <span style={{
              fontSize: 12, color: 'var(--text2)', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.original_topic?.slice(0, 80)}
            </span>
          </div>
          {r.error
            ? <ErrorBox msg={r.error} />
            : (
              <PostResult
                c={r.content || {}}
                sources={r.sources}
                post_id={r.post_id}
                outSettings={outSettings}
                freshness={r.freshness}
                onApplyContent={onApplyContent}
              />
            )
          }
          {i < batchResults.length - 1 && (
            <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }} />
          )}
        </div>
      ))}
    </div>
  )
}

export { PostResult, LoadingSteps, ErrorBox }
export type { PostContent, PostSource, BatchResultItem }
