/**
 * commandHandlersDesign.ts — Design-intelligence MCP canvas command implementations.
 *
 * Handlers for:
 *   - brand_kit          — store/retrieve/apply brand colors, fonts, logo
 *   - template_ops       — save/load/list/delete templates via backend API
 *   - fit_text           — binary-search font size to fill a bounding box
 *   - validate_design    — WCAG contrast check + safe-zone warnings
 *   - execute_design_plan — apply an LLM-generated layout plan in one canvas call
 *   - build_carousel_page — create all elements for one carousel slide at once
 *   - assign_elite_id    — assign stable unique ID to the active element
 */
import type { Canvas as FabricCanvas, FabricObject, FabricText } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'
import type { RefObject } from 'react'
import {
  handleSelectByLabel,
  handleAddText, handleAddTitle, handleAddSubtitle, handleAddTag,
  handleAddShape, handleAddAccentLine, handleAddGradientOverlay,
  handleAddLogo, handleAddFrame, handleAddIcon,
  handleSetBackground,
} from './commandHandlers'
import { handleUpdateElement } from './commandHandlersConsolidated'

/** Map from element type string to add-handler function */
const ADD_HANDLERS: Record<string, (r: RefObject<CanvasHandle | null>, p: Record<string, unknown>) => unknown> = {
  text:             handleAddText,
  title:            handleAddTitle,
  subtitle:         handleAddSubtitle,
  tag:              handleAddTag,
  shape:            handleAddShape,
  accent_line:      handleAddAccentLine,
  gradient_overlay: handleAddGradientOverlay,
  logo:             handleAddLogo,
  frame:            handleAddFrame,
  icon:             handleAddIcon,
}

const BRAND_KIT_KEY  = 'elite_brand_kit'
const BACKEND_BASE   = 'http://127.0.0.1:8000'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCanvas(canvasRef: RefObject<CanvasHandle | null>): FabricCanvas {
  const c = canvasRef.current?.getCanvas()
  if (!c) throw new Error('canvas not ready')
  return c
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6 && clean.length !== 3) return null
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(fg: string, bg: string): number {
  const fgRgb = hexToRgb(fg)
  const bgRgb = hexToRgb(bg)
  if (!fgRgb || !bgRgb) return 0
  const lFg = relativeLuminance(fgRgb)
  const lBg = relativeLuminance(bgRgb)
  const lighter = Math.max(lFg, lBg)
  const darker  = Math.min(lFg, lBg)
  return (lighter + 0.05) / (darker + 0.05)
}

async function backendFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Backend ${path} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── brand_kit ─────────────────────────────────────────────────────────────────

export interface BrandKit {
  colors?:    string[]
  fontFamily?: string
  fontWeight?: string
  logoUrl?:   string
}

export function handleBrandKit(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): unknown {
  const action = String(params.action || 'get')

  if (action === 'set') {
    const existing: BrandKit = JSON.parse(localStorage.getItem(BRAND_KIT_KEY) || '{}')
    const updated: BrandKit = {
      colors:     Array.isArray(params.colors) ? (params.colors as string[]) : existing.colors,
      fontFamily: params.font_family ? String(params.font_family) : existing.fontFamily,
      fontWeight: params.font_weight ? String(params.font_weight) : existing.fontWeight,
      logoUrl:    params.logo_url    ? String(params.logo_url)    : existing.logoUrl,
    }
    localStorage.setItem(BRAND_KIT_KEY, JSON.stringify(updated))
    return { status: 'saved', brandKit: updated }
  }

  if (action === 'get') {
    const kit: BrandKit = JSON.parse(localStorage.getItem(BRAND_KIT_KEY) || '{}')
    return { brandKit: kit }
  }

  if (action === 'apply') {
    const kit: BrandKit = JSON.parse(localStorage.getItem(BRAND_KIT_KEY) || '{}')
    if (!kit.colors?.length && !kit.fontFamily) {
      throw new Error('No brand kit saved. Call brand_kit with action="set" first.')
    }
    const canvas  = getCanvas(canvasRef)
    const objects = canvas.getObjects()
    let applied   = 0
    for (const obj of objects) {
      const type = (obj as FabricObject & { eliteType?: string }).eliteType
      if (type === 'background' || type === 'gradient') continue
      if (kit.fontFamily && 'fontFamily' in obj) {
        ;(obj as FabricObject & { fontFamily?: string }).fontFamily = kit.fontFamily
        if (kit.fontWeight) (obj as FabricObject & { fontWeight?: string }).fontWeight = kit.fontWeight
      }
      if (kit.colors?.length && type === 'accent_line') {
        obj.set('fill', kit.colors[0])
      }
      applied++
    }
    canvas.renderAll()
    canvasRef.current?.saveHistory()
    return { status: 'applied', elementsUpdated: applied, brandKit: kit }
  }

  throw new Error(`unknown action "${action}". Valid: set, get, apply`)
}

// ── template_ops ──────────────────────────────────────────────────────────────

export async function handleTemplateOps(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const action = String(params.action || 'list')

  if (action === 'list') {
    const templates = await backendFetch('/api/templates') as Array<Record<string, unknown>>
    return {
      templates: templates.map(t => ({
        id:     t.id,
        name:   t.name,
        width:  t.width,
        height: t.height,
      })),
    }
  }

  if (action === 'save') {
    const name   = String(params.name || 'Untitled Template')
    const handle = canvasRef.current
    if (!handle) throw new Error('canvas not ready')
    const canvas     = handle.getCanvas()
    const canvasJson = handle.exportJSON() ?? '{}'
    const thumbnail  = params.with_thumbnail !== false
      ? (canvas?.toDataURL({ multiplier: 0.25, format: 'png' }) ?? null)
      : null
    const w = (canvas?.width  ?? 1080)
    const h = (canvas?.height ?? 1350)
    const created = await backendFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name, canvas_json: canvasJson, thumbnail: thumbnail ?? null, width: w, height: h }),
    }) as Record<string, unknown>
    return { status: 'saved', id: created.id, name: created.name }
  }

  if (action === 'load') {
    const idOrName = String(params.id || params.name || '')
    if (!idOrName) throw new Error('provide id or name of the template to load')

    let template: Record<string, unknown>
    try {
      template = await backendFetch(`/api/templates/${idOrName}`) as Record<string, unknown>
    } catch {
      const all = await backendFetch('/api/templates') as Array<Record<string, unknown>>
      const found = all.find(t => String(t.name).toLowerCase() === idOrName.toLowerCase())
      if (!found) throw new Error(`template "${idOrName}" not found`)
      template = await backendFetch(`/api/templates/${found.id}`) as Record<string, unknown>
    }

    const json = String(template.canvas_json || '{}')
    await canvasRef.current?.importJSON(json)
    return { status: 'loaded', name: template.name, id: template.id }
  }

  if (action === 'delete') {
    const id = String(params.id || '')
    if (!id) throw new Error('provide id of the template to delete')
    await backendFetch(`/api/templates/${id}`, { method: 'DELETE' })
    return { status: 'deleted', id }
  }

  throw new Error(`unknown action "${action}". Valid: save, load, list, delete`)
}

// ── fit_text ──────────────────────────────────────────────────────────────────

export function handleFitText(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): unknown {
  const canvas = getCanvas(canvasRef)

  // Select target element if label given
  if (typeof params.label === 'string') {
    handleSelectByLabel(canvasRef, { label: params.label })
  }

  const obj = canvas.getActiveObject()
  if (!obj) throw new Error('no text element selected — pass label or select first')

  const textObj = obj as FabricText & { fontSize?: number; text?: string; _clearCache?: () => void }
  if (!('text' in textObj)) throw new Error('selected element is not a text object')

  const maxW     = Number(params.max_width  ?? textObj.width  ?? 400)
  const maxH     = Number(params.max_height ?? textObj.height ?? 200)
  const minFont  = Number(params.min_font   ?? 8)
  const maxFont  = Number(params.max_font   ?? 200)

  // Binary search for largest font size that fits within maxW x maxH
  let lo = minFont, hi = maxFont, best = minFont
  for (let iter = 0; iter < 20; iter++) {
    const mid = Math.floor((lo + hi) / 2)
    textObj.set('fontSize', mid)
    textObj._clearCache?.()
    const w = (textObj.width  ?? 0) * (textObj.scaleX ?? 1)
    const h = (textObj.height ?? 0) * (textObj.scaleY ?? 1)
    if (w <= maxW && h <= maxH) { best = mid; lo = mid + 1 }
    else { hi = mid - 1 }
  }

  textObj.set('fontSize', best)
  textObj._clearCache?.()
  ;(textObj as FabricText & { dirty?: boolean }).dirty = true
  canvas.renderAll()
  canvasRef.current?.saveHistory()
  return { fontSize: best, label: (textObj as FabricObject & { eliteLabel?: string }).eliteLabel ?? '' }
}

// ── validate_design ───────────────────────────────────────────────────────────

export function handleValidateDesign(
  canvasRef: RefObject<CanvasHandle | null>,
  _params: Record<string, unknown>,
): unknown {
  const canvas      = getCanvas(canvasRef)
  const canvasW     = canvas.width  ?? 1080
  const canvasH     = canvas.height ?? 1350
  const SAFE_MARGIN = 48
  const warnings: Array<{ label: string; type: string; message: string }> = []
  const passed:   Array<{ label: string; check: string }> = []

  const bgColor = (() => {
    const bg = canvas.backgroundColor
    return typeof bg === 'string' ? bg : '#111111'
  })()

  for (const obj of canvas.getObjects()) {
    const label = (obj as FabricObject & { eliteLabel?: string }).eliteLabel ?? obj.type ?? 'unknown'
    const type  = (obj as FabricObject & { eliteType?: string }).eliteType ?? ''

    // Safe zone check
    const left   = obj.left  ?? 0
    const top    = obj.top   ?? 0
    const right  = left + (obj.width  ?? 0) * (obj.scaleX ?? 1)
    const bottom = top  + (obj.height ?? 0) * (obj.scaleY ?? 1)

    if (left < SAFE_MARGIN || top < SAFE_MARGIN || right > canvasW - SAFE_MARGIN || bottom > canvasH - SAFE_MARGIN) {
      if (type !== 'background' && type !== 'gradient' && type !== 'accent_line') {
        warnings.push({ label, type: 'safe_zone', message: `"${label}" extends within ${SAFE_MARGIN}px of canvas edge — may be clipped on Instagram` })
      }
    }

    // Contrast check for text elements
    if (type === 'title' || type === 'text' || type === 'subtitle' || type === 'tag') {
      const fill = (obj as FabricText & { fill?: string }).fill
      const textColor = typeof fill === 'string' ? fill : '#FFFFFF'
      const ratio = contrastRatio(textColor, bgColor)
      if (ratio < 3.0) {
        warnings.push({ label, type: 'contrast', message: `"${label}" contrast ratio ${ratio.toFixed(1)}:1 — below WCAG AA minimum (3:1 for large text, 4.5:1 for body)` })
      } else {
        passed.push({ label, check: `contrast ${ratio.toFixed(1)}:1 OK` })
      }
    }
  }

  return {
    warnings,
    passed,
    summary: warnings.length === 0
      ? 'Design passes all checks'
      : `${warnings.length} issue${warnings.length > 1 ? 's' : ''} found`,
  }
}

// ── execute_design_plan ────────────────────────────────────────────────────────

export async function handleExecuteDesignPlan(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const plan = params.plan
  if (!Array.isArray(plan) || !plan.length) {
    throw new Error('plan must be a non-empty array of steps from design_from_brief')
  }

  const results: Array<{ step: number; action: string; status: string; error?: string }> = []
  let step = 0

  for (const item of plan) {
    step++
    const action     = String((item as Record<string, unknown>).action || '')
    const stepParams = ((item as Record<string, unknown>).params ?? {}) as Record<string, unknown>

    try {
      if (action === 'set_background') {
        handleSetBackground(canvasRef, stepParams)
      } else if (action === 'update_element') {
        handleUpdateElement(canvasRef, stepParams)
      } else {
        const handler = ADD_HANDLERS[action.replace('add_', '')]
          ?? ADD_HANDLERS[action]
        if (!handler) throw new Error(`unknown action "${action}"`)
        await Promise.resolve(handler(canvasRef, stepParams))
      }
      results.push({ step, action, status: 'ok' })
    } catch (err) {
      results.push({ step, action, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  canvasRef.current?.saveHistory()
  const failed = results.filter(r => r.status === 'error').length
  return { total: step, succeeded: step - failed, failed, steps: results }
}

// ── build_carousel_page ────────────────────────────────────────────────────────

export function handleBuildCarouselPage(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): unknown {
  const created: string[] = []

  type SlideEl = { type: string; [k: string]: unknown }
  const elements: SlideEl[] = Array.isArray(params.elements)
    ? (params.elements as SlideEl[])
    : []

  if (!elements.length) {
    throw new Error('elements array is required — each item: { type, text?, x, y, width, height, color?, fill? }')
  }

  if (params.background) {
    handleSetBackground(canvasRef, { color: String(params.background) })
  }

  for (const el of elements) {
    const elType  = String(el.type || 'text')
    const handler = ADD_HANDLERS[elType]
    if (!handler) {
      created.push(`skipped:${elType}`)
      continue
    }
    handler(canvasRef, el as Record<string, unknown>)
    created.push(elType)
  }

  canvasRef.current?.saveHistory()
  return { elementsCreated: created.length, types: created }
}

// ── assign_elite_id ────────────────────────────────────────────────────────────

type EliteTargetObj = FabricObject & { eliteId?: string; eliteLabel?: string; dirty?: boolean }

export function handleAssignEliteId(
  canvasRef: RefObject<CanvasHandle | null>,
  params: Record<string, unknown>,
): unknown {
  const canvas = getCanvas(canvasRef)

  if (params.label) {
    handleSelectByLabel(canvasRef, { label: params.label })
  }

  let target: EliteTargetObj | null =
    (canvas.getActiveObject() as EliteTargetObj | null) ?? null

  if (!target) {
    const all = canvas.getObjects()
    target = (all[all.length - 1] as EliteTargetObj | undefined) ?? null
  }
  if (!target) throw new Error('no element found to assign ID to')

  const id    = params.id ? String(params.id) : crypto.randomUUID()
  target.eliteId = id
  target.dirty   = true
  canvas.renderAll()

  return { eliteId: id, label: target.eliteLabel ?? target.type ?? 'unknown' }
}
