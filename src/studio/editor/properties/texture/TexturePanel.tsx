/**
 * TexturePanel.tsx — Shared texture editor UI.
 * Used under "Text Color" (text objects) and "Fill" (shapes/frames).
 * Pure UI: calls onChange/onClear; parent handles engine calls.
 */
import React, { useState, useEffect, type ChangeEvent } from 'react'
import { PRESETS, getPresetSrc, PRESET_CATEGORIES, presetToParams } from './presets'
import type { PresetCategory } from './presets'
import type { TextureParams, BlendMode } from './types'
import { DEFAULT_TEXTURE } from './types'

const BLEND_MODES: BlendMode[] = [
  'normal','multiply','screen','overlay','soft-light',
  'hard-light','darken','lighten','color-dodge','color-burn','difference','exclusion',
]

const NUM = 'w-[38px] shrink-0 bg-elite-800 border border-elite-600/40 rounded px-1 py-0.5 text-[10px] text-warm font-mono outline-none focus:border-accent/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

// ── Slider row ─────────────────────────────────────────────────────────────────
function SR({
  label, min, max, step = 1, value, unit = '', onChange,
}: {
  label: string; min: number; max: number; step?: number
  value: number; unit?: string; onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-warm-faint w-[52px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
        className="flex-1 accent-accent h-1 min-w-0"/>
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={e => {
          const v = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value)
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className={NUM}/>
      {unit && <span className="text-[9px] text-warm-faint shrink-0">{unit}</span>}
    </div>
  )
}

// ── Preset grid ────────────────────────────────────────────────────────────────
function PresetGrid({ selected, onSelect }: {
  selected?: string
  onSelect: (id: string, src: string) => void
}): JSX.Element {
  const [cat, setCat]           = useState<PresetCategory>('grain')
  const [thumbs, setThumbs]     = useState<Record<string, string>>({})
  const catPresets              = PRESETS.filter(p => p.category === cat)

  useEffect(() => {
    const next: Record<string, string> = {}
    catPresets.forEach(p => { if (!thumbs[p.id]) next[p.id] = getPresetSrc(p.id) })
    if (Object.keys(next).length) setThumbs(prev => ({ ...prev, ...next }))
  }, [cat]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1.5">
      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        {PRESET_CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-2 py-0.5 text-[9px] rounded capitalize cursor-pointer transition-colors ${
              cat === c
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-elite-800 text-warm-faint border border-elite-600/30 hover:text-warm'
            }`}>
            {c}
          </button>
        ))}
      </div>
      {/* Thumbnail grid */}
      <div className="grid grid-cols-5 gap-1">
        {catPresets.map(p => {
          const src = thumbs[p.id] ?? ''
          return (
            <button key={p.id} title={p.name} onClick={() => onSelect(p.id, src)}
              className={`aspect-square rounded overflow-hidden border transition-all cursor-pointer ${
                selected === p.id
                  ? 'border-accent ring-1 ring-accent/40 scale-105'
                  : 'border-elite-600/30 hover:border-accent/40'
              }`}
              style={{ backgroundImage: src ? `url(${src})` : undefined, backgroundSize: 'cover' }}>
              {!src && <span className="text-[8px] text-warm-faint p-1 block text-center leading-tight">{p.name}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export interface TexturePanelProps {
  params: TextureParams
  onChange: (p: TextureParams) => void
  onClear: () => void
}

export function TexturePanel({ params, onChange, onClear }: TexturePanelProps): JSX.Element {
  const up = <K extends keyof TextureParams>(k: K, v: TextureParams[K]): void =>
    onChange({ ...params, [k]: v })

  const upload = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => onChange({ ...params, src: ev.target?.result as string, presetId: undefined })
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  const selectPreset = (id: string, src: string): void => {
    const merged = presetToParams(id, src)
    onChange({ ...DEFAULT_TEXTURE, ...merged })
  }

  return (
    <div
      className="space-y-3"
      onMouseDown={(e: React.MouseEvent) => {
        const tag = (e.target as HTMLElement).tagName
        if (!['INPUT','TEXTAREA','LABEL','SELECT','BUTTON','OPTION'].includes(tag)) e.preventDefault()
      }}
    >

      {/* ── Source ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Source</span>
          {params.src && (
            <button onClick={onClear}
              className="text-[9px] text-warm-faint hover:text-red-400 cursor-pointer transition-colors">
              Clear
            </button>
          )}
        </div>
        <PresetGrid selected={params.presetId} onSelect={selectPreset}/>
        {/* Upload */}
        <label className="flex items-center gap-2 px-3 py-1.5 bg-elite-800 border border-elite-600/40 rounded cursor-pointer hover:border-accent/40 transition-colors">
          {params.src && !params.presetId
            ? <img src={params.src} className="w-6 h-6 rounded object-cover shrink-0" alt="tex"/>
            : <span className="text-warm-faint text-[13px] shrink-0 leading-none">↑</span>
          }
          <span className="text-[10px] text-warm-faint">
            {params.src && !params.presetId ? 'Change image' : 'Upload custom (PNG/JPG)'}
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload}/>
        </label>
      </div>

      {/* ── Mapping ── */}
      <div className="space-y-1.5">
        <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Mapping</span>
        <div className="flex gap-1">
          {(['tile','fill','fit'] as const).map(m => (
            <button key={m} onClick={() => up('mapping', m)}
              className={`flex-1 py-1 text-[10px] capitalize rounded cursor-pointer transition-colors ${
                params.mapping === m
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-elite-800 text-warm-faint border border-elite-600/30 hover:text-warm'
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Adjustments ── */}
      <div className="space-y-1.5">
        <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Adjustments</span>
        <SR label="Scale"    min={10}   max={500} value={params.scale}      unit="%" onChange={v => up('scale', v)}/>
        <SR label="Intensity" min={0}   max={100} value={params.intensity}  unit="%" onChange={v => up('intensity', v)}/>
        <SR label="Rotation" min={0}    max={360} value={params.rotation}   unit="°" onChange={v => up('rotation', v)}/>
        {params.mapping === 'tile' && <>
          <SR label="Offset X" min={0} max={100} value={params.offsetX} unit="%" onChange={v => up('offsetX', v)}/>
          <SR label="Offset Y" min={0} max={100} value={params.offsetY} unit="%" onChange={v => up('offsetY', v)}/>
        </>}
        <SR label="Bright"   min={-100} max={100} value={params.brightness} onChange={v => up('brightness', v)}/>
        <SR label="Contrast" min={-100} max={100} value={params.contrast}   onChange={v => up('contrast', v)}/>
        <SR label="Blur"     min={0}    max={20}  value={params.blur}       unit="px" onChange={v => up('blur', v)}/>
      </div>

      {/* ── Color tint ── */}
      <div className="space-y-1.5">
        <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Color Tint</span>
        <div className="flex items-center gap-2">
          <input type="color" value={params.tintColor} onChange={e => up('tintColor', e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
          <input type="range" min={0} max={100} value={params.tintStrength}
            onChange={e => up('tintStrength', parseInt(e.target.value))}
            className="flex-1 accent-accent h-1"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right shrink-0">{params.tintStrength}%</span>
        </div>
      </div>

      {/* ── Blend ── */}
      <div className="space-y-1.5">
        <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Blend</span>
        <select value={params.blendMode} onChange={e => up('blendMode', e.target.value as BlendMode)}
          className="w-full bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[10px] text-warm outline-none focus:border-accent/60 cursor-pointer capitalize">
          {BLEND_MODES.map(m => (
            <option key={m} value={m} className="capitalize">{m}</option>
          ))}
        </select>
      </div>

    </div>
  )
}
