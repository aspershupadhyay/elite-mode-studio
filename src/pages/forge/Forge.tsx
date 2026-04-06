/**
 * Forge.tsx — Unified AI Content Generation
 *
 * One page, no mode tabs:
 *  - Platform picker at the top
 *  - Topic input → Forge button → single post
 *  - Campaign row → Generate Series → SSE streaming batch
 *  - Persona badge + freshness visible at a glance
 *  - All schema/generation settings live in Settings → Schemas
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import PageShell from '../../components/PageShell'
import PostEditorModal from '../../components/PostEditorModal'
import { apiFetch, apiPost, apiStream } from '../../api'
import { getTemplates } from '../../studio/data/templateStorage'
import { getActiveProfile, getProfiles, setActiveProfile } from '../../utils/profileStorage'
import {
  Instagram, Twitter, Linkedin, Lock,
  TrendingUp, RefreshCw, Layers, StopCircle,
  Calendar, Zap, LayoutTemplate,
} from 'lucide-react'
import type { Post, Template } from '@/types/domain'
import { type OutSettings } from './PostResultsList'
import BatchStream, { type StreamPost, type CampaignBriefData } from './BatchStream'

// ── Static data ───────────────────────────────────────────────────────────────

interface PlatformDef {
  id: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  active: boolean
}

const PLATFORMS: PlatformDef[] = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, active: true  },
  { id: 'twitter',   label: 'Twitter/X', icon: Twitter,   active: false },
  { id: 'linkedin',  label: 'LinkedIn',  icon: Linkedin,  active: false },
]

const CATEGORIES_FALLBACK = [
  'AI & TECH',
  'AUTOMOTIVE',
  'BEAUTY & FASHION',
  'BUSINESS',
  'CLIMATE',
  'CREATOR ECONOMY',
  'CRYPTO',
  'CULTURE & ENTERTAINMENT',
  'DEFENSE',
  'EDUCATION',
  'FINANCE',
  'FITNESS & HEALTH',
  'FOOD & BEVERAGE',
  'GAMING',
  'GEOPOLITICS',
  'MOTIVATION & MINDSET',
  'MUSIC',
  'REAL ESTATE',
  'SCIENCE & SPACE',
  'SPORTS',
  'STARTUPS & VC',
  'TRAVEL & LIFESTYLE',
]

const FRESH_LABELS: Record<string, string> = {
  today:  'Today only',
  '2days':'Last 2 days',
  '7days':'Last 7 days',
  any:    'No filter',
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function getOutSettings(): OutSettings {
  // Legacy: kept for BatchStream compatibility — reads from active profile now
  const p = getActiveProfile()
  return {
    include_9x16:        false,
    include_hook:        false,
    include_category:    false,
    freshness:           p.searchFreshness || '2days',
    persona:             'journalist',
    tone:                p.tone || 'analytical',
    platform_target:     'instagram',
    caption_length:      'medium',
    custom_instructions: p.customInstructions || '',
    title_min_length:    60,
    title_max_length:    110,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a fully-typed Post from a completed StreamPost.
 * Populates both flat fields (title/caption/highlight_words) for backward-compat
 * and the schema-aware fields dict so content-apply can read either path.
 */
function streamPostToPost(p: import('./BatchStream').StreamPost): Post {
  const c = (p.content || {}) as Record<string, string>
  // All AI output keys land in fields — no hardcoded field assumptions.
  // title/caption/highlight_words are populated only if the profile actually defined them.
  return {
    id:              p.post_id || Date.now().toString(),
    created_at:      new Date().toISOString(),
    title:           c.title    || '',
    caption:         c.caption  || '',
    highlight_words: c.highlight_words ? [c.highlight_words] : [],
    angle:           p.angle    || undefined,
    status:          'pending',
    fields:          Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, String(v)])
    ),
  }
}

// ── Shapes ────────────────────────────────────────────────────────────────────

interface RetryApiResult {
  content?: Record<string, string> | null
  sources?: Array<{ title: string; url?: string }>
  post_id?: string | null
}

interface TrendingTopic { title: string; snippet?: string; url?: string }

export interface ForgeProps {
  onSendToStudio:  (post: Post) => void
  onBatchToStudio: (posts: Post[], templateJSON?: string) => void
  /** postId → file:// image URL, updated as images finish generating */
  generatedImages?: Map<string, string>
  /** postIds currently being processed in the ChatGPT image gen pipeline */
  imageGenQueue?: Set<string>
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function Forge({ onSendToStudio, onBatchToStudio, generatedImages, imageGenQueue }: ForgeProps): React.ReactElement {

  // ── Shared ──────────────────────────────────────────────────────────────────
  const [platform,       setPlatform]       = useState<string>('instagram')
  const [outSettings,    setOutSettings]    = useState<ReturnType<typeof getOutSettings>>(getOutSettings)
  const [activeProfile,  setActiveProfileState] = useState(() => getActiveProfile())
  const [allProfiles,    setAllProfiles]    = useState(() => getProfiles())

  // ── Single-post state ────────────────────────────────────────────────────────
  const [topic,        setTopic]        = useState<string>('')
  const [trendLoading, setTrendLoading] = useState<boolean>(false)
  const [trending,     setTrending]     = useState<TrendingTopic[]>([])
  const [showTrending, setShowTrending] = useState<boolean>(false)
  const [trendError,   setTrendError]   = useState<string>('')
  const [trendCat,     setTrendCat]     = useState<string>('GEOPOLITICS')

  // ── Categories (from backend, with fallback) ─────────────────────────────
  const [categories, setCategories] = useState<string[]>(CATEGORIES_FALLBACK)

  useEffect(() => {
    apiFetch<{ categories: string[] }>('/api/trending/categories').then(({ data }) => {
      if (data?.categories?.length) setCategories(data.categories)
    })
  }, [])

  // ── Campaign state ────────────────────────────────────────────────────────
  const [templates,     setTemplates]     = useState<Template[]>([])
  const [selectedTmpl,  setSelectedTmpl]  = useState<string>(
    () => localStorage.getItem('lab_default_template') || ''
  )
  const [campaignCat,   setCampaignCat]   = useState<string>('GEOPOLITICS')
  const [campaignCount, setCampaignCount] = useState<string>('3')
  const [streamActive,  setStreamActive]  = useState<boolean>(false)
  const [elapsedMs,     setElapsedMs]     = useState<number>(0)
  const timerStartRef   = useRef<number | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [campaignError, setCampaignError] = useState<string>('')
  const [campaignBrief, setCampaignBrief] = useState<CampaignBriefData | null>(null)
  const [streamPosts,   setStreamPosts]   = useState<StreamPost[]>([])
  const [editingIndex,  setEditingIndex]  = useState<number | null>(null)
  const [exportStatus,  setExportStatus]  = useState<'' | 'saving' | 'done' | 'error'>('')
  const [sentToStudio,  setSentToStudio]  = useState<boolean>(false)
  const abortRef        = useRef<(() => void) | null>(null)
  const streamPostsRef  = useRef<StreamPost[]>([])
  const templatesRef    = useRef<Template[]>(templates)
  const selectedTmplRef = useRef<string>(selectedTmpl)
  useEffect(() => { streamPostsRef.current  = streamPosts  }, [streamPosts])
  useEffect(() => { templatesRef.current    = templates    }, [templates])
  useEffect(() => { selectedTmplRef.current = selectedTmpl }, [selectedTmpl])

  // Elapsed timer — counts up while streaming
  useEffect(() => {
    if (streamActive) {
      timerStartRef.current = Date.now()
      setElapsedMs(0)
      timerIntervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (timerStartRef.current ?? Date.now()))
      }, 100)
    } else {
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [streamActive])

  // Sync when profile changes
  useEffect(() => {
    const handler = (): void => {
      setOutSettings(getOutSettings())
      setActiveProfileState(getActiveProfile())
      setAllProfiles(getProfiles())
    }
    window.addEventListener('storageChange', handler)
    window.addEventListener('profilesChange', handler)
    return (): void => {
      window.removeEventListener('storageChange', handler)
      window.removeEventListener('profilesChange', handler)
    }
  }, [])

  const refreshTemplates = useCallback(async (): Promise<void> => {
    const saved: Template[] = await (getTemplates() as Promise<Template[]>).catch(() => [])
    setTemplates(saved)
    setSelectedTmpl(prev => {
      if (!prev) return saved[0]?.id || ''
      return saved.find(t => t.id === prev) ? prev : (saved[0]?.id || '')
    })
  }, [])

  useEffect(() => {
    refreshTemplates()
    const handler = (): void => { void refreshTemplates() }
    window.addEventListener('storageChange', handler)
    window.addEventListener('templatesChange', handler)
    return (): void => {
      window.removeEventListener('storageChange', handler)
      window.removeEventListener('templatesChange', handler)
    }
  }, [refreshTemplates])

  // ── Build API params from the active profile ─────────────────────────────
  function buildProfileParams(userTopic?: string): Record<string, unknown> {
    const profile = getActiveProfile()
    return {
      system_prompt:       profile.systemPrompt,
      output_fields:       profile.outputFields,
      tone:                profile.tone,
      language:            profile.language,
      post_count:          profile.postCount,
      search_enabled:      profile.searchEnabled,
      freshness:           profile.searchFreshness || '2days',
      search_mode:         profile.searchMode ?? ((profile.searchFreshness === 'any') ? 'general' : 'news'),
      custom_instructions: profile.customInstructions,
      title_min_length:    profile.titleMinLength ?? 60,
      title_max_length:    profile.titleMaxLength ?? 110,
      ...(userTopic?.trim() ? { topic: userTopic.trim() } : {}),
    }
  }

  // ── Single/multi generate (user-provided topic) ───────────────────────────
  async function handleSingleForge(): Promise<void> {
    if (!topic.trim() || streamActive) return
    const trimmed = topic.trim()
    const count = Math.max(1, parseInt(campaignCount) || 1)
    const params = buildProfileParams(trimmed)
    setCampaignError('')
    setCampaignBrief(null)
    setExportStatus('')
    setSentToStudio(false)
    setStreamActive(true)
    setStreamPosts(Array.from({ length: count }, (_, i) => ({
      id: `placeholder_${i}`, status: 'pending' as const, index: i,
      angle: null, topic: trimmed, streamText: '', sourceCount: 0,
      content: null, sources: [], post_id: null, error: null,
    })))

    try {
      const stream = await apiStream('/api/content/stream', {
        ...params,
        category: campaignCat,
        count,
        topics: [trimmed],
      })
      abortRef.current = stream.abort
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await stream.reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try { dispatchSSEEvent(JSON.parse(line.slice(6)) as Record<string, unknown>) } catch { /* skip */ }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setCampaignError(e.message || 'Stream failed')
    } finally {
      abortRef.current = null
      setStreamActive(false)
    }
  }

  // ── Trending fetch ────────────────────────────────────────────────────────
  function handleFetchTrending(): void {
    const { freshness } = getOutSettings()
    setTrending([])
    setTrendError('')
    setTrendLoading(true)
    apiPost('/api/trending', { category: trendCat, freshness }).then(({ data, error }) => {
      setTrendLoading(false)
      if (error) { setTrendError(error); return }
      const t = (data as { topics?: TrendingTopic[] })?.topics
      if (t?.length) { setTrending(t); setShowTrending(true) }
      else setTrendError(`No trending topics found for '${trendCat}'. Try a different category.`)
    })
  }

  // ── Campaign SSE ──────────────────────────────────────────────────────────
  const dispatchSSEEvent = useCallback((event: Record<string, unknown>): void => {
    switch (event.type) {
      case 'campaign_brief':
        setCampaignBrief(event as unknown as CampaignBriefData)
        setStreamPosts(prev => prev.map((p, i) => ({
          ...p,
          angle: (event.assignments as Array<{ angle: string }>)?.[i]?.angle ?? p.angle,
          topic: (event.topics   as Array<{ title: string }>)?.[i]?.title   ?? p.topic,
        })))
        break
      case 'post_started':
        setStreamPosts(prev => prev.map(p =>
          p.index === (event.post_index as number)
            ? { ...p, status: 'generating' as const, angle: event.angle as string, topic: event.topic as string }
            : p
        ))
        break
      case 'web_fetched':
        setStreamPosts(prev => prev.map(p =>
          p.index === (event.post_index as number) ? { ...p, sourceCount: event.source_count as number } : p
        ))
        break
      case 'post_chunk':
        setStreamPosts(prev => prev.map(p =>
          p.index === (event.post_index as number)
            ? { ...p, status: 'streaming' as const, streamText: (p.streamText || '') + (event.text as string) }
            : p
        ))
        break
      case 'post_completed':
        setStreamPosts(prev => prev.map(p =>
          p.index === (event.post_index as number)
            ? { ...p, status: 'done' as const,
                content: event.content as Record<string, string>,
                sources: (event.sources as Array<{ title: string; url?: string }>) || [],
                post_id: event.post_id as string, freshness: event.freshness as string, streamText: '' }
            : p
        ))
        break
      case 'post_error':
        if ((event.post_index as number) < 0) {
          // Fatal batch-level error — clear stuck placeholder posts and show error
          setCampaignError(event.error as string)
          setStreamPosts([])
        } else {
          setStreamPosts(prev => prev.map(p =>
            p.index === (event.post_index as number) ? { ...p, status: 'error' as const, error: event.error as string } : p
          ))
        }
        break
      case 'batch_done':
        setStreamActive(false)
        setTimeout(() => {
          const completed = streamPostsRef.current.filter(p => p.status === 'done' && p.content)
          if (!completed.length) return
          const tmpl = templatesRef.current.find(t => t.id === selectedTmplRef.current) || templatesRef.current[0] || null
          onBatchToStudio(completed.map(streamPostToPost), tmpl?.canvas_json)
          setSentToStudio(true)
        }, 400)
        break
      default: break
    }
  }, [onBatchToStudio])

  async function runCampaign(): Promise<void> {
    if (streamActive) return
    const count = Math.max(1, parseInt(campaignCount) || 1)
    const params = buildProfileParams()
    setCampaignError('')
    setTrendError('')
    setCampaignBrief(null)
    setExportStatus('')
    setSentToStudio(false)
    setStreamActive(true)
    setStreamPosts(Array.from({ length: count }, (_, i) => ({
      id: `placeholder_${i}`, status: 'pending' as const, index: i,
      angle: null, topic: '', streamText: '', sourceCount: 0,
      content: null, sources: [], post_id: null, error: null,
    })))

    try {
      const stream = await apiStream('/api/content/stream', {
        ...params,
        category: campaignCat,
        count,
      })
      abortRef.current = stream.abort
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await stream.reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try { dispatchSSEEvent(JSON.parse(line.slice(6)) as Record<string, unknown>) } catch { /* skip */ }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setCampaignError(e.message || 'Stream failed')
    } finally {
      abortRef.current = null
      setStreamActive(false)
    }
  }

  function stopCampaign(): void {
    if (abortRef.current) { abortRef.current(); abortRef.current = null }
    setStreamActive(false)
  }

  async function retryPost(index: number): Promise<void> {
    const post = streamPosts[index]
    if (!post) return
    const params = buildProfileParams(post.topic)
    setStreamPosts(prev => prev.map(p => p.index === index ? { ...p, status: 'generating', error: null, streamText: '' } : p))
    const { data, error: err } = await apiPost<RetryApiResult>('/api/content/generate', { topic: post.topic, ...params })
    if (err) setStreamPosts(prev => prev.map(p => p.index === index ? { ...p, status: 'error', error: err } : p))
    else if (data) setStreamPosts(prev => prev.map(p =>
      p.index === index ? { ...p, status: 'done' as const, content: data.content ?? null, sources: data.sources ?? [], post_id: data.post_id ?? null } : p
    ))
  }

  function deletePost(index: number): void {
    setStreamPosts(prev => prev.filter(p => p.index !== index).map((p, i) => ({ ...p, index: i })))
  }

  async function handleExportPNGs(): Promise<void> {
    const completed = streamPosts.filter(p => p.status === 'done')
    if (!completed.length) return
    const api = (window as typeof window & { api?: { savePngBatch?: (files: Array<{ filename: string; base64: string }>) => Promise<{ canceled: boolean }> } }).api
    if (!api?.savePngBatch) { setExportStatus('error'); setCampaignError('PNG export requires the Electron desktop app.'); return }
    setExportStatus('saving'); setCampaignError('')
    try {
      const files = completed.map(p => {
        const c = (p.content || {}) as Record<string, string>
        const text = [`TITLE: ${c.title || ''}`, `HIGHLIGHT WORDS: ${c.highlight_words || ''}`, `CAPTION:\n${c.caption || ''}`, `IMAGE PROMPT 16x9:\n${c.image_prompt_16x9 || ''}`].join('\n\n')
        const safeName = (c.title || `post_${p.index + 1}`).slice(0, 40).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')
        return { filename: `post_${p.index + 1}_${safeName}.txt`, base64: btoa(unescape(encodeURIComponent(text))) }
      })
      const result = await api.savePngBatch(files)
      if (result.canceled) setExportStatus('')
      else { setExportStatus('done'); setTimeout(() => setExportStatus(''), 3000) }
    } catch (e) { setExportStatus('error'); if (e instanceof Error) setCampaignError(`Export failed: ${e.message}`) }
  }

  function handleSendAll(): void {
    const completed = streamPosts.filter(p => p.status === 'done' && p.content)
    if (!completed.length) return
    const tmpl = templates.find(t => t.id === selectedTmpl) || templates[0] || null
    onBatchToStudio(completed.map(streamPostToPost), tmpl?.canvas_json)
    setSentToStudio(true)
  }

  const completedCount = streamPosts.filter(p => p.status === 'done').length
  const errorCount     = streamPosts.filter(p => p.status === 'error').length

  // ── Mode: 'post' or 'series' ─────────────────────────────────────────────
  const [mode, setMode] = useState<'post' | 'series'>('post')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell title="Forge" subtitle="AI Content Generator">
      <div style={{ maxWidth: 720 }}>

        {/* ── Platform tabs ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {PLATFORMS.map(({ id, label, icon: Icon, active }) => {
            const isSelected = platform === id && active
            return (
              <button
                key={id}
                onClick={() => active && setPlatform(id)}
                disabled={!active}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: isSelected ? 600 : 400,
                  transition: 'all .15s', cursor: active ? 'pointer' : 'default',
                  border: isSelected ? '1.5px solid var(--accent)' : '1.5px solid var(--border-default)',
                  background: isSelected ? 'var(--accent-dim)' : 'transparent',
                  color: isSelected ? 'var(--accent)' : active ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                }}
              >
                <Icon size={13} />
                {label}
                {!active && (
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 2, fontWeight: 400 }}>
                    <Lock size={8} /> soon
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Profile row ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <select
            value={activeProfile.id}
            onChange={e => {
              setActiveProfile(e.target.value)
              setActiveProfileState(getActiveProfile())
              setAllProfiles(getProfiles())
            }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
              background: 'var(--accent-dim)', border: '1.5px solid var(--accent-border)',
              color: 'var(--accent)', cursor: 'pointer', outline: 'none',
            }}
          >
            {allProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {activeProfile.tone && (
            <span style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 500,
              background: 'var(--surface-3)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', textTransform: 'capitalize',
            }}>
              {activeProfile.tone}
            </span>
          )}

          {activeProfile.searchEnabled && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 12px', borderRadius: 999, fontSize: 11,
              background: 'var(--surface-3)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-tertiary)',
            }}>
              <Calendar size={10} />
              {FRESH_LABELS[activeProfile.searchFreshness ?? '2days'] || activeProfile.searchFreshness}
            </span>
          )}

          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            {activeProfile.outputFields.filter(f => f.enabled).length} fields
          </span>
        </div>

        {/* ── Mode segmented control ──────────────────────────────────────── */}
        <div style={{
          display: 'inline-flex', gap: 2, padding: 3,
          borderRadius: 12, background: 'var(--surface-3)',
          border: '1px solid var(--border-subtle)', marginBottom: 20,
        }}>
          {(['post', 'series'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '6px 18px', borderRadius: 9, fontSize: 12, fontWeight: mode === m ? 600 : 400,
                border: 'none', cursor: 'pointer', transition: 'all .12s',
                background: mode === m ? 'var(--surface-1)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              {m === 'post' ? 'Single Post' : 'Campaign Series'}
            </button>
          ))}
        </div>

        {/* ── Main input card ─────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border-default)',
          borderRadius: 16, padding: '20px 22px', marginBottom: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>

          {mode === 'post' ? (
            /* ── Single post mode ── */
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
                Topic
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !streamActive && topic.trim() && handleSingleForge()}
                  placeholder="What do you want to post about?"
                  autoFocus
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12,
                    border: '1.5px solid var(--border-default)',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                    transition: 'border-color .12s',
                    fontFamily: 'var(--font-ui)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
                />
                {streamActive
                  ? (
                    <button onClick={stopCampaign} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '12px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                      border: '1.5px solid rgba(239,68,68,0.4)', background: 'transparent',
                      color: 'var(--status-red)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      <StopCircle size={14} /> Stop
                    </button>
                  )
                  : (
                    <button
                      onClick={handleSingleForge}
                      disabled={!topic.trim()}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '12px 24px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                        border: 'none', cursor: topic.trim() ? 'pointer' : 'not-allowed',
                        background: topic.trim() ? 'var(--accent)' : 'var(--surface-4)',
                        color: topic.trim() ? 'var(--accent-fg)' : 'var(--text-tertiary)',
                        transition: 'all .15s', whiteSpace: 'nowrap',
                        boxShadow: topic.trim() ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
                      }}>
                      <Zap size={14} /> Forge Post
                    </button>
                  )
                }
              </div>

              {/* Trending row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={trendCat} onChange={e => setTrendCat(e.target.value)}
                  style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 11,
                    border: '1px solid var(--border-subtle)', background: 'var(--surface-3)',
                    color: 'var(--text-secondary)', outline: 'none',
                  }}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={handleFetchTrending} disabled={trendLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 8, fontSize: 11,
                    cursor: trendLoading ? 'default' : 'pointer',
                    border: '1px solid var(--border-subtle)', background: 'transparent',
                    color: trendLoading ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                    transition: 'all .12s',
                  }}>
                  <RefreshCw size={10} style={trendLoading ? { animation: 'spin 1s linear infinite' } : {}} />
                  <TrendingUp size={10} style={{ color: 'var(--accent)' }} />
                  {trendLoading ? 'Fetching...' : 'Trending topics'}
                </button>
              </div>
            </div>
          ) : (
            /* ── Campaign series mode ── */
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 16px' }}>
                Campaign Settings
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, marginBottom: 16, alignItems: 'end' }}>
                {/* Category */}
                <div>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '0 0 5px', fontWeight: 500 }}>Category</p>
                  <select value={campaignCat} onChange={e => setCampaignCat(e.target.value)}
                    disabled={streamActive}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 10,
                      border: '1.5px solid var(--border-default)', background: 'var(--surface-3)',
                      color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                    }}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Count */}
                <div>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '0 0 5px', fontWeight: 500 }}>Posts</p>
                  <input
                    type="number" min={1} max={20}
                    value={campaignCount}
                    disabled={streamActive}
                    onChange={e => setCampaignCount(e.target.value)}
                    onBlur={e => { const v = parseInt(e.target.value); setCampaignCount(String(isNaN(v) || v < 1 ? 1 : Math.min(v, 20))) }}
                    style={{
                      width: 72, padding: '9px 10px', borderRadius: 10, textAlign: 'center',
                      border: '1.5px solid var(--border-default)', background: 'var(--surface-3)',
                      color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                    }}
                  />
                </div>

                {/* Template */}
                <div>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '0 0 5px', fontWeight: 500 }}>Template</p>
                  <select
                    value={selectedTmpl}
                    onChange={e => setSelectedTmpl(e.target.value)}
                    disabled={streamActive || templates.length === 0}
                    style={{
                      padding: '9px 12px', borderRadius: 10,
                      border: '1.5px solid var(--border-default)', background: 'var(--surface-3)',
                      color: templates.length === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      fontSize: 12, maxWidth: 180, outline: 'none',
                    }}>
                    {templates.length === 0
                      ? <option value="">No templates yet</option>
                      : templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                    }
                  </select>
                </div>
              </div>

              {/* Trending + Generate row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={handleFetchTrending} disabled={trendLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 14px', borderRadius: 8, fontSize: 11,
                    cursor: trendLoading ? 'default' : 'pointer',
                    border: '1px solid var(--border-subtle)', background: 'transparent',
                    color: trendLoading ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  }}>
                  <RefreshCw size={10} style={trendLoading ? { animation: 'spin 1s linear infinite' } : {}} />
                  <TrendingUp size={10} style={{ color: 'var(--accent)' }} />
                  {trendLoading ? 'Fetching...' : 'Trending topics'}
                </button>

                <div style={{ marginLeft: 'auto' }}>
                  {streamActive
                    ? (
                      <button onClick={stopCampaign} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                        border: '1.5px solid rgba(239,68,68,0.4)', background: 'transparent',
                        color: 'var(--status-red)', cursor: 'pointer',
                      }}>
                        <StopCircle size={14} /> Stop
                      </button>
                    )
                    : (
                      <button onClick={runCampaign} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '10px 24px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        background: 'var(--accent)', color: 'var(--accent-fg)',
                        transition: 'all .15s',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                      }}>
                        <Layers size={14} /> Generate Series
                      </button>
                    )
                  }
                </div>
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
                Generating {campaignCount} posts on trending {campaignCat} topics
              </p>
            </div>
          )}

          {/* Trending topics list */}
          {showTrending && trending.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Trending Now</p>
              {trending.map((t, i) => (
                <div key={i}
                  onClick={() => { setTopic(t.title); setShowTrending(false); setMode('post') }}
                  style={{
                    padding: '9px 14px', borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer', background: 'var(--surface-3)', transition: 'all .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                >
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t.title}</p>
                  {t.snippet && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '3px 0 0' }}>{t.snippet}</p>}
                </div>
              ))}
            </div>
          )}

          {trendError && !showTrending && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, fontStyle: 'italic' }}>{trendError}</p>
          )}
        </div>

        {/* ── Errors ─────────────────────────────────────────────────────── */}
        {campaignError && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.20)',
            fontSize: 13, color: 'var(--status-red)', marginBottom: 16, lineHeight: 1.6,
          }}>
            {campaignError}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────────────────── */}
        {(streamPosts.length > 0 || streamActive) && (
          <BatchStream
            campaign={campaignBrief}
            posts={streamPosts}
            sentToStudio={sentToStudio}
            exportStatus={exportStatus}
            streamActive={streamActive}
            elapsedMs={elapsedMs}
            completedCount={completedCount}
            errorCount={errorCount}
            generatedImages={generatedImages}
            imageGenQueue={imageGenQueue}
            onSendAll={handleSendAll}
            onSendOne={(post) => {
              const tmpl = templates.find(t => t.id === selectedTmpl) || templates[0]
              onBatchToStudio([post], tmpl?.canvas_json)
            }}
            onEdit={setEditingIndex}
            onDelete={deletePost}
            onExport={handleExportPNGs}
            onClear={() => { setStreamPosts([]); setCampaignBrief(null); setCampaignError(''); setExportStatus(''); setSentToStudio(false) }}
          />
        )}

      </div>

      {editingIndex !== null && streamPosts[editingIndex] && (
        <PostEditorModal
          post={{ ...streamPosts[editingIndex], content: streamPosts[editingIndex].content as import('../../components/PostEditorModal').EditableContent | undefined }}
          onSave={(updatedContent: import('../../components/PostEditorModal').EditableContent) => {
            setStreamPosts(prev => prev.map(p =>
              p.index === editingIndex ? { ...p, content: updatedContent as Record<string, string> } : p
            ))
          }}
          onClose={() => setEditingIndex(null)}
        />
      )}

    </PageShell>
  )
}
