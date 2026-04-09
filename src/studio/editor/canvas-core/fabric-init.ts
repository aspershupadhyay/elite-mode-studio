/**
 * fabric-init.ts — Bootstrap a Fabric.Canvas instance with custom selection handles.
 *
 * Fabric.js v6 uses instance fields for controls (created via createControls()).
 * Prototype.controls mutation has no effect. We override createControls() globally
 * at module load time so every new FabricObject gets our custom renderers.
 */

import * as fabric from 'fabric'
import { BG } from '../../canvas/constants'

// ── Handle dimensions ────────────────────────────────────────────────────────
const CORNER_R        = 7    // corner circle radius
const PILL_LONG       = 11   // pill capsule long-axis half-length
const PILL_SHORT      = 5    // pill capsule short-axis half-length
const HANDLE_FILL     = '#FFFFFF'
const HANDLE_STROKE   = '#C96A42'
const SELECTION_COLOR = 'rgba(201,106,66,0.08)'
const SEL_BORDER      = '#C96A42'

// ── Renderers ────────────────────────────────────────────────────────────────

function renderCornerCircle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
): void {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.arc(left, top, CORNER_R, 0, Math.PI * 2)
  ctx.fillStyle = HANDLE_FILL
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = HANDLE_STROKE
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function renderHPill(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
): void {
  const hw = PILL_LONG, hh = PILL_SHORT, r = hh
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.16)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.roundRect(left - hw, top - hh, hw * 2, hh * 2, r)
  ctx.fillStyle = HANDLE_FILL
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = HANDLE_STROKE
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function renderVPill(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
): void {
  const hw = PILL_SHORT, hh = PILL_LONG, r = hw
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.16)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.roundRect(left - hw, top - hh, hw * 2, hh * 2, r)
  ctx.fillStyle = HANDLE_FILL
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = HANDLE_STROKE
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function renderRotateControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
): void {
  const r = 6
  ctx.save()
  ctx.fillStyle = HANDLE_FILL
  ctx.strokeStyle = HANDLE_STROKE
  ctx.lineWidth = 1.5
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.arc(left, top, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.stroke()
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(left, top, 3, -Math.PI * 0.8, Math.PI * 0.4)
  ctx.stroke()
  const tipX = left + 3 * Math.cos(Math.PI * 0.4)
  const tipY = top + 3 * Math.sin(Math.PI * 0.4)
  ctx.beginPath()
  ctx.moveTo(tipX - 2, tipY - 1.5)
  ctx.lineTo(tipX, tipY)
  ctx.lineTo(tipX - 2, tipY + 1.5)
  ctx.stroke()
  ctx.restore()
}

// ── Apply custom renders to a controls map ────────────────────────────────────
function patchControls(controls: Record<string, fabric.Control>): void {
  const cornerKeys = ['tl', 'tr', 'bl', 'br']
  const hMidKeys   = ['mt', 'mb']
  const vMidKeys   = ['ml', 'mr']

  for (const key of cornerKeys) {
    const c = controls[key]
    if (c) {
      c.render = renderCornerCircle as fabric.Control['render']
      c.sizeX = CORNER_R * 2 + 6
      c.sizeY = CORNER_R * 2 + 6
    }
  }
  for (const key of hMidKeys) {
    const c = controls[key]
    if (c) {
      c.render = renderHPill as fabric.Control['render']
      c.sizeX = PILL_LONG * 2 + 4
      c.sizeY = PILL_SHORT * 2 + 4
    }
  }
  for (const key of vMidKeys) {
    const c = controls[key]
    if (c) {
      c.render = renderVPill as fabric.Control['render']
      c.sizeX = PILL_SHORT * 2 + 4
      c.sizeY = PILL_LONG * 2 + 4
    }
  }
  const mtr = controls['mtr']
  if (mtr) {
    mtr.render = renderRotateControl as fabric.Control['render']
    mtr.offsetY = -28
    mtr.cursorStyleHandler = () => 'grab'
    mtr.withConnection = false
  }
}

// ── Override createControls globally BEFORE any canvas/object is created ──────
// In Fabric v6, controls are instance fields set by createControls() — prototype
// mutation is ignored. Patching createControls() ensures every new object gets
// our renderers automatically.
;(function patchCreateControls() {
  const proto = fabric.FabricObject.prototype as fabric.FabricObject & {
    createControls?: () => Record<string, fabric.Control>
  }
  if (typeof proto.createControls !== 'function') return
  const original = proto.createControls.bind(proto)
  proto.createControls = function (this: fabric.FabricObject) {
    const controls = original.call(this) as Record<string, fabric.Control>
    patchControls(controls)
    return controls
  }
})()

// ── Also set visual defaults globally ────────────────────────────────────────
Object.assign(fabric.FabricObject.ownDefaults, {
  transparentCorners: false,
  cornerColor:        HANDLE_FILL,
  cornerStrokeColor:  HANDLE_STROKE,
  cornerSize:         CORNER_R * 2,
  cornerStyle:        'rect',
  borderColor:        SEL_BORDER,
  borderScaleFactor:  1.5,
  borderDashArray:    undefined,
  padding:            8,
  snapAngle:          15,
  snapThreshold:      5,
  subTargetCheck:     true,
})

// ── initFabricCanvas ──────────────────────────────────────────────────────────
export function initFabricCanvas(
  canvasEl: HTMLCanvasElement,
  width: number,
  height: number,
  accent: string,
): fabric.Canvas {
  void accent

  const canvas = new fabric.Canvas(canvasEl, {
    width,
    height,
    backgroundColor: BG,
    selection: true,
    preserveObjectStacking: true,
    stopContextMenu: true,
    fireRightClick: true,
    selectionColor: SELECTION_COLOR,
    selectionBorderColor: SEL_BORDER,
    selectionLineWidth: 1,
  })

  // Patch controls on every object added (belt-and-suspenders for v6)
  canvas.on('object:added', ({ target }) => {
    if (target && target.controls) {
      patchControls(target.controls as Record<string, fabric.Control>)
    }
  })

  // Multi-select dashed border
  const applySelBorder = () => {
    const sel = canvas.getActiveObject()
    if (sel instanceof fabric.ActiveSelection) {
      sel.set({ borderDashArray: [6, 3], borderColor: SEL_BORDER, padding: 8 })
      canvas.renderAll()
    }
  }
  canvas.on('selection:created', applySelBorder)
  canvas.on('selection:updated', applySelBorder)

  // Hover outline — draw a border on the lower canvas after each full render.
  // Controls (corners + pills) are only visible when the object is selected.
  let hoveredObj: fabric.FabricObject | null = null

  // mouse:move fires on every pointer movement (even during transforms), giving opt.target.
  // mouse:over is skipped when _currentTransform is active, so we use mouse:move instead.
  canvas.on('mouse:move', (opt) => {
    const target = opt.target
    const active = canvas.getActiveObjects()
    const next = (target && target.selectable && target.evented && !active.includes(target))
      ? target : null
    if (hoveredObj !== next) {
      hoveredObj = next
      canvas.requestRenderAll()
    }
  })

  canvas.on('selection:created', () => { hoveredObj = null })
  canvas.on('selection:updated', () => { hoveredObj = null })
  canvas.on('selection:cleared', () => { hoveredObj = null })

  // after:render fires from both renderAll() (ctx=contextContainer) and renderTop()
  // (ctx=contextTop). We only draw on the lower canvas, so skip renderTop() events.
  canvas.on('after:render', (e: { ctx: CanvasRenderingContext2D }) => {
    if (!hoveredObj) return
    const lowerCtx = canvas.getContext()
    if (e.ctx !== lowerCtx) return
    if (canvas.getActiveObjects().includes(hoveredObj)) { hoveredObj = null; return }
    const PADDING = 8
    const bound = hoveredObj.getBoundingRect()
    e.ctx.save()
    e.ctx.strokeStyle = SEL_BORDER
    e.ctx.lineWidth = 1.5
    e.ctx.setLineDash([])
    e.ctx.strokeRect(
      bound.left   - PADDING,
      bound.top    - PADDING,
      bound.width  + PADDING * 2,
      bound.height + PADDING * 2,
    )
    e.ctx.restore()
  })

  return canvas
}
