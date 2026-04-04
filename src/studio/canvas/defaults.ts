/**
 * defaults.ts — Default canvas layout + highlight-word styling
 *
 * addDefaultElements()    → draws the standard EM template on a fresh canvas
 * buildHighlightStyles()  → creates Fabric per-character styles for accent words
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, Textbox } from 'fabric'
import { BG, TEXT_PRIMARY, TEXT_MUTED, ELITE_CUSTOM_PROPS, getAccentColor, EM_BRAND_COLOR } from './constants'

// Suppress unused-import warning for BG — kept for parity with original module
void BG
void ELITE_CUSTOM_PROPS

// ── addDefaultElements ────────────────────────────────────────────────────────
// Builds the standard Elite Mode post layout:
//   Image Area (top 55%) → Gradient fade → Logo seal → Title → Subtitle → Tag → Accent line
//
// @param canvas  - Fabric.Canvas instance
// @param w / h   - canvas dimensions
// @param accent  - optional hex string; falls back to live CSS var
export function addDefaultElements(
  canvas: FabricCanvas,
  w: number,
  h: number,
  accent?: string,
): void {
  const A     = accent ?? getAccentColor()
  const imgH  = Math.round(h * 0.55)
  const gradH = Math.round(h * 0.12)

  // Gradient fade (bottom of image area → canvas bg)
  const grad = new fabric.Rect({ left: 0, top: imgH - gradH, width: w, height: gradH, strokeWidth: 0 })
  grad.set('fill', new fabric.Gradient({
    type: 'linear',
    coords: { x1: 0, y1: 0, x2: 0, y2: gradH },
    colorStops: [{ offset: 0, color: 'rgba(17,17,17,0)' }, { offset: 1, color: 'rgba(17,17,17,1)' }],
  }))
  grad.eliteType = 'gradient'; grad.eliteLabel = 'Gradient Overlay'

  // Logo seal (circle + EM text) — always uses EM_BRAND_COLOR, never the theme accent
  const sealBaseR = Math.round(w * 0.042)
  const outer   = new fabric.Circle({ radius: sealBaseR + 3, fill: 'transparent', stroke: EM_BRAND_COLOR, strokeWidth: 2.5, strokeUniform: true, originX: 'center', originY: 'center', left: 0, top: 0 })
  const inner   = new fabric.Circle({ radius: sealBaseR,     fill: '#1A1A1A',    stroke: EM_BRAND_COLOR + '44', strokeWidth: 1, strokeUniform: true, originX: 'center', originY: 'center', left: 0, top: 0 })
  const sealTxt = new fabric.Text('EM', { fontSize: Math.round(sealBaseR * 0.75), fill: EM_BRAND_COLOR, fontFamily: 'Inter, sans-serif', fontWeight: '700', originX: 'center', originY: 'center', left: 0, top: 0 })
  // Position: horizontally centered, just above the title (lower image area)
  const seal    = new fabric.Group([outer, inner, sealTxt], { left: w / 2, top: Math.round(h * 0.49), originX: 'center', originY: 'center' })
  seal.eliteType = 'logo'; seal.eliteLabel = 'Logo Seal'

  // Title
  const title = new fabric.Textbox('TITLE GOES HERE', {
    left: 48, top: Math.round(h * 0.56), width: w - 96,
    fontSize: 72, fill: TEXT_PRIMARY, fontFamily: 'Inter, sans-serif',
    fontWeight: '800', textAlign: 'left', lineHeight: 1.12, charSpacing: 20, editable: true,
  })
  title.eliteType = 'title'; title.eliteLabel = 'Title'

  // Subtitle
  const subtitle = new fabric.Textbox('Subtitle text here', {
    left: 48, top: Math.round(h * 0.76), width: w - 96,
    fontSize: 26, fill: TEXT_MUTED, fontFamily: 'Inter, sans-serif',
    fontWeight: '400', textAlign: 'left', lineHeight: 1.4, editable: true,
  })
  subtitle.eliteType = 'text'; subtitle.eliteLabel = 'Subtitle'

  // Tag / hashtag
  const tag = new fabric.Textbox('#elitemode', {
    left: 48, top: h - 80, width: 300,
    fontSize: 16, fill: A, fontFamily: 'Inter, sans-serif', fontWeight: '600', editable: true,
  })
  tag.eliteType = 'tag'; tag.eliteLabel = 'Tag'

  // Accent bar — uses EM_BRAND_COLOR to match logo, never the theme accent
  const line = new fabric.Rect({ left: 0, top: h - 6, width: w, height: 6, fill: EM_BRAND_COLOR })
  line.eliteType = 'line'; line.eliteLabel = 'Accent Line'

  canvas.add(grad, seal, title, subtitle, tag, line)
  canvas.renderAll()
}

// ── buildHighlightStyles ──────────────────────────────────────────────────────
// Maps a list of UPPER-CASE words onto Fabric's per-character style format:
//   { lineIndex: { charIndex: { fill, fontWeight } } }
//
// Fabric Textbox wraps text at render time so we MUST call initDimensions()
// first to populate textbox.textLines with the wrapped lines.
//
// @param textbox              - Fabric.Textbox with text already set
// @param highlightWordsUpper  - string[] of words to highlight (already UPPER)
// @param color                - hex accent colour
// @param weight               - font-weight string e.g. '800'

type FabricCharStyle = { fill: string; fontWeight: string }
type FabricTextStyles = Record<number, Record<number, FabricCharStyle>>

// Hex → [r, g, b] helper (shared by gradient functions)
function hexToRgbArr(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function buildHighlightStyles(
  textbox: Textbox,
  highlightWordsUpper: string[],
  color: string,
  weight: string,
): FabricTextStyles {
  // Ensure Fabric has computed word-wrap line breaks for the current text
  try { textbox.initDimensions() } catch { /* ignore */ }

  const rawLines: unknown = textbox.textLines
  const lines: string[] =
    Array.isArray(rawLines) && (rawLines as unknown[]).length > 0
      ? (rawLines as unknown[]).map((l) => (typeof l === 'string' ? l : ''))
      : (textbox.text ?? '').split('\n')

  const styles: FabricTextStyles = {}

  lines.forEach((line, lineIdx) => {
    const lineUpper  = line.toUpperCase()
    const lineStyles: Record<number, FabricCharStyle> = {}

    highlightWordsUpper.forEach((word) => {
      if (!word || word.length < 2) return
      let from = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const idx = lineUpper.indexOf(word, from)
        if (idx === -1) break
        for (let ch = idx; ch < idx + word.length; ch++) {
          lineStyles[ch] = { fill: color, fontWeight: weight }
        }
        from = idx + 1
      }
    })

    if (Object.keys(lineStyles).length > 0) styles[lineIdx] = lineStyles
  })

  return styles
}

/**
 * Like buildHighlightStyles but interpolates colors across each keyword's characters
 * to produce a gradient-like effect using just solid per-char fills.
 *
 * @param textbox              - Fabric.Textbox with text already set
 * @param highlightWordsUpper  - string[] of words to highlight (already UPPER)
 * @param fromColor            - gradient start hex color
 * @param toColor              - gradient end hex color
 * @param weight               - font-weight string e.g. '800'
 */
export function buildHighlightStylesGrad(
  textbox: Textbox,
  highlightWordsUpper: string[],
  fromColor: string,
  toColor: string,
  weight: string,
): FabricTextStyles {
  try { textbox.initDimensions() } catch { /* ignore */ }

  const rawLines: unknown = textbox.textLines
  const lines: string[] =
    Array.isArray(rawLines) && (rawLines as unknown[]).length > 0
      ? (rawLines as unknown[]).map((l) => (typeof l === 'string' ? l : ''))
      : (textbox.text ?? '').split('\n')

  const cA = hexToRgbArr(fromColor)
  const cB = hexToRgbArr(toColor)
  const lerp = (t: number): string => {
    const r  = Math.round(cA[0] + (cB[0] - cA[0]) * t)
    const g  = Math.round(cA[1] + (cB[1] - cA[1]) * t)
    const bl = Math.round(cA[2] + (cB[2] - cA[2]) * t)
    return `rgb(${r},${g},${bl})`
  }

  const styles: FabricTextStyles = {}

  lines.forEach((line, lineIdx) => {
    const lineUpper  = line.toUpperCase()
    const lineStyles: Record<number, FabricCharStyle> = {}

    highlightWordsUpper.forEach((word) => {
      if (!word || word.length < 2) return
      let from = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const idx = lineUpper.indexOf(word, from)
        if (idx === -1) break
        const len = word.length
        for (let ch = idx; ch < idx + len; ch++) {
          const t = len === 1 ? 0.5 : (ch - idx) / (len - 1)
          lineStyles[ch] = { fill: lerp(t), fontWeight: weight }
        }
        from = idx + 1
      }
    })

    if (Object.keys(lineStyles).length > 0) styles[lineIdx] = lineStyles
  })

  return styles
}
