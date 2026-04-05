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
  tooltip?: { x: number; y: number; w: number; h: number }
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

  const { vLines = [], hLines = [], nearbyDistances = [] } = guides

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

    </div>
  )
}
