/**
 * fabric-init.ts — Bootstrap a Fabric.Canvas instance with Figma-style defaults.
 *
 * Custom selection handles: white squares with subtle border, rotation icon above,
 * hover outlines, dashed multi-select border.
 */

import * as fabric from 'fabric'
import { BG } from '../../canvas/constants'

// ── Handle dimensions ────────────────────────────────────────────────────────
const CORNER_SIZE     = 8
const MID_SIZE        = 6
const HANDLE_COLOR    = '#FFFFFF'
const HANDLE_BORDER   = '#B0B0B0'
const HOVER_COLOR     = 'rgba(59,130,246,0.35)'  // light blue
const SELECTION_COLOR = 'rgba(59,130,246,0.08)'
const SELECTION_BORDER = 'rgba(59,130,246,0.6)'

// ── Custom corner renderer (Figma-style white squares) ───────────────────────
function renderSquareControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: fabric.FabricObject,
): void {
  const size = fabricObject.cornerSize || CORNER_SIZE
  ctx.save()
  ctx.fillStyle = HANDLE_COLOR
  ctx.strokeStyle = HANDLE_BORDER
  ctx.lineWidth = 1
  ctx.shadowColor = 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.roundRect(left - size / 2, top - size / 2, size, size, 1.5)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.stroke()
  ctx.restore()
}

// ── Midpoint handle renderer (smaller rectangles on edges) ───────────────────
function renderMidControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: fabric.FabricObject,
): void {
  void fabricObject
  const w = MID_SIZE + 2
  const h = MID_SIZE
  ctx.save()
  ctx.fillStyle = HANDLE_COLOR
  ctx.strokeStyle = HANDLE_BORDER
  ctx.lineWidth = 1
  ctx.shadowColor = 'rgba(0,0,0,0.12)'
  ctx.shadowBlur = 2
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.roundRect(left - w / 2, top - h / 2, w, h, 1)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.stroke()
  ctx.restore()
}

// ── Rotation handle renderer (circular with icon) ────────────────────────────
function renderRotateControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
): void {
  const r = 6
  ctx.save()
  ctx.fillStyle = HANDLE_COLOR
  ctx.strokeStyle = HANDLE_BORDER
  ctx.lineWidth = 1
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.arc(left, top, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.stroke()

  // Draw rotation arrow icon
  ctx.strokeStyle = '#666666'
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(left, top, 3, -Math.PI * 0.8, Math.PI * 0.4)
  ctx.stroke()
  // Arrow tip
  const tipX = left + 3 * Math.cos(Math.PI * 0.4)
  const tipY = top + 3 * Math.sin(Math.PI * 0.4)
  ctx.beginPath()
  ctx.moveTo(tipX - 2, tipY - 1.5)
  ctx.lineTo(tipX, tipY)
  ctx.lineTo(tipX - 2, tipY + 1.5)
  ctx.stroke()
  ctx.restore()
}

export function initFabricCanvas(
  canvasEl: HTMLCanvasElement,
  width: number,
  height: number,
  accent: string,
): fabric.Canvas {
  void accent  // accent no longer used for handles; kept for API compat

  const canvas = new fabric.Canvas(canvasEl, {
    width,
    height,
    backgroundColor: BG,
    selection: true,
    preserveObjectStacking: true,
    stopContextMenu: true,
    fireRightClick: true,
    // Rubber band selection styling
    selectionColor: SELECTION_COLOR,
    selectionBorderColor: SELECTION_BORDER,
    selectionLineWidth: 1,
  })

  // ── Figma-style selection handles ────────────────────────────────────────
  fabric.FabricObject.prototype.set({
    transparentCorners:  false,
    cornerColor:         HANDLE_COLOR,
    cornerStrokeColor:   HANDLE_BORDER,
    cornerSize:          CORNER_SIZE,
    cornerStyle:         'rect',
    borderColor:         SELECTION_BORDER,
    borderScaleFactor:   1,
    borderDashArray:     undefined,  // solid for single selection
    padding:             1,
    snapAngle:           15,        // rotation snaps to 15° increments
    snapThreshold:       5,         // snap within 5° of target angle
    subTargetCheck:      true,      // enable deep-select into groups on double-click
  })

  // Override corner rendering for all objects
  const cornerControls = ['tl', 'tr', 'bl', 'br'] as const
  const midControls    = ['mt', 'mb', 'ml', 'mr'] as const

  cornerControls.forEach(key => {
    const ctrl = fabric.FabricObject.prototype.controls[key]
    if (ctrl) ctrl.render = renderSquareControl
  })

  midControls.forEach(key => {
    const ctrl = fabric.FabricObject.prototype.controls[key]
    if (ctrl) ctrl.render = renderMidControl
  })

  // Rotation control — position above object
  const mtr = fabric.FabricObject.prototype.controls.mtr
  if (mtr) {
    mtr.render = renderRotateControl
    mtr.offsetY = -25
    mtr.cursorStyleHandler = () => 'grab'
    mtr.withConnection = false  // no line connecting rotate handle to object
  }

  // ── Multi-select override: dashed border on ActiveSelection ───────────────
  canvas.on('selection:created', (e) => {
    const sel = e.selected && canvas.getActiveObject()
    if (sel instanceof fabric.ActiveSelection) {
      sel.set({
        borderDashArray: [6, 3],
        borderColor: SELECTION_BORDER,
        cornerSize: CORNER_SIZE,
        padding: 2,
      })
      canvas.renderAll()
    }
  })
  canvas.on('selection:updated', (e) => {
    const sel = e.selected && canvas.getActiveObject()
    if (sel instanceof fabric.ActiveSelection) {
      sel.set({
        borderDashArray: [6, 3],
        borderColor: SELECTION_BORDER,
        cornerSize: CORNER_SIZE,
        padding: 2,
      })
    }
  })

  // ── Hover outline (light blue on mouseover) ──────────────────────────────
  type HoverTarget = fabric.FabricObject & { _eliteHoverBorder?: string }

  canvas.on('mouse:over', (opt) => {
    const target = opt.target as HoverTarget | undefined
    if (!target || target === canvas.getActiveObject()) return
    if (!target.selectable || !target.evented) return
    target._eliteHoverBorder = target.borderColor as string
    target.set('borderColor', HOVER_COLOR)
    target.set('hasBorders', true)
    canvas.renderAll()
  })

  canvas.on('mouse:out', (opt) => {
    const target = opt.target as HoverTarget | undefined
    if (!target) return
    if (target._eliteHoverBorder) {
      target.set('borderColor', target._eliteHoverBorder)
      delete target._eliteHoverBorder
      canvas.renderAll()
    }
  })

  return canvas
}
