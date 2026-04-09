/**
 * ModelBrowser.tsx — Searchable, filterable model grid.
 * Renders compact cards; calls onSelect when user clicks a model.
 */

import React, { useState, useMemo } from 'react'
import type { ModelDef, ProviderDef, FeatureConfig } from './model-types'
import { TIER_META, PROVIDER_COLORS, FEATURE_LABELS } from './model-types'

interface Props {
  models:            ModelDef[]
  providers:         Record<string, ProviderDef>
  features:          string[]
  featureConfigs:    Record<string, FeatureConfig>
  selectedId:        string | null
  onSelect:          (model: ModelDef) => void
  hideProviderFilter?: boolean
}

const T = {
  bg:     'var(--bg)',
  bg2:    'var(--bg2)',
  bg3:    'var(--bg3)',
  bg4:    'var(--bg4)',
  border: 'var(--border)',
  text:   'var(--text)',
  text2:  'var(--text2)',
  text3:  'var(--text3)',
  violet: 'var(--accent, #7c6fcd)',
  green:  'var(--green, #34d399)',
}

function ProviderDot({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] || '#94a3b8'
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7,
      borderRadius: '50%', background: color, flexShrink: 0,
    }} />
  )
}

function TierBadge({ tier }: { tier: string }) {
  const meta = TIER_META[tier] || TIER_META.fast
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: `${meta.color}18`, color: meta.color,
      textTransform: 'uppercase', letterSpacing: '.05em',
    }}>
      {meta.label}
    </span>
  )
}

function ModelCard({
  model, selected, activeForFeatures, onClick,
}: {
  model: ModelDef
  selected: boolean
  activeForFeatures: string[]
  onClick: () => void
}) {
  const ctx = model.context
    ? model.context >= 1_000_000 ? `${(model.context / 1_000_000).toFixed(1)}M ctx`
    : model.context >= 1000      ? `${Math.round(model.context / 1000)}K ctx`
    : `${model.context} ctx`
    : null

  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '10px 12px',
      borderRadius: 9, border: `1px solid ${selected ? T.violet : T.border}`,
      background: selected ? `${T.violet}14` : T.bg2,
      cursor: 'pointer', transition: 'all .12s',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ProviderDot provider={model.provider} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {model.name}
        </span>
        {model.open_src && (
          <span style={{ fontSize: 9, color: T.green, fontWeight: 700 }}>OSS</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <TierBadge tier={model.tier} />
        {ctx && (
          <span style={{ fontSize: 9, color: T.text3, fontFamily: 'monospace' }}>{ctx}</span>
        )}
      </div>
      {activeForFeatures.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {activeForFeatures.map(f => (
            <span key={f} style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: `${T.green}18`, color: T.green, fontWeight: 600,
            }}>
              {FEATURE_LABELS[f] || f}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

const ALL_TIERS = ['recommended', 'fast', 'powerful', 'reasoning', 'local', 'image']

export default function ModelBrowser({
  models, features, featureConfigs, selectedId, onSelect,
}: Props) {
  const [search,         setSearch]         = useState('')
  const [filterTier,     setFilterTier]     = useState<string>('all')
  const [filterType,     setFilterType]     = useState<string>('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return models.filter(m => {
      if (filterTier !== 'all' && m.tier !== filterTier) return false
      if (filterType !== 'all' && m.type !== filterType) return false
      if (q && !m.name.toLowerCase().includes(q) &&
               !m.id.toLowerCase().includes(q)   &&
               !m.provider.toLowerCase().includes(q)) return false
      return true
    })
  }, [models, filterTier, filterType, search])

  function getActiveFeatures(modelId: string): string[] {
    return features.filter(f => featureConfigs[f]?.model === modelId)
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: active ? 600 : 400,
    border: `1px solid ${active ? T.violet : T.border}`,
    background: active ? `${T.violet}18` : 'transparent',
    color: active ? T.violet : T.text2,
    cursor: 'pointer', flexShrink: 0,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search models..."
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8,
          border: `1px solid ${T.border}`, background: T.bg3,
          color: T.text, fontSize: 12, outline: 'none', boxSizing: 'border-box',
        }}
      />

      {/* Tier + type filter — single compact row */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {['all', ...ALL_TIERS].map(t => (
          <button key={t} onClick={() => setFilterTier(t)}
            style={chipStyle(filterTier === t)}>
            {t === 'all' ? 'All tiers' : (TIER_META[t]?.label || t)}
          </button>
        ))}
        <div style={{ width: 1, background: T.border, margin: '0 4px' }} />
        {['all', 'text', 'image'].map(tp => (
          <button key={tp} onClick={() => setFilterType(tp)}
            style={chipStyle(filterType === tp)}>
            {tp === 'all' ? 'All types' : tp === 'text' ? 'Text' : 'Image'}
          </button>
        ))}
      </div>

      {/* Count */}
      <p style={{ fontSize: 11, color: T.text3, margin: 0 }}>
        {filtered.length} model{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Model list */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5,
        paddingRight: 2,
      }}>
        {filtered.length === 0 ? (
          <p style={{ fontSize: 12, color: T.text3, textAlign: 'center', marginTop: 40 }}>
            No models match your filters.
          </p>
        ) : filtered.map(m => (
          <ModelCard
            key={`${m.provider}:${m.id}`}
            model={m}
            selected={selectedId === m.id}
            activeForFeatures={getActiveFeatures(m.id)}
            onClick={() => onSelect(m)}
          />
        ))}
      </div>
    </div>
  )
}
