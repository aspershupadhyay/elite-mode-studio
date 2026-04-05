/**
 * ColorPill.tsx — Text color picker pill for FloatingTextToolbar.
 */
import { memo, useCallback } from 'react'
import type { MouseEvent } from 'react'
import {
  useOpenDropdown, useSetOpenDropdown, useFillStyle,
} from '../../text/TextStyleStore'
import { Pill, Tray, ResetBtn, accentRgb } from './shared'

// Read live accent hex from CSS custom property
const accentHex = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#0BDA76'

const COLOR_SWATCHES = ['#EAEAEA', '#0BDA76', '#FFD93D', '#4488FF', '#FF4444', '#E879F9']

// ── Color / opacity helpers ───────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

/** Extract { baseHex, opacity 0-100 } from any CSS color string. */
function parseColor(fill: string | undefined): { baseHex: string; opacity: number } {
  if (!fill) return { baseHex: '#EAEAEA', opacity: 100 }
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(fill.trim())
  if (rgba) {
    const [r, g, b] = [parseInt(rgba[1]), parseInt(rgba[2]), parseInt(rgba[3])]
    const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
    return { baseHex: hex, opacity: Math.round(a * 100) }
  }
  return { baseHex: fill.startsWith('#') ? fill : '#EAEAEA', opacity: 100 }
}

/** Compose a CSS color: pure hex when opacity=100, rgba() otherwise. */
function buildColor(hex: string, opacity: number): string {
  if (opacity >= 100) return hex
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${(opacity / 100).toFixed(2)})`
}

export interface ColorPillProps {
  apply: (styles: Record<string, string | number | boolean | null>) => void
}

const ColorPill = memo(function ColorPill({ apply }: ColorPillProps): JSX.Element {
  const { value: fillRaw, mixed, override } = useFillStyle()
  const fill = typeof fillRaw === 'string' ? fillRaw : undefined
  const openKey  = useOpenDropdown()
  const setOpen  = useSetOpenDropdown()
  const open     = openKey === 'color'

  const { baseHex, opacity } = parseColor(fill)

  const applyColor = useCallback((hex: string, op = opacity): void => {
    apply({ fill: buildColor(hex, op) })
  }, [apply, opacity])

  const applyOpacity = useCallback((op: number): void => {
    apply({ fill: buildColor(baseHex, op) })
  }, [apply, baseHex])

  return (
    <Pill modified={override} mixed={mixed}>
      <button title="Text color" onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
        onClick={() => setOpen(open ? null : 'color')}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, background: 'transparent', border: 'none', cursor: 'pointer',
          gap: 2, borderRadius: 6, padding: '0 3px',
        }}
      >
        <span style={{
          fontSize: 14, fontWeight: 700, lineHeight: 1, fontFamily: 'sans-serif',
          color: mixed ? 'rgba(255,255,255,0.6)' : (fill || '#EAEAEA'),
        }}>A</span>
        {mixed
          ? <div style={{ width: 14, height: 2.5, borderRadius: 2,
              background: 'linear-gradient(90deg, #FF4444, #FFD93D, #0BDA76, #4488FF)' }}/>
          : <div style={{ width: 14, height: 2.5, borderRadius: 2, background: fill || '#EAEAEA' }}/>
        }
      </button>
      {override && <ResetBtn onClick={() => apply({ fill: null })}/>}

      {open && (
        <Tray align="left" style={{ width: 180 }}>
          <p style={{ margin: '0 0 7px', fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>Color</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 8 }}>
            {COLOR_SWATCHES.map(c => (
              <button key={c} onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                onClick={() => { applyColor(c, 100); setOpen(null) }}
                style={{
                  width: 20, height: 20, borderRadius: '50%', border: 'none', background: c, cursor: 'pointer',
                  outline: baseHex.toLowerCase() === c.toLowerCase() ? '2px solid #fff' : '2px solid transparent',
                  outlineOffset: 1.5, transition: 'transform .1s',
                }}
                onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(1.22)' }}
                onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(1)' }}
              />
            ))}
          </div>

          {/* Custom color picker */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            padding: '5px 7px', borderRadius: 7, marginBottom: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              background: 'conic-gradient(#ff4444,#ffaa00,#ffff00,#00cc44,#4488ff,#8844ff,#ff4444)',
              border: '1px solid rgba(255,255,255,0.12)' }}/>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif' }}>Custom</span>
            <input type="color" value={baseHex.startsWith('#') ? baseHex : '#EAEAEA'}
              onChange={e => applyColor(e.target.value)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
          </label>

          {/* Opacity slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '.07em' }}>Opacity</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{opacity}%</span>
            </div>
            <div style={{ position: 'relative', height: 14, display: 'flex', alignItems: 'center' }}>
              {/* Checkerboard + color gradient track */}
              <div style={{
                position: 'absolute', inset: '4px 0',
                borderRadius: 4,
                background: `linear-gradient(to right, transparent, ${baseHex})`,
                backgroundImage: `linear-gradient(to right, transparent, ${baseHex}),
                  repeating-conic-gradient(#555 0% 25%, #333 0% 50%)`,
                backgroundSize: 'auto, 8px 8px',
              }}/>
              <input type="range" min={0} max={100} step={1} value={opacity}
                onMouseDown={(e: MouseEvent<HTMLInputElement>) => e.stopPropagation()}
                onChange={e => applyOpacity(parseInt(e.target.value))}
                style={{ position: 'relative', width: '100%', margin: 0, cursor: 'pointer',
                  accentColor: accentHex(), height: 6 }}
              />
            </div>
          </div>
        </Tray>
      )}
    </Pill>
  )
})

export default ColorPill
