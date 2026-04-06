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
  Instagram, Twitter, Linkedin,
  TrendingUp, RefreshCw, Layers, StopCircle,
  Calendar, Zap,
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
  { id: 'instagram', label: 'Instagram', icon: Instagram, active: true },
  { id: 'twitter',   label: 'Twitter/X', icon: Twitter,   active: true },
  { id: 'linkedin',  label: 'LinkedIn',  icon: Linkedin,  active: true },
]

interface PlatformMeta { placeholder: string; hint: string; brandColor: string }

const PLATFORM_META: Record<string, PlatformMeta> = {
  instagram: {
    placeholder: 'What story do you want to tell on Instagram?',
    hint: 'Visual-first · Hashtags · Reels-ready',
    brandColor: '#E1306C',
  },
  twitter: {
    placeholder: "What's your take? Drop the topic...",
    hint: 'Concise · Threads · Real-time engagement',
    brandColor: '#1DA1F2',
  },
  linkedin: {
    placeholder: 'Share your professional insight or industry perspective...',
    hint: 'Thought leadership · Professional network · Articles',
    brandColor: '#0077B5',
  },
}

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

  // ── Derived ──────────────────────────────────────────────────────────────
  const count       = Math.max(1, parseInt(campaignCount) || 1)
  const isSeries    = count > 1
  const meta        = PLATFORM_META[platform]
  const fieldCount  = activeProfile.outputFields.filter(f => f.enabled).length
  const canGenerate = isSeries ? true : topic.trim().length > 0

  function handleGenerate(): void {
    if (!canGenerate || streamActive) return
    if (topic.trim()) {
      handleSingleForge()
    } else {
      runCampaign()
    }
  }

  const streamingPost = streamPosts.find(p => p.status === 'streaming')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell title="Forge" subtitle="">
      <div style={{ maxWidth: 760 }}>

        {/* ── Platform tabs ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          {PLATFORMS.map(({ id, label, icon: Icon }) => {
            const pm = PLATFORM_META[id]
            const isSelected = platform === id
            return (
              <button
                key={id}
                onClick={() => setPlatform(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 20px', borderRadius: 999, fontSize: 13,
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer', transition: 'all .15s',
                  border: isSelected
                    ? `1.5px solid ${pm.brandColor}55`
                    : '1.5px solid var(--border-subtle)',
                  background: isSelected ? `${pm.brandColor}12` : 'transparent',
                  color: isSelected ? pm.brandColor : 'var(--text-secondary)',
                }}
              >
                <Icon size={14} style={{ flexShrink: 0 }} />
                {label}
              </button>
            )
          })}
        </div>

        {/* ── Config strip ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
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
            {fieldCount} fields
          </span>
        </div>

        {/* ── Composition card ────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--surface-2)',
          border: `1.5px solid ${streamActive ? 'var(--accent-border)' : 'var(--border-default)'}`,
          borderRadius: 20, padding: '22px 24px', marginBottom: 16,
          boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
          transition: 'border-color .2s',
        }}>

          {/* Platform hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: meta.brandColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {platform === 'instagram' ? 'Instagram' : platform === 'twitter' ? 'Twitter/X' : 'LinkedIn'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{meta.hint}</span>
          </div>

          {/* Topic textarea */}
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey && canGenerate && !streamActive) handleGenerate() }}
            placeholder={meta.placeholder}
            disabled={streamActive}
            rows={3}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              border: '1.5px solid var(--border-subtle)',
              background: 'var(--surface-3)',
              color: 'var(--text-primary)', fontSize: 14, resize: 'none',
              outline: 'none', lineHeight: 1.65, boxSizing: 'border-box',
              fontFamily: 'var(--font-ui)', transition: 'border-color .12s',
              opacity: streamActive ? 0.6 : 1,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
          />

          {/* Bottom action row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>

            {/* Trending category */}
            <select
              value={trendCat}
              onChange={e => setTrendCat(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 9, fontSize: 11,
                border: '1px solid var(--border-subtle)', background: 'var(--surface-3)',
                color: 'var(--text-secondary)', outline: 'none', maxWidth: 160,
              }}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <button
              onClick={handleFetchTrending}
              disabled={trendLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 9, fontSize: 11,
                cursor: trendLoading ? 'default' : 'pointer',
                border: '1px solid var(--border-subtle)', background: 'transparent',
                color: trendLoading ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                transition: 'all .12s',
              }}
            >
              <RefreshCw size={10} style={trendLoading ? { animation: 'spin 1s linear infinite' } : {}} />
              <TrendingUp size={10} style={{ color: 'var(--accent)' }} />
              {trendLoading ? 'Fetching...' : 'Trending'}
            </button>

            <div style={{ flex: 1 }} />

            {/* Posts count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {isSeries ? 'Series:' : 'Posts:'}
              </span>
              <input
                type="number" min={1} max={20}
                value={campaignCount}
                disabled={streamActive}
                onChange={e => setCampaignCount(e.target.value)}
                onBlur={e => { const v = parseInt(e.target.value); setCampaignCount(String(isNaN(v) || v < 1 ? 1 : Math.min(v, 20))) }}
                style={{
                  width: 52, padding: '5px 8px', borderRadius: 8, textAlign: 'center',
                  border: '1px solid var(--border-subtle)', background: 'var(--surface-3)',
                  color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                }}
              />
            </div>

            {/* Template — only when series */}
            {isSeries && (
              <select
                value={selectedTmpl}
                onChange={e => setSelectedTmpl(e.target.value)}
                disabled={streamActive || templates.length === 0}
                style={{
                  padding: '6px 10px', borderRadius: 9, fontSize: 11,
                  border: '1px solid var(--border-subtle)', background: 'var(--surface-3)',
                  color: templates.length === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  outline: 'none', maxWidth: 160,
                }}
              >
                {templates.length === 0
                  ? <option value="">No templates</option>
                  : templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                }
              </select>
            )}

            {/* Generate / Stop */}
            {streamActive ? (
              <button
                onClick={stopCampaign}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  border: '1.5px solid rgba(239,68,68,0.35)', background: 'transparent',
                  color: 'var(--status-red)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <StopCircle size={14} /> Stop
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 22px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: canGenerate ? 'pointer' : 'not-allowed',
                  background: canGenerate ? 'var(--accent)' : 'var(--surface-4)',
                  color: canGenerate ? 'var(--accent-fg)' : 'var(--text-tertiary)',
                  transition: 'all .15s', whiteSpace: 'nowrap',
                  boxShadow: canGenerate ? '0 2px 8px rgba(201,106,66,0.30)' : 'none',
                }}
              >
                {isSeries ? <Layers size={14} /> : <Zap size={14} />}
                {isSeries ? 'Generate Series' : 'Create Post'}
              </button>
            )}
          </div>

          {/* Trending topics list */}
          {showTrending && trending.length > 0 && (
            <div style={{
              marginTop: 16, paddingTop: 16,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
                Trending Now
              </p>
              {trending.map((t, i) => (
                <div
                  key={i}
                  onClick={() => { setTopic(t.title); setShowTrending(false) }}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer', background: 'var(--surface-3)', transition: 'all .12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent-border)'
                    e.currentTarget.style.background = 'var(--accent-dim)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)'
                    e.currentTarget.style.background = 'var(--surface-3)'
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{t.title}</p>
                  {t.snippet && (
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '3px 0 0' }}>{t.snippet}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {trendError && !showTrending && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, fontStyle: 'italic' }}>{trendError}</p>
          )}
        </div>

        {/* ── Live generation stream (Claude-style) ──────────────────────── */}
        {streamActive && (
          <div style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--accent-border)',
            borderRadius: 16, padding: '18px 22px', marginBottom: 16,
            boxShadow: '0 0 24px rgba(201,106,66,0.06)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                    animation: 'pulse 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
              </div>

              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                {streamingPost
                  ? `Generating post ${streamingPost.index + 1} of ${streamPosts.length}`
                  : `${completedCount} of ${streamPosts.length} complete`}
              </span>

              {streamingPost && streamingPost.sourceCount > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  · {streamingPost.sourceCount} sources researched
                </span>
              )}

              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                {elapsedMs > 0
                  ? `${Math.floor(elapsedMs / 60000)}:${String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}`
                  : '0:00'}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 2, background: 'var(--border-subtle)', borderRadius: 1, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{
                height: '100%', borderRadius: 1, background: 'var(--accent)',
                width: `${(completedCount / Math.max(streamPosts.length, 1)) * 100}%`,
                transition: 'width .4s ease',
              }} />
            </div>

            {/* Streaming text */}
            {streamingPost && streamingPost.streamText && (
              <div style={{
                fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.75,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 220, overflowY: 'auto',
                padding: '14px 16px',
                background: 'var(--surface-3)',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
              }}>
                {streamingPost.streamText}
                <span style={{
                  display: 'inline-block', width: 2, height: 13,
                  background: 'var(--accent)', marginLeft: 2,
                  verticalAlign: 'text-bottom',
                  animation: 'cursor-blink 0.7s step-end infinite',
                }} />
              </div>
            )}

            {/* Post thumbnails row while streaming */}
            {streamPosts.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {streamPosts.map(p => {
                  const dot =
                    p.status === 'done'       ? 'var(--accent)' :
                    p.status === 'streaming'  ? 'var(--accent)' :
                    p.status === 'error'      ? 'var(--status-red)' :
                    p.status === 'generating' ? 'var(--text-tertiary)' :
                                                'var(--border-default)'
                  return (
                    <div key={p.index} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 999, fontSize: 11,
                      background: 'var(--surface-3)',
                      border: `1px solid ${p.status === 'streaming' ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                      color: 'var(--text-secondary)',
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%', background: dot,
                        flexShrink: 0,
                        animation: p.status === 'generating' || p.status === 'streaming' ? 'pulse 1.2s infinite' : 'none',
                      }} />
                      Post {p.index + 1}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

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
        {streamPosts.length > 0 && (
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
