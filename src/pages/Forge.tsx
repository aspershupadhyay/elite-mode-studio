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
import PageShell from '../components/PageShell'
import PostEditorModal from '../components/PostEditorModal'
import { apiFetch, apiPost, apiStream } from '../api'
import { getTemplates } from '../studio/data/templateStorage'
import { getActiveProfile, getProfiles, setActiveProfile } from '../utils/profileStorage'
import {
  Instagram, Twitter, Linkedin, Lock,
  TrendingUp, RefreshCw, Layers, StopCircle,
  Calendar, Zap, LayoutTemplate,
} from 'lucide-react'
import type { Post, Template } from '@/types/domain'
import { type OutSettings } from './content-gen/PostResultsList'
import BatchStream, { type StreamPost, type CampaignBriefData } from './content-lab/BatchStream'

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
function streamPostToPost(p: import('./content-lab/BatchStream').StreamPost): Post {
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
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function Forge({ onSendToStudio, onBatchToStudio, generatedImages }: ForgeProps): React.ReactElement {

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell title="Forge" subtitle="AI Content Generator">
      <div style={{ maxWidth: 860 }}>

        {/* ── 1. Platform selector ─────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {PLATFORMS.map(({ id, label, icon: Icon, active }) => {
            const isSelected = platform === id && active
            return (
              <button key={id} onClick={() => active && setPlatform(id)} disabled={!active}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 500,
                  transition: 'all .15s', cursor: active ? 'pointer' : 'not-allowed',
                  border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--green-dim)' : 'transparent',
                  color: isSelected ? 'var(--accent)' : active ? 'var(--text2)' : 'var(--text3)',
                  boxShadow: isSelected ? '0 0 0 1px var(--green-border)' : 'none',
                }}>
                <Icon size={14} />
                {label}
                {!active && (
                  <span style={{ fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Lock size={9} />soon
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── 2. Profile switcher strip ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>Profile:</span>
          <select
            value={activeProfile.id}
            onChange={e => {
              setActiveProfile(e.target.value)
              setActiveProfileState(getActiveProfile())
              setAllProfiles(getProfiles())
            }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
              background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
              color: 'var(--accent)', cursor: 'pointer',
            }}
          >
            {allProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {activeProfile.tone && (
            <div style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11,
              background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)',
              textTransform: 'capitalize' }}>{activeProfile.tone}</div>
          )}
          {activeProfile.searchEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 20, fontSize: 11,
              background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
              <Calendar size={10} />
              {FRESH_LABELS[activeProfile.searchFreshness ?? '2days'] || activeProfile.searchFreshness}
            </div>
          )}
          {!activeProfile.searchEnabled && (
            <div style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11,
              background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
              no web search
            </div>
          )}
          <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 2 }}>
            · {activeProfile.outputFields.filter(f => f.enabled).length} output fields · edit in Settings → AI Profiles
          </span>
        </div>

        {/* ── 3. Unified input card ─────────────────────────────────────── */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '18px 20px', marginBottom: 20,
        }}>

          {/* Topic input + Forge button */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !streamActive && (topic.trim() ? handleSingleForge() : runCampaign())}
              placeholder="Topic for a single post — or leave empty for a campaign series below"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 9,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text)', fontSize: 13, outline: 'none',
              }}
            />
            {streamActive
              ? (
                <button onClick={stopCampaign} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: '1px solid rgba(255,77,77,0.4)', background: 'transparent',
                  color: 'var(--red)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  <StopCircle size={14} />Stop
                </button>
              )
              : (
                <button
                  onClick={() => topic.trim() ? handleSingleForge() : runCampaign()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 22px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: 'var(--accent)',
                    color: 'var(--accent-fg, #000)',
                    transition: 'all .15s', whiteSpace: 'nowrap',
                  }}>
                  {topic.trim() ? <><Zap size={14} />Forge</> : <><Layers size={14} />Generate Series</>}
                </button>
              )
            }
          </div>

          {/* Second row: category + count + template + trending */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

            {/* Category */}
            <select value={campaignCat} onChange={e => setCampaignCat(e.target.value)}
              disabled={streamActive}
              style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, colorScheme: 'dark' }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Count */}
            <input
              type="number" min={1}
              value={campaignCount}
              disabled={streamActive}
              onChange={e => setCampaignCount(e.target.value)}
              onBlur={e => { const v = parseInt(e.target.value); setCampaignCount(String(isNaN(v) || v < 1 ? 1 : v)) }}
              onKeyDown={e => e.key === 'Enter' && !streamActive && runCampaign()}
              style={{ width: 64, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, colorScheme: 'dark', textAlign: 'center' }}
            />

            {/* Template — always shown, empty state when no templates */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <LayoutTemplate size={11} style={{ color: 'var(--text3)', flexShrink: 0 }} />
              <select
                value={selectedTmpl}
                onChange={e => setSelectedTmpl(e.target.value)}
                disabled={streamActive || templates.length === 0}
                style={{
                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: templates.length === 0 ? 'var(--text3)' : 'var(--text)',
                  fontSize: 12, maxWidth: 180, colorScheme: 'dark',
                }}>
                {templates.length === 0
                  ? <option value="">No templates — create one in Design Studio</option>
                  : templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                }
              </select>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

            {/* Trending fetch */}
            <TrendingUp size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <button onClick={handleFetchTrending} disabled={trendLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, fontSize: 12,
                cursor: trendLoading ? 'default' : 'pointer',
                border: '1px solid var(--border)', background: 'transparent',
                color: trendLoading ? 'var(--text3)' : 'var(--text2)',
              }}>
              <RefreshCw size={11} style={trendLoading ? { animation: 'spin 1s linear infinite' } : {}} />
              {trendLoading ? 'Fetching…' : 'Fetch trending'}
            </button>

            {/* Hint */}
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
              {topic.trim()
                ? `${campaignCount} post${parseInt(campaignCount) > 1 ? 's' : ''} on this topic`
                : `Series · ${campaignCount} posts · ${campaignCat}`}
            </span>
          </div>

          {/* Trending list */}
          {showTrending && trending.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              {trending.map((t, i) => (
                <div key={i}
                  onClick={() => { setTopic(t.title); setShowTrending(false) }}
                  style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg3)', transition: 'border .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                  <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{t.title}</p>
                  {t.snippet && <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, margin: '3px 0 0' }}>{t.snippet}</p>}
                </div>
              ))}
            </div>
          )}
          {/* Inline trending error — not a campaign failure, just no results */}
          {trendError && !showTrending && (
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, fontStyle: 'italic' }}>{trendError}</p>
          )}
        </div>

        {/* ── 5. Errors ────────────────────────────────────────────────── */}
        {campaignError && (
          <div style={{ padding: '12px 14px', background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 8, fontSize: 13, color: 'var(--red)', marginBottom: 16, lineHeight: 1.6 }}>
            {campaignError}
          </div>
        )}

        {/* ── 6. All results via BatchStream ───────────────────────────── */}
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

      {/* Edit modal */}
      {editingIndex !== null && streamPosts[editingIndex] && (
        <PostEditorModal
          post={{ ...streamPosts[editingIndex], content: streamPosts[editingIndex].content as import('../components/PostEditorModal').EditableContent | undefined }}
          onSave={(updatedContent: import('../components/PostEditorModal').EditableContent) => {
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
