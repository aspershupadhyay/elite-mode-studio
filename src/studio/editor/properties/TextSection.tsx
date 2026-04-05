import { useState, useMemo, useEffect } from 'react'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import '@/types/fabric-custom'
import { FONT_REGISTRY, FONT_CATEGORIES } from '../../data/fonts'
import {
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
  BoldIcon, ItalicIcon, UnderlineIcon, ChevronDownIcon,
} from '../../icons/Icons'
import type { StyleValueMap, StyleBoolMap } from '@/types/store'

export interface TextSectionProps {
  object: FabricObject
  canvas: FabricCanvas
  inSelectionMode: boolean
  selResolved: StyleValueMap
  selMixed: StyleBoolMap
  onApplyInline: (styles: Record<string, string | number | boolean | null>) => void
  onUpdate: (key: string, value: string | number | boolean) => void
  onPreview: (key: string, value: string) => void
  onClearPreview: (key: string) => void
}

interface FontEntry { family: string; category: string }

const Section = ({ title, children }: { title: string; children: React.ReactNode }): JSX.Element => (
  <div>
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">{title}</label>
    </div>
    {children}
  </div>
)

const StyleToggle = ({ icon, active, onClick }: { icon: React.ReactNode; active: boolean; onClick: () => void }): JSX.Element => (
  <button onClick={onClick} className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-all duration-100 ${active ? 'bg-accent/15 text-accent' : 'text-warm-faint hover:text-warm hover:bg-elite-700'}`}>{icon}</button>
)

const WEIGHT_LABELS: Record<string, string> = {
  '100': 'Thin', '200': 'ExtraLight', '300': 'Light', '400': 'Regular',
  '500': 'Medium', '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
}

export function TextSection({
  object,
  inSelectionMode,
  selResolved,
  selMixed,
  onApplyInline,
  onUpdate,
  onPreview,
  onClearPreview,
}: TextSectionProps): JSX.Element {
  const [fontSearch, setFontSearch]       = useState('')
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showWeightPicker, setShowWeightPicker] = useState(false)
  const [showBgPicker, setShowBgPicker] = useState(false)

  // Recently used fonts (persisted in localStorage)
  const [recentFonts, setRecentFonts] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('elite_recent_fonts') || '[]') } catch { return [] }
  })
  const addRecentFont = (family: string): void => {
    const next = [family, ...recentFonts.filter(f => f !== family)].slice(0, 10)
    setRecentFonts(next)
    localStorage.setItem('elite_recent_fonts', JSON.stringify(next))
  }

  // System fonts (loaded from OS via IPC)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  useEffect(() => {
    window.api?.getSystemFonts?.().then(fonts => {
      if (fonts?.length) setSystemFonts(fonts)
    }).catch(() => { /* IPC not available in dev browser */ })
  }, [])

  const fabricObj = object as FabricObject & {
    fontFamily?: string
    fontWeight?: string | number
    fontStyle?: string
    underline?: boolean
    textAlign?: string
    charSpacing?: number
    lineHeight?: number
    fontSize?: number
    text?: string
    textBackgroundColor?: string
  }

  const objFontFamily = (fabricObj.fontFamily || 'Inter').replace(/, sans-serif/g, '')
  const objFontWeight = String(fabricObj.fontWeight || '400')
  const objFontStyle  = fabricObj.fontStyle  || 'normal'
  const objUnderline  = fabricObj.underline  || false
  const objTextAlign  = fabricObj.textAlign  || 'left'
  const objTextBg      = fabricObj.textBackgroundColor || ''
  const objCharSpacing = fabricObj.charSpacing || 0
  const objLineHeight  = fabricObj.lineHeight  || 1.15
  const objFontSize    = fabricObj.fontSize    || 72
  const objText        = fabricObj.text        || ''

  const filteredFonts = useMemo(() => {
    const q = fontSearch.toLowerCase()
    const bundled = q
      ? (FONT_REGISTRY as FontEntry[]).filter(f => f.family.toLowerCase().includes(q))
      : (FONT_REGISTRY as FontEntry[])
    return bundled
  }, [fontSearch])

  const filteredSystemFonts = useMemo(() => {
    if (!fontSearch) return systemFonts
    const q = fontSearch.toLowerCase()
    return systemFonts.filter(f => f.toLowerCase().includes(q))
  }, [fontSearch, systemFonts])

  // ── Derived display values ────────────────────────────────────────────────
  const dispFont = inSelectionMode
    ? (selMixed.fontFamily ? '(Mixed)' : ((String(selResolved.fontFamily || '')).replace(/['"]/g, '').split(',')[0].trim() || ''))
    : objFontFamily

  const dispSize = inSelectionMode
    ? (selMixed.fontSize ? '' : Math.round(Number(selResolved.fontSize || 0)))
    : objFontSize

  const rawWeight  = inSelectionMode ? String(selResolved.fontWeight || '400') : objFontWeight
  const dispWeight = (inSelectionMode && selMixed.fontWeight)
    ? '(Mixed)'
    : (WEIGHT_LABELS[rawWeight] || WEIGHT_LABELS[String(Number(rawWeight))] || 'Regular')

  const isBold   = inSelectionMode
    ? (selResolved.fontWeight === 'bold' || Number(selResolved.fontWeight) >= 700)
    : (parseInt(objFontWeight) >= 700)
  const isItalic = inSelectionMode ? selResolved.fontStyle === 'italic' : objFontStyle === 'italic'
  const isUnder  = inSelectionMode ? !!selResolved.underline : objUnderline

  // ── Actions ────────────────────────────────────────────────────────────────
  const setFont = (family: string): void => {
    if (inSelectionMode) onApplyInline({ fontFamily: `'${family}', sans-serif` })
    else onUpdate('fontFamily', family)
    addRecentFont(family)
    setShowFontPicker(false)
    setFontSearch('')
  }

  const setSize = (v: number): void => {
    if (inSelectionMode) onApplyInline({ fontSize: v })
    else onUpdate('fontSize', v)
  }

  const setWeight = (v: string): void => {
    if (inSelectionMode) onApplyInline({ fontWeight: v })
    else onUpdate('fontWeight', v)
    setShowWeightPicker(false)
  }

  const toggleBold   = (): void => inSelectionMode ? onApplyInline({ fontWeight: isBold ? null : 'bold' }) : onUpdate('fontWeight', isBold ? '400' : '700')
  const toggleItalic = (): void => inSelectionMode ? onApplyInline({ fontStyle: isItalic ? null : 'italic' }) : onUpdate('fontStyle', isItalic ? 'normal' : 'italic')
  const toggleUnder  = (): void => inSelectionMode ? onApplyInline({ underline: isUnder ? null : true }) : onUpdate('underline', !isUnder)

  // ── Text case transform — selection-aware ──────────────────────────────────
  const applyCase = (transform: (s: string) => string): void => {
    const full = objText
    if (!full) return
    const to = fabricObj as typeof fabricObj & { selectionStart?: number; selectionEnd?: number }
    const hasSelection = inSelectionMode
      && to.selectionStart !== undefined && to.selectionEnd !== undefined
      && to.selectionStart !== to.selectionEnd
    if (hasSelection) {
      const s = to.selectionStart as number
      const e = to.selectionEnd   as number
      onUpdate('text', full.slice(0, s) + transform(full.slice(s, e)) + full.slice(e))
    } else {
      onUpdate('text', transform(full))
    }
  }

  return (
    <>
      {/* Font family */}
      <Section title="Font">
        <div className="relative">
          <button onClick={() => setShowFontPicker(!showFontPicker)}
            className="w-full flex items-center justify-between bg-elite-800 border border-elite-600/40 rounded px-2.5 py-1.5 hover:border-accent/40 transition-colors cursor-pointer">
            <span
              className={`text-[11px] truncate ${selMixed.fontFamily && inSelectionMode ? 'text-warm-faint italic' : 'text-warm'}`}
              style={{ fontFamily: selMixed.fontFamily && inSelectionMode ? 'sans-serif' : `'${dispFont}', sans-serif` }}>
              {dispFont || 'Font'}
            </span>
            <ChevronDownIcon size={12} className="text-warm-faint flex-shrink-0"/>
          </button>
          {showFontPicker && (
            <div className="dropdown-panel absolute left-0 right-0 top-full mt-1 z-[200] max-h-[320px] flex flex-col">
              <div className="p-2 border-b border-elite-600/30">
                <input type="text" value={fontSearch} onChange={e => setFontSearch(e.target.value)} placeholder="Search fonts..."
                  className="w-full bg-elite-700 border border-elite-600/40 rounded px-2 py-1.5 text-[11px] text-warm placeholder-warm-faint outline-none focus:border-accent/50"/>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {/* Recently used fonts */}
                {recentFonts.length > 0 && !fontSearch && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-accent/70 uppercase tracking-widest">Recent</div>
                    {recentFonts.map(family => (
                      <button key={`recent-${family}`} onClick={() => setFont(family)}
                        onMouseEnter={() => { if (!inSelectionMode) onPreview('fontFamily', family) }}
                        onMouseLeave={() => { if (!inSelectionMode) onClearPreview('fontFamily') }}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${dispFont === family ? 'text-accent bg-accent/8' : 'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}
                        style={{ fontFamily: `'${family}', sans-serif` }}>
                        {family}
                      </button>
                    ))}
                    <div className="mx-3 my-1 border-t border-elite-600/20"/>
                  </div>
                )}
                {/* System fonts */}
                {filteredSystemFonts.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-warm-faint uppercase tracking-widest">System Fonts</div>
                    {filteredSystemFonts.slice(0, fontSearch ? 50 : 20).map(family => (
                      <button key={`sys-${family}`} onClick={() => setFont(family)}
                        onMouseEnter={() => { if (!inSelectionMode) onPreview('fontFamily', family) }}
                        onMouseLeave={() => { if (!inSelectionMode) onClearPreview('fontFamily') }}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${dispFont === family ? 'text-accent bg-accent/8' : 'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}
                        style={{ fontFamily: `'${family}', sans-serif` }}>
                        {family}
                      </button>
                    ))}
                    {!fontSearch && filteredSystemFonts.length > 20 && (
                      <div className="px-3 py-1 text-[10px] text-warm-faint/50">
                        +{filteredSystemFonts.length - 20} more — type to search
                      </div>
                    )}
                    <div className="mx-3 my-1 border-t border-elite-600/20"/>
                  </div>
                )}
                {(FONT_CATEGORIES as string[]).map(cat => {
                  const fonts = filteredFonts.filter((f: FontEntry) => f.category === cat)
                  if (!fonts.length) return null
                  return (
                    <div key={cat}>
                      <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-warm-faint uppercase tracking-widest">{cat}</div>
                      {fonts.map((font: FontEntry) => (
                        <button key={font.family} onClick={() => setFont(font.family)}
                          onMouseEnter={() => { if (!inSelectionMode) onPreview('fontFamily', font.family) }}
                          onMouseLeave={() => { if (!inSelectionMode) onClearPreview('fontFamily') }}
                          className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${dispFont === font.family ? 'text-accent bg-accent/8' : 'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}
                          style={{ fontFamily: `'${font.family}', sans-serif` }}>
                          {font.family}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Size + Weight */}
      <div className="grid grid-cols-2 gap-2">
        <Section title="Size">
          <div className="flex items-center bg-elite-800 border border-elite-600/40 rounded overflow-hidden">
            <span className="px-2 text-[10px] text-warm-faint font-mono bg-elite-850 py-1.5 border-r border-elite-600/30">px</span>
            <input type="number" value={dispSize}
              placeholder={inSelectionMode && selMixed.fontSize ? '—' : ''}
              onChange={e => setSize(parseInt(e.target.value) || 0)}
              className="flex-1 bg-transparent px-2 py-1.5 text-[11px] text-warm font-mono outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
          </div>
        </Section>
        <Section title="Weight">
          <div className="relative">
            <button onClick={() => setShowWeightPicker(!showWeightPicker)}
              className="w-full flex items-center justify-between bg-elite-800 border border-elite-600/40 rounded px-2.5 py-1.5 hover:border-accent/40 transition-colors cursor-pointer">
              <span className={`text-[11px] ${inSelectionMode && selMixed.fontWeight ? 'text-warm-faint italic' : 'text-warm'}`}>{dispWeight}</span>
              <ChevronDownIcon size={12} className="text-warm-faint flex-shrink-0"/>
            </button>
            {showWeightPicker && (
              <div className="dropdown-panel absolute left-0 right-0 top-full mt-1 z-[200] max-h-[250px] overflow-y-auto py-1">
                {(['100','200','300','400','500','600','700','800','900'] as string[]).map(v => (
                  <button key={v} onClick={() => setWeight(v)}
                    onMouseEnter={() => { if (!inSelectionMode) onPreview('fontWeight', v) }}
                    onMouseLeave={() => { if (!inSelectionMode) onClearPreview('fontWeight') }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${rawWeight === v ? 'text-accent bg-accent/8' : 'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}
                    style={{ fontWeight: v }}>
                    {WEIGHT_LABELS[v]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Style toggles */}
      <Section title="Style">
        <div className="flex gap-1">
          <StyleToggle icon={<BoldIcon/>}      active={isBold}   onClick={toggleBold}/>
          <StyleToggle icon={<ItalicIcon/>}    active={isItalic} onClick={toggleItalic}/>
          <StyleToggle icon={<UnderlineIcon/>} active={isUnder}  onClick={toggleUnder}/>
          <div className="w-px h-6 bg-elite-600/30 mx-1 self-center"/>
          <StyleToggle icon={<AlignLeftIcon/>}   active={objTextAlign === 'left'}   onClick={() => onUpdate('textAlign', 'left')}/>
          <StyleToggle icon={<AlignCenterIcon/>} active={objTextAlign === 'center'} onClick={() => onUpdate('textAlign', 'center')}/>
          <StyleToggle icon={<AlignRightIcon/>}  active={objTextAlign === 'right'}  onClick={() => onUpdate('textAlign', 'right')}/>
        </div>
      </Section>

      {/* Case */}
      <Section title="Case">
        <div className="flex gap-1">
          {([
            { label: 'AA', title: 'UPPERCASE', fn: (s: string) => s.toUpperCase() },
            { label: 'Aa', title: 'Title Case', fn: (s: string) => s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) },
            { label: 'aa', title: 'lowercase',  fn: (s: string) => s.toLowerCase() },
          ] as { label: string; title: string; fn: (s: string) => string }[]).map(({ label, title, fn }) => (
            <button key={label} title={title} onClick={() => applyCase(fn)}
              className="flex-1 py-1 text-[11px] font-bold text-warm-faint hover:text-warm active:text-accent active:border-accent/60 active:scale-95 bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 transition-all cursor-pointer">
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Text highlight / background color */}
      <Section title="Text Highlight">
        <div className="relative">
          <div className="flex items-center gap-2 bg-elite-800 border border-elite-600/40 rounded px-2.5 py-1.5">
            <button
              onClick={() => setShowBgPicker(!showBgPicker)}
              style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                background: (inSelectionMode
                  ? (selMixed.textBackgroundColor ? 'linear-gradient(135deg,#FFD93D 50%,#4488FF 50%)' : ((selResolved.textBackgroundColor as string) || 'transparent'))
                  : (objTextBg || 'transparent')),
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            />
            <span className="text-[11px] text-warm flex-1 truncate">
              {inSelectionMode
                ? (selMixed.textBackgroundColor ? '(Mixed)' : ((selResolved.textBackgroundColor as string) || 'None'))
                : (objTextBg || 'None')}
            </span>
            {(inSelectionMode ? !!(selResolved.textBackgroundColor) : !!objTextBg) && (
              <button onClick={() => inSelectionMode ? onApplyInline({ textBackgroundColor: null }) : onUpdate('textBackgroundColor', '')}
                className="text-[9px] text-warm-faint hover:text-red-400 transition-colors">✕</button>
            )}
          </div>
          {showBgPicker && (
            <div className="dropdown-panel absolute left-0 right-0 top-full mt-1 z-[200] p-3">
              <p className="text-[9px] text-warm-faint uppercase tracking-widest mb-2">Highlight Color</p>
              <div className="grid grid-cols-6 gap-1.5 mb-3">
                {(['#FFD93D', '#0BDA76', '#4488FF', '#FF4444', '#E879F9', '#FFFFFF',
                   '#FF7F00', '#00BFFF', '#FF69B4', '#7FFF00', '#DC143C', '#00CED1'] as string[]).map(c => (
                  <button key={c} onClick={() => {
                    inSelectionMode ? onApplyInline({ textBackgroundColor: c }) : onUpdate('textBackgroundColor', c)
                    setShowBgPicker(false)
                  }}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: 'none', background: c, cursor: 'pointer',
                      outline: (inSelectionMode ? selResolved.textBackgroundColor : objTextBg) === c ? '2px solid #fff' : '2px solid transparent',
                      outlineOffset: 1.5,
                    }}
                  />
                ))}
              </div>
              <button onClick={() => {
                inSelectionMode ? onApplyInline({ textBackgroundColor: null }) : onUpdate('textBackgroundColor', '')
                setShowBgPicker(false)
              }}
                className="w-full py-1 text-[10px] text-warm-faint border border-dashed border-elite-600/40 rounded hover:border-accent/40 transition-colors cursor-pointer">
                None — remove
              </button>
              <label className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded bg-elite-700/50 border border-elite-600/30 cursor-pointer">
                <div style={{ width: 16, height: 16, borderRadius: 3, background: 'conic-gradient(#ff4444,#ffaa00,#ffff00,#00cc44,#4488ff,#8844ff,#ff4444)', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}/>
                <span className="text-[10px] text-warm-faint">Custom color</span>
                <input type="color"
                  value={(inSelectionMode ? (selResolved.textBackgroundColor as string) : objTextBg) || '#FFD93D'}
                  onChange={e => inSelectionMode ? onApplyInline({ textBackgroundColor: e.target.value }) : onUpdate('textBackgroundColor', e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
              </label>
            </div>
          )}
        </div>
      </Section>

      <Section title="Letter Spacing">
        <div className="flex items-center gap-2">
          <input type="range" min={-100} max={400} step={10} value={objCharSpacing}
            onChange={e => onUpdate('charSpacing', parseInt(e.target.value))} className="flex-1 accent-accent h-1"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{objCharSpacing}</span>
        </div>
      </Section>

      <Section title="Line Height">
        <div className="flex items-center gap-2">
          <input type="range" min={0.8} max={3.0} step={0.05} value={objLineHeight}
            onChange={e => onUpdate('lineHeight', parseFloat(e.target.value))} className="flex-1 accent-accent h-1"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{Number(objLineHeight).toFixed(2)}</span>
        </div>
      </Section>

      <Section title="Content">
        <textarea value={objText} onChange={e => onUpdate('text', e.target.value)} rows={3}
          className="w-full bg-elite-800 border border-elite-600/40 rounded px-2.5 py-2 text-[11px] text-warm font-mono resize-none focus:border-accent/60 outline-none leading-relaxed"
          placeholder="Your text or {{variable}}"/>
      </Section>
    </>
  )
}
