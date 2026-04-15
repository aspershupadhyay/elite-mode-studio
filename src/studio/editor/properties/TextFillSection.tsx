/**
 * TextFillSection.tsx — 3-mode text fill selector for the sidebar.
 *
 * Modes
 * ─────
 * Solid    — hex-color fill at object level OR per-span when text is selected.
 * Gradient — whole object: Fabric.Gradient fill; partial selection: per-char
 *            color approximation (colors interpolated from gradient stops).
 * Texture  — Fabric.Pattern from an uploaded image, always whole-object.
 *
 * All params are round-tripped via elite* custom properties so they survive
 * JSON export/import and session restore.
 */
import React, { useState, useEffect, useRef } from 'react'
import * as fabric from 'fabric'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import '@/types/fabric-custom'
import { TexturePanel, applyTexture, removeTexture, parseTexture, restoreTexturePatch,
         applyCharTexture, removeCharTexture, removeAllCharTextures, updateAllCharTextures,
         DEFAULT_TEXTURE } from './texture'
import type { TextureParams } from './texture'

// ── Internal types ─────────────────────────────────────────────────────────────
export type TextFillMode = 'solid' | 'gradient' | 'texture'

interface GradStop   { color: string; opacity: number; position: number }
interface GradParams { type: 'linear' | 'radial'; angle: number; stops: GradStop[] }

// ─────────────────────────────────────────────────────────────────────────────
type FabObj = FabricObject & {
  eliteTextFillMode?: TextFillMode
  eliteGradientFill?: string
  eliteTextureFill?: string
  eliteCharTextures?: string   // JSON EliteCharTextureRange[] — mirrors TexFabObj
  eliteSolidFill?: string
  dirty?: boolean
  _eliteOrigRender?: (ctx: CanvasRenderingContext2D) => void
  _eliteTexImg?: HTMLImageElement
  _eliteTexParams?: TextureParams
}

/** IText/Textbox methods needed for per-char gradient application. */
type FabIText = FabObj & {
  selectionStart: number
  selectionEnd: number
  setSelectionStyles: (styles: Record<string, unknown>, start?: number, end?: number) => void
}

// ── Gradient color interpolation helpers ───────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Sample a gradient's color stops at position t (0–1). */
function interpolateGradColor(stops: GradStop[], t: number): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const pos = t * 100
  if (pos <= sorted[0].position) return sorted[0].color
  if (pos >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].color
  for (let i = 0; i < sorted.length - 1; i++) {
    if (pos >= sorted[i].position && pos <= sorted[i + 1].position) {
      const span = sorted[i + 1].position - sorted[i].position
      const f = span === 0 ? 0 : (pos - sorted[i].position) / span
      const [r1, g1, b1] = hexToRgb(sorted[i].color)
      const [r2, g2, b2] = hexToRgb(sorted[i + 1].color)
      return `rgb(${Math.round(r1 + (r2 - r1) * f)},${Math.round(g1 + (g2 - g1) * f)},${Math.round(b1 + (b2 - b1) * f)})`
    }
  }
  return sorted[sorted.length - 1].color
}

// ── Defaults & presets ─────────────────────────────────────────────────────────
const D_GRAD: GradParams = {
  type: 'linear', angle: 180,
  stops: [{ color: '#FFD700', opacity: 1, position: 0 }, { color: '#FFA500', opacity: 1, position: 100 }],
}

const PRESETS: Array<{ label: string; css: string; g: GradParams }> = [
  { label: 'Gold',   css: 'linear-gradient(180deg,#FFD700,#FFA500)', g: { type: 'linear', angle: 180, stops: [{ color: '#FFD700', opacity: 1, position: 0 }, { color: '#FFA500', opacity: 1, position: 100 }] } },
  { label: 'Silver', css: 'linear-gradient(180deg,#FFFFFF,#888888)', g: { type: 'linear', angle: 180, stops: [{ color: '#FFFFFF', opacity: 1, position: 0 }, { color: '#888888', opacity: 1, position: 100 }] } },
  { label: 'Fire',   css: 'linear-gradient(180deg,#FF6B00,#FF0000)', g: { type: 'linear', angle: 180, stops: [{ color: '#FF6B00', opacity: 1, position: 0 }, { color: '#FF0000', opacity: 1, position: 100 }] } },
  { label: 'Ice',    css: 'linear-gradient(180deg,#A8EDFF,#0A84FF)', g: { type: 'linear', angle: 180, stops: [{ color: '#A8EDFF', opacity: 1, position: 0 }, { color: '#0A84FF', opacity: 1, position: 100 }] } },
  { label: 'Neon',   css: 'linear-gradient(180deg,#39FF14,#00C853)', g: { type: 'linear', angle: 180, stops: [{ color: '#39FF14', opacity: 1, position: 0 }, { color: '#00C853', opacity: 1, position: 100 }] } },
  { label: 'Violet', css: 'linear-gradient(180deg,#E879F9,#8B5CF6)', g: { type: 'linear', angle: 180, stops: [{ color: '#E879F9', opacity: 1, position: 0 }, { color: '#8B5CF6', opacity: 1, position: 100 }] } },
]

const SWATCHES = ['#EAEAEA', '#FFFFFF', '#0BDA76', '#FFD93D', '#4488FF', '#FF4444', '#E879F9', '#FF6B00', '#00BFFF', '#111111']

// ── Utility functions ──────────────────────────────────────────────────────────
function parseGrad(obj: FabObj): GradParams {
  if (obj.eliteGradientFill) {
    try { return JSON.parse(obj.eliteGradientFill) as GradParams } catch { /* */ }
  }
  return { ...D_GRAD, stops: D_GRAD.stops.map(s => ({ ...s })) }
}


function stopToFabric(s: GradStop): { offset: number; color: string } {
  if (s.opacity < 1) {
    const [r, g, b] = [parseInt(s.color.slice(1, 3), 16), parseInt(s.color.slice(3, 5), 16), parseInt(s.color.slice(5, 7), 16)]
    return { offset: s.position / 100, color: `rgba(${r},${g},${b},${s.opacity.toFixed(2)})` }
  }
  return { offset: s.position / 100, color: s.color }
}

/**
 * Build a Fabric gradient using PIXEL coordinates derived from the text object's
 * actual dimensions. Using gradientUnits:'pixels' (the default) is the only mode
 * that works reliably for Textbox fills in Fabric v6.
 */
function buildFabricGradient(p: GradParams, w: number, h: number): fabric.Gradient<'linear' | 'radial'> {
  const colorStops = p.stops.map(stopToFabric)
  if (p.type === 'radial') {
    return new fabric.Gradient({
      type: 'radial',
      coords: { r1: 0, r2: Math.max(w, h) / 2, x1: w / 2, y1: h / 2, x2: w / 2, y2: h / 2 },
      colorStops,
    })
  }
  // CSS-equivalent angle: 0°=bottom→top, 90°=left→right, 180°=top→bottom
  const rad = (p.angle * Math.PI) / 180
  const sin = Math.sin(rad), cos = Math.cos(rad)
  return new fabric.Gradient({
    type: 'linear',
    coords: {
      x1: w / 2 - sin * w / 2, y1: h / 2 + cos * h / 2,
      x2: w / 2 + sin * w / 2, y2: h / 2 - cos * h / 2,
    },
    colorStops,
  })
}

function gradCss(p: GradParams): string {
  const stops = p.stops.map(s => {
    if (s.opacity < 1) {
      const [r, g, b] = [parseInt(s.color.slice(1, 3), 16), parseInt(s.color.slice(3, 5), 16), parseInt(s.color.slice(5, 7), 16)]
      return `rgba(${r},${g},${b},${s.opacity}) ${s.position}%`
    }
    return `${s.color} ${s.position}%`
  }).join(', ')
  return p.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${p.angle}deg, ${stops})`
}

function applyGrad(obj: FabObj, p: GradParams, c: FabricCanvas): void {
  removeTexture(obj, c)
  obj.eliteTextFillMode = 'gradient'
  obj.eliteGradientFill = JSON.stringify(p)
  // Compute pixel dimensions — gradient coords are in the object's local space
  const w = (obj.width ?? 200) * (obj.scaleX ?? 1)
  const h = (obj.height ?? 60)  * (obj.scaleY ?? 1)
  obj.set('fill', buildFabricGradient(p, w, h))
  obj.dirty = true
  c.renderAll()
}

/**
 * Smart gradient apply:
 * - If the text object has an active character selection → interpolate gradient
 *   colors per-character and apply as solid per-char fills via setSelectionStyles.
 * - Otherwise → apply as a native Fabric.Gradient on the whole object.
 */
function applyGradSmart(obj: FabObj, p: GradParams, c: FabricCanvas, inSel: boolean): void {
  const to = obj as unknown as FabIText
  const start = to.selectionStart ?? 0
  const end   = to.selectionEnd   ?? 0
  const hasSelection = inSel && start !== end

  if (hasSelection) {
    const count = end - start
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1)
      to.setSelectionStyles({ fill: interpolateGradColor(p.stops, t) }, start + i, start + i + 1)
    }
    obj.eliteTextFillMode = 'gradient'
    obj.eliteGradientFill = JSON.stringify(p)
    obj.dirty = true
    c.requestRenderAll()
  } else {
    applyGrad(obj, p, c)
  }
}

// ── applyTex shim — delegates to shared engine, also sets eliteTextFillMode ──
function applyTex(obj: FabObj, p: TextureParams, c: FabricCanvas): void {
  obj.eliteTextFillMode = 'texture'
  // Normalize fill to a string so the floating toolbar ColorPill always has a
  // valid hex/rgb value — Gradient and Pattern objects cause the "A" to go blank.
  const raw = (obj as FabricObject).fill
  if (typeof raw !== 'string') {
    ;(obj as FabricObject).set('fill', obj.eliteSolidFill || '#EAEAEA')
  }
  applyTexture(obj, p, c)
}

/**
 * Smart texture apply — three-way dispatch:
 * 1. Active char selection  → applyCharTexture([start, end))
 * 2. No selection but obj already has char textures → updateAllCharTextures
 *    (lets the user retune an existing char texture after deselecting / switching elements)
 * 3. No char textures at all → applyTexture on the whole object
 */
function applyTexSmart(
  obj:      FabObj,
  p:        TextureParams,
  c:        FabricCanvas,
  inSel:    boolean,
): void {
  const to     = obj as unknown as FabIText
  const s      = to.selectionStart ?? 0
  const e      = to.selectionEnd   ?? 0
  const hasSel = inSel && s !== e

  obj.eliteTextFillMode = 'texture'
  if (hasSel) {
    applyCharTexture(obj, s, e, p, c)
  } else if (obj.eliteCharTextures && !hasSel) {
    // Re-tuning existing char textures without re-entering selection mode
    updateAllCharTextures(obj as Parameters<typeof updateAllCharTextures>[0], p, c)
  } else {
    applyTexture(obj, p, c)
  }
}

// ── GradEditor sub-component — Figma-style interactive gradient bar ────────────
function GradEditor({ params, onChange }: { params: GradParams; onChange: (p: GradParams) => void }): JSX.Element {
  const [selIdx, setSelIdx]         = useState(0)
  const [angleDraft, setAngleDraft] = useState(String(params.angle))
  const barRef   = useRef<HTMLDivElement>(null)
  // Refs keep the drag handler free of stale closures without re-registering listeners
  const paramsRef   = useRef(params)
  const onChangeRef = useRef(onChange)
  const dragRef     = useRef<{ i: number; startX: number; startPos: number } | null>(null)

  useEffect(() => { paramsRef.current = params },   [params])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { setAngleDraft(String(params.angle)) }, [params.angle])
  // Reset selected stop when a preset is applied (stop count may change)
  useEffect(() => { setSelIdx(0) }, [params.stops.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global drag tracking — registered once, reads fresh values via refs
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const drag = dragRef.current
      if (!drag || !barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const newPos = Math.round(Math.min(100, Math.max(0,
        drag.startPos + ((e.clientX - drag.startX) / rect.width) * 100
      )))
      const stops = paramsRef.current.stops.map((s, xi) => xi === drag.i ? { ...s, position: newPos } : s)
      onChangeRef.current({ ...paramsRef.current, stops })
    }
    const onUp = (): void => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const clamped = Math.min(selIdx, params.stops.length - 1)
  const sel     = params.stops[clamped]

  const setStop = (i: number, upd: Partial<GradStop>): void =>
    onChange({ ...params, stops: params.stops.map((s, xi) => xi === i ? { ...s, ...upd } : s) })

  // Click on bar empty area → interpolate color and insert new stop
  const onBarClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).dataset.stopMarker) return
    if (!barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const t    = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const pos  = Math.round(t * 100)
    const color = interpolateGradColor(params.stops, t)
    const newStops = [...params.stops, { color, opacity: 1, position: pos }]
      .sort((a, b) => a.position - b.position)
    const newI = newStops.findIndex(s => s.position === pos && s.color === color)
    setSelIdx(newI >= 0 ? newI : newStops.length - 1)
    onChange({ ...params, stops: newStops })
  }

  const removeStop = (i: number): void => {
    if (params.stops.length <= 2) return
    const stops = params.stops.filter((_, xi) => xi !== i)
    setSelIdx(Math.min(i, stops.length - 1))
    onChange({ ...params, stops })
  }

  const NUM_CLS = 'bg-elite-800 border border-elite-600/40 rounded px-1 py-0.5 text-[10px] text-warm font-mono outline-none focus:border-accent/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

  return (
    <div className="space-y-2.5">

      {/* ── Interactive gradient bar ── */}
      <div
        ref={barRef}
        onClick={onBarClick}
        style={{
          position: 'relative', height: 22, borderRadius: 7,
          background: gradCss(params),
          border: '1px solid rgba(255,255,255,0.12)',
          cursor: 'crosshair',
        }}
      >
        {params.stops.map((s, i) => (
          <div
            key={i}
            data-stop-marker="1"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => {
              e.preventDefault(); e.stopPropagation()
              setSelIdx(i)
              dragRef.current = { i, startX: e.clientX, startPos: s.position }
            }}
            style={{
              position: 'absolute',
              left: `${s.position}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 16, height: 16, borderRadius: '50%',
              background: s.color,
              border: clamped === i
                ? '2.5px solid #fff'
                : '2px solid rgba(255,255,255,0.45)',
              boxShadow: clamped === i
                ? '0 0 0 1.5px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.5)'
                : '0 1px 4px rgba(0,0,0,0.45)',
              cursor: 'grab', zIndex: clamped === i ? 2 : 1,
              transition: 'border .12s, box-shadow .12s',
            }}
          />
        ))}
      </div>

      {/* ── Selected stop controls ── */}
      {sel && (
        <div className="flex items-center gap-1.5">
          <input type="color" value={sel.color}
            onChange={e => setStop(clamped, { color: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
          <input type="text" value={sel.color}
            onChange={e => setStop(clamped, { color: e.target.value })}
            className={`flex-1 min-w-0 ${NUM_CLS}`}/>
          <span className="text-[9px] text-warm-faint shrink-0">pos</span>
          <input type="number" min={0} max={100} value={sel.position}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setStop(clamped, { position: Math.min(100, Math.max(0, v)) }) }}
            className={`w-8 shrink-0 ${NUM_CLS}`}/>
          <span className="text-[9px] text-warm-faint shrink-0">α</span>
          <input type="number" min={0} max={100} value={Math.round(sel.opacity * 100)}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setStop(clamped, { opacity: Math.min(1, Math.max(0, v / 100)) }) }}
            className={`w-8 shrink-0 ${NUM_CLS}`}/>
          {params.stops.length > 2 && (
            <button onClick={() => removeStop(clamped)}
              className="text-[9px] text-warm-faint hover:text-red-400 cursor-pointer shrink-0">✕</button>
          )}
        </div>
      )}

      {/* ── Linear / Radial toggle ── */}
      <div className="flex gap-1.5">
        {(['linear', 'radial'] as const).map(t => (
          <button key={t} onClick={() => onChange({ ...params, type: t })}
            className={`px-3 py-1 text-[10px] rounded capitalize cursor-pointer transition-colors ${params.type === t ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-elite-800 text-warm-faint border border-elite-600/30 hover:text-warm'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Angle row (linear only) ── */}
      {params.type === 'linear' && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-warm-faint w-[44px] shrink-0">Angle</span>
          <input type="range" min={0} max={360} step={1} value={params.angle}
            onChange={e => onChange({ ...params, angle: parseInt(e.target.value) })}
            className="flex-1 accent-accent h-1 min-w-0"/>
          <input type="number" min={0} max={360} value={angleDraft}
            onChange={e => {
              setAngleDraft(e.target.value)
              const v = parseInt(e.target.value)
              if (!isNaN(v)) onChange({ ...params, angle: Math.min(360, Math.max(0, v)) })
            }}
            onBlur={() => setAngleDraft(String(params.angle))}
            className={`w-9 shrink-0 ${NUM_CLS}`}/>
          <span className="text-[9px] text-warm-faint shrink-0">°</span>
        </div>
      )}

      {/* ── Presets ── */}
      <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {PRESETS.map(p => (
          <button key={p.label} title={p.label}
            onClick={() => { onChange(p.g); setSelIdx(0) }}
            style={{ background: p.css, width: 22, height: 22, borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', flexShrink: 0 }}/>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export interface TextFillSectionProps {
  object: FabricObject
  canvas: FabricCanvas
  inSelectionMode: boolean
  selFill: string | null
  selMixedFill: boolean
  onApplyInline: (styles: Record<string, string | number | boolean | null>) => void
  onUpdate: (key: string, value: string | number | boolean) => void
}

export function TextFillSection({
  object, canvas, inSelectionMode, selFill, selMixedFill, onApplyInline, onUpdate,
}: TextFillSectionProps): JSX.Element {
  const obj = object as FabObj
  const [mode, setMode]             = useState<TextFillMode>(() => obj.eliteTextFillMode || 'solid')
  const [gradParams, setGradParams] = useState<GradParams>(() => parseGrad(obj))
  const [texParams, setTexParams]   = useState<TextureParams>(() => parseTexture(obj))

  // Re-sync local state when a different object is selected.
  // Re-apply texture patch if the object had texture mode (patch lives on the instance).
  useEffect(() => {
    const o = object as FabObj
    const m = o.eliteTextFillMode || 'solid'
    setMode(m)
    setGradParams(parseGrad(o))

    // Resolve which params to show in the texture panel.
    // Priority: object-level texture > first char-texture range > defaults.
    // Without this, re-selecting an object with char textures shows empty defaults
    // and the user can't adjust the already-applied texture.
    let tp = parseTexture(o)
    if (m === 'texture' && !o.eliteTextureFill && o.eliteCharTextures) {
      try {
        const ranges = JSON.parse(o.eliteCharTextures) as Array<{ params: TextureParams }>
        if (ranges[0]?.params?.src) tp = { ...DEFAULT_TEXTURE, ...ranges[0].params }
      } catch { /* */ }
    }
    setTexParams(tp)

    // Restore render patches so textures show correctly after re-selection
    if (m === 'texture') restoreTexturePatch(o as Parameters<typeof restoreTexturePatch>[0], canvas)
  }, [object]) // eslint-disable-line react-hooks/exhaustive-deps

  // Solid fill — reads current string fill or falls back to last stored solid
  const solidFill = typeof object.fill === 'string'
    ? (object.fill as string)
    : (obj.eliteSolidFill || '#EAEAEA')

  const switchMode = (m: TextFillMode): void => {
    // Preserve the current string fill before entering gradient/texture mode
    if (m !== 'solid' && typeof obj.fill === 'string') {
      obj.eliteSolidFill = obj.fill as string
    }
    if (m === 'gradient') {
      removeTexture(obj, canvas)
      applyGradSmart(obj, gradParams, canvas, inSelectionMode)
    } else if (m === 'texture') {
      if (texParams.src) {
        applyTex(obj, texParams, canvas)
      } else {
        obj.eliteTextFillMode = 'texture'
        obj.set('fill', obj.eliteSolidFill || '#EAEAEA')
        obj.dirty = true; canvas.renderAll()
      }
    } else {
      removeTexture(obj, canvas)
      obj.eliteTextFillMode = 'solid'
      obj.set('fill', obj.eliteSolidFill || '#EAEAEA')
      obj.dirty = true; canvas.renderAll()
    }
    setMode(m)
  }

  const setSolid = (c: string): void => {
    obj.eliteSolidFill = c
    if (inSelectionMode) {
      // Only apply per-span when there is an actual selection (not cursor-only).
      // Fabric's selectionStart/End live on IText/Textbox; cast via unknown to avoid strict error.
      const to = obj as unknown as { selectionStart?: number; selectionEnd?: number }
      const hasSelection = to.selectionStart !== undefined && to.selectionEnd !== undefined
        && to.selectionStart !== to.selectionEnd
      if (hasSelection) {
        onApplyInline({ fill: c })
        return
      }
    }
    onUpdate('fill', c)
  }

  const handleGradChange = (p: GradParams): void => {
    setGradParams(p)
    applyGradSmart(obj, p, canvas, inSelectionMode)
  }

  const handleTexChange = (p: TextureParams): void => {
    setTexParams(p)
    applyTexSmart(obj, p, canvas, inSelectionMode)
  }

  const handleTexClear = (): void => {
    // Context-aware: if in selection mode with an active selection, only
    // clear that character range; otherwise clear everything.
    const to    = obj as unknown as FabIText
    const s     = to.selectionStart ?? 0
    const e     = to.selectionEnd   ?? 0
    const hasSel = inSelectionMode && s !== e

    if (hasSel) {
      removeCharTexture(obj, s, e, canvas)
    } else {
      // Remove all char textures AND the object-level texture
      removeAllCharTextures(obj, canvas)
      removeTexture(obj, canvas)
      obj.eliteTextFillMode = 'solid'
      obj.set('fill', obj.eliteSolidFill || '#EAEAEA')
      obj.dirty = true; canvas.renderAll()
      setTexParams({ ...parseTexture(obj) })
      setMode('solid')
    }
  }

  return (
    // onMouseDown: preventDefault on non-interactive elements so Fabric's hidden
    // textarea doesn't lose focus during sidebar interaction.
    // Must allow INPUT, TEXTAREA, LABEL, SELECT, BUTTON, OPTION — blocking SELECT
    // prevents the blend-mode dropdown from opening.
    <div
      onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
        const tag = (e.target as HTMLElement).tagName
        if (!['INPUT','TEXTAREA','LABEL','SELECT','BUTTON','OPTION'].includes(tag)) {
          e.preventDefault()
        }
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Text Color</label>
      </div>

      {/* Mode toggle — always visible */}
      <div className="flex gap-1 mb-3">
        {(['solid', 'gradient', 'texture'] as TextFillMode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer ${
              mode === m
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'text-warm-faint hover:text-warm bg-elite-800 border border-elite-600/30'
            }`}>
            {m === 'solid' ? '● Solid' : m === 'gradient' ? '◑ Gradient' : '▣ Texture'}
          </button>
        ))}
      </div>

      {/* Solid mode */}
      {mode === 'solid' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="color"
              value={(typeof selFill === 'string' && inSelectionMode ? selFill : solidFill) || '#EAEAEA'}
              onChange={e => setSolid(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
            <input type="text"
              value={inSelectionMode ? (selMixedFill ? '(Mixed)' : (typeof selFill === 'string' ? selFill : '')) : solidFill}
              onChange={e => { if (!selMixedFill) setSolid(e.target.value) }}
              className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
            {!inSelectionMode && (
              <button onClick={() => onUpdate('fill', 'transparent')}
                className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer"
                title="No fill">∅</button>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {SWATCHES.map(c => {
              const activeFill = inSelectionMode ? selFill : solidFill
              const isActive = typeof activeFill === 'string' && activeFill.toLowerCase() === c.toLowerCase()
              return (
              <button key={c} onClick={() => setSolid(c)}
                style={{
                  width: 20, height: 20, borderRadius: 4, background: c,
                  border: 'none', cursor: 'pointer',
                  outline: isActive ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent',
                  outlineOffset: 1.5, transition: 'transform .1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.15)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              />
            )})}

          </div>
        </div>
      )}

      {/* Gradient mode */}
      {mode === 'gradient' && (
        <GradEditor params={gradParams} onChange={handleGradChange}/>
      )}

      {/* Texture mode */}
      {mode === 'texture' && (
        <TexturePanel
          params={texParams}
          onChange={handleTexChange}
          onClear={handleTexClear}
          selectionCharCount={
            (() => {
              const to = obj as unknown as FabIText
              const s  = to.selectionStart ?? 0
              const e  = to.selectionEnd   ?? 0
              return inSelectionMode && s !== e ? (e - s) : 0
            })()
          }
        />
      )}
    </div>
  )
}
