/**
 * commandHandlersAdvanced.ts — Advanced MCP canvas command implementations.
 *
 * New tools beyond the basic set:
 *   - select_multiple     — select several elements at once by index array
 *   - rotate_element      — rotate selected element to an absolute angle
 *   - set_shadow          — add/remove drop shadow
 *   - set_blur            — add/remove Gaussian blur filter
 *   - align_elements      — align one or more elements relative to the canvas
 *   - distribute_elements — evenly space multiple selected elements
 *   - generate_image      — inject prompt → ChatGPT → capture → place on canvas
 *   - replace_image       — regenerate an existing image with a new prompt
 */
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import '@/types/fabric-custom'
import type { CanvasHandle } from '@/types/canvas'
import type { RefObject } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────

function getCanvas(canvasRef: RefObject<CanvasHandle | null>): FabricCanvas {
  const c = canvasRef.current?.getCanvas()
  if (!c) throw new Error('canvas not ready')
  return c
}

function getActive(canvas: FabricCanvas): FabricObject {
  const obj = canvas.getActiveObject()
  if (!obj) throw new Error('no element selected — use select_by_label or select_by_index first')
  return obj
}

// ── select_multiple ────────────────────────────────────────────────────────

export function handleSelectMultiple(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const raw    = params.indices
  const indices: number[] = Array.isArray(raw) ? (raw as unknown[]).map(Number) : []
  if (!indices.length) throw new Error('indices must be a non-empty array of element indices')

  const all     = canvas.getObjects()
  const targets = indices.map(i => all[i]).filter(Boolean)
  if (!targets.length) throw new Error('no valid element indices found')

  if (targets.length === 1) {
    canvas.setActiveObject(targets[0])
  } else {
    const sel = new fabric.ActiveSelection(targets, { canvas })
    canvas.setActiveObject(sel)
  }
  canvas.renderAll()
  return {
    selected: targets.map((o, i) => ({
      index: indices[i],
      label: o.eliteLabel || o.type || `element-${indices[i]}`,
    })),
  }
}

// ── rotate_element ─────────────────────────────────────────────────────────

export function handleRotate(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const angle  = Number(params.angle ?? 0)
  obj.set('angle', angle)
  obj.setCoords()
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { angle }
}

// ── set_shadow ─────────────────────────────────────────────────────────────

export function handleSetShadow(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas  = getCanvas(canvasRef)
  const obj     = getActive(canvas)
  const enabled = params.enabled !== false && params.enabled !== 'false'

  if (!enabled) {
    obj.set('shadow', null as never)
  } else {
    const shadow = new fabric.Shadow({
      color:   String(params.color   ?? 'rgba(0,0,0,0.6)'),
      blur:    Number(params.blur    ?? 12),
      offsetX: Number(params.offsetX ?? 6),
      offsetY: Number(params.offsetY ?? 6),
    })
    obj.set('shadow', shadow as never)
  }

  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { shadow: enabled ? { color: params.color, blur: params.blur, offsetX: params.offsetX, offsetY: params.offsetY } : null }
}

// ── set_blur ───────────────────────────────────────────────────────────────

export function handleSetBlur(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas) as FabricObject & { filters?: unknown[]; applyFilters?: () => void }
  const radius = Math.max(0, Number(params.radius ?? 0))

  if (radius === 0) {
    obj.filters = []
  } else {
    const blurFilter = new (fabric.filters as Record<string, unknown> & { Blur: new (o: { blur: number }) => unknown }).Blur({ blur: radius / 100 })
    obj.filters = [blurFilter]
  }
  obj.applyFilters?.()
  ;(obj as FabricObject & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { blur: radius }
}

// ── align_elements ─────────────────────────────────────────────────────────
//
// Aligns selected element(s) relative to the full canvas.
// For multi-select, each element is individually aligned to the canvas edge/center.
// alignment values: left | center | right | top | middle | bottom

export function handleAlignElements(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas = getCanvas(canvasRef)
  const obj    = getActive(canvas)
  const align  = String(params.alignment || 'center')
  const cW     = canvas.width  || 1080
  const cH     = canvas.height || 1350

  type ActiveSel = FabricObject & { getObjects?: () => FabricObject[] }
  const targets: FabricObject[] =
    (obj as ActiveSel).getObjects
      ? ((obj as ActiveSel).getObjects!())
      : [obj]

  let aligned = 0
  for (const t of targets) {
    const w = Math.round((t.width  || 0) * (t.scaleX || 1))
    const h = Math.round((t.height || 0) * (t.scaleY || 1))
    switch (align) {
      case 'left':    t.set({ left: 0,              originX: 'left',   originY: t.originY }); break
      case 'right':   t.set({ left: cW - w,         originX: 'left',   originY: t.originY }); break
      case 'center':  t.set({ left: (cW - w) / 2,   originX: 'left',   originY: t.originY }); break
      case 'top':     t.set({ top:  0,              originX: t.originX, originY: 'top'    }); break
      case 'bottom':  t.set({ top:  cH - h,         originX: t.originX, originY: 'top'    }); break
      case 'middle':  t.set({ top:  (cH - h) / 2,  originX: t.originX, originY: 'top'    }); break
      default: throw new Error(`unknown alignment "${align}". Valid: left, center, right, top, middle, bottom`)
    }
    t.setCoords()
    aligned++
  }

  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { alignment: align, count: aligned }
}

// ── distribute_elements ────────────────────────────────────────────────────
//
// Evenly distributes the selected elements along the horizontal or vertical axis.
// Requires at least 2 elements selected.

export function handleDistributeElements(canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) {
  const canvas    = getCanvas(canvasRef)
  const obj       = getActive(canvas)
  const direction = String(params.direction || 'horizontal')

  type ActiveSel = FabricObject & { getObjects?: () => FabricObject[] }
  const targets: FabricObject[] =
    (obj as ActiveSel).getObjects ? ((obj as ActiveSel).getObjects!()) : [obj]

  if (targets.length < 2) throw new Error('select at least 2 elements to distribute')

  if (direction === 'horizontal') {
    const sorted = [...targets].sort((a, b) => (a.left || 0) - (b.left || 0))
    const first  = sorted[0], last = sorted[sorted.length - 1]
    const startX = first.left || 0
    const endX   = (last.left || 0) + Math.round((last.width || 0) * (last.scaleX || 1))
    const totalW = targets.reduce((s, t) => s + Math.round((t.width || 0) * (t.scaleX || 1)), 0)
    const gap    = (endX - startX - totalW) / (sorted.length - 1)
    let cursor   = startX
    for (const t of sorted) {
      t.set({ left: cursor })
      cursor += Math.round((t.width || 0) * (t.scaleX || 1)) + gap
      t.setCoords()
    }
  } else {
    const sorted = [...targets].sort((a, b) => (a.top || 0) - (b.top || 0))
    const first  = sorted[0], last = sorted[sorted.length - 1]
    const startY = first.top || 0
    const endY   = (last.top || 0) + Math.round((last.height || 0) * (last.scaleY || 1))
    const totalH = targets.reduce((s, t) => s + Math.round((t.height || 0) * (t.scaleY || 1)), 0)
    const gap    = (endY - startY - totalH) / (sorted.length - 1)
    let cursor   = startY
    for (const t of sorted) {
      t.set({ top: cursor })
      cursor += Math.round((t.height || 0) * (t.scaleY || 1)) + gap
      t.setCoords()
    }
  }

  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { direction, count: targets.length }
}

// ── generate_image ─────────────────────────────────────────────────────────
//
// Injects prompt into ChatGPT browser, waits for the image to be captured,
// then places it on the canvas. Optionally targets a specific frame by label,
// or replaces an existing image element by label.
//
// params:
//   prompt           — image generation text prompt (required)
//   target_frame     — eliteLabel of frame to load image into (optional)
//   replace_label    — eliteLabel of existing image element to replace (optional)
//   x, y, w, h       — position/size when adding as standalone image (optional)

export async function handleGenerateImage(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const prompt = String(params.prompt || '').trim()
  if (!prompt) throw new Error('prompt is required for image generation')

  const targetFrameLabel = params.target_frame  ? String(params.target_frame)  : null
  const replaceLabel     = params.replace_label ? String(params.replace_label) : null
  const jobId            = `mcp-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  if (!window.api?.startImageGen) {
    throw new Error(
      'ChatGPT image generation is not available in this context. ' +
      'The app must be running in Electron. ' +
      'If you have API keys, use the MCP generate_image tool with provider="fal" or provider="openai" instead.'
    )
  }

  return new Promise<unknown>((resolve, reject) => {
    let unsubFn: (() => void) | null = null

    const timer = setTimeout(() => {
      unsubFn?.()
      reject(new Error('Image generation timed out after 300 s. ChatGPT may be unreachable or require login (call app_control navigate web to log in first).'))
    }, 300_000)

    unsubFn = window.api.onImageGenProgress?.((progress) => {
      if (progress.postId !== jobId) return

      if (progress.status === 'done' && progress.tmpPath) {
        clearTimeout(timer)
        unsubFn?.()
        const imageUrl = `file://${progress.tmpPath}`

        try {
          const canvas = canvasRef.current?.getCanvas()

          if (targetFrameLabel && canvas) {
            const frame = canvas.getObjects().find(
              o => (o.eliteLabel || '').toLowerCase() === targetFrameLabel.toLowerCase() && o.eliteType === 'frame'
            )
            if (frame) {
              canvasRef.current?.loadImageIntoFrameFromURL(frame, imageUrl)
              canvas.renderAll()
              canvasRef.current?.saveHistory()
              resolve({ status: 'done', imageUrl, placedIn: targetFrameLabel })
              return
            }
            // Frame label not found — give an actionable error listing all frames
            const allFrames = canvas.getObjects()
              .filter(o => (o as FabricObject & { eliteType?: string }).eliteType === 'frame')
              .map(o => `"${(o as FabricObject & { eliteLabel?: string }).eliteLabel ?? 'unnamed'}"`)
            reject(new Error(
              `Frame "${targetFrameLabel}" not found on this page. ` +
              `Available frames: [${allFrames.join(', ') || 'none — create one first'}]. ` +
              `Create a frame with: create_element type="frame" label="${targetFrameLabel}". ` +
              `If the frame is on another page, switch pages first with manage_page action="switch".`
            ))
            return
          }

          if (replaceLabel && canvas) {
            const existing = canvas.getObjects().find(
              o => (o.eliteLabel || '').toLowerCase() === replaceLabel.toLowerCase()
            )
            if (existing) { canvas.remove(existing); canvas.renderAll() }
          }

          canvasRef.current?.addImageFromURL(
            imageUrl,
            params.x !== undefined ? Number(params.x) : undefined,
            params.y !== undefined ? Number(params.y) : undefined,
            params.w !== undefined ? Number(params.w) : undefined,
            params.h !== undefined ? Number(params.h) : undefined,
          )
          resolve({
            status:   'done',
            imageUrl,
            replaced: replaceLabel ?? null,
            message:  'Image generated and placed on canvas',
          })
        } catch (err) {
          reject(err)
        }
      } else if (progress.status === 'error') {
        clearTimeout(timer)
        unsubFn?.()
        reject(new Error(progress.error || 'Image generation failed'))
      }
    }) ?? null

    window.api.startImageGen!({
      jobs: [{
        postId:          jobId,
        pageIndex:       0,
        prompt,
        targetEliteType: targetFrameLabel ? 'frame' : 'image',
      }],
    }).catch((err: Error) => {
      clearTimeout(timer)
      unsubFn?.()
      reject(new Error(`Failed to start image generation: ${err.message}`))
    })
  })
}

// ── replace_image — convenience wrapper ───────────────────────────────────
//
// Select the image you want to replace first (or pass replace_label), then
// call this with a new prompt. The old image is removed and the new one placed
// in the same position.

export async function handleReplaceImage(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const canvas = getCanvas(canvasRef)
  let replaceLabel = params.replace_label ? String(params.replace_label) : null

  if (!replaceLabel) {
    const active = canvas.getActiveObject()
    if (active && (active.eliteType === 'image' || active.eliteType === 'frame')) {
      replaceLabel = active.eliteLabel || null
    }
  }

  if (!replaceLabel) {
    throw new Error(
      'Specify replace_label (eliteLabel of the image to replace) or select the image element first.',
    )
  }

  return handleGenerateImage(canvasRef, { ...params, replace_label: replaceLabel })
}
