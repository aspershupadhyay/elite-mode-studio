/**
 * FontFamilyPill.tsx — Font family selector pill for FloatingTextToolbar.
 */
import { memo, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  useOpenDropdown, useSetOpenDropdown, useFontFamilyStyle,
} from '../../text/TextStyleStore'
import { FONT_REGISTRY, loadGoogleFont } from '../../data/fonts'
import { Pill, Tray, ResetBtn, accentRgb } from './shared'

const accentHex = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#C96A42'

export interface FontFamilyPillProps {
  apply: (styles: Record<string, string | number | boolean | null>) => void
  trayDir?: 'up' | 'down'
}

const FontFamilyPill = memo(function FontFamilyPill({ apply, trayDir = 'down' }: FontFamilyPillProps): JSX.Element {
  const { value: fontFamilyRaw, mixed, override } = useFontFamilyStyle()
  const fontFamily = typeof fontFamilyRaw === 'string' ? fontFamilyRaw : undefined
  const openKey = useOpenDropdown()
  const setOpen = useSetOpenDropdown()
  const open    = openKey === 'font'
  const [fontQ, setFontQ] = useState('')
  const ACCENT  = accentHex()
  const RGB     = accentRgb()

  const currentFont = fontFamily
    ? fontFamily.replace(/['"]/g, '').split(',')[0].trim()
    : (mixed ? '(Mixed)' : 'Font')

  const filteredFonts = fontQ
    ? FONT_REGISTRY.filter((f: { family: string }) => f.family.toLowerCase().includes(fontQ.toLowerCase()))
    : FONT_REGISTRY

  return (
    <Pill modified={override} mixed={mixed} style={{ maxWidth: 128 }}>
      <button title="Font family" onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
        onClick={() => setOpen(open ? null : 'font')}
        style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28, padding: '0 4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span style={{
          fontSize: 12, color: mixed ? 'var(--tb-text2)' : 'var(--tb-text)',
          fontFamily: fontFamily ? `${fontFamily}, sans-serif` : 'sans-serif',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84,
        }}>{currentFont}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 1l3 3 3-3" style={{ stroke: 'var(--tb-text2)' }} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {override && <ResetBtn onClick={() => apply({ fontFamily: null })}/>}

      {open && (
        <Tray align="left" direction={trayDir} style={{ width: 224, maxHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <input autoFocus value={fontQ} onChange={e => setFontQ(e.target.value)}
            placeholder="Search fonts…" onMouseDown={(e: MouseEvent<HTMLInputElement>) => e.stopPropagation()}
            style={{
              width: '100%', padding: '6px 10px',
              background: 'var(--tb-input-bg)',
              border: '1px solid var(--tb-input-border)', borderRadius: 7,
              color: 'var(--tb-text)', fontSize: 11, outline: 'none', marginBottom: 6,
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredFonts.map((f: { family: string }) => {
              const isSelected = currentFont === f.family
              return (
                <button key={f.family} onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                  onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => {
                    loadGoogleFont(f.family)
                    if (!isSelected) e.currentTarget.style.background = 'var(--tb-hover)'
                  }}
                  onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                  onClick={() => { loadGoogleFont(f.family); apply({ fontFamily: `'${f.family}', sans-serif` }); setOpen(null); setFontQ('') }}
                  style={{
                    width: '100%', padding: '6px 10px', border: 'none', cursor: 'pointer',
                    textAlign: 'left', display: 'block', borderRadius: 6,
                    background: isSelected ? `rgba(${RGB}, 0.15)` : 'transparent',
                    color: isSelected ? ACCENT : 'var(--tb-text)',
                    fontSize: 12, fontFamily: `'${f.family}', sans-serif`,
                    transition: 'background .1s',
                  }}
                >{f.family}</button>
              )
            })}
          </div>
        </Tray>
      )}
    </Pill>
  )
})

export default FontFamilyPill
