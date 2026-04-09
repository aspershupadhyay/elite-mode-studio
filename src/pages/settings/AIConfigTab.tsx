/**
 * AIConfigTab.tsx — AI Models
 * Clean layout: provider tabs (filter + key management) → model list → detail panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch, apiPost } from '../../api'
import ModelBrowser from './ModelBrowser'
import ModelDetailPanel from './ModelDetailPanel'
import type { ModelDef, ProviderDef, FeatureConfig } from './model-types'
import { PROVIDER_COLORS, TIER_META } from './model-types'

const T = {
  bg:     'var(--bg)',
  bg2:    'var(--bg2)',
  bg3:    'var(--bg3)',
  bg4:    'var(--bg4)',
  border: 'var(--border)',
  text:   'var(--text)',
  text2:  'var(--text2)',
  text3:  'var(--text3)',
  accent: 'var(--accent, #C96A42)',
  green:  'var(--green, #34d399)',
  amber:  '#f59e0b',
  red:    'var(--red, #f87171)',
}

const FREE_PROVIDERS = new Set(['nvidia', 'ollama'])

// ── Provider tab strip ─────────────────────────────────────────────────────────

function ProviderTabs({
  providers, modelCounts, selected, onSelect,
}: {
  providers:   Record<string, ProviderDef>
  modelCounts: Record<string, number>
  selected:    string
  onSelect:    (pid: string) => void
}) {
  const sorted = ['all', ...Object.keys(providers).sort((a, b) => {
    // free providers first
    const af = FREE_PROVIDERS.has(a) || !providers[a]?.env_key
    const bf = FREE_PROVIDERS.has(b) || !providers[b]?.env_key
    if (af && !bf) return -1
    if (!af && bf) return 1
    // then unlocked
    const au = providers[a]?.key_set
    const bu = providers[b]?.key_set
    if (au && !bu) return -1
    if (!au && bu) return 1
    return 0
  })]

  function label(pid: string) {
    if (pid === 'all') return 'All'
    return providers[pid]?.name || pid
  }

  function status(pid: string) {
    if (pid === 'all') return 'all'
    if (FREE_PROVIDERS.has(pid) || !providers[pid]?.env_key) return 'free'
    if (providers[pid]?.key_set) return 'unlocked'
    return 'locked'
  }

  return (
    <div style={{
      display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2,
      scrollbarWidth: 'none',
    }}>
      {sorted.map(pid => {
        const st      = status(pid)
        const active  = selected === pid
        const color   = pid === 'all' ? T.accent : (PROVIDER_COLORS[pid] || '#94a3b8')
        const count   = pid === 'all' ? undefined : modelCounts[pid]

        return (
          <button
            key={pid}
            onClick={() => onSelect(pid)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, border: 'none',
              flexShrink: 0, cursor: 'pointer', fontSize: 12,
              fontWeight: active ? 600 : 400,
              background: active ? `${color}18` : 'transparent',
              color:      active ? color : T.text2,
              outline:    active ? `1px solid ${color}40` : '1px solid transparent',
              transition: 'all .12s',
            }}
          >
            {/* Status indicator */}
            {pid !== 'all' && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: st === 'free' ? T.green
                          : st === 'unlocked' ? T.green
                          : T.amber,
              }} />
            )}

            {label(pid)}

            {/* FREE / count badge */}
            {st === 'free' && pid !== 'all' && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px',
                borderRadius: 3, background: `${T.green}20`, color: T.green,
              }}>FREE</span>
            )}
            {count !== undefined && (
              <span style={{
                fontSize: 10, color: active ? color : T.text3,
                fontVariantNumeric: 'tabular-nums',
              }}>{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Inline key banner (shown when locked provider is selected) ─────────────────

function KeyBanner({
  pid, pdata, onSaved,
}: {
  pid:    string
  pdata:  ProviderDef
  onSaved: () => void
}) {
  const [key,    setKey]    = useState('')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [pid])

  async function save() {
    if (!key.trim()) return
    setSaving(true)
    await apiPost('/api/provider-key', { provider: pid, api_key: key.trim() })
    setKey(''); setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); onSaved() }, 1200)
  }

  if (pdata.key_set || FREE_PROVIDERS.has(pid) || !pdata.env_key) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      background: `${T.amber}0a`, border: `1px solid ${T.amber}30`,
    }}>
      <span style={{ fontSize: 16 }}>🔑</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: T.text, fontWeight: 600, margin: '0 0 1px' }}>
          Add {pdata.name} API key
        </p>
        <p style={{ fontSize: 10, color: T.text3, margin: 0, fontFamily: 'monospace' }}>
          {pdata.env_key}
        </p>
      </div>
      <input
        ref={inputRef}
        type="password"
        value={key}
        onChange={e => setKey(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()}
        placeholder="Paste key and press Enter…"
        style={{
          width: 260, padding: '7px 11px', borderRadius: 8,
          border: `1px solid ${T.border}`, background: T.bg3,
          color: T.text, fontSize: 12, outline: 'none',
        }}
      />
      <button
        onClick={save}
        disabled={!key.trim() || saving}
        style={{
          padding: '7px 16px', borderRadius: 8, border: 'none',
          background: saved ? T.green : T.accent, color: '#fff',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          opacity: key.trim() ? 1 : 0.4, flexShrink: 0, minWidth: 72,
          transition: 'background .2s',
        }}
      >
        {saved ? 'Saved ✓' : saving ? '…' : 'Save'}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AIConfigTab() {
  const [models,         setModels]         = useState<ModelDef[]>([])
  const [providers,      setProviders]      = useState<Record<string, ProviderDef>>({})
  const [features,       setFeatures]       = useState<string[]>([])
  const [featureConfigs, setFeatureConfigs] = useState<Record<string, FeatureConfig>>({})
  const [selected,       setSelected]       = useState<ModelDef | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [activeProvider, setActiveProvider] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [modelsRes, providersRes, cfgRes] = await Promise.all([
      apiFetch<{ models: ModelDef[] }>('/api/models'),
      apiFetch<{ providers: Record<string, ProviderDef>; features: string[] }>('/api/providers'),
      apiFetch<{ llm_features: Record<string, FeatureConfig>; features: string[] }>('/api/llm-config'),
    ])
    if (modelsRes.data?.models)       setModels(modelsRes.data.models)
    if (providersRes.data?.providers) setProviders(providersRes.data.providers)
    if (providersRes.data?.features)  setFeatures(providersRes.data.features)
    if (cfgRes.data?.llm_features)    setFeatureConfigs(cfgRes.data.llm_features)
    if (cfgRes.data?.features)        setFeatures(cfgRes.data.features)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleConfigSaved(feature: string, cfg: FeatureConfig) {
    setFeatureConfigs(prev => ({ ...prev, [feature]: cfg }))
  }

  const modelCounts = Object.keys(providers).reduce<Record<string, number>>((acc, pid) => {
    acc[pid] = models.filter(m => m.provider === pid).length
    return acc
  }, {})

  // Filter models by active provider tab
  const filteredByProvider = activeProvider === 'all'
    ? models
    : models.filter(m => m.provider === activeProvider)

  const selectedProvider = activeProvider !== 'all' ? providers[activeProvider] ?? null : null
  const showKeyBanner = selectedProvider && !selectedProvider.key_set
    && !FREE_PROVIDERS.has(activeProvider) && !!selectedProvider.env_key

  const unlockedCount = Object.entries(providers).filter(([pid, p]) =>
    FREE_PROVIDERS.has(pid) || !p.env_key || p.key_set
  ).length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 300, gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: T.accent, animation: 'pulse 1.2s infinite',
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}`}</style>
      </div>
    )
  }

  return (
    <div style={{
      height: 'calc(100vh - 56px)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 3px' }}>
            AI Models
          </h2>
          <p style={{ fontSize: 12, color: T.text3, margin: 0 }}>
            {models.length} models &nbsp;·&nbsp;
            <span style={{ color: T.green }}>{unlockedCount} provider{unlockedCount !== 1 ? 's' : ''} unlocked</span>
            &nbsp;·&nbsp; select a provider to add its key
          </p>
        </div>
        <button
          onClick={load}
          style={{
            padding: '6px 12px', borderRadius: 8,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.text3, fontSize: 11, cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Provider tabs */}
      <ProviderTabs
        providers={providers}
        modelCounts={modelCounts}
        selected={activeProvider}
        onSelect={pid => { setActiveProvider(pid); setSelected(null) }}
      />

      {/* Inline key banner */}
      {showKeyBanner && selectedProvider && (
        <KeyBanner pid={activeProvider} pdata={selectedProvider} onSaved={load} />
      )}

      {/* Model browser + detail */}
      <div style={{
        flex: 1, display: 'grid', gap: 12, overflow: 'hidden', minHeight: 0,
        gridTemplateColumns: selected ? '1fr 340px' : '1fr',
      }}>
        {/* Browser */}
        <div style={{
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          background: T.bg2, borderRadius: 12, border: `1px solid ${T.border}`,
          padding: 14,
        }}>
          <ModelBrowser
            models={filteredByProvider}
            providers={providers}
            features={features}
            featureConfigs={featureConfigs}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            hideProviderFilter
          />
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            overflowY: 'auto', overflowX: 'hidden',
            background: T.bg2, borderRadius: 12, border: `1px solid ${T.border}`,
            padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text3,
                textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Model details
              </span>
              <button onClick={() => setSelected(null)} style={{
                background: 'none', border: 'none', color: T.text3,
                fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
              }}>×</button>
            </div>
            <ModelDetailPanel
              model={selected}
              provider={providers[selected.provider] ?? null}
              features={features}
              featureConfigs={featureConfigs}
              onConfigSaved={handleConfigSaved}
            />
          </div>
        )}
      </div>
    </div>
  )
}
