/**
 * BgPill.tsx — Text background highlight pill for FloatingTextToolbar.
 */
import { memo } from 'react'
import type { MouseEvent } from 'react'
import {
  useOpenDropdown, useSetOpenDropdown, useBgStyle,
} from '../../text/TextStyleStore'
import { Pill, Tray, ResetBtn } from './shared'

const BG_SWATCHES = ['#FFD93D', '#0BDA76', '#4488FF', '#FF4444', '#E879F9', '#FFFFFF']

export interface BgPillProps {
  apply: (styles: Record<string, string | number | boolean | null>) => void
  trayDir?: 'up' | 'down'
}

const BgPill = memo(function BgPill({ apply, trayDir = 'down' }: BgPillProps): JSX.Element {
  const { value: textBackgroundColor, mixed, override } = useBgStyle()
  const openKey = useOpenDropdown()
  const setOpen = useSetOpenDropdown()
  const open    = openKey === 'bg'

  const hasBg = !!(textBackgroundColor && textBackgroundColor !== '' && textBackgroundColor !== 'transparent')

  return (
    <Pill modified={hasBg} mixed={mixed}>
      <button title="Text background highlight"
        onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
        onClick={() => setOpen(open ? null : 'bg')}
        style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        {mixed
          ? <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #FFD93D 50%, #4488FF 50%)',
              border: '1px solid var(--tb-sep)' }}/>
          : <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
              background: hasBg ? (textBackgroundColor as string) : 'var(--tb-hover)',
              border: '1px solid var(--tb-sep)' }}/>
        }
        <span style={{ fontSize: 11, color: 'var(--tb-text2)', fontFamily: 'sans-serif' }}>BG</span>
        <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
          <path d="M1 1l2.5 3L6 1" style={{ stroke: 'var(--tb-text2)' }} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {override && <ResetBtn onClick={() => apply({ textBackgroundColor: null })}/>}

      {open && (
        <Tray align="right" direction={trayDir} style={{ width: 172 }}>
          <p style={{ margin: '0 0 7px', fontSize: 9, color: 'var(--tb-text3)', fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>Highlight</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 8 }}>
            {BG_SWATCHES.map(c => (
              <button key={c} onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                onClick={() => { apply({ textBackgroundColor: c }); setOpen(null) }}
                style={{
                  width: 20, height: 20, borderRadius: 5, border: 'none', background: c, cursor: 'pointer',
                  outline: ((textBackgroundColor as string) || '').toLowerCase() === c.toLowerCase() ? '2px solid var(--tb-text)' : '2px solid transparent',
                  outlineOffset: 1.5, transition: 'transform .1s',
                }}
                onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(1.15)' }}
                onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(1)' }}
              />
            ))}
          </div>
          <button onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
            onClick={() => { apply({ textBackgroundColor: null }); setOpen(null) }}
            style={{
              width: '100%', padding: '5px 7px',
              border: '1px dashed var(--tb-input-border)',
              borderRadius: 7, background: 'transparent', color: 'var(--tb-text2)',
              cursor: 'pointer', fontSize: 10, fontFamily: 'sans-serif', marginBottom: 6,
            }}
          >None — remove</button>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            padding: '5px 7px', borderRadius: 7,
            background: 'var(--tb-input-bg)', border: '1px solid var(--tb-input-border)',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              background: 'conic-gradient(#ff4444,#ffaa00,#ffff00,#00cc44,#4488ff,#8844ff,#ff4444)',
              border: '1px solid var(--tb-sep)' }}/>
            <span style={{ fontSize: 10, color: 'var(--tb-text2)', fontFamily: 'sans-serif' }}>Custom</span>
            <input type="color"
              value={(textBackgroundColor && (textBackgroundColor as string).startsWith('#')) ? (textBackgroundColor as string) : '#FFD93D'}
              onChange={e => apply({ textBackgroundColor: e.target.value })}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
          </label>
        </Tray>
      )}
    </Pill>
  )
})

export default BgPill
