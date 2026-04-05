/**
 * StyleRegistry — canonical style-object pool.
 *
 * Spans point to styleRef IDs rather than embedding style data directly.
 * Identical style objects share a single entry → cheap reference equality
 * comparisons and zero duplicate allocations.
 *
 * API
 *   registerStyle(styleObj)  → { id, _key, ...styleObj }  (deduplicated)
 *   getStyle(id)             → canonical style entry or undefined
 *   clear()                  → reset (for testing / hot-reload)
 */

import type { StyleProp } from '@/types/store'

// The canonical property list; only these keys are stored in the registry.
const PROPS: readonly StyleProp[] = [
  'fill',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'underline',
  'textBackgroundColor',
]

/**
 * A registered style entry: always has an `id` and `_key`, plus any subset
 * of the recognised style properties.
 */
export interface StyleEntry extends Partial<Record<StyleProp, string | number | boolean>> {
  id: number
  _key: string
}

// key → entry
const _pool = new Map<string, StyleEntry>()
let _nextId = 1

function canonicalKey(obj: Partial<Record<StyleProp, string | number | boolean>>): string {
  // Sort keys for stable JSON regardless of insertion order
  const ordered: Partial<Record<StyleProp, string | number | boolean>> = {}
  PROPS.forEach(p => {
    const v = obj[p]
    if (v !== undefined && v !== null) ordered[p] = v
  })
  return JSON.stringify(ordered)
}

export function registerStyle(
  styleObj: Partial<Record<StyleProp, string | number | boolean>>,
): StyleEntry {
  const key = canonicalKey(styleObj)
  const existing = _pool.get(key)
  if (existing !== undefined) return existing

  const entry: StyleEntry = { id: _nextId++, _key: key }
  PROPS.forEach(p => {
    const v = styleObj[p]
    if (v !== undefined && v !== null) entry[p] = v
  })
  _pool.set(key, entry)
  return entry
}

export function getStyle(id: number): StyleEntry | undefined {
  for (const entry of _pool.values()) {
    if (entry.id === id) return entry
  }
  return undefined
}

export function clear(): void {
  _pool.clear()
  _nextId = 1
}
