/**
 * spanOps — span-level style operations on Fabric IText / Textbox objects.
 *
 * These functions are the ONLY place that mutates Fabric per-char styles.
 * They implement the spec's apply-style pipeline:
 *
 *   1. Separate patch into "set" and "remove" buckets.
 *   2. setSelectionStyles() for set-values (Fabric handles span splitting).
 *   3. For null/undefined values: walk _textLines to delete keys from the
 *      internal obj.styles[lineIdx][charIdx] map.  Never call
 *      setSelectionStyles(null) — that corrupts the text renderer.
 *   4. Mark obj.dirty = true, renderAll().
 *
 * resetStyleProps(obj, canvas, keys)
 *   Remove per-char overrides for `keys`, reverting to object-level default.
 *   Text content is never touched.
 *
 * applyStylePatch(obj, canvas, patch)
 *   Apply { prop: value | null } patch to the current selection.
 *   null → remove override.
 */

import type { IText, Textbox, Canvas as FabricCanvas } from 'fabric'

/**
 * The internal per-char style map Fabric keeps on text objects.
 * Outer key = line index (as number or numeric string), inner key = char index.
 */
type FabricStyleMap = Record<string, Record<string, Record<string, string | number | boolean>>>

/**
 * A text object that carries Fabric's internal runtime fields used here.
 * We extend the public IText / Textbox type with only the fields we touch.
 */
type FabricTextObj = (IText | Textbox) & {
  isEditing?: boolean
  selectionStart?: number
  selectionEnd?: number
  _textLines?: string[][]
  styles?: FabricStyleMap
  dirty?: boolean
  setSelectionStyles?: (styles: Record<string, string | number | boolean>) => void
}

/**
 * Apply a { prop: value | null } patch to the Fabric text object's selection.
 *
 * @param obj    - Fabric text object in edit mode
 * @param canvas - Fabric canvas instance
 * @param patch  - e.g. { fill: '#F00', fontSize: null, ... }
 */
export function applyStylePatch(
  obj: IText | Textbox,
  canvas: FabricCanvas,
  patch: Record<string, string | number | boolean | null>,
): void {
  const text = obj as FabricTextObj
  if (!text || !text.isEditing) return

  const toApply: Record<string, string | number | boolean> = {}
  const toRemove: string[] = []

  Object.entries(patch).forEach(([k, v]) => {
    if (v === null || v === undefined) {
      toRemove.push(k)
    } else {
      toApply[k] = v
    }
  })

  // ── Apply non-null values ─────────────────────────────────────────────────
  if (Object.keys(toApply).length > 0 && typeof text.setSelectionStyles === 'function') {
    text.setSelectionStyles(toApply)
  }

  // ── Remove overrides by direct map mutation ───────────────────────────────
  // setSelectionStyles({ prop: null }) sets null as the value, which corrupts
  // Fabric's renderer. We must delete the key from styles[li][ci] instead.
  if (toRemove.length > 0 && text.styles) {
    const start = text.selectionStart ?? 0
    const end   = text.selectionEnd   ?? 0
    const lines = text._textLines ?? []
    let flat = 0

    for (let li = 0; li < lines.length; li++) {
      const lineLen = lines[li]?.length ?? 0
      for (let ci = 0; ci < lineLen; ci++) {
        const lineStyles = text.styles[li]
        if (flat >= start && flat < end && lineStyles?.[ci]) {
          toRemove.forEach(k => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete (lineStyles[ci] as Record<string, unknown>)[k]
          })
          // Remove the char entry entirely if it's now empty (avoids ghost entries)
          if (Object.keys(lineStyles[ci]).length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete lineStyles[ci]
          }
        }
        flat++
      }
      flat++ // newline
    }

    // Remove empty line entries
    Object.keys(text.styles).forEach(liKey => {
      const lineStyles = (text.styles as FabricStyleMap)[liKey]
      if (lineStyles && Object.keys(lineStyles).length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (text.styles as FabricStyleMap)[liKey]
      }
    })
  }

  text.dirty = true
  canvas.renderAll()
}

/**
 * Remove per-char overrides for specific keys, reverting those chars to the
 * object-level default.  Text content is NEVER modified.
 *
 * @param obj    - Fabric text object
 * @param canvas - Fabric canvas instance
 * @param keys   - e.g. ['fill'] or ['fontWeight', 'fontStyle']
 */
export function resetStyleProps(
  obj: IText | Textbox,
  canvas: FabricCanvas,
  keys: string[],
): void {
  const patch: Record<string, null> = Object.fromEntries(keys.map(k => [k, null]))
  applyStylePatch(obj, canvas, patch)
}
