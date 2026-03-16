/**
 * FrameShapePreview.jsx
 * Renders a tiny accurate SVG preview of each frame shape.
 * Used in the Frames panel of BottomToolbar.
 * Keeping this as a separate component keeps BottomToolbar lean.
 */

import { FRAME_SHAPES } from '../canvas/frames.js'

// SVG path/element map for all defined shapes (36×36 viewport, centered at 18,18)
const SHAPE_SVG = {
  'rect':          <rect x="3" y="3" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'rounded-rect':  <rect x="3" y="3" width="30" height="30" rx="5" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'circle':        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'ellipse':       <ellipse cx="18" cy="18" rx="15" ry="11" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'triangle':      <polygon points="18,4 33,32 3,32" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'diamond':       <polygon points="18,3 33,18 18,33 3,18" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'hexagon':       <polygon points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'pentagon':      <polygon points="18,3 33,14 27,31 9,31 3,14" fill="none" stroke="currentColor" strokeWidth="2"/>,
  'octagon':       <polygon points="11,3 25,3 33,11 33,25 25,33 11,33 3,25 3,11" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'star':          <polygon points="18,3 21,13 31,13 23,19 26,30 18,24 10,30 13,19 5,13 15,13" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'star-4':        <polygon points="18,3 20,14 31,16 20,18 18,29 16,18 5,16 16,14" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'cross':         <path d="M14,3 h8 v11 h11 v8 h-11 v11 h-8 v-11 h-11 v-8 h11 z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'heart':         <path d="M18,28 C18,28 5,20 5,12 C5,8 8,5 12,5 C14.5,5 16.5,6 18,8 C19.5,6 21.5,5 24,5 C28,5 31,8 31,12 C31,20 18,28 18,28 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'shield':        <path d="M18,3 L31,9 L31,17 C31,24 24,30 18,33 C12,30 5,24 5,17 L5,9 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'speech':        <path d="M5,5 h26 a2,2 0 0 1 2,2 v16 a2,2 0 0 1-2,2 h-18 l-5,5 l0,-5 h-3 a2,2 0 0 1-2,-2 v-16 a2,2 0 0 1 2,-2 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'arrow':         <polygon points="3,13 18,13 18,5 33,18 18,31 18,23 3,23" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  'badge':         <polygon points="18,3 21,6 25,5 27,8 31,9 31,13 34,16 32,19 33,23 30,25 29,29 25,29 22,32 18,31 14,32 11,29 7,29 6,25 3,23 4,19 2,16 5,13 5,9 9,8 11,5 15,6" fill="none" stroke="currentColor" strokeWidth="1"/>,
}

export default function FrameShapePreview({ shapeKey, size = 36 }) {
  // Letter or digit — render as bold text
  if (shapeKey.length === 1 && /[A-Z0-9]/.test(shapeKey)) {
    return (
      <div style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontWeight: 900,
        fontSize: size * 0.65,
        color: 'currentColor',
        userSelect: 'none',
        lineHeight: 1,
      }}>
        {shapeKey}
      </div>
    )
  }

  const shape = SHAPE_SVG[shapeKey]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      style={{ display: 'block', color: 'currentColor' }}
    >
      {shape ?? <rect x="3" y="3" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2"/>}
    </svg>
  )
}
