/**
 * GuideOverlay.tsx — Figma-style alignment guides + spacing measurements
 *
 * Shows snap alignment lines and object-to-object distance measurements
 * while dragging. Single accent color for all guides.
 */

// Single accent color for all guides
const GUIDE_COLOR = '#ff44aa'

interface SnapLine {
  x?: number
  y?: number
  label?: string
}

interface TooltipData {
  x: number
  y: number
  w: number
  h: number
}

interface NearbyDistance {
  val: number
  type: 'h' | 'v'
  from: number
  to: number
  midY?: number
  midX?: number
  label?: string
}

export interface GuideData {
  active: boolean
  _originX?: number
  _originY?: number
  vLines?: SnapLine[]
  hLines?: SnapLine[]
  tooltip?: TooltipData
  nearbyDistances?: NearbyDistance[]
  mode?: string
}

// Small measurement badge
function MeasBadge({ cx, cy, val, highlight }: { cx: number; cy: number; val: number; highlight?: boolean }): JSX.Element {
  const txt  = String(val)
  const lblW = txt.length * 6 + 12
  const lblH = 16
  return (
    <g>
      <rect x={cx - lblW / 2} y={cy - lblH / 2} width={lblW} height={lblH}
        rx={4} fill={highlight ? GUIDE_COLOR : 'rgba(255,68,170,0.15)'}
        stroke={GUIDE_COLOR} strokeWidth={0.7}/>
      <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle"
        fill={highlight ? '#fff' : GUIDE_COLOR} fontSize={9}
        fontFamily="SF Mono, JetBrains Mono, monospace" fontWeight="700">
        {txt}
      </text>
    </g>
  )
}

interface GuideOverlayProps {
  guides: GuideData | null
  canvasHandle?: unknown
  zoom: number
  canvasW: number
  canvasH: number
}

export default function GuideOverlay({ guides, zoom, canvasW, canvasH }: GuideOverlayProps): JSX.Element {
  if (!guides || !guides.active) {
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}/>
  }

  const ox  = guides._originX ?? 0
  const oy  = guides._originY ?? 0
  const cvx = (cx: number): number => ox + cx * zoom
  const cvy = (cy: number): number => oy + cy * zoom

  const { vLines = [], hLines = [], tooltip, nearbyDistances = [] } = guides
  const isResize = guides.mode === 'resize'

  // Tooltip: show W×H during resize, X Y during move
  const tipLabel = tooltip
    ? isResize
      ? `${tooltip.w} × ${tooltip.h}`
      : `X ${tooltip.x}  Y ${tooltip.y}`
    : null
  const tipX = tooltip ? Math.max(4, cvx(tooltip.x + tooltip.w / 2) - 40) : 0
  const tipY = tooltip ? Math.max(4, cvy(tooltip.y) - 28) : 0

  // Edge distances — only show when snapping to a canvas edge (not always)
  const edgeMeasurements: Array<
    | { type: 'h'; x1: number; x2: number; y: number; val: number }
    | { type: 'v'; y1: number; y2: number; x: number; val: number }
  > = []

  // Only show edge distances when object is snapping to a canvas edge/center
  if (tooltip && !isResize) {
    const { x, y, w, h } = tooltip
    const objL = cvx(x),     objR = cvx(x + w)
    const objT = cvy(y),     objB = cvy(y + h)
    const canL = cvx(0),     canR = cvx(canvasW)
    const canT = cvy(0),     canBo = cvy(canvasH)
    const midY = (objT + objB) / 2
    const midX = (objL + objR) / 2

    // Check if we're snapping to a vertical canvas guide
    const snappingToVGuide = vLines.some(l => {
      const label = l.label || ''
      return label.includes('edge') || label === 'Center' || label.includes('/3')
    })
    // Check if we're snapping to a horizontal canvas guide
    const snappingToHGuide = hLines.some(l => {
      const label = l.label || ''
      return label.includes('edge') || label === 'Center' || label.includes('/3')
    })

    // Only show left/right edge distance when snapping vertically (to a vertical guide)
    if (snappingToVGuide) {
      if (x > 2)               edgeMeasurements.push({ type: 'h', x1: canL,  x2: objL, y: midY, val: Math.round(x) })
      if (x + w < canvasW - 2) edgeMeasurements.push({ type: 'h', x1: objR,  x2: canR, y: midY, val: Math.round(canvasW - x - w) })
    }
    // Only show top/bottom edge distance when snapping horizontally
    if (snappingToHGuide) {
      if (y > 2)               edgeMeasurements.push({ type: 'v', y1: canT,  y2: objT, x: midX, val: Math.round(y) })
      if (y + h < canvasH - 2) edgeMeasurements.push({ type: 'v', y1: objB,  y2: canBo, x: midX, val: Math.round(canvasH - y - h) })
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>

        {/* Snap alignment lines — single magenta color, span full canvas */}
        {vLines.map((line, i) => {
          const x = cvx(line.x ?? 0)
          return (
            <line key={`sv${i}`} x1={x} y1={cvy(0)} x2={x} y2={cvy(canvasH)}
              stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
          )
        })}

        {hLines.map((line, i) => {
          const y = cvy(line.y ?? 0)
          return (
            <line key={`sh${i}`} x1={cvx(0)} y1={y} x2={cvx(canvasW)} y2={y}
              stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
          )
        })}

        {/* Canvas-edge distance measurements — only when snapping to canvas guides */}
        {edgeMeasurements.map((m, i) => {
          if (m.type === 'h') {
            const len = Math.abs(m.x2 - m.x1)
            if (len < 10) return null
            return (
              <g key={`em${i}`}>
                <line x1={m.x1} y1={m.y} x2={m.x2} y2={m.y}
                  stroke={GUIDE_COLOR} strokeWidth={0.7} strokeDasharray="4 3" opacity={0.5}/>
                <line x1={m.x1} y1={m.y - 4} x2={m.x1} y2={m.y + 4}
                  stroke={GUIDE_COLOR} strokeWidth={0.7} opacity={0.5}/>
                <line x1={m.x2} y1={m.y - 4} x2={m.x2} y2={m.y + 4}
                  stroke={GUIDE_COLOR} strokeWidth={0.7} opacity={0.5}/>
                <MeasBadge cx={(m.x1 + m.x2) / 2} cy={m.y} val={m.val}/>
              </g>
            )
          } else {
            const len = Math.abs(m.y2 - m.y1)
            if (len < 10) return null
            return (
              <g key={`em${i}`}>
                <line x1={m.x} y1={m.y1} x2={m.x} y2={m.y2}
                  stroke={GUIDE_COLOR} strokeWidth={0.7} strokeDasharray="4 3" opacity={0.5}/>
                <line x1={m.x - 4} y1={m.y1} x2={m.x + 4} y2={m.y1}
                  stroke={GUIDE_COLOR} strokeWidth={0.7} opacity={0.5}/>
                <line x1={m.x - 4} y1={m.y2} x2={m.x + 4} y2={m.y2}
                  stroke={GUIDE_COLOR} strokeWidth={0.7} opacity={0.5}/>
                <MeasBadge cx={m.x} cy={(m.y1 + m.y2) / 2} val={m.val}/>
              </g>
            )
          }
        })}

        {/* Object-to-object gap measurements — always show when nearby */}
        {nearbyDistances.map((m, i) => {
          if (m.val <= 0) return null
          const isEqualSpacing = m.label === 'Equal spacing'
          if (m.type === 'h') {
            const x1 = cvx(m.from), x2 = cvx(m.to), y = cvy(m.midY ?? 0)
            const len = Math.abs(x2 - x1)
            if (len < 6) return null
            return (
              <g key={`nm${i}`}>
                {/* Connecting line between objects */}
                <line x1={x1} y1={y} x2={x2} y2={y}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
                {/* End caps */}
                <line x1={x1} y1={y - 5} x2={x1} y2={y + 5}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
                <line x1={x2} y1={y - 5} x2={x2} y2={y + 5}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
                {/* Badge with px value */}
                <MeasBadge cx={(x1 + x2) / 2} cy={y - 12} val={m.val} highlight={isEqualSpacing}/>
              </g>
            )
          } else {
            const y1 = cvy(m.from), y2 = cvy(m.to), x = cvx(m.midX ?? 0)
            const len = Math.abs(y2 - y1)
            if (len < 6) return null
            return (
              <g key={`nm${i}`}>
                <line x1={x} y1={y1} x2={x} y2={y2}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
                <line x1={x - 5} y1={y1} x2={x + 5} y2={y1}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
                <line x1={x - 5} y1={y2} x2={x + 5} y2={y2}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={0.8}/>
                <MeasBadge cx={x + 16} cy={(y1 + y2) / 2} val={m.val} highlight={isEqualSpacing}/>
              </g>
            )
          }
        })}
      </svg>

      {/* Position / size tooltip */}
      {tipLabel && (
        <div style={{
          position: 'absolute', left: tipX, top: tipY,
          background: 'rgba(10,10,15,0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e2e8f0',
          fontSize: 10, fontFamily: 'SF Mono, JetBrains Mono, monospace', fontWeight: 600,
          padding: '3px 8px', borderRadius: 5,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 60,
          backdropFilter: 'blur(6px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          {tipLabel}
        </div>
      )}
    </div>
  )
}
