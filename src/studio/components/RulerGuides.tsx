/**
 * RulerGuides.tsx — Figma-style rulers + persistent draggable guide lines
 */

import { useRef, useEffect, useReducer, useCallback } from 'react'
import type { RefObject } from 'react'
import type { PanOffset, RulerGuideSet } from '@/types/canvas'
import { RulerBar } from './ruler/RulerBar'
import { GuideLineManager } from './ruler/GuideLineManager'

// ── Constants ──────────────────────────────────────────────────────────────
const RULER_SIZE     = 20
const GUIDE_COLOR    = '#e8365d'
const CENTER_SNAP_PX = 7

// ── Types ───────────────────────────────────────────────────────────────────
interface DragState {
  type: 'new' | 'move'
  axis: 'h' | 'v'
  index?: number
  pos: number
  snappedToCenter?: boolean
}

export interface RulerGuidesProps {
  canvasW: number
  canvasH: number
  zoom: number
  pan: PanOffset
  guides: RulerGuideSet
  onGuideChange: (guides: RulerGuideSet) => void
  studioRef: RefObject<HTMLDivElement | null>
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function computeBounds(
  studioEl: HTMLDivElement | null,
  canvasW: number,
  canvasH: number,
  zoom: number,
  pan: PanOffset | null,
): { left: number; top: number; width: number; height: number } | null {
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

// ── Component ────────────────────────────────────────────────────────────────
export default function RulerGuides({
  canvasW, canvasH,
  zoom,
  pan,
  guides,
  onGuideChange,
  studioRef,
}: RulerGuidesProps): JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0)

  const latestGuides   = useRef(guides)
  const latestZoom     = useRef(zoom)
  const latestPan      = useRef(pan)
  const latestCanvasW  = useRef(canvasW)
  const latestCanvasH  = useRef(canvasH)
  const latestCallback = useRef(onGuideChange)
  const latestStudio   = useRef(studioRef)

  useEffect(() => { latestGuides.current   = guides },        [guides])
  useEffect(() => { latestZoom.current     = zoom },          [zoom])
  useEffect(() => { latestPan.current      = pan },           [pan])
  useEffect(() => { latestCanvasW.current  = canvasW },       [canvasW])
  useEffect(() => { latestCanvasH.current  = canvasH },       [canvasH])
  useEffect(() => { latestCallback.current = onGuideChange }, [onGuideChange])
  useEffect(() => { latestStudio.current   = studioRef },     [studioRef])

  const dragRef      = useRef<DragState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const getLatestBounds = useCallback((): ReturnType<typeof computeBounds> => {
    return computeBounds(
      latestStudio.current?.current ?? null,
      latestCanvasW.current,
      latestCanvasH.current,
      latestZoom.current,
      latestPan.current,
    )
  }, [])

  const toCx = useCallback((sx: number): number => {
    const b = getLatestBounds()
    return b ? (sx - b.left) / latestZoom.current : sx
  }, [getLatestBounds])

  const toCy = useCallback((sy: number): number => {
    const b = getLatestBounds()
    return b ? (sy - b.top) / latestZoom.current : sy
  }, [getLatestBounds])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!dragRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const { axis } = dragRef.current
      let pos = axis === 'h'
        ? Math.round(toCy(e.clientY - rect.top))
        : Math.round(toCx(e.clientX - rect.left))

      const center    = axis === 'h' ? latestCanvasH.current / 2 : latestCanvasW.current / 2
      const screenDist = Math.abs((pos - center) * latestZoom.current)
      const snappedToCenter = screenDist < CENTER_SNAP_PX
      if (snappedToCenter) pos = center

      dragRef.current = { ...dragRef.current, pos, snappedToCenter }
      forceUpdate()
    }

    const onMouseUp = (e: MouseEvent): void => {
      if (!dragRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const { type, axis, index } = dragRef.current
      let pos = axis === 'h'
        ? Math.round(toCy(e.clientY - rect.top))
        : Math.round(toCx(e.clientX - rect.left))

      const center = axis === 'h' ? latestCanvasH.current / 2 : latestCanvasW.current / 2
      if (Math.abs((pos - center) * latestZoom.current) < CENTER_SNAP_PX) pos = center

      const g = latestGuides.current
      const newGuides: RulerGuideSet = { ...g, h: [...g.h], v: [...g.v] }
      const W = latestCanvasW.current
      const H = latestCanvasH.current
      const inCanvas = axis === 'h' ? (pos >= 0 && pos <= H) : (pos >= 0 && pos <= W)

      if (type === 'new') {
        if (inCanvas) {
          if (axis === 'h') newGuides.h.push(pos)
          else              newGuides.v.push(pos)
          latestCallback.current?.(newGuides)
        }
      } else if (type === 'move') {
        if (inCanvas) {
          if (axis === 'h') newGuides.h[index!] = pos
          else              newGuides.v[index!]  = pos
        } else {
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
  }, [toCx, toCy])

  useEffect(() => {
    const el = studioRef?.current
    if (!el) return
    const ro = new ResizeObserver(() => forceUpdate())
    ro.observe(el)
    return () => ro.disconnect()
  }, [studioRef])

  const bounds = computeBounds(studioRef?.current ?? null, canvasW, canvasH, zoom, pan)
  if (!bounds) {
    return <div ref={containerRef} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:55 }}/>
  }

  const bl = bounds.left
  const bt = bounds.top
  const bw = bounds.width
  const bh = bounds.height

  const toSx = (cx: number): number => bl + cx * zoom
  const toSy = (cy: number): number => bt + cy * zoom

  const containerW = studioRef?.current?.clientWidth  || 2000
  const containerH = studioRef?.current?.clientHeight || 2000

  const drag = dragRef.current

  const onTopRulerDown = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      type: 'new', axis: 'v',
      pos: Math.round(toCx(e.clientX - rect.left)),
    }
    forceUpdate()
  }

  const onLeftRulerDown = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      type: 'new', axis: 'h',
      pos: Math.round(toCy(e.clientY - rect.top)),
    }
    forceUpdate()
  }

  const onGuideDown = (axis: 'h' | 'v', index: number, currentPos: number) =>
    (e: React.MouseEvent): void => {
      if (e.button !== 0) return
      e.stopPropagation()
      dragRef.current = { type: 'move', axis, index, pos: currentPos }
      forceUpdate()
    }

  const onGuideDblClick = (axis: 'h' | 'v', index: number) =>
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      const newG: RulerGuideSet = { ...guides, h: [...guides.h], v: [...guides.v] }
      if (axis === 'h') newG.h = newG.h.filter((_, i) => i !== index)
      else              newG.v = newG.v.filter((_, i) => i !== index)
      onGuideChange(newG)
    }

  const onToggleVisible = (): void => {
    onGuideChange({ ...guides, visible: !guides.visible })
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 55 }}
    >
      {/* Corner square */}
      <div
        title={guides.visible ? 'Hide guides (click)' : 'Show guides (click)'}
        onClick={onToggleVisible}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: RULER_SIZE, height: RULER_SIZE,
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

      {/* Top ruler (horizontal) */}
      <RulerBar
        orientation="horizontal"
        length={containerW}
        zoom={zoom}
        panOffset={pan.x}
        canvasSize={canvasW}
        canvasSizeOpposite={canvasH}
        canvasOrigin={bl}
        canvasExtent={bw}
        onMouseDown={onTopRulerDown}
      />

      {/* Left ruler (vertical) */}
      <RulerBar
        orientation="vertical"
        length={containerH}
        zoom={zoom}
        panOffset={pan.y}
        canvasSize={canvasH}
        canvasSizeOpposite={canvasW}
        canvasOrigin={bt}
        canvasExtent={bh}
        onMouseDown={onLeftRulerDown}
      />

      {/* Guide lines + hit areas */}
      {guides.visible && (
        <svg
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            overflow: 'visible', pointerEvents: 'none', zIndex: 56,
          }}
        >
          {/* Horizontal guides */}
          <GuideLineManager
            guides={guides.h}
            orientation="horizontal"
            zoom={zoom}
            canvasRect={null}
            containerW={containerW}
            containerH={containerH}
            canvasLeft={bl}
            canvasTop={bt}
            canvasW={bw}
            canvasH={bh}
            dragAxis={drag?.axis ?? null}
            dragType={drag?.type ?? null}
            dragIndex={drag?.index ?? null}
            dragPos={drag?.pos ?? null}
            designW={canvasW}
            designH={canvasH}
            onGuideMouseDown={(i, pos) => onGuideDown('h', i, pos)}
            onGuideDblClick={(i) => onGuideDblClick('h', i)}
          />

          {/* Vertical guides */}
          <GuideLineManager
            guides={guides.v}
            orientation="vertical"
            zoom={zoom}
            canvasRect={null}
            containerW={containerW}
            containerH={containerH}
            canvasLeft={bl}
            canvasTop={bt}
            canvasW={bw}
            canvasH={bh}
            dragAxis={drag?.axis ?? null}
            dragType={drag?.type ?? null}
            dragIndex={drag?.index ?? null}
            dragPos={drag?.pos ?? null}
            designW={canvasW}
            designH={canvasH}
            onGuideMouseDown={(i, pos) => onGuideDown('v', i, pos)}
            onGuideDblClick={(i) => onGuideDblClick('v', i)}
          />

          {/* Preview guide while dragging from a ruler */}
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
