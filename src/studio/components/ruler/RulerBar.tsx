/**
 * RulerBar.tsx — single ruler bar (horizontal or vertical)
 * rendering tick marks, labels and canvas-range highlight.
 */

const RULER_SIZE = 20

function niceInterval(canvasSize: number, zoom: number): number {
  const targetScreenGap = 40
  const rawCanvasGap    = targetScreenGap / zoom
  const magnitude       = Math.pow(10, Math.floor(Math.log10(rawCanvasGap)))
  const normalized      = rawCanvasGap / magnitude
  let nice: number
  if      (normalized < 1.5) nice = 1
  else if (normalized < 3.5) nice = 2
  else if (normalized < 7.5) nice = 5
  else                       nice = 10
  return nice * magnitude
}

export interface RulerBarProps {
  orientation: 'horizontal' | 'vertical'
  /** Full screen length of the ruler bar (px) */
  length: number
  zoom: number
  /** Canvas origin offset in screen pixels */
  panOffset: number
  /** Canvas design dimension (width for horizontal, height for vertical) */
  canvasSize: number
  /** Opposite canvas dimension (height for horizontal, width for vertical) */
  canvasSizeOpposite: number
  /** Canvas origin position in screen pixels (left for H, top for V) */
  canvasOrigin: number
  /** Canvas extent in screen pixels (width*zoom for H, height*zoom for V) */
  canvasExtent: number
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void
}

export function RulerBar({
  orientation,
  length,
  zoom,
  canvasSize,
  canvasOrigin,
  canvasExtent,
  onMouseDown,
}: RulerBarProps): JSX.Element {
  const isH    = orientation === 'horizontal'
  const interval = niceInterval(canvasSize, zoom)

  const startTick = Math.floor((isH ? (RULER_SIZE - canvasOrigin) / zoom : (RULER_SIZE - canvasOrigin) / zoom) / interval) * interval
  const endTick   = Math.ceil(((length - canvasOrigin) / zoom) / interval) * interval

  // Use CSS vars so ruler adapts to light/dark theme
  const tickColor  = 'var(--border-strong)'
  const minorColor = 'var(--border-default)'
  const labelColor = 'var(--text-tertiary)'
  const highlightColor = 'var(--border-subtle)'
  const edgeColor  = 'var(--border-default)'

  const ticks: JSX.Element[] = []
  for (let cv = startTick; cv <= endTick; cv += interval) {
    const sp = canvasOrigin + cv * zoom - RULER_SIZE

    if (isH) {
      ticks.push(
        <g key={cv}>
          <line
            x1={sp} y1={RULER_SIZE - 8} x2={sp} y2={RULER_SIZE}
            style={{ stroke: tickColor }} strokeWidth={1}
          />
          {sp > 2 && sp < length - RULER_SIZE - 10 && (
            <text
              x={sp + 2} y={RULER_SIZE - 10}
              style={{ fill: labelColor }} fontSize={8}
              fontFamily="JetBrains Mono, monospace"
            >
              {Math.round(cv - canvasSize / 2)}
            </text>
          )}
          {Array.from({ length: 4 }, (_, j) => {
            const mx = sp + ((j + 1) / 5) * interval * zoom
            return (
              <line
                key={j}
                x1={mx} y1={RULER_SIZE - 4} x2={mx} y2={RULER_SIZE}
                style={{ stroke: minorColor }} strokeWidth={0.5}
              />
            )
          })}
        </g>
      )
    } else {
      ticks.push(
        <g key={cv}>
          <line
            x1={RULER_SIZE - 8} y1={sp} x2={RULER_SIZE} y2={sp}
            style={{ stroke: tickColor }} strokeWidth={1}
          />
          {sp > 2 && sp < length - RULER_SIZE - 6 && (
            <text
              style={{ fill: labelColor }} fontSize={8}
              fontFamily="JetBrains Mono, monospace"
              textAnchor="middle" dominantBaseline="middle"
              transform={`translate(${RULER_SIZE / 2 - 1}, ${sp - 6}) rotate(-90)`}
            >
              {Math.round(cv - canvasSize / 2)}
            </text>
          )}
          {Array.from({ length: 4 }, (_, j) => {
            const my = sp + ((j + 1) / 5) * interval * zoom
            return (
              <line
                key={j}
                x1={RULER_SIZE - 4} y1={my} x2={RULER_SIZE} y2={my}
                style={{ stroke: minorColor }} strokeWidth={0.5}
              />
            )
          })}
        </g>
      )
    }
  }

  if (isH) {
    return (
      <svg
        style={{
          position: 'absolute', top: 0, left: RULER_SIZE, right: 0,
          height: RULER_SIZE, width: `calc(100% - ${RULER_SIZE}px)`,
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'block', overflow: 'hidden',
          pointerEvents: 'auto', cursor: 'crosshair', userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
      >
        <rect
          x={canvasOrigin - RULER_SIZE} y={0}
          width={canvasExtent} height={RULER_SIZE}
          style={{ fill: highlightColor }} stroke="none"
        />
        {ticks}
        <rect x={canvasOrigin - RULER_SIZE - 0.5} y={0} width={1} height={RULER_SIZE} style={{ fill: edgeColor }}/>
        <rect x={canvasOrigin - RULER_SIZE + canvasExtent - 0.5} y={0} width={1} height={RULER_SIZE} style={{ fill: edgeColor }}/>
      </svg>
    )
  }

  return (
    <svg
      style={{
        position: 'absolute', top: RULER_SIZE, left: 0,
        width: RULER_SIZE, height: `calc(100% - ${RULER_SIZE}px)`,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'block', overflow: 'hidden',
        pointerEvents: 'auto', cursor: 'crosshair', userSelect: 'none',
      }}
      onMouseDown={onMouseDown}
    >
      <rect
        x={0} y={canvasOrigin - RULER_SIZE}
        width={RULER_SIZE} height={canvasExtent}
        style={{ fill: highlightColor }} stroke="none"
      />
      {ticks}
      <rect x={0} y={canvasOrigin - RULER_SIZE - 0.5} width={RULER_SIZE} height={1} style={{ fill: edgeColor }}/>
      <rect x={0} y={canvasOrigin - RULER_SIZE + canvasExtent - 0.5} width={RULER_SIZE} height={1} style={{ fill: edgeColor }}/>
    </svg>
  )
}
