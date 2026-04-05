/**
 * SelectionManager — Fabric.js ↔ TextStyleStore bridge.
 *
 * Responsibilities
 * ─────────────────
 * 1. Read the active Fabric IText/Textbox selection.
 * 2. Resolve per-char styles for the selected range.
 * 3. Detect mixed state (selection spans chars with different values).
 * 4. Take a per-property snapshot for × reset.
 * 5. Push the resolved state into TextStyleStore (single atomic update).
 *
 * Call `pushSelectionToStore(obj, canvasEl, canvas)` anywhere the
 * selection might have changed (mouse:up, keyup, text:editing:entered).
 *
 * Performance
 * ────────────
 * Throttled to one call per rAF via the exported `scheduleSelectionUpdate`
 * helper — callers that might fire many events (e.g. keyup) should use that
 * instead of calling pushSelectionToStore directly.
 */

import type { IText, Textbox, Canvas as FabricCanvas, FabricObject, CompleteTextStyleDeclaration } from 'fabric'
import type {
  StyleValueMap,
  StyleBoolMap,
  StyleSnapshot,
  ScreenRect,
} from '@/types/store'
import { useTextStyleStore, STYLE_PROPS } from './TextStyleStore'

// ── Internal augmented type ───────────────────────────────────────────────────

/**
 * Runtime fields Fabric IText / Textbox carries during editing, not fully
 * present in the public type declarations.
 */
type FabricTextInEdit = (IText | Textbox) & {
  isEditing?: boolean
  selectionStart?: number
  selectionEnd?: number
  getSelectionStyles?: (
    start: number,
    end: number,
    complete: boolean,
  ) => Partial<CompleteTextStyleDeclaration>[]
  getBoundingRect: () => { left: number; top: number; width: number; height: number }
}

// ── Resolve ───────────────────────────────────────────────────────────────────

/**
 * Read Fabric selection styles and return a resolved snapshot.
 * Returns null if obj is null or not in editing mode.
 */
export function resolveSelectionStyles(
  obj: IText | Textbox,
): { resolved: StyleValueMap; mixed: StyleBoolMap; overrides: StyleBoolMap; snapshot: StyleSnapshot } | null {
  const text = obj as FabricTextInEdit
  if (!text || !text.isEditing) return null

  const start = text.selectionStart ?? 0
  const end   = text.selectionEnd   ?? 0

  // Per-char style entries for the selected range.
  // complete=false → only EXPLICIT per-char overrides; inherited values come back
  // as undefined, letting us correctly detect overrides vs. object defaults.
  // (complete=true fills in inherited values, making every char look "overridden".)
  const charStyles: Partial<CompleteTextStyleDeclaration>[] =
    text.getSelectionStyles?.(start, end, false) ?? []

  const resolved  = {} as StyleValueMap
  const mixed     = {} as StyleBoolMap
  const overrides = {} as StyleBoolMap
  const snapshot: StyleSnapshot = {}

  STYLE_PROPS.forEach(prop => {
    if (charStyles.length === 0) {
      // No selection (cursor only) — use object-level value
      const objVal = (obj as unknown as Record<string, unknown>)[prop]
      resolved[prop]  = (objVal !== undefined ? (objVal as string | number | boolean) : null)
      mixed[prop]     = false
      overrides[prop] = false
      return
    }

    // Per-char value (undefined → no override for this char)
    const perChar: Array<string | number | boolean | null> = charStyles.map(s => {
      const v = (s as Record<string, unknown>)[prop]
      return v !== undefined ? (v as string | number | boolean) : null
    })

    // Effective value: per-char override else object base
    const objBase = (obj as unknown as Record<string, unknown>)[prop]
    const baseVal: string | number | boolean | null =
      objBase !== undefined ? (objBase as string | number | boolean) : null

    const effective: Array<string | number | boolean | null> = perChar.map(v =>
      v !== null ? v : baseVal,
    )

    const hasOverride = perChar.some(v => v !== null)
    const allSame     = effective.every(v => String(v) === String(effective[0]))

    resolved[prop]  = effective[0] ?? null  // first effective value; UI shows MIXED separately
    mixed[prop]     = !allSame
    overrides[prop] = hasOverride

    // Snapshot: full per-char array so we can revert precisely
    if (hasOverride) snapshot[prop] = perChar
  })

  return { resolved, mixed, overrides, snapshot }
}

/**
 * Convert a Fabric object's bounding rect to viewport-relative px coords.
 * canvasEl = the raw <canvas> DOM element (canvasRef.current)
 * canvas   = the fabric.Canvas instance
 */
export function computeScreenRect(
  obj: IText | Textbox,
  canvasEl: HTMLCanvasElement,
  canvas: FabricCanvas,
): ScreenRect | null {
  try {
    const text = obj as FabricTextInEdit
    const br   = text.getBoundingRect()
    const cr   = canvasEl.getBoundingClientRect()

    const canvasWidth  = (canvas as unknown as { width: number }).width
    const canvasHeight = (canvas as unknown as { height: number }).height

    const scaleX = cr.width  / canvasWidth
    const scaleY = cr.height / canvasHeight

    return {
      left:   cr.left + br.left   * scaleX,
      top:    cr.top  + br.top    * scaleY,
      width:  br.width  * scaleX,
      height: br.height * scaleY,
    }
  } catch {
    return null
  }
}

/**
 * Push the current Fabric selection state into TextStyleStore atomically.
 * Safe to call from any Fabric event handler.
 */
export function pushSelectionToStore(
  obj: FabricObject | null,
  canvasEl: HTMLCanvasElement | null,
  canvas: FabricCanvas,
): void {
  const { setInlineState, clear } = useTextStyleStore.getState()

  const text = obj as FabricTextInEdit | null
  if (!text || !text.isEditing) {
    clear()
    return
  }

  const resolution = resolveSelectionStyles(text as IText | Textbox)
  if (!resolution) { clear(); return }

  if (!canvasEl) { clear(); return }

  const screenRect  = computeScreenRect(text as IText | Textbox, canvasEl, canvas)
  const hasSelection = (text.selectionStart ?? 0) !== (text.selectionEnd ?? 0)

  setInlineState({
    isEditing:    true,
    hasSelection,
    screenRect,
    resolved:     resolution.resolved,
    mixed:        resolution.mixed,
    overrides:    resolution.overrides,
    snapshot:     resolution.snapshot,
  })
}

// ── rAF throttle ─────────────────────────────────────────────────────────────

let _rafId: number | null = null

/**
 * Schedule a selection update on the next animation frame.
 * Multiple calls within the same frame collapse into one.
 * Use this from high-frequency event sources (keyup, mouse:move).
 */
export function scheduleSelectionUpdate(
  obj: FabricObject,
  canvasEl: HTMLCanvasElement,
  canvas: FabricCanvas,
): void {
  if (_rafId !== null) return
  _rafId = requestAnimationFrame(() => {
    _rafId = null
    pushSelectionToStore(obj, canvasEl, canvas)
  })
}
