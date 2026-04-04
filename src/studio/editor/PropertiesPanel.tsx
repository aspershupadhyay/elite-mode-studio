import { useState, useEffect, useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import * as fabric from 'fabric'
import '@/types/fabric-custom'
import { getActiveProfile, saveProfile } from '@/utils/profileStorage'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import { loadGoogleFont } from '../data/fonts'
import { DropletIcon } from '../icons/Icons'
import { useToolbarState, useTextStyleStore } from '../text/TextStyleStore'
import { useShallow } from 'zustand/react/shallow'
import type { CanvasHandle } from '@/types/canvas'

import { PositionSection } from './properties/PositionSection'
import { FillSection, StrokeSection, GradientSection } from './properties/FillSection'
import { TextSection } from './properties/TextSection'
import { TextFillSection } from './properties/TextFillSection'
import { FrameSection } from './properties/FrameSection'
import { IconSection } from './properties/IconSection'
import { EffectsSection } from './properties/EffectsSection'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PropertiesPanelProps {
  selectedObject: FabricObject | null
  canvas: FabricCanvas | null
  canvasRef: RefObject<CanvasHandle | null>
}

interface ObjectProps {
  left: number
  top: number
  width: number
  height: number
  fill: string
  fontSize: number
  fontWeight: string
  fontFamily: string
  text: string
  opacity: number
  charSpacing: number
  lineHeight: number
  textAlign: string
  fontStyle: string
  underline: boolean
  stroke: string
  strokeWidth: number
  rx: number
}

// ── Palettes ──────────────────────────────────────────────────────────────────
const BG_PALETTE = [
  '#111111','#1A1A1A','#0A0A0A','#181818','#1E1E1E','#222222','#2A2A2A','#333333',
  '#0D1117','#161B22','#1C2128','#0E131A','#141A23','#112240','#1A2744','#0A192F',
  '#1B1B2F','#162447','#241b2f','#2D132C','#1F0C29','#0c0c1d','#100e1e','#141022',
  '#FFFFFF','#F5F5F5','#FAFAFA','#F0F0F0','#E8E8E8','#0BDA76','#0FA968','#0D8B56',
]

// ── Sub-components ────────────────────────────────────────────────────────────
const Section = ({ icon, title, children, collapsible = false, defaultOpen = true }: {
  icon?: React.ReactNode; title: string; children: React.ReactNode
  collapsible?: boolean; defaultOpen?: boolean
}): JSX.Element => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-elite-600/10 pb-3 last:border-0 last:pb-0">
      <button
        onClick={collapsible ? () => setOpen(!open) : undefined}
        className={`w-full flex items-center gap-1.5 mb-1.5 ${collapsible ? 'cursor-pointer group' : 'cursor-default'}`}
      >
        {collapsible && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            className="text-warm-faint group-hover:text-warm transition-colors flex-shrink-0"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        )}
        {icon && <span className="text-warm-faint">{icon}</span>}
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold pointer-events-none">{title}</label>
      </button>
      {open && children}
    </div>
  )
}

const ColorSwatch = ({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }): JSX.Element => (
  <button onClick={onClick}
    className={`w-full aspect-square rounded-sm border cursor-pointer transition-all duration-100 hover:scale-110 ${active ? 'border-accent ring-1 ring-accent/50 scale-110' : 'border-elite-600/30 hover:border-warm-faint'}`}
    style={{ backgroundColor: color }} title={color}/>
)

// ── Span-style keys that Fabric can store per-character ───────────────────────
const TEXT_SPAN_KEYS = new Set([
  'fill', 'fontFamily', 'fontWeight', 'fontStyle', 'underline',
  'fontSize', 'stroke', 'strokeWidth', 'textBackgroundColor', 'overline', 'linethrough',
])

type SpanStyleMap = Record<string, Record<string, Record<string, unknown>>>

/**
 * Remove per-character overrides for `keys` from every span in `obj.styles`.
 * This makes the object-level value show through for all characters.
 */
function clearAllSpanStyleKeys(
  obj: FabricObject,
  canvas: FabricCanvas,
  keys: string[],
): void {
  const text = obj as FabricObject & { styles?: SpanStyleMap; dirty?: boolean }
  if (!text.styles) return
  Object.values(text.styles).forEach(lineStyles => {
    Object.values(lineStyles).forEach(charStyle => {
      keys.forEach(k => { delete (charStyle as Record<string, unknown>)[k] })
    })
    Object.keys(lineStyles).forEach(ci => {
      if (Object.keys(lineStyles[Number(ci)] ?? {}).length === 0) delete lineStyles[Number(ci)]
    })
  })
  Object.keys(text.styles).forEach(li => {
    const ls = (text.styles as SpanStyleMap)[li]
    if (ls && Object.keys(ls).length === 0) delete (text.styles as SpanStyleMap)[li]
  })
  text.dirty = true
  canvas.renderAll()
}

// ── Content Slot Section ──────────────────────────────────────────────────────
function ContentSlotSection({
  selectedObject,
  canvas,
  canvasRef,
}: {
  selectedObject: FabricObject | null
  canvas: FabricCanvas | null
  canvasRef: RefObject<CanvasHandle | null>
}): JSX.Element {
  const profileFields = getActiveProfile().outputFields.filter(f => f.enabled)
  // Read directly from object — no local state needed, component remounts on selection change
  const currentSlot = selectedObject?.eliteType ?? ''

  const assignSlot = (fieldId: string): void => {
    if (!selectedObject || !canvas) return
    // Toggle off if already assigned to this field
    const newVal = selectedObject.eliteType === fieldId ? undefined : fieldId
    selectedObject.eliteType  = newVal as typeof selectedObject.eliteType
    // Auto-set eliteLabel to the field label so it shows in the layer panel
    if (newVal) {
      const field = profileFields.find(f => f.id === fieldId)
      if (field && !selectedObject.eliteLabel) {
        selectedObject.eliteLabel = field.label
      }
    }
    canvas.renderAll()
    canvasRef.current?.saveHistory()
    // Auto-add to profile slotMapping (non-preset profiles only)
    if (newVal) {
      const profile = getActiveProfile()
      if (!profile.isPreset) {
        const existing = profile.slotMapping ?? []
        if (!existing.some(m => m.fieldId === newVal)) {
          saveProfile({ ...profile, slotMapping: [...existing, { fieldId: newVal, eliteType: newVal }] })
        }
      }
    }
  }

  const clearSlot = (): void => {
    if (!selectedObject || !canvas) return
    selectedObject.eliteType  = undefined as typeof selectedObject.eliteType
    canvas.renderAll()
    canvasRef.current?.saveHistory()
  }

  if (!profileFields.length) {
    return (
      <Section title="Content Slot">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          No output fields defined. Go to Settings → Profiles and add output fields.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Content Slot">
      <p className="text-[10px] text-[var(--text-tertiary)] mb-3 leading-relaxed">
        Tap a field to link it to this element. Tap again to unlink.
      </p>
      <div className="flex flex-col gap-1.5">
        {profileFields.map(f => {
          const isActive = currentSlot === f.id
          return (
            <button
              key={f.id}
              onClick={() => assignSlot(f.id)}
              className="w-full text-left px-2.5 py-2 rounded-md text-[11px] font-medium transition-all"
              style={{
                background:  isActive ? 'rgba(11,218,118,0.15)' : 'var(--surface-2)',
                border:      `1px solid ${isActive ? 'var(--accent)' : 'var(--border-subtle)'}`,
                color:       isActive ? 'var(--accent)' : 'var(--text-secondary)',
                cursor:      'pointer',
              }}
            >
              <span className="flex items-center justify-between">
                <span>{f.label}</span>
                {isActive && (
                  <span className="text-[9px] font-mono opacity-70">{`{${f.id}}`}</span>
                )}
              </span>
            </button>
          )
        })}
        {currentSlot && !profileFields.find(f => f.id === currentSlot) && (
          <div className="px-2.5 py-2 rounded-md text-[11px]"
               style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', color: '#fb923c' }}>
            <span className="font-mono">{`{${currentSlot}}`}</span>
            <span className="ml-1 opacity-70">— not in profile</span>
            <button onClick={clearSlot} className="ml-2 underline text-[10px]">clear</button>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PropertiesPanel({ selectedObject, canvas, canvasRef }: PropertiesPanelProps): JSX.Element {
  const [props, setProps] = useState<ObjectProps>({
    left: 0, top: 0, width: 0, height: 0, fill: '#EAEAEA', fontSize: 72, fontWeight: '800',
    fontFamily: 'Inter', text: '', opacity: 1, charSpacing: 0, lineHeight: 1.15,
    textAlign: 'left', fontStyle: 'normal', underline: false, stroke: '', strokeWidth: 0, rx: 0,
  })
  const [bgColor, setBgColor]           = useState('#111111')
  const [gradTopColor, setGradTopColor]       = useState('rgba(17,17,17,0)')
  const [gradBottomColor, setGradBottomColor] = useState('rgba(17,17,17,1)')
  const [gradOpacity, setGradOpacity]         = useState(1)

  const logoInputRef = useRef<HTMLInputElement>(null)

  // ── Inline text selection state ───────────────────────────────────────────
  const { isEditing, hasSelection: selHasSelection } = useToolbarState()
  const selResolved = useTextStyleStore(useShallow((s: { resolved: unknown }) => s.resolved))
  const selMixed    = useTextStyleStore(useShallow((s: { mixed: unknown }) => s.mixed))
  const inSelectionMode = isEditing && selHasSelection

  const applyInline = useCallback((styles: Record<string, string | number | boolean | null>): void => {
    canvasRef.current?.applySelectionStyle(styles)
  }, [canvasRef])

  // ── Sync state from canvas background ────────────────────────────────────
  useEffect(() => {
    if (canvas) {
      const bg = (canvas as FabricCanvas & { backgroundColor?: string }).backgroundColor || '#111111'
      if (typeof bg === 'string') setBgColor(bg)
    }
  }, [canvas, selectedObject])

  // ── Sync state from selectedObject ───────────────────────────────────────
  useEffect(() => {
    if (!selectedObject) return
    const fill = selectedObject.fill
    let fillStr = '#EAEAEA'
    if (typeof fill === 'string') fillStr = fill
    else if (fill === null || fill === undefined) fillStr = 'transparent'

    const obj = selectedObject as FabricObject & {
      fontSize?: number; fontWeight?: string | number; fontFamily?: string
      text?: string; charSpacing?: number; lineHeight?: number
      textAlign?: string; fontStyle?: string; underline?: boolean; rx?: number
    }

    setProps({
      left:   Math.round(selectedObject.left || 0),
      top:    Math.round(selectedObject.top  || 0),
      width:  Math.round((selectedObject.width  || 0) * (selectedObject.scaleX || 1)),
      height: Math.round((selectedObject.height || 0) * (selectedObject.scaleY || 1)),
      fill:   fillStr,
      fontSize:   obj.fontSize   || 72,
      fontWeight: String(obj.fontWeight || '400'),
      fontFamily: (obj.fontFamily || 'Inter').replace(/, sans-serif/g, ''),
      text:         obj.text         || '',
      opacity:      selectedObject.opacity ?? 1,
      charSpacing:  obj.charSpacing  || 0,
      lineHeight:   obj.lineHeight   || 1.15,
      textAlign:    obj.textAlign    || 'left',
      fontStyle:    obj.fontStyle    || 'normal',
      underline:    obj.underline    || false,
      stroke:       (typeof selectedObject.stroke === 'string' ? selectedObject.stroke : '') || '',
      strokeWidth:  selectedObject.strokeWidth || 0,
      rx: (() => {
        if (selectedObject.type === 'image') {
          const cp = (selectedObject as FabricObject & { clipPath?: FabricObject & { rx?: number } }).clipPath
          return Math.round((cp?.rx || 0) * (selectedObject.scaleX || 1))
        }
        return Math.round((obj.rx || 0) * (selectedObject.scaleX || 1))
      })(),
    })

    // Gradient init
    if (selectedObject.eliteType === 'gradient' && fill instanceof fabric.Gradient) {
      const stops = (fill as fabric.Gradient<'linear' | 'radial'> & { colorStops?: Array<{ color: string }> }).colorStops || []
      if (stops.length >= 2) {
        setGradTopColor(stops[0].color || 'rgba(17,17,17,0)')
        setGradBottomColor(stops[1].color || 'rgba(17,17,17,1)')
      }
      setGradOpacity(selectedObject.opacity ?? 1)
    }
  }, [selectedObject])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const update = (key: string, value: string | number | boolean): void => {
    if (!selectedObject || !canvas) return
    if (key === 'width')  selectedObject.set('scaleX', (value as number) / (selectedObject.width  || 1))
    else if (key === 'height') selectedObject.set('scaleY', (value as number) / (selectedObject.height || 1))
    else if (key === 'rx') {
      const sX = selectedObject.scaleX || 1, sY = selectedObject.scaleY || 1
      const rxLocal = (value as number) / sX
      const ryLocal = (value as number) / sY
      if (selectedObject.type === 'image') {
        // FabricImage: apply corner radius via a non-absolute clipPath rect
        const imgW = selectedObject.width  || 0
        const imgH = selectedObject.height || 0
        const existingClip = (selectedObject as FabricObject & { clipPath?: FabricObject & { rx?: number; ry?: number; width?: number; height?: number } }).clipPath
        if (existingClip && existingClip.type === 'rect') {
          existingClip.set({ rx: rxLocal, ry: ryLocal, width: imgW, height: imgH })
        } else {
          const clip = new fabric.Rect({
            left: -(imgW / 2), top: -(imgH / 2),
            width: imgW, height: imgH,
            rx: rxLocal, ry: ryLocal,
            originX: 'left', originY: 'top',
          })
          ;(selectedObject as FabricObject & { clipPath?: FabricObject }).clipPath = clip
        }
      } else {
        selectedObject.set({ rx: rxLocal, ry: ryLocal })
        const cp = (selectedObject as FabricObject & { clipPath?: FabricObject }).clipPath
        if (cp) cp.set({ rx: rxLocal, ry: ryLocal })
      }
    } else {
      selectedObject.set(key as keyof FabricObject, value as never)
      // Global sidebar change (no selection) — clear any per-char span overrides for
      // this key so the object-level value shows through on every character.
      const isTextObj = ['itext', 'textbox'].includes(selectedObject.type ?? '')
      if (isTextObj && TEXT_SPAN_KEYS.has(key)) {
        clearAllSpanStyleKeys(selectedObject, canvas, [key])
      }
    }
    ;(selectedObject as FabricObject & { dirty?: boolean }).dirty = true
    canvas.renderAll()
    setProps(p => ({ ...p, [key]: value }))
  }

  const preview = (key: string, value: string): void => {
    if (!selectedObject || !canvas) return
    if (key === 'fill' && typeof selectedObject.fill !== 'string') return
    if (key === 'fontFamily') { loadGoogleFont(value); selectedObject.set('fontFamily', `${value}, sans-serif`) }
    else selectedObject.set(key as keyof FabricObject, value as never)
    ;(selectedObject as FabricObject & { dirty?: boolean }).dirty = true
    canvas.renderAll()
  }

  const clearPreview = (key: string): void => {
    if (!selectedObject || !canvas) return
    if (key === 'fill' && typeof selectedObject.fill !== 'string') return
    const orig = props[key as keyof ObjectProps]
    if (key === 'fontFamily') selectedObject.set('fontFamily', `${orig}, sans-serif`)
    else selectedObject.set(key as keyof FabricObject, orig as never)
    ;(selectedObject as FabricObject & { dirty?: boolean }).dirty = true
    canvas.renderAll()
  }

  const updateGradient = (top: string, bot: string): void => {
    if (!selectedObject || !canvas || selectedObject.eliteType !== 'gradient') return
    const h = (selectedObject.height || 100) * (selectedObject.scaleY || 1)
    selectedObject.set('fill', new fabric.Gradient({
      type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: h },
      colorStops: [{ offset: 0, color: top }, { offset: 1, color: bot }],
    }))
    canvas.renderAll()
    setGradTopColor(top); setGradBottomColor(bot)
  }

  const updateBgColor = (color: string): void => {
    setBgColor(color)
    canvasRef.current?.setCanvasBg(color)
  }

  // ── Derived flags ─────────────────────────────────────────────────────────
  const eliteType      = selectedObject?.eliteType || ''
  const isText         = selectedObject instanceof fabric.Textbox || selectedObject instanceof fabric.FabricText
  const isImage        = eliteType === 'image' || selectedObject instanceof fabric.FabricImage
  const isFrame        = eliteType === 'frame'
  const isIcon         = eliteType === 'icon'
  const isGroup        = selectedObject instanceof fabric.Group && !(selectedObject instanceof fabric.ActiveSelection)
  const isLogo         = eliteType === 'logo'
  const isGradient     = eliteType === 'gradient'
  const hasStringFill  = typeof selectedObject?.fill === 'string'
  const isShape        = ['shape','line'].includes(eliteType)

  // ── Empty state: canvas bg panel ─────────────────────────────────────────
  if (!selectedObject) {
    return (
      <div className="w-full h-full studio-panel border-l border-elite-600/25 flex flex-col overflow-hidden select-none">
        <div className="px-4 py-3 border-b border-elite-600/25">
          <h3 className="text-[11px] font-semibold text-accent uppercase tracking-widest">Canvas</h3>
          <span className="text-[10px] text-warm-faint">Background & settings</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <Section icon={<DropletIcon/>} title="Card Background">
            <div className="flex items-center gap-2 mb-2">
              <input type="color" value={bgColor} onChange={e => updateBgColor(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
              <input type="text" value={bgColor} onChange={e => updateBgColor(e.target.value)}
                className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {BG_PALETTE.map((c, i) => (
                <ColorSwatch key={i} color={c}
                  active={bgColor.toLowerCase() === c.toLowerCase()}
                  onClick={() => updateBgColor(c)}/>
              ))}
            </div>
          </Section>
          <p className="text-[11px] text-warm-faint text-center pt-4">Select an element to edit its properties</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full studio-panel border-l border-elite-600/25 flex flex-col overflow-hidden select-none">
      <div className="px-4 py-3 border-b border-elite-600/25">
        <h3 className="text-[11px] font-semibold text-accent uppercase tracking-widest">{selectedObject.eliteLabel || 'Element'}</h3>
        <span className="text-[10px] text-warm-faint">{eliteType}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Position / Size / Opacity */}
        <PositionSection
          object={selectedObject}
          canvas={canvas!}
          onChange={update}
        />

        {/* Fill — non-text objects (shapes, logos, etc.) */}
        {!isGradient && !isImage && !isFrame && !isIcon && !isText && (
          <FillSection
            object={selectedObject}
            canvas={canvas!}
            inSelectionMode={inSelectionMode}
            selFill={inSelectionMode ? (String((selResolved as Record<string, unknown> | null)?.fill ?? '')) || null : null}
            selMixedFill={inSelectionMode ? !!(selMixed as Record<string, boolean>)?.fill : false}
            currentFill={props.fill}
            hasStringFill={hasStringFill}
            onApplyInline={applyInline}
            onUpdate={update}
            onPreview={preview}
            onClearPreview={clearPreview}
          />
        )}

        {/* Text fill — solid / gradient / texture modes for text objects */}
        {isText && (
          <TextFillSection
            object={selectedObject}
            canvas={canvas!}
            inSelectionMode={inSelectionMode}
            selFill={inSelectionMode
              ? (typeof (selResolved as Record<string, unknown>)?.fill === 'string'
                  ? ((selResolved as Record<string, unknown>).fill as string)
                  : null)
              : null}
            selMixedFill={inSelectionMode ? !!(selMixed as Record<string, boolean>)?.fill : false}
            onApplyInline={applyInline}
            onUpdate={update}
          />
        )}

        {/* Stroke */}
        {(isShape || isLogo || isImage) && !isFrame && !isIcon && (
          <StrokeSection
            currentStroke={props.stroke}
            strokeWidth={props.strokeWidth}
            onUpdate={update}
          />
        )}

        {/* Gradient */}
        {isGradient && (
          <GradientSection
            gradTopColor={gradTopColor}
            gradBottomColor={gradBottomColor}
            gradOpacity={gradOpacity}
            onUpdateGradient={updateGradient}
            onUpdateOpacity={(v) => { setGradOpacity(v); update('opacity', v) }}
          />
        )}

        {/* Logo image replace */}
        {isLogo && (
          <Section title="Logo Image">
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file && selectedObject && canvas) {
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const imgEl = new Image()
                    imgEl.onload = () => {
                      const obj = selectedObject
                      const targetW = (obj.width  || 120) * (obj.scaleX || 1)
                      const targetH = (obj.height || 120) * (obj.scaleY || 1)
                      const scale = Math.min(targetW / imgEl.width, targetH / imgEl.height)
                      const tx = (targetW - imgEl.width  * scale) / 2
                      const ty = (targetH - imgEl.height * scale) / 2
                      const pattern = new fabric.Pattern({ source: imgEl, repeat: 'no-repeat' })
                      ;(pattern as fabric.Pattern & { patternTransform?: number[] }).patternTransform = [scale, 0, 0, scale, tx, ty]
                      const logoRect = new fabric.Rect({
                        left: obj.left, top: obj.top, width: targetW, height: targetH,
                        originX: obj.originX || 'center', originY: obj.originY || 'center',
                        fill: pattern, stroke: '#0BDA76', strokeWidth: 0,
                        rx: (obj as FabricObject & { rx?: number }).rx || 0,
                        ry: (obj as FabricObject & { ry?: number }).ry || 0,
                      })
                      logoRect.eliteType  = 'logo'
                      logoRect.eliteLabel = file.name.replace(/\.[^/.]+$/, '') || 'Logo'
                      canvas.remove(obj)
                      canvas.add(logoRect)
                      canvas.setActiveObject(logoRect)
                      canvas.renderAll()
                    }
                    imgEl.src = ev.target?.result as string
                  }
                  reader.readAsDataURL(file)
                }
                e.target.value = ''
              }}/>
            <button onClick={() => logoInputRef.current?.click()}
              className="w-full py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-[11px] font-semibold hover:bg-accent/20 transition-colors cursor-pointer">
              Replace Logo Image
            </button>
            <p className="text-[9px] text-warm-faint mt-1 text-center">PNG, JPEG, SVG or WebP — replaces the seal</p>
          </Section>
        )}

        {/* Frame properties */}
        {isFrame && canvas && (
          <FrameSection
            object={selectedObject}
            canvas={canvas}
            canvasRef={canvasRef}
          />
        )}

        {/* Icon properties */}
        {isIcon && !isFrame && (
          <IconSection
            object={selectedObject}
            canvas={canvas!}
            onUpdate={update}
          />
        )}

        {/* Universal Effects — available for all element types */}
        <EffectsSection object={selectedObject} canvas={canvas!} />

        {/* Content Slot — tag this object so AI output lands here */}
        {!isGroup && (
          <ContentSlotSection
            selectedObject={selectedObject}
            canvas={canvas}
            canvasRef={canvasRef}
          />
        )}

        {/* Group ungroup */}
        {isGroup && !isLogo && !isFrame && (
          <Section title="Group">
            <button onClick={() => canvasRef.current?.ungroupSelected()}
              className="w-full py-2 rounded-lg bg-elite-700 border border-elite-600/30 text-warm text-[11px] font-semibold hover:bg-elite-600/50 transition-colors cursor-pointer">
              Ungroup Elements
            </button>
          </Section>
        )}

        {/* Text properties */}
        {isText && (
          <TextSection
            object={selectedObject}
            canvas={canvas!}
            inSelectionMode={inSelectionMode}
            selResolved={selResolved as import('@/types/store').StyleValueMap}
            selMixed={selMixed as import('@/types/store').StyleBoolMap}
            onApplyInline={applyInline}
            onUpdate={update}
            onPreview={preview}
            onClearPreview={clearPreview}
          />
        )}
      </div>
    </div>
  )
}
