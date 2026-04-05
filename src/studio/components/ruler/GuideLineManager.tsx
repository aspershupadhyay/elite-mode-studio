/**
 * GuideLineManager.tsx — renders guide lines and handles drag-to-move
 * and double-click-to-delete for existing guides.
 */

const RULER_SIZE   = 20
const GUIDE_COLOR  = '#e8365d'
const GUIDE_ALPHA  = 0.9

export interface GuideLineMgrProps {
  guides: number[]
  orientation: 'horizontal' | 'vertical'
  zoom: number
  /** Canvas bounds in container-relative pixels */
  canvasRect: DOMRect | null
  containerW: number
  containerH: number
  /** Canvas left offset in container pixels */
  canvasLeft: number
  /** Canvas top offset in container pixels */
  canvasTop: number
  /** Canvas width in screen pixels */
  canvasW: number
  /** Canvas height in screen pixels */
  canvasH: number
  /** Active drag state to read current drag position */
  dragAxis: 'h' | 'v' | null
  dragType: 'new' | 'move' | null
  dragIndex: number | null
  dragPos: number | null
  /** Design dimensions (canvas units) */
  designW: number
  designH: number
  onGuideMouseDown: (index: number, currentPos: number) => (e: React.MouseEvent) => void
  onGuideDblClick: (index: number) => (e: React.MouseEvent) => void
}

export function GuideLineManager({
  guides,
  orientation,
  zoom,
  containerW,
  containerH,
  canvasLeft,
  canvasTop,
  dragAxis,
  dragType,
  dragIndex,
  dragPos,
  designW,
  designH,
  onGuideMouseDown,
  onGuideDblClick,
}: GuideLineMgrProps): JSX.Element {
  const isH = orientation === 'horizontal'

  const toSx = (cx: number): number => canvasLeft + cx * zoom
  const toSy = (cy: number): number => canvasTop  + cy * zoom

  return (
    <>
      {guides.map((pos, i) => {
        const isMoving = dragType === 'move' && dragAxis === (isH ? 'h' : 'v') && dragIndex === i
        const currentPos = isMoving && dragPos !== null ? dragPos : pos
        const label = Math.round(currentPos - (isH ? designH : designW) / 2)

        if (isH) {
          const sy = toSy(currentPos)
          return (
            <g key={`h-${i}`}>
              <rect
                x={RULER_SIZE} y={sy - 6}
                width={containerW} height={12}
                fill="transparent"
                style={{ pointerEvents: 'auto', cursor: 'row-resize' }}
                onMouseDown={onGuideMouseDown(i, pos)}
                onDoubleClick={onGuideDblClick(i)}
              />
              <line
                x1={RULER_SIZE} y1={sy} x2={containerW} y2={sy}
                stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_ALPHA}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={0} y={sy - RULER_SIZE / 2}
                width={RULER_SIZE} height={RULER_SIZE}
                fill={GUIDE_COLOR} rx={2}
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={RULER_SIZE / 2} y={sy}
                fill="#fff" fontSize={7}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle" dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
            </g>
          )
        } else {
          const sx = toSx(currentPos)
          return (
            <g key={`v-${i}`}>
              <rect
                x={sx - 6} y={RULER_SIZE}
                width={12} height={containerH}
                fill="transparent"
                style={{ pointerEvents: 'auto', cursor: 'col-resize' }}
                onMouseDown={onGuideMouseDown(i, pos)}
                onDoubleClick={onGuideDblClick(i)}
              />
              <line
                x1={sx} y1={RULER_SIZE} x2={sx} y2={containerH}
                stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_ALPHA}
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={sx - RULER_SIZE / 2} y={0}
                width={RULER_SIZE} height={RULER_SIZE}
                fill={GUIDE_COLOR} rx={2}
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={sx} y={RULER_SIZE / 2}
                fill="#fff" fontSize={7}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle" dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
            </g>
          )
        }
      })}
    </>
  )
}
