/**
 * Zustand TextStyleStore — shape contracts.
 *
 * Kept separate so both the store implementation and any component that
 * reads the store import the same canonical types.
 */

export type StyleProp =
  | 'fill'
  | 'fontSize'
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'underline'
  | 'textBackgroundColor'

/** Per-property resolved values — may be string, number, boolean, or null. */
export type StyleValueMap = Record<StyleProp, string | number | boolean | null>

/** Per-property mixed-state flags (true = selection spans different values). */
export type StyleBoolMap = Record<StyleProp, boolean>

/**
 * Per-property snapshot taken when selection is made.
 * Each entry is an ordered array of per-character values (null = inherits object default).
 */
export type StyleSnapshot = Partial<Record<StyleProp, (string | number | boolean | null)[]>>

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

export type OpenDropdownKey = 'color' | 'font' | 'bg' | null

// ── Store shape ────────────────────────────────────────────────────────────

export interface TextStyleState {
  isEditing: boolean
  hasSelection: boolean
  screenRect: ScreenRect | null
  openDropdown: OpenDropdownKey
  resolved: StyleValueMap
  mixed: StyleBoolMap
  overrides: StyleBoolMap
  snapshot: StyleSnapshot
}

export interface TextStyleActions {
  setInlineState: (payload: Partial<TextStyleState>) => void
  setOpenDropdown: (key: OpenDropdownKey) => void
  clear: () => void
}

export type TextStyleStore = TextStyleState & TextStyleActions

// ── Per-property selector return type ─────────────────────────────────────

export interface StyleSlice {
  value: string | number | boolean | null
  mixed: boolean
  override: boolean
}

export interface ToolbarSlice {
  isEditing: boolean
  hasSelection: boolean
  screenRect: ScreenRect | null
}
