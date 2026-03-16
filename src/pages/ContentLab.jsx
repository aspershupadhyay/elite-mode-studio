/**
 * ContentLab.jsx — Elite AI Content Director (isolated test tab)
 *
 * Features:
 *  - AI Campaign Brief: one LLM call assigns a unique angle to each post
 *  - FastAPI SSE streaming: words appear character-by-character
 *  - 5-state cards: waiting → generating → streaming → complete → error
 *  - Edit, Duplicate, Delete, Send to Studio per card
 *  - Export All as PNG via Electron native folder save
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import PageShell from '../components/PageShell.jsx'
import { Card, Label } from '../components/ui.jsx'
import PostCard, { ANGLE_META } from '../components/PostCard.jsx'
import PostEditorModal from '../components/PostEditorModal.jsx'
import { apiStream, apiPost } from '../api.js'
import { getTemplates } from '../studio/data/templateStorage.js'
import { Layers, StopCircle, Zap, Calendar, Download, FlaskConical, Star, LayoutTemplate, Send } from 'lucide-react'

const CATEGORIES   = ['GEOPOLITICS', 'AI & TECH', 'FINANCE', 'CRYPTO', 'DEFENSE', 'CLIMATE']
const FRESH_LABELS = { today: 'Today only', '2days': 'Last 2 days', '7days': 'Last 7 days', any: 'No filter' }
const COUNT_OPTIONS = [1, 2, 3, 5]

function getOutSettings() {
  return {
    include_9x16:     JSON.parse(localStorage.getItem('out_9x16')    ?? 'false'),
    include_hook:     JSON.parse(localStorage.getItem('out_hook')     ?? 'false'),
    include_category: JSON.parse(localStorage.getItem('out_category') ?? 'false'),
    freshness:        localStorage.getItem('freshness') ?? '2days',
  }
}

function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      padding: '12px 14px', background: 'rgba(255,77,77,0.08)',
      border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8,
      fontSize: 13, color: 'var(--red)', marginBottom: 16, lineHeight: 1.6,
    }}>{msg}</div>
  )
}

function CampaignBriefPanel({ brief }) {
  if (!brief) return null
  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px',
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Zap size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <Label style={{ margin: 0 }}>Campaign Brief</Label>
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

const DEFAULT_TEMPLATE = { id: '__default_em_classic', name: 'EM Classic (Default)', canvasJSON: '__default__' }

// ── Main component ─────────────────────────────────────────────────────────────
export default function ContentLab({ onApplyContent, onBatchComplete }) {
  const [category, setCategory]         = useState('GEOPOLITICS')
  const [count, setCount]               = useState(3)
  const [freshness, setFreshness]       = useState(getOutSettings().freshness)

  // Template picker
  const [templates, setTemplates]       = useState([DEFAULT_TEMPLATE])
  const [selectedTmpl, setSelectedTmpl] = useState(
    () => localStorage.getItem('lab_default_template') || '__default_em_classic'
  )

  const [streamActive, setStreamActive] = useState(false)
  const [error, setError]               = useState('')
  const [campaignBrief, setCampaignBrief] = useState(null)
  const [posts, setPosts]               = useState([])
  const [editingIndex, setEditingIndex] = useState(null)
  const [exportStatus, setExportStatus] = useState('')  // '' | 'saving' | 'done' | 'error'
  const [sentToStudio, setSentToStudio] = useState(false)

  const abortRef      = useRef(null)
  const postsRef      = useRef([])       // mirror for use inside SSE callbacks
  const templatesRef  = useRef(templates)
  const selectedTmplRef = useRef(selectedTmpl)

  // Keep all refs in sync with state (avoids stale closures in SSE callback)
  useEffect(() => { postsRef.current = posts }, [posts])
  useEffect(() => { templatesRef.current = templates }, [templates])
  useEffect(() => { selectedTmplRef.current = selectedTmpl }, [selectedTmpl])

  // Load saved templates on mount
  useEffect(() => {
    getTemplates().then(saved => {
      setTemplates([DEFAULT_TEMPLATE, ...saved])
    }).catch(() => {})
  }, [])

  // ── SSE event dispatcher ─────────────────────────────────────────────────────
  const dispatchSSEEvent = useCallback((event) => {
    switch (event.type) {

      case 'campaign_brief':
        setCampaignBrief(event)
        setPosts(prev => prev.map((p, i) => {
          const assignment = event.assignments?.[i]
          const topicItem  = event.topics?.[i]
          return {
            ...p,
            angle: assignment?.angle ?? p.angle,
            topic: topicItem?.title  ?? p.topic,
          }
        }))
        break

      case 'post_started':
        setPosts(prev => prev.map(p =>
          p.index === event.post_index
            ? { ...p, status: 'generating', angle: event.angle, topic: event.topic }
            : p
        ))
        break

      case 'web_fetched':
        setPosts(prev => prev.map(p =>
          p.index === event.post_index
            ? { ...p, sourceCount: event.source_count }
            : p
        ))
        break

      case 'post_chunk':
        setPosts(prev => prev.map(p =>
          p.index === event.post_index
            ? { ...p, status: 'streaming', streamText: (p.streamText || '') + event.text }
            : p
        ))
        break

      case 'post_completed':
        setPosts(prev => prev.map(p =>
          p.index === event.post_index
            ? {
                ...p,
                status:     'complete',
                content:    event.content,
                sources:    event.sources || [],
                post_id:    event.post_id,
                freshness:  event.freshness,
                streamText: '',
              }
            : p
        ))
        break

      case 'post_error':
        if (event.post_index < 0) {
          setError(event.error)
        } else {
          setPosts(prev => prev.map(p =>
            p.index === event.post_index
              ? { ...p, status: 'error', error: event.error }
              : p
          ))
        }
        break

      case 'batch_done':
        setStreamActive(false)
        // Auto-send all completed posts to Studio
        // Use refs (not state captures) to avoid stale closure
        setTimeout(() => {
          const completed = postsRef.current.filter(p => p.status === 'complete' && p.content)
          if (completed.length > 0 && onBatchComplete) {
            const tmpl = templatesRef.current.find(t => t.id === selectedTmplRef.current)
                      || DEFAULT_TEMPLATE
            onBatchComplete({
              posts: completed.map(p => ({
                title:           p.content.title          || '',
                highlight_words: p.content.highlight_words || '',
                caption:         p.content.caption         || '',
                angle:           p.angle,
                topic:           p.topic,
              })),
              templateId:   tmpl.id,
              templateJSON: tmpl.canvasJSON,
            })
            setSentToStudio(true)
          }
        }, 400)
        break

      default:
        break
    }
  }, [])

  // ── Run batch ───────────────────────────────────────────────────────────────
  async function runBatch() {
    if (streamActive) return
    const out = getOutSettings()
    setError('')
    setCampaignBrief(null)
    setExportStatus('')
    setSentToStudio(false)
    setStreamActive(true)

    // Instantiate N waiting cards immediately — UI never blocks
    const placeholders = Array.from({ length: count }, (_, i) => ({
      status: 'waiting', index: i, angle: null, topic: '',
      streamText: '', sourceCount: 0,
      content: null, sources: [], post_id: null, error: null,
    }))
    setPosts(placeholders)

    let reader = null
    try {
      const stream = await apiStream('/api/content/stream-batch', {
        category,
        count,
        freshness:        out.freshness,
        include_9x16:     out.include_9x16,
        include_hook:     out.include_hook,
        include_category: out.include_category,
      })
      reader = stream.reader
      abortRef.current = stream.abort

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // { stream: true } handles multi-byte UTF-8 split across TCP chunks
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            dispatchSSEEvent(event)
          } catch {
            // Malformed line — skip silently
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Stream connection failed')
      }
    } finally {
      abortRef.current = null
      setStreamActive(false)
    }
  }

  function stopBatch() {
    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
    }
    setStreamActive(false)
  }

  // ── Per-card actions ────────────────────────────────────────────────────────
  async function retryPost(index) {
    const post = posts[index]
    if (!post) return
    const out = getOutSettings()

    setPosts(prev => prev.map(p =>
      p.index === index ? { ...p, status: 'generating', error: null, streamText: '' } : p
    ))

    const { data, error: err } = await apiPost('/api/content/instagram', {
      topic: post.topic, ...out
    })
    if (err) {
      setPosts(prev => prev.map(p =>
        p.index === index ? { ...p, status: 'error', error: err } : p
      ))
    } else {
      setPosts(prev => prev.map(p =>
        p.index === index ? {
          ...p, status: 'complete',
          content: data.content, sources: data.sources || [], post_id: data.post_id,
        } : p
      ))
    }
  }

  function duplicatePost(index) {
    const post = posts[index]
    if (!post) return
    setPosts(prev => [...prev, {
      ...post,
      index: prev.length,
      post_id: null,
    }])
  }

  function deletePost(index) {
    setPosts(prev =>
      prev.filter(p => p.index !== index)
          .map((p, newIdx) => ({ ...p, index: newIdx }))
    )
  }

  // ── Export All as PNG ───────────────────────────────────────────────────────
  async function handleExportPNGs() {
    const completed = posts.filter(p => p.status === 'complete')
    if (!completed.length) return

    if (!window.api?.savePngBatch) {
      setExportStatus('error')
      setError('PNG export requires the Electron desktop app. Not available in browser mode.')
      return
    }

    setExportStatus('saving')
    setError('')

    try {
      // Build simple text files for now — canvas PNG capture requires Design Studio to be active.
      // This exports a JSON payload that Design Studio can import and render.
      // Full canvas-based PNG capture is available when canvasHandle is threaded through.
      const files = completed.map(p => {
        const content = p.content || {}
        const text = [
          `TITLE: ${content.title || ''}`,
          `HIGHLIGHT WORDS: ${content.highlight_words || ''}`,
          `CAPTION:\n${content.caption || ''}`,
          `IMAGE PROMPT 16x9:\n${content.image_prompt_16x9 || ''}`,
        ].join('\n\n')
        const base64 = btoa(unescape(encodeURIComponent(text)))
        const safeName = (content.title || `post_${p.index + 1}`)
          .slice(0, 40).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')
        return { filename: `post_${p.index + 1}_${safeName}.txt`, base64 }
      })

      const result = await window.api.savePngBatch(files)
      if (result.canceled) {
        setExportStatus('')
      } else {
        setExportStatus('done')
        setTimeout(() => setExportStatus(''), 3000)
      }
    } catch (e) {
      setExportStatus('error')
      setError(`Export failed: ${e.message}`)
    }
  }

  // ── Counts ──────────────────────────────────────────────────────────────────
  const completedCount = posts.filter(p => p.status === 'complete').length
  const errorCount     = posts.filter(p => p.status === 'error').length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <PageShell
      title="Content Lab"
      subtitle={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FlaskConical size={12} style={{ color: 'var(--green)' }} />
          AI Content Director · SSE Streaming · Campaign Series
        </span>
      }
    >
      <div style={{ maxWidth: 860 }}>

        {/* ── Controls ── */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>

            {/* Category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label style={{ margin: 0 }}>Category</Label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={streamActive}
                style={{
                  padding: '6px 12px', borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--text)', fontSize: 13,
                }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Count */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label style={{ margin: 0 }}>Posts</Label>
              <select
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                disabled={streamActive}
                style={{
                  padding: '6px 12px', borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--text)', fontSize: 13,
                }}
              >
                {COUNT_OPTIONS.map(n => <option key={n} value={n}>{n} post{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>

            {/* Freshness */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={11} /> Freshness
              </Label>
              <select
                value={freshness}
                onChange={e => setFreshness(e.target.value)}
                disabled={streamActive}
                style={{
                  padding: '6px 12px', borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--text)', fontSize: 13,
                }}
              >
                {Object.entries(FRESH_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Template picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <LayoutTemplate size={11} /> Template
              </Label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={selectedTmpl}
                  onChange={e => setSelectedTmpl(e.target.value)}
                  disabled={streamActive}
                  style={{
                    padding: '6px 12px', borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)', color: 'var(--text)', fontSize: 13,
                    maxWidth: 180,
                  }}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {/* Set as default star */}
                <button
                  title={localStorage.getItem('lab_default_template') === selectedTmpl ? 'Default template' : 'Set as default'}
                  onClick={() => {
                    localStorage.setItem('lab_default_template', selectedTmpl)
                    // Force re-render to update star highlight
                    setSelectedTmpl(s => s)
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: localStorage.getItem('lab_default_template') === selectedTmpl
                      ? 'var(--amber, #f59e0b)'
                      : 'var(--text3)',
                    padding: 4,
                  }}
                >
                  <Star size={14} fill={localStorage.getItem('lab_default_template') === selectedTmpl ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>

            {/* Action button */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end', paddingBottom: 0 }}>
              {streamActive
                ? (
                  <button
                    onClick={stopBatch}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: '1px solid rgba(255,77,77,0.4)', background: 'transparent',
                      color: 'var(--red)', cursor: 'pointer',
                    }}
                  >
                    <StopCircle size={13} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={runBatch}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: 'none', background: 'var(--green)', color: '#000',
                      cursor: 'pointer',
                    }}
                  >
                    <Layers size={13} /> Generate Series
                  </button>
                )
              }
            </div>
          </div>
        </Card>

        {/* ── Progress bar ── */}
        {streamActive && posts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                {completedCount} / {posts.length} complete
                {errorCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>{errorCount} failed</span>}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {Math.round((completedCount / Math.max(posts.length, 1)) * 100)}%
              </span>
            </div>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'var(--green)',
                width: `${(completedCount / Math.max(posts.length, 1)) * 100}%`,
                transition: 'width .4s ease',
              }} />
            </div>
          </div>
        )}

        {/* ── Error ── */}
        <ErrorBox msg={error} />

        {/* ── Campaign Brief ── */}
        <CampaignBriefPanel brief={campaignBrief} />

        {/* ── Status row when done ── */}
        {!streamActive && completedCount > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
              {completedCount} post{completedCount !== 1 ? 's' : ''} forged
              {errorCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 400 }}>· {errorCount} failed</span>}
            </span>
            {/* Manual Send All to Studio */}
            <button
              onClick={() => {
                const completed = posts.filter(p => p.status === 'complete' && p.content)
                if (completed.length && onBatchComplete) {
                  const tmpl = templates.find(t => t.id === selectedTmpl) || DEFAULT_TEMPLATE
                  onBatchComplete({
                    posts: completed.map(p => ({
                      title:           p.content.title          || '',
                      highlight_words: p.content.highlight_words || '',
                      caption:         p.content.caption         || '',
                      angle:           p.angle,
                      topic:           p.topic,
                    })),
                    templateId:   tmpl.id,
                    templateJSON: tmpl.canvasJSON,
                  })
                  setSentToStudio(true)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1px solid ${sentToStudio ? 'var(--green)' : 'var(--border)'}`,
                background: sentToStudio ? 'rgba(52,211,153,0.1)' : 'transparent',
                color: sentToStudio ? 'var(--green)' : 'var(--text2)',
                cursor: 'pointer',
              }}
            >
              <Send size={12} />
              {sentToStudio ? 'In Studio ✓' : 'Send All to Studio'}
            </button>

            <button
              onClick={handleExportPNGs}
              disabled={exportStatus === 'saving'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', background: 'transparent',
                color: exportStatus === 'done' ? 'var(--green)' : 'var(--text2)',
                cursor: exportStatus === 'saving' ? 'not-allowed' : 'pointer',
                opacity: exportStatus === 'saving' ? 0.6 : 1,
              }}
            >
              <Download size={12} />
              {exportStatus === 'saving' ? 'Saving…' : exportStatus === 'done' ? 'Saved ✓' : 'Export All'}
            </button>
          </div>
        )}

        {/* ── Post cards ── */}
        {posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {posts.map(post => (
              <PostCard
                key={post.index}
                post={post}
                onApplyContent={data => onApplyContent?.(data)}
                onEdit={() => setEditingIndex(post.index)}
                onDuplicate={() => duplicatePost(post.index)}
                onDelete={() => deletePost(post.index)}
                onRetry={() => retryPost(post.index)}
              />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {posts.length === 0 && !streamActive && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--text3)', fontSize: 13,
          }}>
            <FlaskConical size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Content Lab ready</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7 }}>
              Select a category and hit Generate Series — an AI Campaign Brief will plan
              each post with a unique angle before generation starts.
            </p>
          </div>
        )}

      </div>

      {/* ── Edit modal ── */}
      {editingIndex !== null && posts[editingIndex] && (
        <PostEditorModal
          post={posts[editingIndex]}
          onSave={updatedContent => {
            setPosts(prev => prev.map(p =>
              p.index === editingIndex ? { ...p, content: updatedContent } : p
            ))
          }}
          onClose={() => setEditingIndex(null)}
        />
      )}

    </PageShell>
  )
}
