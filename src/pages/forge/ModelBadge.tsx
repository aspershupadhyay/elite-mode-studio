/**
 * ModelBadge.tsx — Compact model picker in Forge.
 * Only shows models from providers with API keys set (or free providers).
 * Groups models by provider. Includes search.
 */

import { useState, useEffect, useRef } from 'react'
import { apiFetch, apiPost } from '../../api'
import type { ModelDef, ProviderDef } from '../settings/model-types'
import { PROVIDER_COLORS } from '../settings/model-types'

interface Props {
  feature?: string
  onModelChange?: (provider: string, model: string) => void
}

const FREE_PROVIDERS = new Set(['nvidia', 'ollama'])

const T = {
  bg:     'var(--bg)',
  bg2:    'var(--bg2)',
  bg3:    'var(--bg3)',
  border: 'var(--border)',
  text:   'var(--text)',
  text2:  'var(--text2)',
  text3:  'var(--text3)',
  accent: 'var(--accent, #C96A42)',
  green:  'var(--green, #34d399)',
}

export default function ModelBadge({ feature = 'forge', onModelChange }: Props) {
  const [models,    setModels]    = useState<ModelDef[]>([])
  const [providers, setProviders] = useState<Record<string, ProviderDef>>({})
  const [active,    setActive]    = useState<ModelDef | null>(null)
  const [open,      setOpen]      = useState(false)
  const [search,    setSearch]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  async function load() {
    const [modelsRes, providersRes, cfgRes] = await Promise.all([
      apiFetch<{ models: ModelDef[] }>('/api/models?model_type=text'),
      apiFetch<{ providers: Record<string, ProviderDef> }>('/api/providers'),
      apiFetch<{ llm_features: Record<string, { provider: string; model: string }> }>('/api/llm-config'),
    ])

    const allModels   = modelsRes.data?.models   ?? []
    const providerMap = providersRes.data?.providers ?? {}
    setProviders(providerMap)

    // Only include models from unlocked providers
    const unlocked = allModels.filter(m => {
      if (FREE_PROVIDERS.has(m.provider)) return true
      const p = providerMap[m.provider]
      return !p?.env_key || p.key_set
    })
    setModels(unlocked)

    const forgeModelId = cfgRes.data?.llm_features?.[feature]?.model
    if (forgeModelId) {
      const found = unlocked.find(m => m.id === forgeModelId) ??
                    allModels.find(m => m.id === forgeModelId)
      if (found) setActive(found)
    }
  }

  useEffect(() => { load() }, [feature])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function selectModel(model: ModelDef) {
    setSaving(true)
    await apiPost('/api/llm-config', {
      feature, provider: model.provider, model: model.id,
    })
    setActive(model); setOpen(false); setSearch(''); setSaving(false)
    onModelChange?.(model.provider, model.id)
  }

  // Filter by search then group by provider
  const q = search.toLowerCase()
  const filtered = models.filter(m =>
    !q || m.name.toLowerCase().includes(q) ||
    m.id.toLowerCase().includes(q) ||
    m.provider.toLowerCase().includes(q)
  )

  // Group by provider, sorted: free first, then alphabetical
  const groups = filtered.reduce<Record<string, ModelDef[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const sortedProviders = Object.keys(groups).sort((a, b) => {
    const af = FREE_PROVIDERS.has(a)
    const bf = FREE_PROVIDERS.has(b)
    if (af && !bf) return -1
    if (!af && bf) return 1
    return (providers[a]?.name || a).localeCompare(providers[b]?.name || b)
  })

  const color = active ? (PROVIDER_COLORS[active.provider] || '#94a3b8') : '#94a3b8'
  const noModels = models.length === 0

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Badge trigger */}
      <button
        onClick={() => { setOpen(o => !o); setSearch('') }}
        disabled={saving || noModels}
        title={noModels ? 'Add an API key in Settings → AI Models' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 7,
          border: `1px solid ${T.border}`, background: T.bg3,
          color: T.text2, fontSize: 11, fontWeight: 500,
          cursor: saving || noModels ? 'not-allowed' : 'pointer',
          opacity: noModels ? 0.5 : 1,
          transition: 'all .12s',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%',
          background: noModels ? '#94a3b8' : color, flexShrink: 0 }} />
        <span style={{ maxWidth: 150, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {saving ? '…' : noModels ? 'No models — add key' : (active?.name ?? 'Select model')}
        </span>
        <span style={{ fontSize: 9, color: T.text3, marginLeft: 2 }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 9999,
          width: 300, maxHeight: 400, display: 'flex', flexDirection: 'column',
          background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10,
          boxShadow: '0 10px 32px rgba(0,0,0,.3)', overflow: 'hidden',
        }}>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${models.length} unlocked models…`}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 6, boxSizing: 'border-box',
                border: `1px solid ${T.border}`, background: T.bg3,
                color: T.text, fontSize: 11, outline: 'none',
              }}
            />
          </div>

          {/* Grouped model list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sortedProviders.length === 0 ? (
              <p style={{ fontSize: 11, color: T.text3, textAlign: 'center', padding: '24px 16px' }}>
                No models match "{search}"
              </p>
            ) : sortedProviders.map(pid => {
              const pModels  = groups[pid]
              const pName    = providers[pid]?.name || pid
              const isFree   = FREE_PROVIDERS.has(pid)
              const dotColor = PROVIDER_COLORS[pid] || '#94a3b8'

              return (
                <div key={pid}>
                  {/* Provider header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px 4px', position: 'sticky', top: 0,
                    background: T.bg2, borderBottom: `1px solid ${T.border}`,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%',
                      background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text3,
                      textTransform: 'uppercase', letterSpacing: '.06em', flex: 1 }}>
                      {pName}
                    </span>
                    {isFree && (
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px',
                        borderRadius: 3, background: `${T.green}20`, color: T.green }}>
                        FREE
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: T.text3 }}>{pModels.length}</span>
                  </div>

                  {/* Models */}
                  {pModels.map(m => {
                    const isActive = active?.id === m.id
                    return (
                      <button
                        key={`${m.provider}:${m.id}`}
                        onClick={() => selectModel(m)}
                        style={{
                          width: '100%', textAlign: 'left',
                          padding: '7px 12px 7px 24px',
                          border: 'none', borderBottom: `1px solid ${T.border}`,
                          background: isActive ? `${T.accent}14` : 'transparent',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          transition: 'background .08s',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 12, fontWeight: isActive ? 600 : 400,
                            color: isActive ? T.accent : T.text, margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {m.name}
                          </p>
                          {m.context && (
                            <p style={{ fontSize: 9, color: T.text3, margin: 0, fontFamily: 'monospace' }}>
                              {m.context >= 1_000_000
                                ? `${(m.context / 1_000_000).toFixed(1)}M ctx`
                                : `${Math.round(m.context / 1000)}K ctx`}
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <span style={{ fontSize: 10, color: T.accent, fontWeight: 700, flexShrink: 0 }}>
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Footer hint */}
          <div style={{
            padding: '7px 12px', borderTop: `1px solid ${T.border}`,
            fontSize: 10, color: T.text3, flexShrink: 0,
          }}>
            {filtered.length} models · add more keys in Settings → AI Models
          </div>
        </div>
      )}
    </div>
  )
}
