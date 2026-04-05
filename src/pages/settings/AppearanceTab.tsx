import { useState } from 'react'
import { hexToRgb } from '../../utils'
import { T, Icons, SectionHeader, Card } from './shared'
import type { AppearanceConfig } from '@/types/domain'

// ── Presets ───────────────────────────────────────────────────────────────────

interface AccentPreset {
  name: string
  value: string
  dim: string
  border: string
}

interface BgPreset {
  name: string
  bg: string
  bg2: string
  bg3: string
}

const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Lime',    value: '#c8ff00', dim: 'rgba(200,255,0,0.10)',   border: 'rgba(200,255,0,0.30)'   },
  { name: 'Emerald', value: '#0BDA76', dim: 'rgba(11,218,118,0.10)',  border: 'rgba(11,218,118,0.30)'  },
  { name: 'Cyan',    value: '#06B6D4', dim: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.30)'   },
  { name: 'Violet',  value: '#8B5CF6', dim: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.30)'  },
  { name: 'Rose',    value: '#F43F5E', dim: 'rgba(244,63,94,0.10)',   border: 'rgba(244,63,94,0.30)'   },
  { name: 'Amber',   value: '#F59E0B', dim: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)'  },
  { name: 'Pink',    value: '#EC4899', dim: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.30)'  },
  { name: 'Orange',  value: '#F97316', dim: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.30)'  },
]

const BG_PRESETS: BgPreset[] = [
  { name: 'Obsidian', bg: '#09090B', bg2: '#111113', bg3: '#18181B' },
  { name: 'Midnight', bg: '#0A0A14', bg2: '#0F0F1A', bg3: '#16162A' },
  { name: 'Carbon',   bg: '#0C0C0C', bg2: '#141414', bg3: '#1C1C1C' },
  { name: 'Navy',     bg: '#0A0F1E', bg2: '#0F1628', bg3: '#162035' },
  { name: 'Forest',   bg: '#080E0A', bg2: '#0E1410', bg3: '#162018' },
]

// ── Full appearance state (superset of AppearanceConfig) ─────────────────────

interface FullAppearance {
  accent: string
  accentDim: string
  accentBorder: string
  bg: string
  bg2: string
  bg3: string
  fontScale: number
  sidebarCollapsed: boolean
}

function getAppearance(): FullAppearance {
  try {
    const raw = localStorage.getItem('app_appearance')
    if (raw) return JSON.parse(raw) as FullAppearance
  } catch {}
  return {
    accent: ACCENT_PRESETS[0].value,
    accentDim: ACCENT_PRESETS[0].dim,
    accentBorder: ACCENT_PRESETS[0].border,
    bg: BG_PRESETS[0].bg, bg2: BG_PRESETS[0].bg2, bg3: BG_PRESETS[0].bg3,
    fontScale: 1,
    sidebarCollapsed: false,
  }
}

function applyAppearance(app: FullAppearance): void {
  const r = document.documentElement.style
  r.setProperty('--green',        app.accent)
  r.setProperty('--green-rgb',    hexToRgb(app.accent))
  r.setProperty('--green-dim',    app.accentDim)
  r.setProperty('--green-border', app.accentBorder)
  r.setProperty('--accent-fg',    '#000')   /* dark text on any accent fill */
  // Set both legacy and new surface vars so all components pick up the change
  r.setProperty('--bg',           app.bg)
  r.setProperty('--bg2',          app.bg2)
  r.setProperty('--bg3',          app.bg3)
  r.setProperty('--surface-0',    app.bg)
  r.setProperty('--surface-1',    app.bg)
  r.setProperty('--surface-2',    app.bg2)
  r.setProperty('--surface-3',    app.bg3)
  document.body.style.background = app.bg
  localStorage.setItem('app_appearance', JSON.stringify(app))
  window.dispatchEvent(new CustomEvent('themeChange', { detail: { accent: app.accent } }))
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AppearanceTabProps {
  config: AppearanceConfig
  onChange: (config: AppearanceConfig) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppearanceTab(_props: AppearanceTabProps): React.ReactElement {
  const [app, setApp]               = useState<FullAppearance>(getAppearance)
  const [customAccent, setCustomAccent] = useState<string>(app.accent)

  const applyAndSave = (patch: Partial<FullAppearance>): void => {
    const next = { ...app, ...patch }
    setApp(next)
    applyAppearance(next)
  }

  const chooseAccent = (preset: AccentPreset): void => {
    applyAndSave({ accent: preset.value, accentDim: preset.dim, accentBorder: preset.border })
    setCustomAccent(preset.value)
  }

  const applyCustomAccent = (hex: string): void => {
    setCustomAccent(hex)
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    applyAndSave({
      accent:       hex,
      accentDim:    `rgba(${r},${g},${b},0.10)`,
      accentBorder: `rgba(${r},${g},${b},0.30)`,
    })
  }

  return (
    <div>
      <SectionHeader
        icon={Icons.palette}
        title="Appearance"
        subtitle="Personalise the studio to match your aesthetic — changes apply instantly"
      />

      {/* Accent color */}
      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Accent Color</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
          Used for highlights, active states, and interactive elements
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {ACCENT_PRESETS.map(p => (
            <button key={p.value} onClick={() => chooseAccent(p)} title={p.name}
              style={{
                width: 32, height: 32, borderRadius: 8, border: `2px solid`,
                borderColor: app.accent === p.value ? p.value : 'transparent',
                background: p.value, cursor: 'pointer', position: 'relative',
                transition: 'all .15s',
                outline: app.accent === p.value ? `3px solid ${p.value}40` : 'none',
                outlineOffset: 2,
              }}>
              {app.accent === p.value && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icons.check size={14} color="#fff" />
                </div>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={customAccent}
            onChange={e => applyCustomAccent(e.target.value)}
            style={{
              width: 36, height: 36, borderRadius: 8, border: `1px solid ${T.border}`,
              background: 'transparent', cursor: 'pointer', padding: 2,
            }} />
          <div>
            <p style={{ fontSize: 12, color: T.text, margin: 0 }}>Custom color</p>
            <p style={{ fontSize: 10, color: T.text3, fontFamily: 'monospace' }}>{customAccent}</p>
          </div>
        </div>
      </Card>

      {/* Background preset */}
      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Background Tone</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>Base darkness of the interface</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {BG_PRESETS.map(p => (
            <button key={p.name} onClick={() => applyAndSave({ bg: p.bg, bg2: p.bg2, bg3: p.bg3 })}
              style={{
                padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${app.bg === p.bg ? app.accent : T.border}`,
                background: p.bg, transition: 'all .15s',
                outline: app.bg === p.bg ? `2px solid ${app.accent}40` : 'none',
                outlineOffset: 2,
              }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, background: p.bg3, margin: '0 auto 6px', border: `1px solid ${T.border2}` }} />
              <p style={{
                fontSize: 10, color: app.bg === p.bg ? app.accent : T.text2,
                margin: 0, fontWeight: app.bg === p.bg ? 600 : 400,
              }}>{p.name}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Live preview */}
      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 14 }}>Preview</p>
        <div style={{ padding: '16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: app.accent, marginTop: 4 }} />
            <div>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, fontWeight: 500 }}>Sample post title</p>
              <p style={{ fontSize: 11, color: 'var(--text2)', margin: '4px 0 0' }}>Subtitle text in secondary color</p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <div style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11,
                background: app.accentDim, border: `1px solid ${app.accentBorder}`,
                color: app.accent, fontWeight: 600,
              }}>Active</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: app.accent, color: '#000', fontSize: 12, fontWeight: 600, cursor: 'default',
            }}>Primary</button>
            <button style={{
              padding: '6px 14px', borderRadius: 7,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: 'var(--text2)', fontSize: 12, cursor: 'default',
            }}>Secondary</button>
          </div>
        </div>
      </Card>
    </div>
  )
}
