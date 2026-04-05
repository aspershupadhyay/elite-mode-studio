/**
 * FontSizePill.tsx — Font size stepper pill for FloatingTextToolbar.
 */
import { memo, useState, useEffect, useCallback, useRef } from 'react'
import type { MouseEvent, KeyboardEvent, TouchEvent } from 'react'
import { useFontSizeStyle } from '../../text/TextStyleStore'
import { Pill, ResetBtn, useLongPress } from './shared'

export interface FontSizePillProps {
  apply: (styles: Record<string, string | number | boolean | null>) => void
}

const FontSizePill = memo(function FontSizePill({ apply }: FontSizePillProps): JSX.Element {
  const { value: fontSize, mixed, override } = useFontSizeStyle()
  const [localSize, setLocalSize] = useState('')
  const [sizeKey,   setSizeKey]   = useState(0)
  const sizeRef = useRef(24)

  // Sync display when external state changes
  useEffect(() => {
    if (fontSize != null) {
      const v = Math.round(fontSize as number)
      sizeRef.current = v
      setLocalSize(String(v))
    } else if (mixed) {
      setLocalSize('—')
    }
  }, [fontSize, mixed])

  const doStep = useCallback((dir: number): void => {
    const next = Math.max(8, sizeRef.current + dir)
    sizeRef.current = next
    setLocalSize(String(next))
    setSizeKey(k => k + 1)
    apply({ fontSize: next })
  }, [apply])

  const { start: startStep, stop: stopStep } = useLongPress(doStep)

  return (
    <Pill modified={override} mixed={mixed} style={{ gap: 1, padding: '0 4px' }}>
      <button title="Decrease (hold)"
        onMouseDown={(e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); startStep(-1) }}
        onMouseUp={stopStep} onMouseLeave={stopStep}
        onTouchStart={(e: TouchEvent<HTMLButtonElement>) => { e.preventDefault(); startStep(-1) }}
        onTouchEnd={stopStep}
        style={{
          width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 18, fontWeight: 300, lineHeight: 1,
        }}
      >−</button>

      <div style={{ position: 'relative', width: 30 }}>
        <span key={sizeKey} style={{
          display: 'block', textAlign: 'center', fontSize: 12,
          color: mixed ? 'rgba(255,255,255,0.45)' : '#EAEAEA',
          fontFamily: 'monospace', lineHeight: '28px', pointerEvents: 'none',
          animation: 'sz-pop .1s cubic-bezier(.16,1,.3,1)',
        }}>{localSize}</span>
        <input value={localSize}
          onChange={e => {
            setLocalSize(e.target.value)
            sizeRef.current = parseInt(e.target.value) || sizeRef.current
          }}
          onBlur={e => {
            const v = parseInt(e.target.value)
            if (v >= 8) { sizeRef.current = v; apply({ fontSize: v }) }
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              const v = parseInt(localSize)
              if (v >= 8) { sizeRef.current = v; apply({ fontSize: v }) }
            }
          }}
          onMouseDown={(e: MouseEvent<HTMLInputElement>) => e.stopPropagation()}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'text' }}
        />
      </div>

      <button title="Increase (hold)"
        onMouseDown={(e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); startStep(+1) }}
        onMouseUp={stopStep} onMouseLeave={stopStep}
        onTouchStart={(e: TouchEvent<HTMLButtonElement>) => { e.preventDefault(); startStep(+1) }}
        onTouchEnd={stopStep}
        style={{
          width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 14, fontWeight: 300, lineHeight: 1,
        }}
      >+</button>
      {override && <ResetBtn onClick={() => apply({ fontSize: null })}/>}
    </Pill>
  )
})

export default FontSizePill
