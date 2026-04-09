/**
 * ModelDetailPanel.tsx — Right panel shown when a model is selected.
 * Shows: feature assignment, provider key status, all settings sliders/inputs.
 */

import React, { useState, useEffect } from 'react'
import { apiFetch, apiPost } from '../../api'
import type { ModelDef, ProviderDef, SettingsField, FeatureConfig } from './model-types'
import { PROVIDER_COLORS, TIER_META, FEATURE_LABELS } from './model-types'

interface Props {
  model:          ModelDef
  provider:       ProviderDef | null
  features:       string[]
  featureConfigs: Record<string, FeatureConfig>
  onConfigSaved:  (feature: string, cfg: FeatureConfig) => void
}

const T = {
  bg: 'var(--bg)', bg2: 'var(--bg2)', bg3: 'var(--bg3)', bg4: 'var(--bg4)',
  border: 'var(--border)', text: 'var(--text)', text2: 'var(--text2)', text3: 'var(--text3)',
  violet: 'var(--accent, #7c6fcd)', green: 'var(--green, #34d399)',
  amber: '#f59e0b', red: 'var(--red, #f87171)',
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, color: T.text3,
      textTransform: 'uppercase', letterSpacing: '.08em', margin: '16px 0 8px' }}>
      {label}
    </p>
  )
}

function SliderField({ field, value, onChange }: {
  field: SettingsField
  value: number | null
  onChange: (v: number) => void
}) {
  const min  = field.min  ?? 0
  const max  = (field.max ?? 2) as number
  const step = field.step ?? 0.01
  const val  = value ?? (field.default as number ?? min)

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label style={{ fontSize: 11, color: T.text2, fontWeight: 500 }}>{field.label}</label>
        <span style={{ fontSize: 11, color: T.violet, fontFamily: 'monospace', fontWeight: 600 }}>
          {val}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: T.violet, cursor: 'pointer' }}
      />
      {field.tip && <p style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>{field.tip}</p>}
    </div>
  )
}

function NumberField({ field, value, onChange }: {
  field: SettingsField
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: T.text2, fontWeight: 500,
        display: 'block', marginBottom: 4 }}>
        {field.label}
      </label>
      <input
        type="number"
        min={field.min ?? undefined}
        max={(field.max ?? undefined) as number | undefined}
        step={field.step ?? 1}
        value={value ?? ''}
        placeholder={field.default !== null ? String(field.default) : 'auto'}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 7,
          border: `1px solid ${T.border}`, background: T.bg3,
          color: T.text, fontSize: 12, outline: 'none', boxSizing: 'border-box',
        }}
      />
      {field.tip && <p style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>{field.tip}</p>}
    </div>
  )
}

function ToggleField({ field, value, onChange }: {
  field: SettingsField
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 14 }}>
      <div>
        <label style={{ fontSize: 11, color: T.text2, fontWeight: 500 }}>{field.label}</label>
        {field.tip && <p style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{field.tip}</p>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        background: value ? T.violet : T.border, position: 'relative', flexShrink: 0,
        transition: 'background .2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 18 : 2, width: 16, height: 16,
          borderRadius: '50%', background: '#fff', transition: 'left .2s',
        }} />
      </button>
    </div>
  )
}

export default function ModelDetailPanel({
  model, provider, features, featureConfigs, onConfigSaved,
}: Props) {
  const [params,   setParams]   = useState<Record<string, unknown>>({})
  const [apiKey,   setApiKey]   = useState('')
  const [keySet,   setKeySet]   = useState(provider?.key_set ?? false)
  const [savingKey, setSavingKey] = useState(false)
  const [savedKey,  setSavedKey]  = useState(false)
  const [savingCfg, setSavingCfg] = useState<string | null>(null)
  const [savedCfg,  setSavedCfg]  = useState<string | null>(null)

  // Populate params from currently active feature config for this model
  useEffect(() => {
    const activeFeature = features.find(f => featureConfigs[f]?.model === model.id)
    if (activeFeature) {
      const { provider: _p, model: _m, ...rest } = featureConfigs[activeFeature]
      setParams(rest as Record<string, unknown>)
    } else {
      setParams({})
    }
    setApiKey('')
    setSavedKey(false)
  }, [model.id])

  useEffect(() => {
    setKeySet(provider?.key_set ?? false)
  }, [provider?.key_set])

  async function saveKey() {
    if (!apiKey.trim() || !provider?.env_key) return
    setSavingKey(true)
    await apiPost('/api/provider-key', { provider: model.provider, api_key: apiKey.trim() })
    setKeySet(true); setApiKey(''); setSavingKey(false); setSavedKey(true)
    setTimeout(() => setSavedKey(false), 2500)
  }

  async function activateForFeature(feature: string) {
    setSavingCfg(feature)
    const body: Record<string, unknown> = {
      feature,
      provider: model.provider,
      model:    model.id,
      ...params,
    }
    const { error } = await apiPost('/api/llm-config', body)
    if (!error) {
      onConfigSaved(feature, { provider: model.provider, model: model.id, ...params } as FeatureConfig)
      setSavedCfg(feature)
      setTimeout(() => setSavedCfg(null), 2000)
    }
    setSavingCfg(null)
  }

  function setParam(key: string, val: unknown) {
    setParams(prev => ({ ...prev, [key]: val }))
  }

  const schema = provider?.settings_schema ?? []
  const color  = PROVIDER_COLORS[model.provider] || '#94a3b8'
  const tier   = TIER_META[model.tier]

  return (
    <div style={{ padding: '0 2px', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Model header */}
      <div style={{
        padding: '16px', borderRadius: 10,
        background: T.bg3, border: `1px solid ${T.border}`, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: color, flexShrink: 0, display: 'inline-block',
          }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{model.name}</span>
          {model.open_src && (
            <span style={{ fontSize: 9, color: T.green, fontWeight: 700,
              background: `${T.green}15`, padding: '2px 6px', borderRadius: 4 }}>
              OSS
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.text3 }}>{provider?.name || model.provider}</span>
          {tier && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: `${tier.color}18`, color: tier.color,
              textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {tier.label}
            </span>
          )}
          {model.context && (
            <span style={{ fontSize: 10, color: T.text3, fontFamily: 'monospace' }}>
              {model.context >= 1_000_000
                ? `${(model.context / 1_000_000).toFixed(1)}M tokens`
                : `${Math.round(model.context / 1000)}K tokens`}
            </span>
          )}
        </div>
        <p style={{ fontSize: 10, color: T.text3, marginTop: 6, fontFamily: 'monospace',
          wordBreak: 'break-all' }}>
          {model.id}
        </p>
      </div>

      {/* API Key */}
      {provider?.env_key && (
        <>
          <SectionLabel label="API Key" />
          <div style={{
            padding: '12px 14px', borderRadius: 9, background: T.bg3,
            border: `1px solid ${keySet ? `${T.green}40` : T.border}`, marginBottom: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: keySet ? T.green : T.amber }} />
              <span style={{ fontSize: 11, color: keySet ? T.green : T.amber }}>
                {keySet ? 'Key saved' : 'No key — add one to use this provider'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password" value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={`${provider.env_key}...`}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 7,
                  border: `1px solid ${T.border}`, background: T.bg,
                  color: T.text, fontSize: 11, outline: 'none',
                }}
              />
              <button
                onClick={saveKey}
                disabled={!apiKey.trim() || savingKey}
                style={{
                  padding: '7px 14px', borderRadius: 7, border: 'none',
                  background: savedKey ? T.green : T.violet,
                  color: '#fff', fontSize: 11, fontWeight: 600,
                  cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
                  opacity: apiKey.trim() ? 1 : 0.5, flexShrink: 0,
                }}>
                {savedKey ? 'Saved ✓' : savingKey ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Feature assignment */}
      {model.type === 'text' && (
        <>
          <SectionLabel label="Use this model for" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
            {features.map(f => {
              const isActive = featureConfigs[f]?.model === model.id
              const isSaving = savingCfg === f
              const isSaved  = savedCfg  === f
              return (
                <div key={f} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${isActive ? `${T.violet}50` : T.border}`,
                  background: isActive ? `${T.violet}10` : T.bg3,
                }}>
                  <div>
                    <p style={{ fontSize: 12, color: T.text, fontWeight: isActive ? 600 : 400, margin: 0 }}>
                      {FEATURE_LABELS[f] || f}
                    </p>
                    {isActive && (
                      <p style={{ fontSize: 10, color: T.violet, margin: '2px 0 0' }}>Active</p>
                    )}
                    {!isActive && featureConfigs[f] && (
                      <p style={{ fontSize: 10, color: T.text3, margin: '2px 0 0' }}>
                        Current: {featureConfigs[f].model}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => activateForFeature(f)}
                    disabled={isSaving}
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11,
                      fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                      background: isActive ? T.bg4 : isSaved ? T.green : T.violet,
                      color: isActive ? T.text3 : '#fff',
                    }}>
                    {isSaving ? '...' : isSaved ? 'Saved ✓' : isActive ? 'Active' : 'Activate'}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Settings sliders/inputs */}
      {schema.length > 0 && (
        <>
          <SectionLabel label="Model Settings" />
          {schema.map(field => {
            const val = params[field.key] as number | boolean | null ?? null
            if (field.type === 'slider') {
              return (
                <SliderField key={field.key} field={field}
                  value={val as number | null}
                  onChange={v => setParam(field.key, v)} />
              )
            }
            if (field.type === 'number') {
              return (
                <NumberField key={field.key} field={field}
                  value={val as number | null}
                  onChange={v => setParam(field.key, v)} />
              )
            }
            if (field.type === 'toggle') {
              return (
                <ToggleField key={field.key} field={field}
                  value={(val as boolean) ?? (field.default as boolean) ?? false}
                  onChange={v => setParam(field.key, v)} />
              )
            }
            return null
          })}
          <p style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>
            Settings apply when you activate this model for a feature above.
          </p>
        </>
      )}
    </div>
  )
}
