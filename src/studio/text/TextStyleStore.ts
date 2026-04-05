/**
 * TextStyleStore — single source of truth for inline text selection state.
 *
 * Architecture
 * ─────────────
 * Zustand store with fine-grained selectors so each pill component subscribes
 * only to its own property slice.  A pill re-renders ONLY when its property
 * value, mixed flag, or override flag changes — never for unrelated props.
 *
 * Shape
 * ─────
 * isEditing         bool    — a text object is in edit mode
 * hasSelection      bool    — selection length > 0 (cursor-only → toolbar hidden)
 * screenRect        object  — { left, top, width, height } in viewport px
 * openDropdown      string|null — which pill's dropdown is open ('color'|'font'|'bg'|null)
 *
 * Per-property (for each STYLE_PROP):
 *   resolved.X      any     — effective value (per-char first, then object default)
 *   mixed.X         bool    — selection spans different values for this prop
 *   overrides.X     bool    — at least one char in selection has an explicit per-char override
 *
 * snapshot          object  — per-prop per-char values captured at selection time
 *                              used to implement accurate per-property × reset
 */

import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type {
  TextStyleStore,
  StyleProp,
  StyleValueMap,
  StyleBoolMap,
  StyleSlice,
  ToolbarSlice,
  OpenDropdownKey,
} from '@/types/store'

export const STYLE_PROPS: readonly StyleProp[] = [
  'fill',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'underline',
  'textBackgroundColor',
]

function emptyStyleMaps(): {
  resolved: StyleValueMap
  mixed: StyleBoolMap
  overrides: StyleBoolMap
} {
  return {
    resolved:  Object.fromEntries(STYLE_PROPS.map(p => [p, null])) as StyleValueMap,
    mixed:     Object.fromEntries(STYLE_PROPS.map(p => [p, false])) as StyleBoolMap,
    overrides: Object.fromEntries(STYLE_PROPS.map(p => [p, false])) as StyleBoolMap,
  }
}

export const useTextStyleStore = create<TextStyleStore>()((set) => ({
  // Selection presence
  isEditing:    false,
  hasSelection: false,
  screenRect:   null,
  openDropdown: null,

  // Style maps (populated by SelectionManager)
  ...emptyStyleMaps(),

  // Snapshot of per-char style values taken when selection is made
  // shape: { fill: [null, '#F00', null, ...], fontSize: [null, ...], ... }
  snapshot: {},

  // ── Actions ───────────────────────────────────────────────────────────────

  setInlineState: (payload) => set(payload),

  setOpenDropdown: (key: OpenDropdownKey) => set({ openDropdown: key }),

  clear: () => set({
    isEditing: false, hasSelection: false, screenRect: null,
    openDropdown: null, snapshot: {},
    ...emptyStyleMaps(),
  }),
}))

// ── Per-property selectors ────────────────────────────────────────────────────
// Each pill calls ONE of these hooks and re-renders only when its own slice changes.
//
// Root-cause note: selectors that return new object literals on every call
// always fail Object.is() equality → Zustand triggers re-render → infinite loop.
// useShallow() does a shallow key-by-key comparison and returns the SAME cached
// object when no values have changed, breaking the cycle.

export const useFillStyle       = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.fill,                mixed: s.mixed.fill,                override: s.overrides.fill                })))
export const useFontSizeStyle   = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.fontSize,            mixed: s.mixed.fontSize,            override: s.overrides.fontSize            })))
export const useFontFamilyStyle = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.fontFamily,          mixed: s.mixed.fontFamily,          override: s.overrides.fontFamily          })))
export const useFontWeightStyle = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.fontWeight,          mixed: s.mixed.fontWeight,          override: s.overrides.fontWeight          })))
export const useFontStyleStyle  = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.fontStyle,           mixed: s.mixed.fontStyle,           override: s.overrides.fontStyle           })))
export const useUnderlineStyle  = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.underline,           mixed: s.mixed.underline,           override: s.overrides.underline           })))
export const useBgStyle         = (): StyleSlice => useTextStyleStore(useShallow((s): StyleSlice => ({ value: s.resolved.textBackgroundColor, mixed: s.mixed.textBackgroundColor, override: s.overrides.textBackgroundColor  })))

// Toolbar visibility / position
export const useToolbarState    = (): ToolbarSlice => useTextStyleStore(useShallow((s): ToolbarSlice => ({
  isEditing:    s.isEditing,
  hasSelection: s.hasSelection,
  screenRect:   s.screenRect,
})))

// Dropdown coordination (primitives — no useShallow needed)
export const useOpenDropdown    = (): OpenDropdownKey         => useTextStyleStore(s => s.openDropdown)
export const useSetOpenDropdown = (): ((key: OpenDropdownKey) => void) => useTextStyleStore(s => s.setOpenDropdown)
