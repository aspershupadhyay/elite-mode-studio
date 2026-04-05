/**
 * BIUPill.tsx — Bold / Italic / Underline toggle pill for FloatingTextToolbar.
 */
import { memo } from 'react'
import {
  useFontWeightStyle, useFontStyleStyle, useUnderlineStyle,
} from '../../text/TextStyleStore'
import { Pill, SBtn, ResetBtn } from './shared'

export interface BIUPillProps {
  apply: (styles: Record<string, string | number | boolean | null>) => void
}

const BIUPill = memo(function BIUPill({ apply }: BIUPillProps): JSX.Element {
  const { value: fontWeight, mixed: mixedW, override: ovW } = useFontWeightStyle()
  const { value: fontStyle,  mixed: mixedS, override: ovS } = useFontStyleStyle()
  const { value: underline,  mixed: mixedU, override: ovU } = useUnderlineStyle()

  const isBold   = fontWeight === 'bold' || Number(fontWeight) >= 700
  const isItalic = fontStyle  === 'italic'
  const isUnder  = !!underline

  const anyOverride = ovW || ovS || ovU
  const anyActive   = isBold || isItalic || isUnder
  const anyMixed    = mixedW || mixedS || mixedU

  return (
    <Pill modified={anyActive} mixed={!anyActive && anyMixed} style={{ gap: 1 }}>
      <SBtn active={isBold}   mixed={mixedW} title="Bold"
        onClick={() => apply({ fontWeight: isBold   ? null : 'bold'   })}>
        <span style={{ fontSize: 13, fontWeight: 700,               fontFamily: 'sans-serif' }}>B</span>
      </SBtn>
      <SBtn active={isItalic} mixed={mixedS} title="Italic"
        onClick={() => apply({ fontStyle: isItalic  ? null : 'italic' })}>
        <span style={{ fontSize: 13, fontStyle: 'italic',            fontFamily: 'sans-serif' }}>I</span>
      </SBtn>
      <SBtn active={isUnder}  mixed={mixedU} title="Underline"
        onClick={() => apply({ underline: isUnder   ? null : true    })}>
        <span style={{ fontSize: 13, textDecoration: 'underline',    fontFamily: 'sans-serif' }}>U</span>
      </SBtn>
      {anyOverride && <ResetBtn onClick={() => apply({ fontWeight: null, fontStyle: null, underline: null })}/>}
    </Pill>
  )
})

export default BIUPill
