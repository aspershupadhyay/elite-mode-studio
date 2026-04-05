import React, { useState, useEffect } from 'react'
import { T, Icons, SectionHeader, Card, CardRow, Toggle } from './shared'
import type { StudioPrefs } from '@/types/domain'

const DEFAULT_IMAGE_GEN_URL = 'https://chatgpt.com/g/g-p-695fa0174ec88191a103a44f86864e61-image-generation/project'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StudioTabProps {
  prefs: StudioPrefs
  onChange: (prefs: StudioPrefs) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudioTab({ prefs, onChange }: StudioTabProps): React.ReactElement {
  const [imageGenUrl, setImageGenUrl] = useState(DEFAULT_IMAGE_GEN_URL)
  const [urlSaved, setUrlSaved] = useState(false)

  useEffect(() => {
    window.api?.getImageGenConfig?.()
      .then(cfg => { if (cfg?.chatGptUrl) setImageGenUrl(cfg.chatGptUrl) })
      .catch(() => {})
  }, [])

  function handleSaveUrl(): void {
    window.api?.setImageGenUrl?.(imageGenUrl.trim() || DEFAULT_IMAGE_GEN_URL)
      .then(() => {
        setUrlSaved(true)
        setTimeout(() => setUrlSaved(false), 2000)
      })
      .catch(() => {})
  }

  const HIGHLIGHT_COLORS = [
    '#FFD93D', '#FF8C42', '#0BDA76', '#4488FF', '#E879F9', '#FF4444', '#FFFFFF', '#111111',
  ]

  function savePrefs(patch: Partial<StudioPrefs>): void {
    onChange({ ...prefs, ...patch })
  }

  return (
    <div>
      <SectionHeader
        icon={Icons.pen}
        title="Studio Advanced"
        subtitle="Fine-grained controls for the Design Studio canvas. These settings are hidden from the main Studio UI."
      />

      <Card>
        <CardRow
          label="Text Background Highlight"
          desc="When enabled, a 'BG' button appears in the floating text toolbar. Tap it to apply a colored background behind selected characters."
          noBorder={!prefs.bgHighlight?.enabled}
        >
          <Toggle
            checked={!!prefs.bgHighlight?.enabled}
            onChange={v =>
              savePrefs({
                bgHighlight: {
                  ...prefs.bgHighlight,
                  enabled: v,
                  color: prefs.bgHighlight?.color || '#FFD93D',
                },
              })
            }
          />
        </CardRow>

        {prefs.bgHighlight?.enabled && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 11, color: T.text2, marginBottom: 10 }}>Highlight Color</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() =>
                    savePrefs({ bgHighlight: { ...prefs.bgHighlight, color: c } })
                  }
                  style={{
                    width: 28, height: 28, borderRadius: 8, border: 'none',
                    background: c, cursor: 'pointer',
                    outline:
                      prefs.bgHighlight?.color === c
                        ? `2px solid ${T.violetL}`
                        : '2px solid transparent',
                    outlineOffset: 2,
                    transition: 'outline-color .1s',
                  }}
                />
              ))}
              {/* Color picker swatch */}
              <label style={{
                position: 'relative', width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                background: 'conic-gradient(#ff4444,#ffaa00,#ffff00,#00cc44,#4488ff,#8844ff,#ff4444)',
                border: `1px solid ${T.border2}`, overflow: 'hidden',
              }}>
                <input
                  type="color"
                  value={prefs.bgHighlight?.color || '#FFD93D'}
                  onChange={e =>
                    savePrefs({ bgHighlight: { ...prefs.bgHighlight, color: e.target.value } })
                  }
                  style={{
                    position: 'absolute', inset: 0, opacity: 0,
                    cursor: 'pointer', width: '100%', height: '100%',
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 8 }}>
        <CardRow
          label="Post Element Preferences"
          desc="Control which AI-generated elements are applied to the canvas. Your saved choices appear automatically next time."
          noBorder
        >
          <button
            onClick={() => {
              localStorage.removeItem('elite_post_prefs')
              alert('Post element preferences cleared.')
            }}
            style={{
              padding: '6px 14px', background: T.bg, border: `1px solid ${T.border2}`,
              borderRadius: 8, color: T.text2, fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >Reset</button>
        </CardRow>
      </Card>

      <div style={{ marginTop: 24 }}>
        <SectionHeader
          icon={Icons.sparkle}
          title="Image Generation"
          subtitle="Configure the ChatGPT URL used for AI image generation. Set this to your custom GPT or any ChatGPT conversation URL."
        />
      </div>

      <Card>
        <div style={{ padding: '4px 0' }}>
          <p style={{ fontSize: 11, color: T.text2, marginBottom: 8 }}>ChatGPT URL</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="url"
              value={imageGenUrl}
              onChange={e => { setImageGenUrl(e.target.value); setUrlSaved(false) }}
              placeholder={DEFAULT_IMAGE_GEN_URL}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 11,
                background: T.bg, border: `1px solid ${T.border2}`,
                color: T.text, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={handleSaveUrl}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: urlSaved ? 'rgba(11,218,118,0.15)' : 'transparent',
                border: `1px solid ${urlSaved ? 'var(--green)' : T.border2}`,
                color: urlSaved ? 'var(--green)' : T.text2,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
            >
              {urlSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>
            This URL is opened in the AI Browser window during image generation. Make sure you're logged in to ChatGPT.
          </p>
        </div>
      </Card>
    </div>
  )
}
