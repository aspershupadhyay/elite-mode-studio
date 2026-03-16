/**
 * RulerGuides.jsx — Figma-style rulers + persistent draggable guide lines
 *
 * Features:
 *   • Horizontal ruler (top) + vertical ruler (left), 20 px wide/tall
 *   • Tick marks with labels that scroll/scale with the canvas zoom & pan
 *   • Drag from the top ruler → creates a vertical guide
 *   • Drag from the left ruler → creates a horizontal guide
 *   • Drag an existing guide → moves it; drag outside canvas → deletes it
 *   • Double-click a guide → deletes it instantly
 *   • Guide lines extend the full width/height of the studio viewport
 *   • Objects snap to guides via snapping.js (rulerGuidesRef)
 *   • Corner square at ruler intersection (click to toggle guides visibility)
 *
 * Props:
 *   canvasW / canvasH  — canvas design dimensions (canvas units, e.g. 1080 × 1350)
 *   zoom               — current zoom as a fraction  (e.g. 0.35)
 *   pan                — current pan offset { x, y } in screen pixels
 *   guides             — { h: number[], v: number[], visible: boolean }
 *   onGuideChange      — (newGuides) => void
 *   studioRef          — ref to the studio center-area <div> (for size queries)
 */

import { useRef, useEffect, useReducer, useCallback } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────
const RULER_SIZE       = 20          // px — fixed screen thickness of each ruler bar
const GUIDE_COLOR      = '#e8365d'   // Figma-style magenta-red
const GUIDE_ALPHA      = 0.9
const CORNER_SIZE      = RULER_SIZE
const CENTER_SNAP_PX   = 7          // screen-pixel threshold to snap guide to canvas center (0)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Choose a "nice" tick interval so we get ≈ 10-15 visible major ticks. */
function niceInterval(canvasSize, zoom) {
  // We want tick marks every ~40 screen pixels
  const targetScreenGap = 40
  const rawCanvasGap    = targetScreenGap / zoom
  const magnitude       = Math.pow(10, Math.floor(Math.log10(rawCanvasGap)))
  const normalized      = rawCanvasGap / magnitude
  let nice
  if      (normalized < 1.5) nice = 1
  else if (normalized < 3.5) nice = 2
  else if (normalized < 7.5) nice = 5
  else                       nice = 10
  return nice * magnitude
}

/** Compute canvas bounds in container-relative screen pixels. */
function computeBounds(studioEl, canvasW, canvasH, zoom, pan) {
  if (!studioEl) return null
  const cw = studioEl.clientWidth
  const ch = studioEl.clientHeight
  return {
    left:   cw / 2 - canvasW * zoom / 2 + (pan?.x || 0),
    top:    ch / 2 - canvasH * zoom / 2 + (pan?.y || 0),
    width:  canvasW * zoom,
    height: canvasH * zoom,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RulerGuides({
  canvasW, canvasH,
  zoom,
  pan,
  guides,
  onGuideChange,
  studioRef,
}) {
  // Force re-render when drag state changes (no actual React state needed for drag)
  const [, forceUpdate] = useReducer(n => n + 1, 0)

  // Refs that are always current (safe to read inside once-mounted event handlers)
  const latestGuides    = useRef(guides)
  const latestZoom      = useRef(zoom)
  const latestPan       = useRef(pan)
  const latestCanvasW   = useRef(canvasW)
  const latestCanvasH   = useRef(canvasH)
  const latestCallback  = useRef(onGuideChange)
  const latestStudio    = useRef(studioRef)

  useEffect(() => { latestGuides.current   = guides },        [guides])
  useEffect(() => { latestZoom.current     = zoom },          [zoom])
  useEffect(() => { latestPan.current      = pan },           [pan])
  useEffect(() => { latestCanvasW.current  = canvasW },       [canvasW])
  useEffect(() => { latestCanvasH.current  = canvasH },       [canvasH])
  useEffect(() => { latestCallback.current = onGuideChange }, [onGuideChange])
  useEffect(() => { latestStudio.current   = studioRef },     [studioRef])

  // Drag state stored in a ref (avoids extra renders for intermediate positions)
  // Shape: null | { type:'new'|'move', axis:'h'|'v', index?:number, pos:number }
  const dragRef     = useRef(null)
  const containerRef = useRef(null)

  // ── Helpers that read latest refs (safe in stale closures) ───────────────

  const getLatestBounds = useCallback(() => {
    return computeBounds(
      latestStudio.current?.current,
      latestCanvasW.current,
      latestCanvasH.current,
      latestZoom.current,
      latestPan.current,
    )
  }, [])

  /** Screen coord → canvas unit (using latest values) */
  const toCx = useCallback((sx) => {
    const b = getLatestBounds()
    return b ? (sx - b.left) / latestZoom.current : sx
  }, [getLatestBounds])

  const toCy = useCallback((sy) => {
    const b = getLatestBounds()
    return b ? (sy - b.top) / latestZoom.current : sy
  }, [getLatestBounds])

  // ── Global mouse handlers (attached once, read from refs) ─────────────────
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const { axis } = dragRef.current
      let pos = axis === 'h'
        ? Math.round(toCy(e.clientY - rect.top))
        : Math.round(toCx(e.clientX - rect.left))

      // ── Snap to canvas center (display label = 0) with resistance ─────────
      const center    = axis === 'h' ? latestCanvasH.current / 2 : latestCanvasW.current / 2
      const screenDist = Math.abs((pos - center) * latestZoom.current)
      const snappedToCenter = screenDist < CENTER_SNAP_PX
      if (snappedToCenter) pos = center

      dragRef.current = { ...dragRef.current, pos, snappedToCenter }
      forceUpdate()
    }

    const onMouseUp = (e) => {
      if (!dragRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const { type, axis, index } = dragRef.current
      let pos = axis === 'h'
        ? Math.round(toCy(e.clientY - rect.top))
        : Math.round(toCx(e.clientX - rect.left))

      // Apply center snap on release too
      const center = axis === 'h' ? latestCanvasH.current / 2 : latestCanvasW.current / 2
      if (Math.abs((pos - center) * latestZoom.current) < CENTER_SNAP_PX) pos = center

      const g        = latestGuides.current
      const newGuides = { ...g, h: [...g.h], v: [...g.v] }
      const W        = latestCanvasW.current
      const H        = latestCanvasH.current
      const inCanvas = axis === 'h' ? (pos >= 0 && pos <= H) : (pos >= 0 && pos <= W)

      if (type === 'new') {
        if (inCanvas) {
          if (axis === 'h') newGuides.h.push(pos)
          else              newGuides.v.push(pos)
          latestCallback.current?.(newGuides)
        }
      } else if (type === 'move') {
        if (inCanvas) {
          if (axis === 'h') newGuides.h[index] = pos
          else              newGuides.v[index] = pos
        } else {
          // Dragged outside canvas → delete the guide
          if (axis === 'h') newGuides.h = newGuides.h.filter((_, i) => i !== index)
          else              newGuides.v = newGuides.v.filter((_, i) => i !== index)
        }
        latestCallback.current?.(newGuides)
      }

      dragRef.current = null
      forceUpdate()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [toCx, toCy]) // stable callbacks that read refs

  // Re-render when studioRef container resizes (keeps ticks in sync)
  useEffect(() => {
    const el = studioRef?.current
    if (!el) return
    const ro = new ResizeObserver(() => forceUpdate())
    ro.observe(el)
    return () => ro.disconnect()
  }, [studioRef])

  // ── Render ────────────────────────────────────────────────────────────────
  const bounds = computeBounds(studioRef?.current, canvasW, canvasH, zoom, pan)
  if (!bounds) return <div ref={containerRef} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:55 }}/>

  const bl = bounds.left
  const bt = bounds.top
  const bw = bounds.width
  const bh = bounds.height

  // Convert canvas unit → screen pixel for the current render
  const toSx = (cx) => bl + cx * zoom
  const toSy = (cy) => bt + cy * zoom

  const containerW = studioRef?.current?.clientWidth  || 2000
  const containerH = studioRef?.current?.clientHeight || 2000

  // Tick interval for current zoom
  const hInt = niceInterval(canvasW, zoom)
  const vInt = niceInterval(canvasH, zoom)

  // Tick range: cover the full ruler (not just canvas bounds)
  const hStartTick = Math.floor((0 - bl) / zoom / hInt) * hInt
  const hEndTick   = Math.ceil(((containerW - bl) / zoom) / hInt) * hInt
  const vStartTick = Math.floor((RULER_SIZE - bt) / zoom / vInt) * vInt
  const vEndTick   = Math.ceil(((containerH - bt) / zoom) / vInt) * vInt

  const drag = dragRef.current

  // ── Ruler mouse-down handlers ─────────────────────────────────────────────
  const onTopRulerDown = (e) => {
    if (e.button !== 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      type: 'new', axis: 'v',
      pos: Math.round(toCx(e.clientX - rect.left)),
    }
    forceUpdate()
  }
  const onLeftRulerDown = (e) => {
    if (e.button !== 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      type: 'new', axis: 'h',
      pos: Math.round(toCy(e.clientY - rect.top)),
    }
    forceUpdate()
  }

  const onGuideDown = (axis, index, currentPos) => (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragRef.current = { type: 'move', axis, index, pos: currentPos }
    forceUpdate()
  }

  const onGuideDblClick = (axis, index) => (e) => {
    e.stopPropagation()
    const newG = { ...guides, h: [...guides.h], v: [...guides.v] }
    if (axis === 'h') newG.h = newG.h.filter((_, i) => i !== index)
    else              newG.v = newG.v.filter((_, i) => i !== index)
    onGuideChange(newG)
  }

  const onToggleVisible = () => {
    onGuideChange({ ...guides, visible: !guides.visible })
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 55 }}
    >
      {/* ── Corner square ──────────────────────────────────────────────────── */}
      <div
        title={guides.visible ? 'Hide guides (click)' : 'Show guides (click)'}
        onClick={onToggleVisible}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: CORNER_SIZE, height: CORNER_SIZE,
          background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 2, pointerEvents: 'auto',
        }}
      >
        <svg width={10} height={10} viewBox="0 0 10 10">
          <line x1={2} y1={5} x2={8} y2={5} stroke={guides.visible ? GUIDE_COLOR : 'rgba(255,255,255,0.3)'} strokeWidth={1.2}/>
          <line x1={5} y1={2} x2={5} y2={8} stroke={guides.visible ? GUIDE_COLOR : 'rgba(255,255,255,0.3)'} strokeWidth={1.2}/>
        </svg>
      </div>

      {/* ── Top ruler (horizontal) ─────────────────────────────────────────── */}
      <svg
        style={{
          position: 'absolute', top: 0, left: RULER_SIZE, right: 0,
          height: RULER_SIZE, width: `calc(100% - ${RULER_SIZE}px)`,
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'block', overflow: 'hidden',
          pointerEvents: 'auto', cursor: 'crosshair', userSelect: 'none',
        }}
        onMouseDown={onTopRulerDown}
      >
        {/* Canvas range highlight */}
        <rect
          x={bl - RULER_SIZE} y={0}
          width={bw} height={RULER_SIZE}
          fill="rgba(255,255,255,0.05)" stroke="none"
        />
        {/* Tick marks + labels */}
        {(() => {
          const items = []
          for (let cv = hStartTick; cv <= hEndTick; cv += hInt) {
            const sx = bl + cv * zoom - RULER_SIZE  // relative to this <svg>'s left
            items.push(
              <g key={cv}>
                <line
                  x1={sx} y1={RULER_SIZE - 8} x2={sx} y2={RULER_SIZE}
                  stroke="rgba(255,255,255,0.3)" strokeWidth={1}
                />
                {/* Only render label if it fits inside the visible ruler */}
                {sx > 2 && sx < containerW - RULER_SIZE - 10 && (
                  <text
                    x={sx + 2} y={RULER_SIZE - 10}
                    fill="rgba(255,255,255,0.45)" fontSize={8}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {Math.round(cv - canvasW / 2)}
                  </text>
                )}
                {/* Minor ticks (4 sub-divisions) */}
                {Array.from({ length: 4 }, (_, j) => {
                  const mx = sx + ((j + 1) / 5) * hInt * zoom
                  return (
                    <line
                      key={j}
                      x1={mx} y1={RULER_SIZE - 4} x2={mx} y2={RULER_SIZE}
                      stroke="rgba(255,255,255,0.15)" strokeWidth={0.5}
                    />
                  )
                })}
              </g>
            )
          }
          return items
        })()}
        {/* Canvas edges markers */}
        <rect x={bl - RULER_SIZE - 0.5} y={0} width={1} height={RULER_SIZE} fill="rgba(255,255,255,0.25)"/>
        <rect x={bl - RULER_SIZE + bw - 0.5} y={0} width={1} height={RULER_SIZE} fill="rgba(255,255,255,0.25)"/>
      </svg>

      {/* ── Left ruler (vertical) ──────────────────────────────────────────── */}
      <svg
        style={{
          position: 'absolute', top: RULER_SIZE, left: 0,
          width: RULER_SIZE, height: `calc(100% - ${RULER_SIZE}px)`,
          background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          display: 'block', overflow: 'hidden',
          pointerEvents: 'auto', cursor: 'crosshair', userSelect: 'none',
        }}
        onMouseDown={onLeftRulerDown}
      >
        {/* Canvas range highlight */}
        <rect
          x={0} y={bt - RULER_SIZE}
          width={RULER_SIZE} height={bh}
          fill="rgba(255,255,255,0.05)" stroke="none"
        />
        {/* Tick marks + labels */}
        {(() => {
          const items = []
          for (let cv = vStartTick; cv <= vEndTick; cv += vInt) {
            const sy = bt + cv * zoom - RULER_SIZE  // relative to this <svg>'s top
            items.push(
              <g key={cv}>
                <line
                  x1={RULER_SIZE - 8} y1={sy} x2={RULER_SIZE} y2={sy}
                  stroke="rgba(255,255,255,0.3)" strokeWidth={1}
                />
                {sy > 2 && sy < containerH - RULER_SIZE - 6 && (
                  <text
                    fill="rgba(255,255,255,0.45)" fontSize={8}
                    fontFamily="JetBrains Mono, monospace"
                    textAnchor="middle" dominantBaseline="middle"
                    transform={`translate(${RULER_SIZE / 2 - 1}, ${sy - 6}) rotate(-90)`}
                  >
                    {Math.round(cv - canvasH / 2)}
                  </text>
                )}
                {Array.from({ length: 4 }, (_, j) => {
                  const my = sy + ((j + 1) / 5) * vInt * zoom
                  return (
                    <line
                      key={j}
                      x1={RULER_SIZE - 4} y1={my} x2={RULER_SIZE} y2={my}
                      stroke="rgba(255,255,255,0.15)" strokeWidth={0.5}
                    />
                  )
                })}
              </g>
            )
          }
          return items
        })()}
        {/* Canvas edges markers */}
        <rect x={0} y={bt - RULER_SIZE - 0.5} width={RULER_SIZE} height={1} fill="rgba(255,255,255,0.25)"/>
        <rect x={0} y={bt - RULER_SIZE + bh - 0.5} width={RULER_SIZE} height={1} fill="rgba(255,255,255,0.25)"/>
      </svg>

      {/* ── Guide lines + hit areas ─────────────────────────────────────────── */}
      {guides.visible && (
        <svg
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            overflow: 'visible', pointerEvents: 'none', zIndex: 56,
          }}
        >
          {/* ── Horizontal guides (drag from left ruler) ── */}
          {guides.h.map((yPos, i) => {
            const isMoving = drag?.type === 'move' && drag.axis === 'h' && drag.index === i
            const sy       = isMoving ? toSy(drag.pos) : toSy(yPos)
            const label    = Math.round((isMoving ? drag.pos : yPos) - canvasH / 2)
            return (
              <g key={`h-${i}`}>
                {/* Wide transparent hit area */}
                <rect
                  x={RULER_SIZE} y={sy - 6}
                  width={containerW} height={12}
                  fill="transparent"
                  style={{ pointerEvents: 'auto', cursor: 'row-resize' }}
                  onMouseDown={onGuideDown('h', i, yPos)}
                  onDoubleClick={onGuideDblClick('h', i)}
                />
                {/* Visible guide line */}
                <line
                  x1={RULER_SIZE} y1={sy} x2={containerW} y2={sy}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_ALPHA}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Ruler-edge indicator */}
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
          })}

          {/* ── Vertical guides (drag from top ruler) ── */}
          {guides.v.map((xPos, i) => {
            const isMoving = drag?.type === 'move' && drag.axis === 'v' && drag.index === i
            const sx       = isMoving ? toSx(drag.pos) : toSx(xPos)
            const label    = Math.round((isMoving ? drag.pos : xPos) - canvasW / 2)
            return (
              <g key={`v-${i}`}>
                {/* Wide transparent hit area */}
                <rect
                  x={sx - 6} y={RULER_SIZE}
                  width={12} height={containerH}
                  fill="transparent"
                  style={{ pointerEvents: 'auto', cursor: 'col-resize' }}
                  onMouseDown={onGuideDown('v', i, xPos)}
                  onDoubleClick={onGuideDblClick('v', i)}
                />
                {/* Visible guide line */}
                <line
                  x1={sx} y1={RULER_SIZE} x2={sx} y2={containerH}
                  stroke={GUIDE_COLOR} strokeWidth={1} opacity={GUIDE_ALPHA}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Ruler-edge indicator */}
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
          })}

          {/* ── Preview guide while dragging from a ruler ── */}
          {drag?.type === 'new' && drag.pos !== undefined && (() => {
            const snapped = drag.snappedToCenter
            const color   = snapped ? '#ffffff' : GUIDE_COLOR
            const opacity = snapped ? 0.9 : 0.65
            const sw      = snapped ? 1.5 : 1
            const dash    = snapped ? '0' : '5 3'
            return drag.axis === 'h' ? (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={RULER_SIZE} y1={toSy(drag.pos)}
                  x2={containerW}  y2={toSy(drag.pos)}
                  stroke={color} strokeWidth={sw}
                  strokeDasharray={dash} opacity={opacity}
                />
                {snapped && (
                  <circle cx={bl + bw / 2} cy={toSy(drag.pos)} r={4}
                    fill={color} opacity={0.9}/>
                )}
              </g>
            ) : (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={toSx(drag.pos)} y1={RULER_SIZE}
                  x2={toSx(drag.pos)} y2={containerH}
                  stroke={color} strokeWidth={sw}
                  strokeDasharray={dash} opacity={opacity}
                />
                {snapped && (
                  <circle cx={toSx(drag.pos)} cy={bt + bh / 2} r={4}
                    fill={color} opacity={0.9}/>
                )}
              </g>
            )
          })()}
        </svg>
      )}
    </div>
  )
}
