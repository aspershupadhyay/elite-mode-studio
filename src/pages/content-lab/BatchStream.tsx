import React from 'react'
import { Zap, Send, Download, Trash2, Globe } from 'lucide-react'
import { Card, Label } from '../../components/ui'
import PostCard, { PostDetailPanel, ANGLE_META } from '../../components/PostCard'
import type { Post } from '@/types/domain'

// ── StreamPost ────────────────────────────────────────────────────────────────

export interface StreamPost {
  id: string
  index: number
  angle: string | null
  topic: string
  status: 'pending' | 'generating' | 'streaming' | 'done' | 'error'
  /** Accumulated streaming text before completion */
  streamText: string
  sourceCount: number
  content: Record<string, string> | null
  sources: Array<{ title: string; url?: string }>
  post_id: string | null
  error: string | null
}

// ── Campaign brief shape (from SSE) ──────────────────────────────────────────

export interface CampaignBriefData {
  name: string
  angle: string
  angle_brief: string
  series_tone?: string
  assignments?: Array<{ angle: string }>
  topics?: Array<{ title: string }>
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BatchStreamProps {
  campaign: CampaignBriefData | null
  posts: StreamPost[]
  sentToStudio: boolean
  exportStatus: '' | 'saving' | 'done' | 'error'
  streamActive: boolean
  elapsedMs?: number
  completedCount: number
  errorCount: number
  /** postId → file:// image URL — set as images arrive from ChatGPT */
  generatedImages?: Map<string, string>
  onSendAll: () => void
  onSendOne: (post: Post) => void
  onEdit: (index: number) => void
  onDelete: (index: number) => void
  onExport: () => void
  onClear: () => void
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CampaignBriefPanel({ brief }: { brief: CampaignBriefData | null }): React.ReactElement | null {
  if (!brief) return null

  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px',
      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Zap size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <label style={{ margin: 0 }}>Campaign Brief</label>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
          Series tone: {brief.series_tone}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {brief.assignments?.map((a, i) => {
          const meta = ANGLE_META[a.angle] || { label: a.angle, color: 'var(--text2)', bg: 'var(--bg3)' }
          return (
            <div key={i} style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 11,
              background: meta.bg, color: meta.color,
              border: `1px solid ${meta.color}30`,
            }}>
              <span style={{ fontWeight: 700 }}>#{i + 1}</span> {meta.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BatchStream({
  campaign,
  posts,
  sentToStudio,
  exportStatus,
  streamActive,
  elapsedMs = 0,
  completedCount,
  errorCount,
  generatedImages,
  onSendAll,
  onSendOne,
  onEdit,
  onDelete,
  onExport,
  onClear,
}: BatchStreamProps): React.ReactElement {
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null)

  return (
    <>
      {/* Progress bar */}
      {streamActive && posts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {completedCount} / {posts.length} complete
              {errorCount > 0 && (
                <span style={{ color: 'var(--red)', marginLeft: 8 }}>{errorCount} failed</span>
              )}
              {elapsedMs > 0 && (
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>
                  · {Math.floor(elapsedMs / 60000)}:{String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {Math.round((completedCount / Math.max(posts.length, 1)) * 100)}%
            </span>
          </div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: 'var(--green)',
              width: `${(completedCount / Math.max(posts.length, 1)) * 100}%`,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Campaign brief */}
      <CampaignBriefPanel brief={campaign} />

      {/* Status row when done */}
      {!streamActive && completedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600, flex: '1 1 auto' }}>
            {completedCount} post{completedCount !== 1 ? 's' : ''} forged
            {errorCount > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 400 }}>
                · {errorCount} failed
              </span>
            )}
          </span>
          <button
            onClick={onSendAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${sentToStudio ? 'var(--green)' : 'var(--border)'}`,
              background: sentToStudio ? 'rgba(52,211,153,0.1)' : 'transparent',
              color: sentToStudio ? 'var(--green)' : 'var(--text2)',
              cursor: 'pointer',
            }}>
            <Send size={12} />
            {sentToStudio ? 'In Studio ✓' : 'Send All to Studio'}
          </button>
          <button
            onClick={onExport}
            disabled={exportStatus === 'saving'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)', background: 'transparent',
              color: exportStatus === 'done' ? 'var(--green)' : 'var(--text2)',
              cursor: exportStatus === 'saving' ? 'not-allowed' : 'pointer',
              opacity: exportStatus === 'saving' ? 0.6 : 1,
            }}>
            <Download size={12} />
            {exportStatus === 'saving' ? 'Saving…' : exportStatus === 'done' ? 'Saved ✓' : 'Export All'}
          </button>
          <button
            onClick={onClear}
            title="Clear all generated posts"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid rgba(255,77,77,0.25)', background: 'transparent',
              color: 'rgba(255,100,100,0.7)', cursor: 'pointer',
              transition: 'all .15s',
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.background = 'rgba(255,77,77,0.08)'
              b.style.color = 'var(--red, #ff4444)'
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.background = 'transparent'
              b.style.color = 'rgba(255,100,100,0.7)'
            }}>
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      )}

      {/* Post cards */}
      {posts.length > 0 && (() => {
        // Build card data once, reuse for both thumbnails and detail panel
        const cardPosts = posts.map(post => {
          const cardStatus: import('../../components/post-card/types').PostStatus =
            post.status === 'done'    ? 'complete'    :
            post.status === 'pending' ? 'waiting'     :
            post.status as 'generating' | 'streaming' | 'error'

          // Pass the full content dict through — PostContent renders all schema fields generically
          const cardContent = post.content
            ? (post.content as Record<string, string>)
            : undefined

          // Resolve generated image URL for this post (keyed by post_id)
          const generatedImageUrl = post.post_id
            ? generatedImages?.get(post.post_id)
            : undefined

          return { ...post, cardStatus, cardContent, generatedImageUrl }
        })

        const expandedPost = expandedIdx !== null
          ? cardPosts.find(p => p.index === expandedIdx)
          : null

        return (
          <>
            {/* Thumbnail row */}
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
              {cardPosts.map(post => (
                <PostCard
                  key={post.index}
                  post={{
                    index:             post.index,
                    angle:             post.angle ?? undefined,
                    topic:             post.topic,
                    status:            post.cardStatus,
                    streamText:        post.streamText,
                    sourceCount:       post.sourceCount,
                    content:           post.cardContent,
                    sources:           post.sources,
                    post_id:           post.post_id ?? undefined,
                    error:             post.error ?? undefined,
                    generatedImageUrl: post.generatedImageUrl,
                  }}
                  isExpanded={expandedIdx === post.index}
                  onExpand={(idx) => setExpandedIdx(idx)}
                  onDelete={() => onDelete(post.index)}
                />
              ))}
            </div>

            {/* Single shared detail panel — always below the card row */}
            {expandedPost && (() => {
              const rawContent = expandedPost.content as Record<string, string> | null
              // Find any image prompt key to use for "Send to Browser"
              const imagePromptKey = rawContent
                ? Object.keys(rawContent).find(k => k.startsWith('image_prompt') || k.endsWith('_prompt'))
                : undefined
              const imagePromptVal = imagePromptKey && rawContent ? rawContent[imagePromptKey] : undefined

              return (
                <>
                  <PostDetailPanel
                    post={{
                      index:       expandedPost.index,
                      angle:       expandedPost.angle ?? undefined,
                      topic:       expandedPost.topic,
                      status:      expandedPost.cardStatus,
                      content:     expandedPost.cardContent,
                      sources:     expandedPost.sources,
                      post_id:     expandedPost.post_id ?? undefined,
                    }}
                    onApplyContent={(data) =>
                      onSendOne({
                        id: expandedPost.post_id || Date.now().toString(),
                        title: data.title,
                        caption: data.caption,
                        highlight_words: data.highlight_words ? [data.highlight_words] : [],
                        created_at: new Date().toISOString(),
                        // Pass all fields: data.fields has the full content, rawContent is fallback
                        fields: data.fields ?? rawContent ?? undefined,
                      })
                    }
                    onEdit={() => onEdit(expandedPost.index)}
                    onDelete={() => { onDelete(expandedPost.index); setExpandedIdx(null) }}
                    onClose={() => setExpandedIdx(null)}
                  />
                  {/* Send to Browser — dispatches any image prompt key for AI image generation */}
                  {imagePromptVal && (
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('elite-inject-prompt', {
                            detail: {
                              postId: expandedPost.post_id || expandedPost.id,
                              prompt: imagePromptVal,
                              title:  rawContent?.title || 'Post',
                            },
                          }))
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: '1px solid rgba(68,136,255,0.4)',
                          background: 'rgba(68,136,255,0.08)',
                          color: '#4488ff', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>
                        <Globe size={12} /> Send to Browser
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )
      })()}
    </>
  )
}
