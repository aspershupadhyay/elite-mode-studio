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
  getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#0BDA76'

export interface FontFamilyPillProps {
  apply: (styles: Record<string, string | number | boolean | null>) => void
}

const FontFamilyPill = memo(function FontFamilyPill({ apply }: FontFamilyPillProps): JSX.Element {
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
          fontSize: 12, color: mixed ? 'rgba(255,255,255,0.5)' : '#EAEAEA',
          fontFamily: fontFamily ? `${fontFamily}, sans-serif` : 'sans-serif',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84,
        }}>{currentFont}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 1l3 3 3-3" stroke="rgba(255,255,255,0.3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {override && <ResetBtn onClick={() => apply({ fontFamily: null })}/>}

      {open && (
        <Tray align="left" style={{ width: 224, maxHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <input autoFocus value={fontQ} onChange={e => setFontQ(e.target.value)}
            placeholder="Search fonts…" onMouseDown={(e: MouseEvent<HTMLInputElement>) => e.stopPropagation()}
            style={{
              width: '100%', padding: '5px 8px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
              color: '#EAEAEA', fontSize: 11, outline: 'none', marginBottom: 5,
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredFonts.map((f: { family: string }) => (
              <button key={f.family} onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                onMouseEnter={() => loadGoogleFont(f.family)}
                onClick={() => { loadGoogleFont(f.family); apply({ fontFamily: `'${f.family}', sans-serif` }); setOpen(null); setFontQ('') }}
                style={{
                  width: '100%', padding: '5px 8px', border: 'none', cursor: 'pointer',
                  textAlign: 'left', display: 'block', borderRadius: 5,
                  background: currentFont === f.family ? `rgba(${RGB}, 0.14)` : 'transparent',
                  color: currentFont === f.family ? ACCENT : '#EAEAEA',
                  fontSize: 12, fontFamily: `'${f.family}', sans-serif`,
                }}
              >{f.family}</button>
            ))}
          </div>
        </Tray>
      )}
    </Pill>
  )
})

export default FontFamilyPill
