/**
 * KeywordStyleSection.tsx — Per-template keyword highlight style preference.
 *
 * Shown in PropertiesPanel when the selected object is eliteType='title'.
 * Lets the designer save how auto-generated highlight_words should be styled:
 *   • Solid  — single accent color per character
 *   • Gradient — two-color gradient interpolated across each keyword's chars
 *   • Texture  — one of the built-in procedural textures applied to the whole title
 *
 * The preference is saved as JSON in obj.eliteHighlightStyle and read by
 * content-apply.ts when applyGeneratedContent() runs.
 */
import React, { useState, useEffect } from 'react'
import type { FabricObject } from 'fabric'
import { PRESETS, getPresetSrc, presetToParams } from './texture/presets'
import { DEFAULT_TEXTURE } from './texture/types'
import type { TextureParams } from './texture'

// ── Types ────────────────────────────────────────────────────────────────────

export type KwMode = 'solid' | 'gradient' | 'texture'

export interface KeywordStyle {
  mode: KwMode
  color: string            // solid: chosen color
  fromColor: string        // gradient: from stop
  toColor: string          // gradient: to stop
  texPresetId: string      // texture: preset id
  texSrc: string           // texture: generated src (lazy)
  texParams: TextureParams // texture: full params
}

export const DEFAULT_KW_STYLE: KeywordStyle = {
  mode: 'solid',
  color: '#0BDA76',
  fromColor: '#FFD700',
  toColor: '#FFA500',
  texPresetId: '',
  texSrc: '',
  texParams: { ...DEFAULT_TEXTURE },
}

export function parseKwStyle(obj: FabricObject): KeywordStyle {
  const raw = (obj as FabricObject & { eliteHighlightStyle?: string }).eliteHighlightStyle
  if (raw) {
    try {
      return { ...DEFAULT_KW_STYLE, ...(JSON.parse(raw) as Partial<KeywordStyle>) }
    } catch { /* */ }
  }
  // Try to detect current solid accent from existing character styles
  const tb = obj as FabricObject & { styles?: Record<number, Record<number, { fill?: string }>>; fill?: string }
  if (tb.styles) {
    const allStyles = Object.values(tb.styles).flatMap(l => Object.values(l))
    const colored = allStyles.find(s => s.fill && s.fill !== (tb.fill as string))
    if (colored?.fill) return { ...DEFAULT_KW_STYLE, color: colored.fill }
  }
  return { ...DEFAULT_KW_STYLE }
}

// ── Gradient presets ──────────────────────────────────────────────────────────

const GRAD_PRESETS: Array<{ label: string; from: string; to: string; css: string }> = [
  { label: 'Gold',   from: '#FFD700', to: '#FFA500', css: 'linear-gradient(90deg,#FFD700,#FFA500)' },
  { label: 'Silver', from: '#FFFFFF', to: '#888888', css: 'linear-gradient(90deg,#FFFFFF,#888888)' },
  { label: 'Fire',   from: '#FF6B00', to: '#FF0000', css: 'linear-gradient(90deg,#FF6B00,#FF0000)' },
  { label: 'Ice',    from: '#A8EDFF', to: '#0A84FF', css: 'linear-gradient(90deg,#A8EDFF,#0A84FF)' },
  { label: 'Neon',   from: '#39FF14', to: '#00C853', css: 'linear-gradient(90deg,#39FF14,#00C853)' },
  { label: 'Violet', from: '#E879F9', to: '#8B5CF6', css: 'linear-gradient(90deg,#E879F9,#8B5CF6)' },
  { label: 'Sunset', from: '#FF6B6B', to: '#FFD93D', css: 'linear-gradient(90deg,#FF6B6B,#FFD93D)' },
  { label: 'Ocean',  from: '#00C9FF', to: '#92FE9D', css: 'linear-gradient(90deg,#00C9FF,#92FE9D)' },
]

const SOLID_SWATCHES = [
  '#0BDA76', '#FFD93D', '#4488FF', '#FF4444', '#E879F9',
  '#FF6B00', '#00BFFF', '#EAEAEA', '#FFFFFF', '#FFD700',
]

// Subset of presets useful for title text texture
const TEX_PRESETS = PRESETS.filter(p => ['grain', 'paper', 'grunge', 'halftone'].includes(p.category))

// ── Component ─────────────────────────────────────────────────────────────────

export interface KeywordStyleSectionProps {
  object: FabricObject
}

export function KeywordStyleSection({ object }: KeywordStyleSectionProps): JSX.Element {
  const [style, setStyle] = useState<KeywordStyle>(() => parseKwStyle(object))
  const [texThumbs, setTexThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    setStyle(parseKwStyle(object))
  }, [object])

  // Lazy-load texture thumbnails when texture tab is active
  useEffect(() => {
    if (style.mode !== 'texture') return
    const next: Record<string, string> = {}
    TEX_PRESETS.forEach(p => { if (!texThumbs[p.id]) next[p.id] = getPresetSrc(p.id) })
    if (Object.keys(next).length) setTexThumbs(prev => ({ ...prev, ...next }))
  }, [style.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (s: KeywordStyle): void => {
    setStyle(s)
    ;(object as FabricObject & { eliteHighlightStyle?: string }).eliteHighlightStyle = JSON.stringify(s)
  }

  const up = (patch: Partial<KeywordStyle>): void => save({ ...style, ...patch })

  const NUM = 'bg-elite-800 border border-elite-600/40 rounded px-1.5 py-1 text-[10px] text-warm font-mono outline-none focus:border-accent/60'

  return (
    <div>
      <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-2">
        Keyword Style
      </label>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-2.5">
        {(['solid', 'gradient', 'texture'] as KwMode[]).map(m => (
          <button key={m} onClick={() => up({ mode: m })}
            className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer capitalize ${
              style.mode === m
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'text-warm-faint hover:text-warm bg-elite-800 border border-elite-600/30'
            }`}>
            {m === 'solid' ? '● Solid' : m === 'gradient' ? '◑ Grad' : '▣ Texture'}
          </button>
        ))}
      </div>

      {/* ── Solid ── */}
      {style.mode === 'solid' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="color" value={style.color}
              onChange={e => up({ color: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
            <input type="text" value={style.color}
              onChange={e => up({ color: e.target.value })}
              className={`flex-1 ${NUM}`}/>
          </div>
          <div className="flex gap-1 flex-wrap">
            {SOLID_SWATCHES.map(c => (
              <button key={c} onClick={() => up({ color: c })}
                style={{
                  width: 20, height: 20, borderRadius: 4, background: c,
                  border: 'none', cursor: 'pointer',
                  outline: style.color.toLowerCase() === c.toLowerCase() ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent',
                  outlineOffset: 1.5, transition: 'transform .1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Gradient ── */}
      {style.mode === 'gradient' && (
        <div className="space-y-2">
          {/* Preview bar */}
          <div style={{
            height: 10, borderRadius: 6,
            background: `linear-gradient(90deg, ${style.fromColor}, ${style.toColor})`,
            border: '1px solid rgba(255,255,255,0.1)',
          }}/>
          {/* From / To pickers */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-warm-faint w-7 shrink-0">From</span>
            <input type="color" value={style.fromColor} onChange={e => up({ fromColor: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
            <input type="text" value={style.fromColor} onChange={e => up({ fromColor: e.target.value })}
              className={`flex-1 ${NUM}`}/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-warm-faint w-7 shrink-0">To</span>
            <input type="color" value={style.toColor} onChange={e => up({ toColor: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
            <input type="text" value={style.toColor} onChange={e => up({ toColor: e.target.value })}
              className={`flex-1 ${NUM}`}/>
          </div>
          {/* Preset swatches */}
          <div className="flex gap-1 flex-wrap">
            {GRAD_PRESETS.map(p => (
              <button key={p.label} title={p.label}
                onClick={() => up({ fromColor: p.from, toColor: p.to })}
                style={{
                  width: 28, height: 14, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                  background: p.css, border: '1px solid rgba(255,255,255,0.1)',
                  outline: style.fromColor === p.from && style.toColor === p.to ? '2px solid rgba(255,255,255,0.7)' : '2px solid transparent',
                  outlineOffset: 1,
                }}/>
            ))}
          </div>
        </div>
      )}

      {/* ── Texture ── */}
      {style.mode === 'texture' && (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-1">
            {TEX_PRESETS.map(p => {
              const src = texThumbs[p.id] ?? ''
              const isActive = style.texPresetId === p.id
              return (
                <button key={p.id} title={p.name}
                  onClick={() => {
                    const src2 = getPresetSrc(p.id)
                    const merged = { ...DEFAULT_TEXTURE, ...presetToParams(p.id, src2) }
                    up({ texPresetId: p.id, texSrc: src2, texParams: merged })
                    setTexThumbs(prev => ({ ...prev, [p.id]: src2 }))
                  }}
                  className={`aspect-square rounded overflow-hidden border transition-all cursor-pointer ${
                    isActive ? 'border-accent ring-1 ring-accent/40 scale-105' : 'border-elite-600/30 hover:border-accent/40'
                  }`}
                  style={{ backgroundImage: src ? `url(${src})` : undefined, backgroundSize: 'cover' }}>
                  {!src && <span className="text-[7px] text-warm-faint block text-center leading-tight p-0.5">{p.name}</span>}
                </button>
              )
            })}
          </div>
          {style.texPresetId && (
            <p className="text-[9px] text-accent/70">
              Selected: {TEX_PRESETS.find(p => p.id === style.texPresetId)?.name ?? style.texPresetId}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
