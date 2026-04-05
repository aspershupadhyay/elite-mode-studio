/**
 * GuideOverlay.tsx — Figma-style alignment guides + spacing measurements
 *
 * Shows snap alignment lines (teal) and spacing measurement lines (red)
 * while dragging objects — exactly like Figma's layout guides.
 *
 * Props:
 *   guides       — snap data from Canvas.jsx | null
 *   canvasHandle — imperative handle (unused, kept for API compat)
 *   zoom         — current CSS zoom as fraction (e.g. 0.35)
 *   canvasW / H  — canvas design dimensions
 */

// No React hooks needed — purely presentational

// Single accent color for all guides (like Figma's magenta/pink)
const GUIDE_COLOR = '#ff44aa'   // magenta — single color for all snap guides
const MEAS_COLOR  = '#ff44aa'   // same color for spacing measurements
const MEAS_BG     = 'rgba(255,68,170,0.12)'
// Legacy alias
const SNAP_COLOR  = GUIDE_COLOR

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

interface MeasBadgeProps {
  cx: number
  cy: number
  val: number
}

// Small measurement badge rendered as SVG (avoids DOM overlay z-index issues)
function MeasBadge({ cx, cy, val }: MeasBadgeProps): JSX.Element {
  const txt  = String(val)
  const lblW = txt.length * 5.5 + 10
  const lblH = 14
  return (
    <g>
      <rect x={cx - lblW / 2} y={cy - lblH / 2} width={lblW} height={lblH}
        rx={3} fill={MEAS_BG} stroke={MEAS_COLOR} strokeWidth={0.6}/>
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fill={MEAS_COLOR} fontSize={8.5}
        fontFamily="JetBrains Mono, monospace" fontWeight="700">
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

  // Use _originX/Y directly from guides — no state lag
  const ox  = guides._originX ?? 0
  const oy  = guides._originY ?? 0
  const cvx = (cx: number): number => ox + cx * zoom
  const cvy = (cy: number): number => oy + cy * zoom

  const { vLines = [], hLines = [], tooltip, nearbyDistances = [] } = guides
  const isResize = guides.mode === 'resize'

  // ── Position / size tooltip ─────────────────────────────────────────────────
  const tipLabel = tooltip
    ? isResize
      ? `${tooltip.w} × ${tooltip.h}`
      : `X ${tooltip.x}  Y ${tooltip.y}`
    : null
  const tipX = tooltip ? Math.max(4, cvx(tooltip.x + tooltip.w / 2) - 40) : 0
  const tipY = tooltip ? Math.max(4, cvy(tooltip.y) - 28) : 0

  // ── Canvas-edge spacing measurements ───────────────────────────────────────
  // Show distances from object to canvas edges while dragging (not during resize)
  const edgeMeasurements: Array<
    | { type: 'h'; x1: number; x2: number; y: number; val: number }
    | { type: 'v'; y1: number; y2: number; x: number; val: number }
  > = []
  if (tooltip && !isResize) {
    const { x, y, w, h } = tooltip
    const objL = cvx(x),     objR = cvx(x + w)
    const objT = cvy(y),     objB = cvy(y + h)
    const canL = cvx(0),     canR = cvx(canvasW)
    const canT = cvy(0),     canBo = cvy(canvasH)
    const midY = (objT + objB) / 2
    const midX = (objL + objR) / 2

    if (x > 2)               edgeMeasurements.push({ type: 'h', x1: canL,  x2: objL, y: midY, val: Math.round(x) })
    if (x + w < canvasW - 2) edgeMeasurements.push({ type: 'h', x1: objR,  x2: canR, y: midY, val: Math.round(canvasW - x - w) })
    if (y > 2)               edgeMeasurements.push({ type: 'v', y1: canT,  y2: objT, x: midX, val: Math.round(y) })
    if (y + h < canvasH - 2) edgeMeasurements.push({ type: 'v', y1: objB,  y2: canBo, x: midX, val: Math.round(canvasH - y - h) })
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>

        {/* ── Snap alignment lines — span full canvas ─────────────────────── */}
        {vLines.map((line, i) => {
          const x = cvx(line.x ?? 0)
          return (
            <g key={`sv${i}`}>
              <line x1={x} y1={cvy(0)} x2={x} y2={cvy(canvasH)}
                stroke={SNAP_COLOR} strokeWidth={1} opacity={0.9}/>
              {line.label && (
                <text x={x + 4} y={cvy(0) + 13}
                  fill={SNAP_COLOR} fontSize={9}
                  fontFamily="JetBrains Mono, monospace" fontWeight="600">
                  {line.label}
                </text>
              )}
            </g>
          )
        })}

        {hLines.map((line, i) => {
          const y = cvy(line.y ?? 0)
          return (
            <g key={`sh${i}`}>
              <line x1={cvx(0)} y1={y} x2={cvx(canvasW)} y2={y}
                stroke={SNAP_COLOR} strokeWidth={1} opacity={0.9}/>
              {line.label && (
                <text x={cvx(0) + 4} y={y - 4}
                  fill={SNAP_COLOR} fontSize={9}
                  fontFamily="JetBrains Mono, monospace" fontWeight="600">
                  {line.label}
                </text>
              )}
            </g>
          )
        })}

        {/* ── Canvas-edge distance measurements ──────────────────────────── */}
        {edgeMeasurements.map((m, i) => {
          if (m.type === 'h') {
            const len = Math.abs(m.x2 - m.x1)
            if (len < 6) return null
            return (
              <g key={`em${i}`}>
                <line x1={m.x1} y1={m.y} x2={m.x2} y2={m.y}
                  stroke={MEAS_COLOR} strokeWidth={0.8} opacity={0.85}/>
                <line x1={m.x1} y1={m.y - 4} x2={m.x1} y2={m.y + 4}
                  stroke={MEAS_COLOR} strokeWidth={0.8} opacity={0.85}/>
                <line x1={m.x2} y1={m.y - 4} x2={m.x2} y2={m.y + 4}
                  stroke={MEAS_COLOR} strokeWidth={0.8} opacity={0.85}/>
                <MeasBadge cx={(m.x1 + m.x2) / 2} cy={m.y} val={m.val}/>
              </g>
            )
          } else {
            const len = Math.abs(m.y2 - m.y1)
            if (len < 6) return null
            return (
              <g key={`em${i}`}>
                <line x1={m.x} y1={m.y1} x2={m.x} y2={m.y2}
                  stroke={MEAS_COLOR} strokeWidth={0.8} opacity={0.85}/>
                <line x1={m.x - 4} y1={m.y1} x2={m.x + 4} y2={m.y1}
                  stroke={MEAS_COLOR} strokeWidth={0.8} opacity={0.85}/>
                <line x1={m.x - 4} y1={m.y2} x2={m.x + 4} y2={m.y2}
                  stroke={MEAS_COLOR} strokeWidth={0.8} opacity={0.85}/>
                <MeasBadge cx={m.x} cy={(m.y1 + m.y2) / 2} val={m.val}/>
              </g>
            )
          }
        })}

        {/* ── Object-to-object distance measurements ─────────────────────── */}
        {nearbyDistances.map((m, i) => {
          if (m.val <= 0) return null
          if (m.type === 'h') {
            const x1 = cvx(m.from), x2 = cvx(m.to), y = cvy(m.midY ?? 0)
            return (
              <g key={`nm${i}`}>
                <line x1={x1} y1={y} x2={x2} y2={y}
                  stroke={MEAS_COLOR} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.7}/>
                <line x1={x1} y1={y - 3} x2={x1} y2={y + 3} stroke={MEAS_COLOR} strokeWidth={0.8}/>
                <line x1={x2} y1={y - 3} x2={x2} y2={y + 3} stroke={MEAS_COLOR} strokeWidth={0.8}/>
                <MeasBadge cx={(x1 + x2) / 2} cy={y - 10} val={m.val}/>
              </g>
            )
          } else {
            const y1 = cvy(m.from), y2 = cvy(m.to), x = cvx(m.midX ?? 0)
            return (
              <g key={`nm${i}`}>
                <line x1={x} y1={y1} x2={x} y2={y2}
                  stroke={MEAS_COLOR} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.7}/>
                <line x1={x - 3} y1={y1} x2={x + 3} y2={y1} stroke={MEAS_COLOR} strokeWidth={0.8}/>
                <line x1={x - 3} y1={y2} x2={x + 3} y2={y2} stroke={MEAS_COLOR} strokeWidth={0.8}/>
                <MeasBadge cx={x + 14} cy={(y1 + y2) / 2} val={m.val}/>
              </g>
            )
          }
        })}
      </svg>

      {/* ── Position / size tooltip ───────────────────────────────────────── */}
      {tipLabel && (
        <div style={{
          position: 'absolute', left: tipX, top: tipY,
          background: 'rgba(10,10,15,0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e2e8f0',
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
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
