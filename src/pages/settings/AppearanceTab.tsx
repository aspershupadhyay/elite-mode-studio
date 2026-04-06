import { useState } from 'react'
import { T, Icons, SectionHeader, Card } from './shared'
import type { AppearanceConfig } from '@/types/domain'

type Theme = 'dark' | 'light'

function getTheme(): Theme {
  return (localStorage.getItem('app_theme') as Theme) ?? 'dark'
}

function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light')
  else document.documentElement.removeAttribute('data-theme')
  localStorage.setItem('app_theme', theme)
}

export interface AppearanceTabProps {
  config: AppearanceConfig
  onChange: (config: AppearanceConfig) => void
}

export default function AppearanceTab(_props: AppearanceTabProps): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(getTheme)

  const choose = (t: Theme): void => {
    setTheme(t)
    applyTheme(t)
  }

  return (
    <div>
      <SectionHeader
        icon={Icons.palette}
        title="Appearance"
        subtitle="Choose between dark and light mode"
      />

      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Theme</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>
          Select the interface color scheme
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(['dark', 'light'] as Theme[]).map(t => {
            const isDark = t === 'dark'
            const active = theme === t
            const bg = isDark ? '#0C0C0C' : '#FFFFFF'
            const surface = isDark ? '#181818' : '#F1F3F5'
            const text = isDark ? '#F0F0F0' : '#111111'
            const subtext = isDark ? '#9A9A9A' : '#555555'
            const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'
            return (
              <button
                key={t}
                onClick={() => choose(t)}
                style={{
                  padding: 0, cursor: 'pointer', borderRadius: 12,
                  border: `2px solid ${active ? 'var(--accent)' : T.border}`,
                  background: 'transparent', overflow: 'hidden',
                  outline: active ? `3px solid rgba(var(--green-rgb),0.20)` : 'none',
                  outlineOffset: 2, transition: 'all .15s',
                }}
              >
                {/* Mini preview */}
                <div style={{ background: bg, padding: '14px 12px' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#22c55e' }} />
                    ))}
                  </div>
                  <div style={{ background: surface, borderRadius: 6, padding: '8px 10px', border: `1px solid ${border}` }}>
                    <div style={{ width: '70%', height: 7, borderRadius: 3, background: text, opacity: 0.7, marginBottom: 5 }} />
                    <div style={{ width: '50%', height: 5, borderRadius: 3, background: subtext, opacity: 0.5 }} />
                  </div>
                </div>
                {/* Label */}
                <div style={{
                  padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderTop: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : T.text, textTransform: 'capitalize' }}>
                    {t}
                  </span>
                  {active && <Icons.check size={13} color="var(--accent)" />}
                </div>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
