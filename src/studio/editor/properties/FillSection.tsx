import React, { useState, useEffect } from 'react'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import '@/types/fabric-custom'
import { DropletIcon } from '../../icons/Icons'
import { TexturePanel, applyTexture, removeTexture, parseTexture, supportsTextureFill } from './texture'
import type { TextureParams } from './texture'
import { useBrandKit } from './BrandKitPanel'

const COLOR_PALETTE = [
  '#FFFFFF','#EAEAEA','#CCCCCC','#999999','#666666','#444444','#222222','#111111',
  '#FF4444','#FF6B6B','#FF8C42','#FFA62F','#FFD93D','#FFE066','#B8F2E6','#AED9E0',
  '#4488FF','#5C7AEA','#8B5CF6','#A78BFA','#C084FC','#E879F9','#F472B6','#FB7185',
  '#0BDA76','#34D399','#2DD4BF','#22D3EE','#38BDF8','#60A5FA','#818CF8','#A78BFA',
  '#10B981','#059669','#047857','#065F46','#064E3B','#F59E0B','#D97706','#B45309',
]

export interface FillSectionProps {
  object: FabricObject
  canvas: FabricCanvas
  inSelectionMode: boolean
  selFill: string | null
  selMixedFill: boolean
  currentFill: string
  hasStringFill: boolean
  onApplyInline: (styles: Record<string, string | number | boolean | null>) => void
  onUpdate: (key: string, value: string | number) => void
  onPreview: (key: string, value: string) => void
  onClearPreview: (key: string) => void
}

const Section = ({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }): JSX.Element => (
  <div>
    <div className="flex items-center gap-1.5 mb-1.5">
      {icon && <span className="text-warm-faint">{icon}</span>}
      <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">{title}</label>
    </div>
    {children}
  </div>
)

const ColorSwatch = ({
  color, active, onClick, onEnter, onLeave,
}: {
  color: string; active: boolean; onClick: () => void; onEnter?: () => void; onLeave?: () => void
}): JSX.Element => (
  <button onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave}
    className={`w-full aspect-square rounded-sm border cursor-pointer transition-all duration-100 hover:scale-110 ${active ? 'border-accent ring-1 ring-accent/50 scale-110' : 'border-elite-600/30 hover:border-warm-faint'}`}
    style={{ backgroundColor: color }} title={color}/>
)

type FillMode = 'solid' | 'texture'

export function FillSection({
  object, canvas, inSelectionMode, selFill, selMixedFill,
  currentFill, hasStringFill, onApplyInline, onUpdate, onPreview, onClearPreview,
}: FillSectionProps): JSX.Element {
  const brand = useBrandKit()
  const canTexture = supportsTextureFill(object)
  const [fillMode, setFillMode] = useState<FillMode>(() =>
    object.eliteTextureFill ? 'texture' : 'solid'
  )
  const [texParams, setTexParams] = useState<TextureParams>(() => parseTexture(object))

  // Sync state when a different object is selected
  useEffect(() => {
    const hasTexture = !!object.eliteTextureFill
    setFillMode(hasTexture ? 'texture' : 'solid')
    const tp = parseTexture(object)
    setTexParams(tp)
    // Re-apply texture patch after re-selection if not yet patched
    if (hasTexture && tp.src && !(object as FabricObject & { _eliteOrigRender?: unknown })._eliteOrigRender) {
      applyTexture(object, tp, canvas)
    }
  }, [object]) // eslint-disable-line react-hooks/exhaustive-deps

  const dispFill = inSelectionMode ? (selMixedFill ? null : selFill) : (hasStringFill ? currentFill : null)
  const setFill  = (v: string): void => {
    if (inSelectionMode) onApplyInline({ fill: v })
    else onUpdate('fill', v)
  }

  const switchFillMode = (m: FillMode): void => {
    if (m === 'solid') {
      removeTexture(object, canvas)
      // Restore solid fill
      onUpdate('fill', currentFill || '#1A1A1A')
    } else {
      // Switching to texture — apply if we already have params with src
      if (texParams.src) applyTexture(object, texParams, canvas)
    }
    setFillMode(m)
  }

  const handleTexChange = (p: TextureParams): void => {
    setTexParams(p)
    applyTexture(object, p, canvas)
  }

  const handleTexClear = (): void => {
    removeTexture(object, canvas)
    onUpdate('fill', currentFill || '#1A1A1A')
    setFillMode('solid')
  }

  return (
    <Section icon={<DropletIcon/>} title={inSelectionMode ? 'Text Color · Selection' : 'Fill'}>
      {/* Mode tabs — only show texture tab if this element type supports it */}
      {canTexture && (
        <div className="flex gap-1 mb-2.5">
          {(['solid', 'texture'] as FillMode[]).map(m => (
            <button key={m} onClick={() => switchFillMode(m)}
              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors cursor-pointer capitalize ${
                fillMode === m
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-warm-faint hover:text-warm bg-elite-800 border border-elite-600/30'
              }`}>
              {m === 'solid' ? '● Solid' : '▣ Texture'}
            </button>
          ))}
        </div>
      )}

      {/* Solid fill */}
      {fillMode === 'solid' && (
        <>
          {inSelectionMode && selMixedFill && (
            <p className="text-[10px] text-warm-faint mb-2 italic">Mixed colors — choose to unify</p>
          )}
          <div className="flex items-center gap-2 mb-2">
            <input type="color" value={dispFill || '#EAEAEA'} onChange={e => setFill(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
            <input type="text"
              value={inSelectionMode ? (selMixedFill ? '(Mixed)' : (dispFill || '')) : (hasStringFill ? currentFill : 'gradient')}
              onChange={e => { if (!inSelectionMode || !selMixedFill) setFill(e.target.value) }}
              className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
            {!inSelectionMode && (
              <button onClick={() => onUpdate('fill', 'transparent')}
                className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer" title="No fill">∅</button>
            )}
          </div>
          {/* Brand colors row — appears above main palette when a brand is active */}
          {brand && brand.colors.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[8px] text-accent/60 uppercase tracking-widest font-semibold">Brand</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {brand.colors.map((c, i) => (
                  <button key={i} title={c}
                    style={{ background: c }}
                    onClick={() => setFill(c)}
                    onMouseEnter={() => { if (!inSelectionMode) onPreview('fill', c) }}
                    onMouseLeave={() => { if (!inSelectionMode) onClearPreview('fill') }}
                    className={`w-5 h-5 rounded border cursor-pointer transition-transform hover:scale-110 active:scale-95
                      ${(dispFill || '').toLowerCase() === c.toLowerCase() ? 'border-accent ring-1 ring-accent/50 scale-110' : 'border-white/10'}`}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-8 gap-1">
            {COLOR_PALETTE.map((c, i) => (
              <ColorSwatch key={i} color={c}
                active={(dispFill || '').toLowerCase() === c.toLowerCase()}
                onClick={() => setFill(c)}
                onEnter={() => { if (!inSelectionMode) onPreview('fill', c) }}
                onLeave={() => { if (!inSelectionMode) onClearPreview('fill') }}
              />
            ))}
          </div>
        </>
      )}

      {/* Texture fill */}
      {fillMode === 'texture' && (
        <TexturePanel params={texParams} onChange={handleTexChange} onClear={handleTexClear}/>
      )}
    </Section>
  )
}

// ── Stroke sub-section ────────────────────────────────────────────────────────
export function StrokeSection({
  currentStroke, strokeWidth, onUpdate,
}: {
  currentStroke: string; strokeWidth: number
  onUpdate: (key: string, value: string | number) => void
}): JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Stroke</label>
      </div>
      <div className="flex items-center gap-2 mb-2 w-full">
        <input type="color" value={currentStroke || '#0BDA76'} onChange={e => onUpdate('stroke', e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
        <input type="text" value={currentStroke || '#0BDA76'} onChange={e => onUpdate('stroke', e.target.value)}
          className="flex-1 min-w-0 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none uppercase"/>
        <div className="w-16 shrink-0">
          <div className="flex items-center bg-elite-800 border border-elite-600/40 rounded overflow-hidden">
            <span className="px-2 text-[10px] text-warm-faint font-mono bg-elite-850 py-1.5 border-r border-elite-600/30">W</span>
            <input type="number" value={strokeWidth || 0} onChange={e => onUpdate('strokeWidth', parseInt(e.target.value) || 0)}
              className="flex-1 bg-transparent px-2 py-1.5 text-[11px] text-warm font-mono outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
          </div>
        </div>
        <button onClick={() => { onUpdate('stroke', 'transparent'); onUpdate('strokeWidth', 0) }}
          className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer shrink-0" title="No stroke">∅</button>
      </div>
    </div>
  )
}

// ── Gradient overlay config (for eliteType='gradient' objects) ────────────────

const GRAD_DIRS = [
  { key: 'tb',   label: '↓', title: 'Top to Bottom'       },
  { key: 'bt',   label: '↑', title: 'Bottom to Top'       },
  { key: 'lr',   label: '→', title: 'Left to Right'       },
  { key: 'rl',   label: '←', title: 'Right to Left'       },
  { key: 'tlbr', label: '↘', title: 'Top-Left to Bottom-Right' },
  { key: 'trbl', label: '↙', title: 'Top-Right to Bottom-Left' },
  { key: 'bltr', label: '↗', title: 'Bottom-Left to Top-Right' },
  { key: 'brtl', label: '↖', title: 'Bottom-Right to Top-Left' },
]

export function GradientSection({
  gradColor, gradDir, gradStrength, gradOpacity,
  onUpdateGradient, onUpdateOpacity,
}: {
  gradColor: string; gradDir: string; gradStrength: number; gradOpacity: number
  onUpdateGradient: (color: string, dir: string, strength: number) => void
  onUpdateOpacity: (v: number) => void
}): JSX.Element {
  return (
    <Section title="Gradient Overlay">
      <div className="space-y-3">
        {/* Color */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-warm-faint w-12 shrink-0">Color</span>
          <input type="color" value={gradColor}
            onChange={e => onUpdateGradient(e.target.value, gradDir, gradStrength)}
            className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
          <span className="text-[10px] text-warm-faint font-mono flex-1">{gradColor.toUpperCase()}</span>
        </div>

        {/* Direction */}
        <div>
          <span className="text-[10px] text-warm-faint block mb-1.5">Direction</span>
          <div className="grid grid-cols-4 gap-1">
            {GRAD_DIRS.map(d => (
              <button key={d.key} title={d.title}
                onClick={() => onUpdateGradient(gradColor, d.key, gradStrength)}
                className={`py-1.5 text-[13px] rounded border cursor-pointer transition-colors ${
                  gradDir === d.key
                    ? 'bg-accent/20 text-accent border-accent/40'
                    : 'bg-elite-800 text-warm-faint border-elite-600/30 hover:border-warm-faint/40 hover:text-warm'
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Strength (dark end opacity) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-warm-faint w-12 shrink-0">Strength</span>
          <input type="range" min={0} max={1} step={0.05} value={gradStrength}
            onChange={e => onUpdateGradient(gradColor, gradDir, parseFloat(e.target.value))}
            className="flex-1 accent-accent h-1 cursor-pointer"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{Math.round(gradStrength * 100)}%</span>
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-warm-faint w-12 shrink-0">Opacity</span>
          <input type="range" min={0} max={1} step={0.05} value={gradOpacity}
            onChange={e => onUpdateOpacity(parseFloat(e.target.value))}
            className="flex-1 accent-accent h-1 cursor-pointer"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{Math.round(gradOpacity * 100)}%</span>
        </div>
      </div>
    </Section>
  )
}
