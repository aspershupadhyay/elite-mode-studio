/**
 * defaults.js — Default canvas layout + highlight-word styling
 *
 * addDefaultElements()    → draws the standard EM template on a fresh canvas
 * buildHighlightStyles()  → creates Fabric per-character styles for accent words
 */
import * as fabric from 'fabric'
import { BG, TEXT_PRIMARY, TEXT_MUTED, ELITE_CUSTOM_PROPS, getAccentColor } from './constants.js'

// ── addDefaultElements ────────────────────────────────────────────────────────
// Builds the standard Elite Mode post layout:
//   Image Area (top 55%) → Gradient fade → Logo seal → Title → Subtitle → Tag → Accent line
//
// @param canvas  - Fabric.Canvas instance
// @param w / h   - canvas dimensions
// @param accent  - optional hex string; falls back to live CSS var
export function addDefaultElements(canvas, w, h, accent) {
  const A    = accent || getAccentColor()
  const imgH = Math.round(h * 0.55)
  const gradH = Math.round(h * 0.12)
  const sealR = Math.round(w * 0.055)

  // Image placeholder area
  const imgArea = new fabric.Rect({ left:0, top:0, width:w, height:imgH, fill:'#1A1A1A', strokeWidth:0 })
  imgArea.eliteType = 'image_area'; imgArea.eliteLabel = 'Image Area'

  // Gradient fade (bottom of image area → canvas bg)
  const grad = new fabric.Rect({ left:0, top:imgH - gradH, width:w, height:gradH, strokeWidth:0 })
  grad.set('fill', new fabric.Gradient({
    type: 'linear',
    coords: { x1:0, y1:0, x2:0, y2:gradH },
    colorStops: [{ offset:0, color:'rgba(17,17,17,0)' }, { offset:1, color:'rgba(17,17,17,1)' }],
  }))
  grad.eliteType = 'gradient'; grad.eliteLabel = 'Gradient Overlay'

  // Logo seal (circle + EM text)
  const outer   = new fabric.Circle({ radius:sealR+4, fill:'transparent', stroke:A, strokeWidth:3, strokeUniform:true, originX:'center', originY:'center', left:0, top:0 })
  const inner   = new fabric.Circle({ radius:sealR,   fill:'#1A1A1A',    stroke:A+'44', strokeWidth:1, strokeUniform:true, originX:'center', originY:'center', left:0, top:0 })
  const sealTxt = new fabric.Text('EM', { fontSize:Math.round(sealR*0.8), fill:A, fontFamily:'Inter, sans-serif', fontWeight:'700', originX:'center', originY:'center', left:0, top:0 })
  const seal    = new fabric.Group([outer, inner, sealTxt], { left:w/2, top:imgH, originX:'center', originY:'center' })
  seal.eliteType = 'logo'; seal.eliteLabel = 'Logo Seal'

  // Title
  const title = new fabric.Textbox('TITLE GOES HERE', {
    left:48, top:Math.round(h*0.56), width:w-96,
    fontSize:72, fill:TEXT_PRIMARY, fontFamily:'Inter, sans-serif',
    fontWeight:'800', textAlign:'left', lineHeight:1.12, charSpacing:20, editable:true,
  })
  title.eliteType = 'title'; title.eliteLabel = 'Title'

  // Subtitle
  const subtitle = new fabric.Textbox('Subtitle text here', {
    left:48, top:Math.round(h*0.76), width:w-96,
    fontSize:26, fill:TEXT_MUTED, fontFamily:'Inter, sans-serif',
    fontWeight:'400', textAlign:'left', lineHeight:1.4, editable:true,
  })
  subtitle.eliteType = 'text'; subtitle.eliteLabel = 'Subtitle'

  // Tag / hashtag
  const tag = new fabric.Textbox('#elitemode', {
    left:48, top:h-80, width:300,
    fontSize:16, fill:A, fontFamily:'Inter, sans-serif', fontWeight:'600', editable:true,
  })
  tag.eliteType = 'tag'; tag.eliteLabel = 'Tag'

  // Accent bar
  const line = new fabric.Rect({ left:0, top:h-6, width:w, height:6, fill:A })
  line.eliteType = 'line'; line.eliteLabel = 'Accent Line'

  canvas.add(imgArea, grad, seal, title, subtitle, tag, line)
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
export function buildHighlightStyles(textbox, highlightWordsUpper, color, weight) {
  // Ensure Fabric has computed word-wrap line breaks for the current text
  try { textbox.initDimensions() } catch {}

  const lines = (textbox.textLines && textbox.textLines.length > 0)
    ? textbox.textLines
    : (textbox.text || '').split('\n')

  const styles = {}

  lines.forEach((line, lineIdx) => {
    const lineUpper  = (typeof line === 'string' ? line : '').toUpperCase()
    const lineStyles = {}

    highlightWordsUpper.forEach(word => {
      if (!word || word.length < 2) return
      let from = 0
      while (true) { // eslint-disable-line no-constant-condition
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
